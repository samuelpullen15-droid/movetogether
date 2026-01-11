import { View, Text, ScrollView, Pressable, Image, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal, Dimensions, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  UserPlus,
  Users,
  X,
  UserMinus,
  QrCode,
  Link,
  MoreHorizontal,
  Phone,
  Check,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeOut, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';

const { height: screenHeight } = Dimensions.get('window');
import { useAuthStore } from '@/lib/auth-store';
import { getUserFriends, sendFriendRequest, removeFriend, getPendingFriendRequests, getSentFriendRequests, acceptFriendRequest, FriendWithProfile } from '@/lib/friends-service';
import { searchUsersByUsername, searchUsersByPhoneNumber, findUsersFromContacts, searchResultToFriend, SearchUserResult } from '@/lib/user-search-service';
import { Friend } from '@/lib/competition-types';
import { getAvatarUrl } from '@/lib/avatar-utils';
import * as Contacts from 'expo-contacts';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchMode, setSearchMode] = useState<'username' | 'phone'>('username');
  const [pendingRequests, setPendingRequests] = useState<FriendWithProfile[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendWithProfile[]>([]);
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(new Set());
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  // Animation values for modal
  const modalTranslateY = useSharedValue(screenHeight);
  const overlayOpacity = useSharedValue(0);
  
  const handleCloseModal = useCallback(() => {
    if (!isModalVisible || !showAddFriend) {
      return;
    }
    
    setIsModalVisible(false);
    
    overlayOpacity.value = withTiming(0, { duration: 300 });
    modalTranslateY.value = withTiming(screenHeight, { duration: 300 }, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(setShowAddFriend)(false);
        runOnJS(setSearchQuery)('');
        runOnJS(setSearchResults)([]);
      }
    });
  }, [overlayOpacity, modalTranslateY, showAddFriend, isModalVisible]);
  
  useEffect(() => {
    if (showAddFriend) {
      setIsModalVisible(true);
      modalTranslateY.value = screenHeight;
      overlayOpacity.value = 0;
      setTimeout(() => {
        modalTranslateY.value = withTiming(0, { duration: 300 });
        overlayOpacity.value = withTiming(0.7, { duration: 300 });
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddFriend]);
  
  useEffect(() => {
    if (!showAddFriend && !isModalVisible) {
      modalTranslateY.value = screenHeight;
      overlayOpacity.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddFriend, isModalVisible]);
  
  const modalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: modalTranslateY.value }],
  }));
  
  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // Load friends on mount
  useEffect(() => {
    if (user?.id) {
      loadFriends();
      loadPendingRequests();
      loadSentRequests();
    }
  }, [user?.id]);

  const loadFriends = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const userFriends = await getUserFriends(user.id);
      setFriends(userFriends);
    } catch (error) {
      console.error('Error loading friends:', error);
      Alert.alert('Error', 'Failed to load friends');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingRequests = async () => {
    if (!user?.id) return;
    try {
      const requests = await getPendingFriendRequests(user.id);
      setPendingRequests(requests);
    } catch (error) {
      console.error('Error loading pending requests:', error);
    }
  };

  const loadSentRequests = async () => {
    if (!user?.id) return;
    try {
      const requests = await getSentFriendRequests(user.id);
      setSentRequests(requests);
      // Update sentRequestIds set for quick lookup
      setSentRequestIds(new Set(requests.map(r => r.id)));
    } catch (error) {
      console.error('Error loading sent requests:', error);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!showAddFriend || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchMode, showAddFriend]);

  const performSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      let results: SearchUserResult[] = [];

      // Try both username and phone search
      const [usernameResults, phoneResults] = await Promise.all([
        searchUsersByUsername(searchQuery).catch(() => []),
        searchUsersByPhoneNumber(searchQuery).catch(() => []),
      ]);

      // Combine results, removing duplicates
      const allResults = [...usernameResults, ...phoneResults];
      const uniqueResults = Array.from(
        new Map(allResults.map(r => [r.id, r])).values()
      );
      results = uniqueResults;

      // Filter out current user, existing friends, and sent requests
      const friendIds = new Set(friends.map(f => f.id));
      const filteredResults = results
        .filter(r => r.id !== user?.id && !friendIds.has(r.id) && !sentRequestIds.has(r.id))
        .map(searchResultToFriend);

      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Error searching:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddFriend = async (friendId: string) => {
    if (!user?.id) return;

    try {
      const result = await sendFriendRequest(user.id, friendId);
      if (result.success) {
        // Add to sent requests set
        setSentRequestIds(prev => new Set([...prev, friendId]));
        // Reload sent requests to get full profile data
        await loadSentRequests();
      } else {
        Alert.alert('Error', result.error || 'Failed to send friend request');
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to add friend');
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!user?.id) return;

    Alert.alert(
      'Remove Friend',
      'Are you sure you want to remove this friend?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await removeFriend(user.id, friendId);
              if (result.success) {
                await loadFriends();
              } else {
                Alert.alert('Error', result.error || 'Failed to remove friend');
              }
            } catch (error) {
              console.error('Error removing friend:', error);
              Alert.alert('Error', 'Failed to remove friend');
            }
          },
        },
      ]
    );
  };

  const handleFindFromContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'We need access to your contacts to find friends who are using the app.',
          [{ text: 'OK' }]
        );
        return;
      }

      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });

      if (!contacts || contacts.length === 0) {
        Alert.alert('No Contacts', 'No contacts found on your device.');
        return;
      }

      // Extract emails and phone numbers
      const emails: string[] = [];
      const phoneNumbers: string[] = [];

      contacts.forEach((contact) => {
        if (contact.emails && contact.emails.length > 0) {
          contact.emails.forEach((email) => {
            if (email.email) emails.push(email.email.toLowerCase().trim());
          });
        }
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          contact.phoneNumbers.forEach((phone) => {
            if (phone.number) phoneNumbers.push(phone.number);
          });
        }
      });

      if (emails.length === 0 && phoneNumbers.length === 0) {
        Alert.alert('No Contact Info', 'No emails or phone numbers found in your contacts.');
        return;
      }

      setIsSearching(true);
      try {
        const foundUsers = await findUsersFromContacts(emails, phoneNumbers);

        // Filter out current user, existing friends, and sent requests
        const friendIds = new Set(friends.map(f => f.id));
        const filteredResults = foundUsers
          .filter(u => u.id !== user?.id && !friendIds.has(u.id) && !sentRequestIds.has(u.id))
          .map(searchResultToFriend);

        if (filteredResults.length === 0) {
          Alert.alert(
            'No Friends Found',
            'No friends from your contacts are using MoveTogether yet.'
          );
        } else {
          setSearchResults(filteredResults);
          setShowAddFriend(true);
        }
      } catch (error) {
        console.error('Error finding friends from contacts:', error);
        Alert.alert('Error', 'Failed to find friends from contacts');
      } finally {
        setIsSearching(false);
      }
    } catch (error) {
      console.error('Error accessing contacts:', error);
      Alert.alert('Error', 'Failed to access contacts');
    }
  };

  return (
    <View className="flex-1 bg-black">
      {/* Header */}
      <LinearGradient
        colors={['#000000', '#000000']}
        style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}
      >
        <Animated.View entering={FadeInDown.duration(600)}>
          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center active:opacity-70"
            >
              <ChevronLeft size={24} color="white" />
              <Text className="text-white text-base ml-1">Back</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAddFriend(true)}
              className="flex-row items-center px-4 py-2 rounded-full bg-fitness-accent active:opacity-80"
            >
              <UserPlus size={18} color="white" />
              <Text className="text-white font-semibold ml-2">Add Friend</Text>
            </Pressable>
          </View>
          <Text className="text-white text-3xl font-bold">Friends</Text>
          <Text className="text-gray-400 text-base mt-1">
            {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
          </Text>
        </Animated.View>
      </LinearGradient>

      {/* Friends List */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color="#FA114F" />
          </View>
        ) : friends.length === 0 && sentRequests.length === 0 ? (
          <View className="items-center justify-center py-20 px-5">
            <Users size={64} color="#6b7280" />
            <Text className="text-white text-xl font-semibold mt-6">No friends yet</Text>
            <Text className="text-gray-400 text-base mt-2 text-center">
              Add friends by username, phone number, or from your contacts
            </Text>
            <Pressable
              onPress={() => setShowAddFriend(true)}
              className="mt-6 px-6 py-3 rounded-full bg-fitness-accent active:opacity-80"
            >
              <Text className="text-white font-semibold">Add Your First Friend</Text>
            </Pressable>
          </View>
        ) : (
          <View className="px-5 mt-4">
            {/* Pending Requests Section (Sent) */}
            {sentRequests.length > 0 && (
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-3">Pending</Text>
                <View className="bg-fitness-card rounded-2xl overflow-hidden">
                  {sentRequests.map((request, index) => (
                    <Pressable
                      key={request.id}
                      onPress={() => router.push(`/friend-profile?id=${request.id}`)}
                      className={`flex-row items-center px-5 py-4 ${
                        index < sentRequests.length - 1 ? 'border-b border-white/5' : ''
                      } active:opacity-70`}
                    >
                      <Image
                        source={{ uri: request.avatar }}
                        className="w-14 h-14 rounded-full border-2 border-fitness-accent/30"
                      />
                      <View className="flex-1 ml-4">
                        <Text className="text-white font-semibold text-base">{request.name || 'User'}</Text>
                        {request.username && (
                          <Text className="text-gray-400 text-sm mt-0.5">{request.username}</Text>
                        )}
                      </View>
                      <View className="px-4 py-2 rounded-full bg-white/5 flex-row items-center"
                        style={{ gap: 4 }}
                      >
                        <Check size={14} color="#6b7280" />
                        <Text className="text-gray-500 font-semibold text-sm">Request sent</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Friends Section */}
            {friends.length > 0 && (
              <View>
                <Text className="text-white text-lg font-semibold mb-3">Friends</Text>
                {friends.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() => router.push(`/friend-profile?id=${friend.id}`)}
                className="flex-row items-center p-4 bg-fitness-card rounded-xl mb-3 active:opacity-70"
              >
                <Image
                  source={{ uri: friend.avatar }}
                  className="w-14 h-14 rounded-full border-2 border-fitness-accent/30"
                />
                <View className="flex-1 ml-4">
                  <Text className="text-white font-semibold text-base">{friend.name}</Text>
                  {friend.username && (
                    <Text className="text-gray-400 text-sm mt-0.5">{friend.username}</Text>
                  )}
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    handleRemoveFriend(friend.id);
                  }}
                  className="p-2 rounded-full bg-white/10 active:bg-white/20"
                >
                  <UserMinus size={18} color="#FA114F" />
                </Pressable>
              </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Friend Modal */}
      {showAddFriend && (
        <Modal transparent animationType="none" onRequestClose={handleCloseModal}>
          <View className="flex-1" pointerEvents={isModalVisible ? 'auto' : 'box-none'}>
            <Animated.View
              className="absolute inset-0"
              style={[
                { backgroundColor: 'rgba(0,0,0,0.7)' },
                overlayAnimatedStyle
              ]}
              pointerEvents={isModalVisible ? 'auto' : 'none'}
            >
              {isModalVisible && (
                <Pressable
                  className="flex-1"
                  onPress={handleCloseModal}
                />
              )}
            </Animated.View>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: screenHeight * 0.2,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  justifyContent: 'flex-start',
                },
                modalAnimatedStyle
              ]}
              pointerEvents={isModalVisible ? 'auto' : 'none'}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? -150 : 20}
                style={{ flex: 1 }}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={!isModalVisible}>
                  <View
                    className="bg-black rounded-t-3xl"
                    style={{
                      flex: 1,
                      borderTopLeftRadius: 24,
                      borderTopRightRadius: 24,
                      overflow: 'hidden',
                    }}
                  >
                    <ScrollView
                      className="flex-1"
                      contentContainerStyle={{ paddingBottom: 120 }}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      style={{ backgroundColor: 'transparent' }}
                    >
                      {/* Header */}
                      <LinearGradient
                        colors={['#1a1a2e', '#000000']}
                        style={{ paddingTop: Math.max(insets.top - 9, 12), paddingHorizontal: 20, paddingBottom: 16 }}
                      >
                        <Animated.View entering={FadeInDown.duration(600)}>
                          <Pressable
                            onPress={handleCloseModal}
                            disabled={!isModalVisible}
                            className="flex-row items-center mb-2"
                          >
                            <ChevronLeft size={24} color="white" />
                            <Text className="text-white text-base ml-1">Back</Text>
                          </Pressable>
                          <Text className="text-white text-3xl font-bold">Add Friends</Text>
                          <Text className="text-gray-400 text-base mt-1">
                            Find and connect with friends
                          </Text>
                        </Animated.View>
                      </LinearGradient>

                      {/* Search Section */}
                      <Animated.View
                        entering={FadeInDown.duration(500).delay(100)}
                        className="px-5 mb-6"
                      >
                        <View className="bg-fitness-card rounded-full px-5 py-4 flex-row items-center">
                          <Search size={20} color="#6b7280" />
                          <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Search by username or phone..."
                            placeholderTextColor="#6b7280"
                            className="text-white text-lg ml-3 flex-1"
                            autoCapitalize="none"
                            autoCorrect={false}
                            spellCheck={false}
                            keyboardType="default"
                            selectionColor="#FA114F"
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setIsSearchFocused(false)}
                            returnKeyType="search"
                            onSubmitEditing={() => Keyboard.dismiss()}
                          />
                          {searchQuery.length > 0 && (
                            <Pressable
                              onPress={() => {
                                setSearchQuery('');
                                setSearchResults([]);
                                Keyboard.dismiss();
                              }}
                              className="ml-2 p-1 active:opacity-70"
                            >
                              <X size={18} color="#6b7280" />
                            </Pressable>
                          )}
                        </View>
                      </Animated.View>

                      {/* Find Friends from Contacts Section */}
                      {!isSearchFocused && searchQuery.length === 0 && (
                        <Animated.View
                          entering={FadeInDown.duration(500).delay(150)}
                          exiting={FadeOut.duration(200)}
                          className="px-5 mb-6"
                        >
                          <Text className="text-white text-lg font-semibold mb-3">Find Friends Elsewhere</Text>
                          <View className="bg-fitness-card rounded-2xl overflow-hidden">
                            <Pressable
                              onPress={handleFindFromContacts}
                              disabled={isSearching}
                              className="flex-row items-center justify-between px-5 py-5 active:bg-white/5"
                            >
                              <View className="flex-row items-center">
                                <Phone size={22} color="#FA114F" />
                                <Text className="text-white text-lg ml-3">Find Friends from Contacts</Text>
                              </View>
                              <ChevronRight size={20} color="#6b7280" />
                            </Pressable>
                          </View>
                        </Animated.View>
                      )}

                      {/* Friend Requests Section */}
                      {!isSearchFocused && searchQuery.length === 0 && (
                        <Animated.View
                          entering={FadeInDown.duration(500).delay(200)}
                          exiting={FadeOut.duration(200)}
                          className="px-5 mb-6"
                        >
                        <Text className="text-white text-lg font-semibold mb-3">Friend Requests</Text>
                        {pendingRequests.length === 0 ? (
                          <View className="bg-fitness-card rounded-2xl px-5 py-8 items-center">
                            <Text className="text-gray-400 text-base">No pending friend requests</Text>
                          </View>
                        ) : (
                          <View className="bg-fitness-card rounded-2xl overflow-hidden">
                            {pendingRequests.map((request, index) => (
                              <View
                                key={request.id}
                                className={`px-5 py-4 ${
                                  index < pendingRequests.length - 1 ? 'border-b border-white/5' : ''
                                }`}
                              >
                                <View className="flex-row items-start mb-4">
                                  <Image
                                    source={{ uri: request.avatar }}
                                    className="w-14 h-14 rounded-full"
                                  />
                                  <View className="flex-1 ml-4">
                                    <Text className="text-white font-bold text-base">{request.name || 'User'}</Text>
                                    {request.username && (
                                      <Text className="text-gray-400 text-sm mt-0.5">{request.username}</Text>
                                    )}
                                    <Text className="text-blue-400 text-sm mt-1">Added you</Text>
                                  </View>
                                </View>
                                <View className="flex-row" style={{ gap: 12 }}>
                                  <Pressable
                                    onPress={() => {/* TODO: Handle maybe later */}}
                                    className="flex-1 bg-white/10 rounded-xl py-3 items-center active:opacity-80"
                                  >
                                    <Text className="text-white font-semibold text-sm">Maybe later</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={async () => {
                                      if (!user?.id || !request.id) return;
                                      try {
                                        const result = await acceptFriendRequest(user.id, request.id);
                                        if (result.success) {
                                          await loadPendingRequests();
                                          await loadFriends();
                                        } else {
                                          Alert.alert('Error', result.error || 'Failed to accept request');
                                        }
                                      } catch (error) {
                                        console.error('Error accepting request:', error);
                                        Alert.alert('Error', 'Failed to accept request');
                                      }
                                    }}
                                    className="flex-1 bg-green-600 rounded-xl py-3 items-center flex-row justify-center active:opacity-80"
                                    style={{ gap: 6 }}
                                  >
                                    <Check size={16} color="white" />
                                    <Text className="text-white font-semibold text-sm">Accept</Text>
                                    <UserPlus size={16} color="white" />
                                  </Pressable>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </Animated.View>
                      )}

                      {/* Search Results */}
                      {searchQuery.length >= 2 && searchResults.length > 0 && (
                        <Animated.View
                          entering={FadeInDown.duration(500).delay(200)}
                          className="px-5 mb-6"
                        >
                          <Text className="text-white text-lg font-semibold mb-3">Search Results</Text>
                          <View className="gap-3">
                            {searchResults.map((result, index) => (
                              <Pressable
                                key={result.id}
                                onPress={() => handleAddFriend(result.id)}
                                className="bg-fitness-card rounded-2xl overflow-hidden active:opacity-80"
                              >
                                <View className="flex-row items-center px-5 py-4">
                                  <Image
                                    source={{ uri: result.avatar }}
                                    className="w-16 h-16 rounded-full"
                                  />
                                  <View className="flex-1 ml-4">
                                    <Text className="text-white font-bold text-lg">{result.name || 'User'}</Text>
                                    {result.username && (
                                      <Text className="text-gray-400 text-base mt-0.5">{result.username}</Text>
                                    )}
                                  </View>
                                  {sentRequestIds.has(result.id) ? (
                                    <View className="px-6 py-3 rounded-full bg-white/10 flex-row items-center"
                                      style={{ gap: 6 }}
                                    >
                                      <Check size={18} color="#10b981" />
                                      <Text className="text-gray-400 font-semibold text-base">Request sent</Text>
                                    </View>
                                  ) : (
                                    <Pressable
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        handleAddFriend(result.id);
                                      }}
                                      className="px-6 py-3 rounded-full bg-fitness-accent active:opacity-80 flex-row items-center"
                                      style={{ gap: 6 }}
                                    >
                                      <UserPlus size={18} color="white" />
                                      <Text className="text-white font-semibold text-base">Add</Text>
                                    </Pressable>
                                  )}
                                </View>
                              </Pressable>
                            ))}
                          </View>
                        </Animated.View>
                      )}

                      {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                        <View className="items-center py-12 px-5">
                          <Text className="text-gray-400 text-base">No users found</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}
