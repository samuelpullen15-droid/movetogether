import { View, ScrollView, Pressable, TextInput, Platform, ActivityIndicator, Linking, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFitnessStore, UserProfile } from '@/lib/fitness-store';
import { useHealthStore } from '@/lib/health-service';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import {
  User,
  Flame,
  Timer,
  Activity,
  Scale,
  Target,
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
  FileText,
  Users,
  BookOpen,
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
  colors: ReturnType<typeof useThemeColors>;
}

function SettingRow({ icon, label, value, onPress, iconBgColor, colors }: SettingRowProps) {
  const defaultIconBg = colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center py-4 px-4"
      style={{ backgroundColor: 'transparent' }}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: iconBgColor || defaultIconBg }}
      >
        {icon}
      </View>
      <View className="flex-1 ml-4">
        <Text style={{ color: colors.textSecondary }} className="text-sm">{label}</Text>
        <Text style={{ color: colors.text }} className="text-base font-medium mt-0.5">{value}</Text>
      </View>
      <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
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
  colors: ReturnType<typeof useThemeColors>;
}

function EditModal({ visible, title, value, onSave, onClose, keyboardType = 'default', suffix, colors }: EditModalProps) {
  const [inputValue, setInputValue] = useState(value);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      className="absolute inset-0 z-50"
      style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 justify-end">
          <Pressable className="flex-1" onPress={onClose} />
          <Animated.View
            entering={FadeInUp.duration(250).springify().damping(15)}
            className="rounded-t-3xl"
            style={{ backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }}
          >
            <View className="p-6">
              <Text style={{ color: colors.text }} className="text-xl font-bold mb-6">{title}</Text>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View
                  className="flex-row items-center rounded-xl px-4 py-3"
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                >
                  <TextInput
                    value={inputValue}
                    onChangeText={setInputValue}
                    keyboardType={keyboardType}
                    autoFocus
                    className="flex-1 text-lg"
                    style={{ color: colors.text }}
                    placeholderTextColor={colors.textSecondary}
                    selectionColor="#FA114F"
                  />
                  {suffix && <Text style={{ color: colors.textSecondary }} className="text-lg ml-2">{suffix}</Text>}
                </View>
              </Pressable>
              <View className="flex-row mt-6 space-x-3">
                <Pressable
                  onPress={onClose}
                  className="flex-1 py-4 rounded-xl items-center"
                  style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                >
                  <Text style={{ color: colors.text }} className="font-semibold">Cancel</Text>
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
        </View>
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
  colors: ReturnType<typeof useThemeColors>;
}

