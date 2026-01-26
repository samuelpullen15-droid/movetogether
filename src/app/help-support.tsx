import { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Text } from "@/components/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useThemeColors } from "@/lib/useThemeColors";
import { useAuthStore } from "@/lib/auth-store";
import { supabase } from "@/lib/supabase";
import { LiquidGlassIconButton } from "@/components/LiquidGlassIconButton";
import {
  BookOpen,
  MessageCircle,
  MessageSquare,
  ExternalLink,
  X,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Intercom from "@intercom/intercom-react-native";
import * as Sentry from "@sentry/react-native";

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleHelpCenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("https://help.movetogetherfitness.com/en");
  };

  const handleSendFeedback = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Sentry.showFeedbackWidget();
  };

  const handleChatSupport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoadingChat(true);

    try {
      if (user?.id) {
        // Try to get JWT token for identity verification
        let hasValidToken = false;

        try {
          // Refresh session to get a valid access token
          const { data: refreshData, error: refreshError } =
            await supabase.auth.refreshSession();
          const accessToken = refreshData?.session?.access_token;

          if (refreshError || !accessToken) {
            console.warn(
              "[HelpSupport] Session refresh failed, continuing without identity verification",
            );
          } else {
            // Call the Edge Function to get Intercom JWT
            const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
            const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

            const response = await fetch(
              `${supabaseUrl}/functions/v1/get-intercom-token`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                  apikey: supabaseAnonKey || "",
                },
              },
            );

            if (response.ok) {
              const data = await response.json();
              if (data?.userHash) {
                await Intercom.setUserHash(data.userHash);
                hasValidToken = true;
              }
            }
          }
        } catch (tokenErr) {
          console.warn(
            "[HelpSupport] Identity verification error, continuing without:",
            tokenErr,
          );
        }

        // Login with user attributes
        await Intercom.loginUserWithUserAttributes({
          email: user.email,
          userId: user.id,
          name: user.display_name || undefined,
        });
      } else {
        await Intercom.loginUnidentifiedUser();
      }

      // Present Intercom directly
      await Intercom.present();
    } catch (err) {
      console.error("[HelpSupport] Error opening Intercom:", err);
    } finally {
      setIsLoadingChat(false);
    }
  };

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: colors.bg, paddingTop: insets.top }}
    >
      {/* Close Button */}
      <View className="absolute right-4 z-10" style={{ top: 12 }}>
        <LiquidGlassIconButton
          onPress={handleClose}
          iconName="xmark"
          size={44}
          iconSize={20}
          icon={<X size={20} color={colors.text} />}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Animated.View
          entering={FadeInDown.duration(400)}
          className="px-5 mt-4 mb-2"
        >
          <Text
            style={{ color: colors.text }}
            className="text-2xl font-bold text-center"
          >
            Help & Support
          </Text>
        </Animated.View>

        {/* Description */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="px-12 mb-6"
        >
          <Text
            style={{ color: colors.textSecondary }}
            className="text-base text-center"
          >
            Need help? Browse our Help Center or chat with our support team.
          </Text>
        </Animated.View>

        {/* Support Options */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(200)}
          className="px-5"
        >
          {/* Help Center */}
          <Pressable
            onPress={handleHelpCenter}
            className="rounded-2xl overflow-hidden mb-4"
            style={{ backgroundColor: colors.card }}
          >
            <View className="p-5">
              <View className="flex-row items-center">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: colors.isDark
                      ? "rgba(59, 130, 246, 0.2)"
                      : "rgba(59, 130, 246, 0.1)",
                  }}
                >
                  <BookOpen size={24} color="#3B82F6" />
                </View>
                <View className="flex-1 ml-4">
                  <Text
                    style={{ color: colors.text }}
                    className="text-lg font-semibold"
                  >
                    Help Center
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary }}
                    className="text-sm mt-1"
                  >
                    Browse articles and FAQs
                  </Text>
                </View>
                <ExternalLink
                  size={20}
                  color={colors.isDark ? "#4a4a4a" : "#9ca3af"}
                />
              </View>
            </View>
          </Pressable>

          {/* Chat with Support */}
          <Pressable
            onPress={handleChatSupport}
            disabled={isLoadingChat}
            className="rounded-2xl overflow-hidden mb-4"
            style={{
              backgroundColor: colors.card,
              opacity: isLoadingChat ? 0.7 : 1,
            }}
          >
            <View className="p-5">
              <View className="flex-row items-center">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: colors.isDark
                      ? "rgba(139, 92, 246, 0.2)"
                      : "rgba(139, 92, 246, 0.1)",
                  }}
                >
                  {isLoadingChat ? (
                    <ActivityIndicator size="small" color="#8B5CF6" />
                  ) : (
                    <MessageCircle size={24} color="#8B5CF6" />
                  )}
                </View>
                <View className="flex-1 ml-4">
                  <Text
                    style={{ color: colors.text }}
                    className="text-lg font-semibold"
                  >
                    Chat with Support
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary }}
                    className="text-sm mt-1"
                  >
                    {isLoadingChat
                      ? "Connecting..."
                      : "Get help from our support team"}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>

          {/* Send Feedback */}
          <Pressable
            onPress={handleSendFeedback}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.card }}
          >
            <View className="p-5">
              <View className="flex-row items-center">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: colors.isDark
                      ? "rgba(250, 17, 79, 0.2)"
                      : "rgba(250, 17, 79, 0.1)",
                  }}
                >
                  <MessageSquare size={24} color="#FA114F" />
                </View>
                <View className="flex-1 ml-4">
                  <Text
                    style={{ color: colors.text }}
                    className="text-lg font-semibold"
                  >
                    Send Feedback
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary }}
                    className="text-sm mt-1"
                  >
                    Report a bug or share your ideas
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>

        </Animated.View>

        {/* Additional Info */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(300)}
          className="px-5 mt-8"
        >
          <Text
            style={{ color: colors.textSecondary }}
            className="text-sm text-center"
          >
            Our support team is available 24/7 to help you with any questions or
            issues.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
