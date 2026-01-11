import { View, Text, ScrollView, Pressable, TextInput, Platform, ActivityIndicator, Linking, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFitnessStore, UserProfile } from '@/lib/fitness-store';
import { useHealthStore } from '@/lib/health-service';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { isRevenueCatEnabled } from '@/lib/revenuecatClient';
import {
  ChevronLeft,
  User,
  Flame,
  Timer,
  Activity,
  Scale,
  Target,
  Heart,
  Check,
  ChevronRight,
  Calendar,
  Crown,
  RefreshCw,
  ExternalLink,
  LogOut,
  Mail,
  Shield,
  Bell,
  HelpCircle,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, FadeInUp } from 'react-native-reanimated';
import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
  iconBgColor?: string;
}

function SettingRow({ icon, label, value, onPress, iconBgColor = 'bg-white/10' }: SettingRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center py-4 px-4 active:bg-white/5"
    >
      <View className={`w-10 h-10 rounded-full items-center justify-center ${iconBgColor}`}>
        {icon}
      </View>
      <View className="flex-1 ml-4">
        <Text className="text-gray-400 text-sm">{label}</Text>
        <Text className="text-white text-base font-medium mt-0.5">{value}</Text>
      </View>
      <ChevronRight size={20} color="#4a4a4a" />
    </Pressable>
  );
}

interface EditModalProps {
  visible: boolean;
  title: string;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
  keyboardType?: 'default' | 'numeric';
  suffix?: string;
}

function EditModal({ visible, title, value, onSave, onClose, keyboardType = 'default', suffix }: EditModalProps) {
  const [inputValue, setInputValue] = useState(value);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Animated.View 
      entering={FadeIn.duration(200)}
      className="absolute inset-0 bg-black/80 z-50"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-end"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Pressable className="flex-1" onPress={onClose} />
          <Animated.View
            entering={FadeInUp.duration(250).springify().damping(15)}
            className="bg-fitness-card rounded-t-3xl"
            style={{ paddingBottom: insets.bottom + 20 }}
          >
            <View className="p-6">
              <Text className="text-white text-xl font-bold mb-6">{title}</Text>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3">
                  <TextInput
                    value={inputValue}
                    onChangeText={setInputValue}
                    keyboardType={keyboardType}
                    autoFocus
                    className="flex-1 text-white text-lg"
                    placeholderTextColor="#6b7280"
                    selectionColor="#FA114F"
                  />
                  {suffix && <Text className="text-gray-400 text-lg ml-2">{suffix}</Text>}
                </View>
              </Pressable>
              <View className="flex-row mt-6 space-x-3">
                <Pressable
                  onPress={onClose}
                  className="flex-1 py-4 rounded-xl bg-white/10 items-center active:bg-white/20"
                >
                  <Text className="text-white font-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onSave(inputValue);
                    onClose();
                  }}
                  className="flex-1 py-4 rounded-xl bg-fitness-accent items-center active:opacity-80"
                >
                  <Text className="text-white font-semibold">Save</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