function SelectModal({ visible, title, options, selectedValue, onSelect, onClose, colors }: SelectModalProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View
      className="absolute inset-0 z-50"
      style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }}
    >
      <Pressable className="flex-1" onPress={onClose} />
      <View
        className="rounded-t-3xl"
        style={{ backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }}
      >
        <View className="p-6">
          <Text style={{ color: colors.text }} className="text-xl font-bold mb-4">{title}</Text>
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              className="flex-row items-center py-4"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
            >
              <Text style={{ color: colors.text }} className="flex-1 text-lg">{option.label}</Text>
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
  const colors = useThemeColors();

  const currentUser = useFitnessStore((s) => s.currentUser);
  const updateUserProfile = useFitnessStore((s) => s.updateUserProfile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

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
    // Navigate to upgrade page where users can manage their subscription
    router.push('/upgrade');
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

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Overscroll background for dark mode */}
      {colors.isDark && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 300,
            backgroundColor: '#1C1C1E',
            zIndex: -1,
          }}
        />
      )}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : [colors.bg, colors.bg]}
          style={{
            paddingTop: insets.top + 108,
            marginTop: -100,
            paddingHorizontal: 20,
            paddingBottom: 34,
          }}
        >
          <Animated.View entering={FadeInDown.duration(400)} className="flex-row items-center" style={{ paddingRight: 8 }}>
            <LiquidGlassBackButton onPress={() => router.back()} />
            <Text style={{ color: colors.text }} className="text-2xl font-bold ml-6">Settings</Text>
          </Animated.View>
        </LinearGradient>

        {/* Account Section */}
        <Animated.View entering={FadeInDown.duration(500).delay(50)} className="px-5 mt-2">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium uppercase tracking-wide mb-3">
            Account
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            {/* Email/Provider */}
            <View className="flex-row items-center py-4 px-4">
              <View className="w-10 h-10 rounded-full items-center justify-center bg-blue-500/20">
                <Mail size={20} color="#3B82F6" />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.textSecondary }} className="text-sm">Signed in as</Text>
                <Text style={{ color: colors.text }} className="text-base font-medium mt-0.5">
                  {authUser?.email || 'Demo Account'}
                </Text>
              </View>
            </View>
            <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
            {/* Provider */}
            <View className="flex-row items-center py-4 px-4">
              <View className="w-10 h-10 rounded-full items-center justify-center bg-purple-500/20">
                <Shield size={20} color="#A78BFA" />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.textSecondary }} className="text-sm">Sign in method</Text>
                <Text style={{ color: colors.text }} className="text-base font-medium mt-0.5">
                  {authUser?.provider === 'apple'
                    ? 'Apple'
                    : authUser?.provider === 'google'
                    ? 'Google'
                    : authUser?.provider === 'email'
                    ? 'Email'
                    : authUser?.provider === 'demo'
                    ? 'Demo'
                    : 'Unknown'}
                </Text>
              </View>
            </View>
            <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
            {/* Sign Out */}
            <Pressable
              onPress={handleSignOut}
              disabled={isSigningOut}
              className="flex-row items-center py-4 px-4"
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
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium uppercase tracking-wide mb-3">
            Profile
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            <SettingRow
              icon={<User size={20} color={colors.isDark ? 'white' : '#374151'} />}
              label="Name"
              value={authUser?.fullName || authUser?.firstName || 'Not set'}
              colors={colors}
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
            <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
            <SettingRow
              icon={<Calendar size={20} color={colors.isDark ? 'white' : '#374151'} />}
              label="Age"
              value={`${currentUser.profile.age} years`}
              colors={colors}
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
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium uppercase tracking-wide mb-3">
            Membership
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            {/* Subscription Status */}
            <View className="flex-row items-center py-4 px-4">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: isPro ? 'rgba(245, 158, 11, 0.2)' : (colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') }}
              >
                <Crown size={20} color={isPro ? '#FFD700' : '#6b7280'} />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.textSecondary }} className="text-sm">Status</Text>
                {isSubscriptionLoading ? (
                  <ActivityIndicator size="small" color="#FA114F" className="mt-1" />
                ) : (
                  <View className="flex-row items-center mt-0.5">
                    {subscriptionTier === 'crusher' ? (
                      <>
                        <LinearGradient
                          colors={['#FFD700', '#FFA500']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}
                        >
                          <Text className="text-black text-xs font-bold">CRUSHER</Text>
                        </LinearGradient>
                        <Text style={{ color: colors.text }} className="text-base font-medium ml-2">Active</Text>
                      </>
                    ) : subscriptionTier === 'mover' ? (
                      <>
                        <LinearGradient
                          colors={['#3b82f6', '#2563eb']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}
                        >
                          <Text className="text-white text-xs font-bold">MOVER</Text>
                        </LinearGradient>
                        <Text style={{ color: colors.text }} className="text-base font-medium ml-2">Active</Text>
                      </>
                    ) : (
                      <Text style={{ color: colors.textSecondary }} className="text-base font-medium">Starter</Text>
                    )}
                  </View>
                )}
              </View>
            </View>

            {isPro ? (
              <>
                <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
                {/* Manage Subscription */}
                <Pressable
                  onPress={handleManageSubscription}
                  className="flex-row items-center py-4 px-4"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                  >
                    <ExternalLink size={20} color={colors.isDark ? 'white' : '#374151'} />
                  </View>
                  <View className="flex-1 ml-4">
                    <Text style={{ color: colors.text }} className="text-base font-medium">Manage Subscription</Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">Cancel or change your plan</Text>
                  </View>
                  <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
                </Pressable>
              </>
            ) : (
              <>
                <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
                {/* Upgrade to Pro */}
                <Pressable
                  onPress={() => router.push('/upgrade')}
                  className="flex-row items-center py-4 px-4"
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center bg-amber-500/20">
                    <Crown size={20} color="#FFD700" />
                  </View>
                  <View className="flex-1 ml-4">
                    <Text style={{ color: colors.text }} className="text-base font-medium">Upgrade to Pro</Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                      {subscriptionTier === 'mover' ? '$49.99' : subscriptionTier === 'crusher' ? '$99.99' : 'Free'}/year
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
                </Pressable>
              </>
            )}

            <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
            {/* Restore Purchases */}
            <Pressable
              onPress={handleRestorePurchases}
              disabled={isRestoring}
              className="flex-row items-center py-4 px-4"
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <RefreshCw size={20} color={colors.isDark ? 'white' : '#374151'} />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.text }} className="text-base font-medium">Restore Purchases</Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">Restore previous subscriptions</Text>
              </View>
              {isRestoring ? (
                <ActivityIndicator size="small" color="#FA114F" />
              ) : (
                <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
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
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium uppercase tracking-wide mb-3">
            Notifications
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            <SettingRow
              icon={<Bell size={20} color={colors.isDark ? 'white' : '#374151'} />}
              label="Notification Settings"
              value="Manage your alerts"
              colors={colors}
              onPress={() => router.push('/notification-settings')}
            />
          </View>
        </Animated.View>

        {/* Privacy */}
        <Animated.View entering={FadeInDown.duration(500).delay(350)} className="px-5 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium uppercase tracking-wide mb-3">
            Privacy
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            <SettingRow
              icon={<Shield size={20} color={colors.isDark ? 'white' : '#374151'} />}
              label="Privacy Settings"
              value="Control your data"
              colors={colors}
              onPress={() => router.push('/privacy-settings')}
            />
          </View>
        </Animated.View>

        {/* Help & Support */}
        <Animated.View entering={FadeInDown.duration(500).delay(400)} className="px-5 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium uppercase tracking-wide mb-3">
            Help & Support
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            <SettingRow
              icon={<HelpCircle size={20} color={colors.isDark ? 'white' : '#374151'} />}
              label="Help & Support"
              value="Get assistance"
              colors={colors}
              onPress={() => router.push('/help-support')}
            />
          </View>
        </Animated.View>

        {/* Legal */}
        <Animated.View entering={FadeInDown.duration(500).delay(425)} className="px-5 mt-6">
          <Text style={{ color: colors.textSecondary }} className="text-sm font-medium uppercase tracking-wide mb-3">
            Legal
          </Text>
          <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.card }}>
            <Pressable
              onPress={() => Linking.openURL('https://movetogetherfitness.com/terms-and-conditions')}
              className="flex-row items-center py-4 px-4"
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <FileText size={20} color={colors.isDark ? 'white' : '#374151'} />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.text }} className="text-base font-medium">Terms and Conditions</Text>
              </View>
              <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
            </Pressable>
            <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
            <Pressable
              onPress={() => Linking.openURL('https://movetogetherfitness.com/privacy')}
              className="flex-row items-center py-4 px-4"
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <Shield size={20} color={colors.isDark ? 'white' : '#374151'} />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.text }} className="text-base font-medium">Privacy Policy</Text>
              </View>
              <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
            </Pressable>
            <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
            <Pressable
              onPress={() => Linking.openURL('https://movetogetherfitness.com/community-guidelines')}
              className="flex-row items-center py-4 px-4"
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <Users size={20} color={colors.isDark ? 'white' : '#374151'} />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.text }} className="text-base font-medium">Community Guidelines</Text>
              </View>
              <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
            </Pressable>
            <View className="h-px mx-4" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
            <Pressable
              onPress={() => Linking.openURL('https://movetogetherfitness.com/acceptable-use')}
              className="flex-row items-center py-4 px-4"
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <BookOpen size={20} color={colors.isDark ? 'white' : '#374151'} />
              </View>
              <View className="flex-1 ml-4">
                <Text style={{ color: colors.text }} className="text-base font-medium">Acceptable Use Policy</Text>
              </View>
              <ChevronRight size={20} color={colors.isDark ? '#4a4a4a' : '#9ca3af'} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Version */}
        <View className="items-center mt-8">
          <Text style={{ color: colors.textSecondary }} className="text-sm">MoveTogether v1.0.0</Text>
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
        colors={colors}
      />

      {/* Select Modal */}
      <SelectModal
        visible={selectModal.visible}
        title={selectModal.title}
        options={selectModal.options}
        selectedValue={selectModal.selectedValue}
        onSelect={handleSelectSave}
        onClose={() => setSelectModal({ ...selectModal, visible: false })}
        colors={colors}
      />
    </View>
  );
}

