import React, { useState } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { supabase } from '@/lib/supabase';
import { dataExportApi } from '@/lib/edge-functions';
import { useAuthStore } from '@/lib/auth-store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Download,
  FileText,
  User,
  Activity,
  Trophy,
  Users,
  Bell,
  Shield,
  Scale,
  CheckCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const DATA_CATEGORIES = [
  {
    icon: User,
    label: 'Profile Information',
    description: 'Your name, email, avatar, and account details',
  },
  {
    icon: Shield,
    label: 'Privacy & Notification Settings',
    description: 'Your preferences for data sharing and alerts',
  },
  {
    icon: Trophy,
    label: 'Competition History',
    description: 'All competitions you\'ve participated in and your scores',
  },
  {
    icon: Activity,
    label: 'Activity Data',
    description: 'Steps, calories, exercise minutes, and workouts (1 year)',
  },
  {
    icon: Scale,
    label: 'Weight History',
    description: 'Your weight tracking records (1 year)',
  },
  {
    icon: Users,
    label: 'Friends List',
    description: 'Your connected friends on MoveTogether',
  },
  {
    icon: FileText,
    label: 'Achievements',
    description: 'All badges and milestones you\'ve earned',
  },
];

export default function DataExportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);

  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user?.id || !supabase) return;

    Alert.alert(
      'Export Your Data',
      'We\'ll compile all your MoveTogether data and send you a download link via email. This may take a few moments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsExporting(true);

            try {
              if (!supabase) {
                throw new Error('Not connected to database');
              }

              // Get and refresh session if needed
              const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

              if (sessionError) {
                console.error('Session error:', sessionError);
                throw new Error('Session error. Please sign in again.');
              }

              if (!sessionData.session) {
                throw new Error('No active session. Please sign in again.');
              }

              const { data: result, error } = await dataExportApi.exportUserData();

              if (error) {
                throw new Error(error.message || 'Export failed');
              }

              setExportComplete(true);
              setDownloadUrl(result.download_url);

              Alert.alert(
                'Export Ready!',
                user.email
                  ? 'Your data export is ready. We\'ve also sent the download link to your email.'
                  : 'Your data export is ready for download.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Export error:', error);
              Alert.alert(
                'Export Failed',
                'We couldn\'t export your data. Please try again later.'
              );
            } finally {
              setIsExporting(false);
            }
          },
        },
      ]
    );
  };

  const handleDownload = () => {
    if (downloadUrl) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(downloadUrl);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

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
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <Animated.View
            entering={FadeInDown.duration(400)}
            className="flex-row items-center"
          >
            <LiquidGlassBackButton onPress={() => router.back()} />
            <Text
              style={{ color: colors.text }}
              className="text-2xl font-bold ml-4"
            >
              Download My Data
            </Text>
          </Animated.View>
        </View>

        {/* Info */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(50)}
          className="px-5 mt-2"
        >
          <Text style={{ color: colors.textSecondary }} className="text-base">
            You can request a copy of all your MoveTogether data. The export
            will be provided as a JSON file that you can view and keep for your
            records.
          </Text>
        </Animated.View>

        {/* What's Included */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="px-5 mt-6"
        >
          <Text
            style={{ color: colors.text }}
            className="text-lg font-bold mb-3"
          >
            What's Included
          </Text>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.card }}
          >
            {DATA_CATEGORIES.map((category, index) => (
              <View
                key={category.label}
                className="flex-row items-center py-3.5 px-4"
                style={{
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: colors.isDark
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.05)',
                }}
              >
                <View
                  className="w-8 h-8 rounded-full items-center justify-center mr-3"
                  style={{
                    backgroundColor: colors.isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.04)',
                  }}
                >
                  <category.icon size={16} color={colors.textSecondary} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.text }} className="text-base">
                    {category.label}
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary }}
                    className="text-xs"
                  >
                    {category.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Export Button */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(150)}
          className="px-5 mt-8"
        >
          {exportComplete && downloadUrl ? (
            <View>
              <View
                className="flex-row items-center justify-center py-4 px-6 rounded-xl mb-4"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderWidth: 1,
                  borderColor: 'rgba(34, 197, 94, 0.2)',
                }}
              >
                <CheckCircle size={20} color="#22C55E" />
                <Text className="text-green-500 ml-2 font-medium">
                  Export ready!
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleDownload}
                className="py-4 rounded-xl items-center flex-row justify-center"
                style={{ backgroundColor: '#FA114F' }}
                activeOpacity={0.8}
              >
                <Download size={20} color="white" />
                <Text className="text-white font-semibold text-base ml-2">
                  Download Export
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setExportComplete(false);
                  setDownloadUrl(null);
                }}
                className="py-3 mt-3 items-center"
                activeOpacity={0.7}
              >
                <Text
                  style={{ color: colors.textSecondary }}
                  className="text-base"
                >
                  Request New Export
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleExport}
              disabled={isExporting}
              className="py-4 rounded-xl items-center flex-row justify-center"
              style={{
                backgroundColor: isExporting ? colors.card : '#FA114F',
              }}
              activeOpacity={0.8}
            >
              {isExporting ? (
                <>
                  <ActivityIndicator size="small" color="#FA114F" />
                  <Text
                    style={{ color: colors.text }}
                    className="font-semibold text-base ml-2"
                  >
                    Preparing Export...
                  </Text>
                </>
              ) : (
                <>
                  <Download size={20} color="white" />
                  <Text className="text-white font-semibold text-base ml-2">
                    Export My Data
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Note */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5 mt-6"
        >
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm text-center"
          >
            Download links expire after 7 days. You can request a new export at
            any time.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