interface SelectModalProps {
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function SelectModal({ visible, title, options, selectedValue, onSelect, onClose }: SelectModalProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View className="absolute inset-0 bg-black/80 z-50">
      <Pressable className="flex-1" onPress={onClose} />
      <View
        className="bg-fitness-card rounded-t-3xl"
        style={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="p-6">
          <Text className="text-white text-xl font-bold mb-4">{title}</Text>
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              className="flex-row items-center py-4 border-b border-white/5 active:bg-white/5"
            >
              <Text className="flex-1 text-white text-lg">{option.label}</Text>
              {selectedValue === option.value && <Check size={22} color="#FA114F" />}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currentUser = useFitnessStore((s) => s.currentUser);
  const updateUserProfile = useFitnessStore((s) => s.updateUserProfile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const activeProvider = useHealthStore((s) => s.activeProvider);
  const providers = useHealthStore((s) => s.providers);
  const goals = useHealthStore((s) => s.goals);
  const updateGoals = useHealthStore((s) => s.updateGoals);
  const authUser = useAuthStore((s) => s.user);

  const subscriptionTier = useSubscriptionStore((s) => s.tier);
  const isSubscriptionLoading = useSubscriptionStore((s) => s.isLoading);
  const checkTier = useSubscriptionStore((s) => s.checkTier);
  const restore = useSubscriptionStore((s) => s.restore);
  const loadOfferings = useSubscriptionStore((s) => s.loadOfferings);
  
  // Check if user has any paid tier (mover or crusher)
  const isPro = subscriptionTier === 'mover' || subscriptionTier === 'crusher';

  // Auth store
  const signOut = useAuthStore((s) => s.signOut);
  const loadCompetitions = useFitnessStore((s) => s.loadCompetitions);
  const resetOnboarding = useOnboardingStore((s) => s.resetOnboarding);

  const [isRestoring, setIsRestoring] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    checkTier();
    loadOfferings();
  }, []);

  const [editModal, setEditModal] = useState<{
    visible: boolean;
    title: string;
    value: string;
    field: string;
    keyboardType?: 'default' | 'numeric';
    suffix?: string;
  }>({ visible: false, title: '', value: '', field: '' });

  const [selectModal, setSelectModal] = useState<{
    visible: boolean;
    title: string;
    options: { label: string; value: string }[];
    selectedValue: string;
    field: string;
  }>({ visible: false, title: '', options: [], selectedValue: '', field: '' });

  const handleSave = (value: string) => {
    switch (editModal.field) {
      case 'name':
        // Parse the name into first and last name
        const nameParts = value.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        updateProfile(firstName, lastName);
        break;
      case 'weight':
        updateUserProfile({ weight: parseFloat(value) || currentUser.profile.weight });
        break;
      case 'targetWeight':
        updateUserProfile({ targetWeight: parseFloat(value) || currentUser.profile.targetWeight });
        break;
      case 'age':
        updateUserProfile({ age: parseInt(value, 10) || currentUser.profile.age });
        break;
      case 'moveGoal':
        updateGoals({ moveCalories: parseInt(value, 10) || goals.moveCalories }, authUser?.id);
        break;
      case 'exerciseGoal':
        updateGoals({ exerciseMinutes: parseInt(value, 10) || goals.exerciseMinutes }, authUser?.id);
        break;
      case 'standGoal':
        updateGoals({ standHours: parseInt(value, 10) || goals.standHours }, authUser?.id);
        break;
    }
  };

  const handleSelectSave = (value: string) => {
    // Handle select modal saves if needed in the future
  };

  const handleRestorePurchases = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    const success = await restore();
    setIsRestoring(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleManageSubscription = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Open the App Store subscription management page
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSigningOut(true);
    // Clear competitions from local store on sign out (user-specific data)
    loadCompetitions([]);
    await signOut();
    resetOnboarding();
    setIsSigningOut(false);
    router.replace('/sign-in');
  };

  const connectedProvider = providers.find((p) => p.id === activeProvider);

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Animated.View entering={FadeInDown.duration(400)} className="flex-row items-center">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-4 active:bg-white/20"
            >
              <ChevronLeft size={24} color="white" />
            </Pressable>
            <Text className="text-white text-2xl font-bold">Settings</Text>
          </Animated.View>
        </LinearGradient>

        {/* Account Section */}
        <Animated.View entering={FadeInDown.duration(500).delay(50)} className="px-5 mt-2">
          <Text className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
            Account
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            {/* Email/Provider */}
            <View className="flex-row items-center py-4 px-4">
              <View className="w-10 h-10 rounded-full items-center justify-center bg-blue-500/20">
                <Mail size={20} color="#3B82F6" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-gray-400 text-sm">Signed in as</Text>
                <Text className="text-white text-base font-medium mt-0.5">
                  {authUser?.email || 'Demo Account'}
                </Text>
              </View>
            </View>
            <View className="h-px bg-white/5 mx-4" />
            {/* Provider */}
            <View className="flex-row items-center py-4 px-4">
              <View className="w-10 h-10 rounded-full items-center justify-center bg-purple-500/20">
                <Shield size={20} color="#A78BFA" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-gray-400 text-sm">Sign in method</Text>
                <Text className="text-white text-base font-medium mt-0.5 capitalize">
                  {authUser?.provider === 'apple' ? 'Apple' : authUser?.provider === 'google' ? 'Google' : 'Demo'}
                </Text>
              </View>
            </View>
            <View className="h-px bg-white/5 mx-4" />
            {/* Sign Out */}
            <Pressable
              onPress={handleSignOut}
              disabled={isSigningOut}
              className="flex-row items-center py-4 px-4 active:bg-white/5"
            >
              <View className="w-10 h-10 rounded-full items-center justify-center bg-red-500/20">
                <LogOut size={20} color="#EF4444" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-red-500 text-base font-medium">Sign Out</Text>
              </View>
              {isSigningOut && (
                <ActivityIndicator size="small" color="#EF4444" />
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* Profile Section */}
        <Animated.View entering={FadeInDown.duration(500).delay(150)} className="px-5 mt-6">
          <Text className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
            Profile
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            <SettingRow
              icon={<User size={20} color="white" />}
              label="Name"
              value={authUser?.fullName || authUser?.firstName || 'Not set'}
              onPress={() => {
                const currentName = authUser?.fullName || '';
                const nameParts = currentName.split(' ') || [];
                const firstName = nameParts[0] || authUser?.firstName || '';
                const lastName = nameParts.slice(1).join(' ') || authUser?.lastName || '';
                setEditModal({
                  visible: true,
                  title: 'Edit Name',
                  value: `${firstName} ${lastName}`.trim() || currentName,
                  field: 'name',
                });
              }}
            />
            <View className="h-px bg-white/5 mx-4" />
            <SettingRow
              icon={<Calendar size={20} color="white" />}
              label="Age"
              value={`${currentUser.profile.age} years`}
              onPress={() =>
                setEditModal({
                  visible: true,
                  title: 'Edit Age',
                  value: currentUser.profile.age.toString(),
                  field: 'age',
                  keyboardType: 'numeric',
                  suffix: 'years',
                })
              }
            />
          </View>
        </Animated.View>

        {/* Membership Section */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} className="px-5 mt-6">
          <Text className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
            Membership
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            {/* Pro Status */}
            <View className="flex-row items-center py-4 px-4">
              <View className={`w-10 h-10 rounded-full items-center justify-center ${isPro ? 'bg-amber-500/20' : 'bg-white/10'}`}>
                <Crown size={20} color={isPro ? '#FFD700' : '#6b7280'} />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-gray-400 text-sm">Status</Text>
                {isSubscriptionLoading ? (
                  <ActivityIndicator size="small" color="#FA114F" className="mt-1" />
                ) : (
                  <View className="flex-row items-center mt-0.5">
                    {isPro ? (
                      <>
                        <LinearGradient
                          colors={['#FFD700', '#FFA500']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}
                        >
                          <Text className="text-black text-xs font-bold">PRO</Text>
                        </LinearGradient>
                        <Text className="text-white text-base font-medium ml-2">Active</Text>
                      </>
                    ) : (
                      <Text className="text-gray-500 text-base font-medium">Free Plan</Text>
                    )}
                  </View>
                )}
              </View>
            </View>

            {isPro ? (
              <>
                <View className="h-px bg-white/5 mx-4" />
                {/* Manage Subscription */}
                <Pressable
                  onPress={handleManageSubscription}
                  className="flex-row items-center py-4 px-4 active:bg-white/5"
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center bg-white/10">
                    <ExternalLink size={20} color="white" />
                  </View>
                  <View className="flex-1 ml-4">
                    <Text className="text-white text-base font-medium">Manage Subscription</Text>
                    <Text className="text-gray-500 text-sm mt-0.5">Cancel or change your plan</Text>
                  </View>
                  <ChevronRight size={20} color="#4a4a4a" />
                </Pressable>
              </>
            ) : (
              <>
                <View className="h-px bg-white/5 mx-4" />
                {/* Upgrade to Pro */}
                <Pressable
                  onPress={() => router.push('/upgrade')}
                  className="flex-row items-center py-4 px-4 active:bg-white/5"
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center bg-amber-500/20">
                    <Crown size={20} color="#FFD700" />
                  </View>
                  <View className="flex-1 ml-4">
                    <Text className="text-white text-base font-medium">Upgrade to Pro</Text>
                    <Text className="text-gray-500 text-sm mt-0.5">
                      {subscriptionTier === 'mover' ? '$49.99' : subscriptionTier === 'crusher' ? '$99.99' : 'Free'}/year
                    </Text>
                  </View>
                  <ChevronRight size={20} color="#4a4a4a" />
                </Pressable>
              </>
            )}

            <View className="h-px bg-white/5 mx-4" />
            {/* Restore Purchases */}
            <Pressable
              onPress={handleRestorePurchases}
              disabled={isRestoring}
              className="flex-row items-center py-4 px-4 active:bg-white/5"
            >
              <View className="w-10 h-10 rounded-full items-center justify-center bg-white/10">
                <RefreshCw size={20} color="white" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-white text-base font-medium">Restore Purchases</Text>
                <Text className="text-gray-500 text-sm mt-0.5">Restore previous subscriptions</Text>
              </View>
              {isRestoring ? (
                <ActivityIndicator size="small" color="#FA114F" />
              ) : (
                <ChevronRight size={20} color="#4a4a4a" />
              )}
            </Pressable>
          </View>

          {!isRevenueCatEnabled() && (
            <View className="mt-3 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <Text className="text-blue-400 text-sm">
                Subscriptions are available in the published app. Test purchases work in development builds.
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Notifications */}
        <Animated.View entering={FadeInDown.duration(500).delay(300)} className="px-5 mt-6">
          <Text className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
            Notifications
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            <SettingRow
              icon={<Bell size={20} color="white" />}
              iconBgColor="bg-white/10"
              label="Notification Settings"
              value="Manage your alerts"
              onPress={() => {
                // TODO: Navigate to notification settings
              }}
            />
          </View>
        </Animated.View>

        {/* Privacy */}
        <Animated.View entering={FadeInDown.duration(500).delay(350)} className="px-5 mt-6">
          <Text className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
            Privacy
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            <SettingRow
              icon={<Shield size={20} color="white" />}
              iconBgColor="bg-white/10"
              label="Privacy Settings"
              value="Control your data"
              onPress={() => {
                // TODO: Navigate to privacy settings
              }}
            />
          </View>
        </Animated.View>

        {/* Help & Support */}
        <Animated.View entering={FadeInDown.duration(500).delay(400)} className="px-5 mt-6">
          <Text className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
            Help & Support
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            <SettingRow
              icon={<HelpCircle size={20} color="white" />}
              iconBgColor="bg-white/10"
              label="Help & Support"
              value="Get assistance"
              onPress={() => {
                // TODO: Navigate to help & support
              }}
            />
          </View>
        </Animated.View>

        {/* Health Permissions */}
        <Animated.View entering={FadeInDown.duration(500).delay(450)} className="px-5 mt-6">
          <Text className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-3">
            Health & Permissions
          </Text>
          <View className="bg-fitness-card rounded-2xl overflow-hidden">
            <Pressable
              onPress={() => router.push('/connect-health')}
              className="flex-row items-center py-4 px-4 active:bg-white/5"
            >
              <View className="w-10 h-10 rounded-full items-center justify-center bg-fitness-accent/20">
                <Heart size={20} color="#FA114F" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-gray-400 text-sm">
                  {Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit'}
                </Text>
                <View className="flex-row items-center mt-0.5">
                  {activeProvider ? (
                    <>
                      <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                      <Text className="text-green-500 text-base font-medium">Connected</Text>
                    </>
                  ) : (
                    <>
                      <View className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
                      <Text className="text-orange-500 text-base font-medium">Not Connected</Text>
                    </>
                  )}
                </View>
              </View>
              <ChevronRight size={20} color="#4a4a4a" />
            </Pressable>
            {connectedProvider && (
              <>
                <View className="h-px bg-white/5 mx-4" />
                <View className="px-4 py-3">
                  <Text className="text-gray-500 text-sm">
                    Last synced: {connectedProvider.lastSync
                      ? new Date(connectedProvider.lastSync).toLocaleString()
                      : 'Never'}
                  </Text>
                </View>
              </>
            )}
          </View>

          {!activeProvider && (
            <View className="mt-3 p-4 bg-orange-500/10 rounded-xl border border-orange-500/20">
              <Text className="text-orange-400 text-sm">
                Connect to {Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit'} to sync your activity, weight, and BMI data automatically.
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Version */}
        <View className="items-center mt-8">
          <Text className="text-gray-600 text-sm">MoveTogether v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <EditModal
        visible={editModal.visible}
        title={editModal.title}
        value={editModal.value}
        keyboardType={editModal.keyboardType}
        suffix={editModal.suffix}
        onSave={handleSave}
        onClose={() => setEditModal({ ...editModal, visible: false })}
      />

      {/* Select Modal */}
      <SelectModal
        visible={selectModal.visible}
        title={selectModal.title}
        options={selectModal.options}
        selectedValue={selectModal.selectedValue}
        onSelect={handleSelectSave}
        onClose={() => setSelectModal({ ...selectModal, visible: false })}
      />
    </View>
  );
}

