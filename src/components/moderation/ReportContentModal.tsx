// src/components/moderation/ReportContentModal.tsx
//
// Generic modal for reporting content (profiles, photos, posts, competitions, messages)
// Anonymous: Reported user never sees who reported them

import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Linking,
  Pressable,
} from 'react-native';
import { Text } from '@/components/Text';
import { useThemeColors } from '@/lib/useThemeColors';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import {
  X,
  AlertTriangle,
  MessageSquareOff,
  Ban,
  Skull,
  UserX,
  ImageOff,
  HelpCircle,
  Check,
  ExternalLink,
  Shield,
} from 'lucide-react-native';

export type ContentType = 'profile' | 'photo' | 'post' | 'competition' | 'message';

export type ReportReason =
  | 'harassment'
  | 'hate_speech'
  | 'spam'
  | 'explicit_content'
  | 'violence'
  | 'impersonation'
  | 'other';

interface ReportContentModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: ContentType;
  contentId: string;
  reportedUserId: string;
  reportedUserName?: string;
}

interface ReasonOption {
  value: ReportReason;
  label: string;
  description: string;
  icon: typeof AlertTriangle;
}

const REPORT_REASONS: ReasonOption[] = [
  {
    value: 'harassment',
    label: 'Harassment or bullying',
    description: 'Intimidating, threatening, or targeting someone',
    icon: MessageSquareOff,
  },
  {
    value: 'hate_speech',
    label: 'Hate speech or discrimination',
    description: 'Content promoting hatred based on identity',
    icon: Ban,
  },
  {
    value: 'spam',
    label: 'Spam or misleading',
    description: 'Repetitive, promotional, or deceptive content',
    icon: AlertTriangle,
  },
  {
    value: 'explicit_content',
    label: 'Inappropriate or explicit',
    description: 'Sexual, graphic, or offensive material',
    icon: ImageOff,
  },
  {
    value: 'violence',
    label: 'Violence or threats',
    description: 'Content depicting or encouraging harm',
    icon: Skull,
  },
  {
    value: 'impersonation',
    label: 'Impersonation or fake',
    description: 'Pretending to be someone else',
    icon: UserX,
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else not listed above',
    icon: HelpCircle,
  },
];

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  profile: 'Profile',
  photo: 'Photo',
  post: 'Activity Post',
  competition: 'Competition Participant',
  message: 'Chat Message',
};

const SUPABASE_URL =
  Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

export function ReportContentModal({
  visible,
  onClose,
  contentType,
  contentId,
  reportedUserId,
  reportedUserName,
}: ReportContentModalProps) {
  const colors = useThemeColors();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [otherReason, setOtherReason] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedReason(null);
      setOtherReason('');
      setAdditionalDetails('');
      setError(null);
      setSuccess(false);
    }
  }, [visible]);

  const handleSelectReason = (reason: ReportReason) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedReason(reason);
    setError(null);
  };

  const handleOpenGuidelines = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('https://movetogetherfitness.com/community-guidelines');
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;

    // Validate "Other" reason has description
    if (selectedReason === 'other' && !otherReason.trim()) {
      setError('Please describe what you are reporting');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('You must be logged in to submit a report');
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reported_user_id: reportedUserId,
          category: selectedReason,
          content_type: contentType,
          content_id: contentId,
          description:
            selectedReason === 'other'
              ? `[Other: ${otherReason.trim()}] ${additionalDetails.trim()}`
              : additionalDetails.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.rate_limited) {
          setError(data.error || 'You have reached your report limit. Please try again later.');
        } else if (data.duplicate) {
          setError('You have already reported this content recently.');
        } else {
          setError(data.error || 'Failed to submit report. Please try again.');
        }
        return;
      }

      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-close after showing success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Report submission error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const isSubmitDisabled =
    !selectedReason || isSubmitting || (selectedReason === 'other' && !otherReason.trim());

  if (success) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View className="flex-1 items-center justify-center px-8">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: '#10B98120' }}
            >
              <Check size={40} color="#10B981" strokeWidth={3} />
            </View>
            <Text style={{ color: colors.text }} className="text-2xl font-bold text-center mb-3">
              Report Submitted
            </Text>
            <Text
              style={{ color: colors.textSecondary }}
              className="text-base text-center leading-6"
            >
              Thank you for helping keep our community safe. We'll review your report and take
              appropriate action.
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-2">
            <Text style={{ color: colors.text }} className="text-xl font-bold">
              Report {CONTENT_TYPE_LABELS[contentType]}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              disabled={isSubmitting}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.card }}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Subheader with anonymous notice */}
          <View className="px-5 pb-4">
            <View
              className="flex-row items-center p-3 rounded-xl"
              style={{ backgroundColor: colors.card }}
            >
              <Shield size={18} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary }} className="text-sm ml-2 flex-1">
                Your report is anonymous. The reported user will not know who submitted it.
              </Text>
            </View>
          </View>

          {/* Community Guidelines Link */}
          <TouchableOpacity
            onPress={handleOpenGuidelines}
            className="flex-row items-center mx-5 mb-6 px-4 py-3 rounded-xl"
            style={{ backgroundColor: '#FA114F15' }}
            activeOpacity={0.7}
          >
            <ExternalLink size={18} color="#FA114F" />
            <Text style={{ color: '#FA114F' }} className="text-sm font-medium ml-2 flex-1">
              Review our Community Guidelines
            </Text>
          </TouchableOpacity>

          {/* Reason Selection */}
          <View className="px-5 mb-4">
            <Text style={{ color: colors.text }} className="text-base font-semibold mb-3">
              Why are you reporting this {contentType}?
            </Text>

            {REPORT_REASONS.map((reason) => {
              const isSelected = selectedReason === reason.value;
              const IconComponent = reason.icon;

              return (
                <Pressable
                  key={reason.value}
                  onPress={() => handleSelectReason(reason.value)}
                  className="flex-row items-center p-4 rounded-xl mb-2"
                  style={{
                    backgroundColor: isSelected ? '#FA114F15' : colors.card,
                    borderWidth: 2,
                    borderColor: isSelected ? '#FA114F' : 'transparent',
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: isSelected ? '#FA114F20' : colors.bg }}
                  >
                    <IconComponent size={20} color={isSelected ? '#FA114F' : colors.textSecondary} />
                  </View>
                  <View className="flex-1">
                    <Text
                      style={{ color: isSelected ? '#FA114F' : colors.text }}
                      className="text-base font-medium"
                    >
                      {reason.label}
                    </Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
                      {reason.description}
                    </Text>
                  </View>
                  {isSelected && (
                    <View
                      className="w-6 h-6 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#FA114F' }}
                    >
                      <Check size={14} color="white" strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Other Reason Input */}
          {selectedReason === 'other' && (
            <View className="px-5 mb-4">
              <Text style={{ color: colors.text }} className="text-sm font-medium mb-2">
                Please describe the issue *
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.card,
                  color: colors.text,
                  borderRadius: 12,
                  padding: 16,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
                placeholder="What's the problem with this content?"
                placeholderTextColor={colors.textSecondary}
                value={otherReason}
                onChangeText={setOtherReason}
                multiline
                maxLength={500}
              />
              <Text style={{ color: colors.textSecondary }} className="text-xs text-right mt-1">
                {otherReason.length}/500
              </Text>
            </View>
          )}

          {/* Additional Details (Optional) */}
          {selectedReason && selectedReason !== 'other' && (
            <View className="px-5 mb-4">
              <Text style={{ color: colors.text }} className="text-sm font-medium mb-2">
                Additional details (optional)
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.card,
                  color: colors.text,
                  borderRadius: 12,
                  padding: 16,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
                placeholder="Provide any additional context..."
                placeholderTextColor={colors.textSecondary}
                value={additionalDetails}
                onChangeText={setAdditionalDetails}
                multiline
                maxLength={1000}
              />
              <Text style={{ color: colors.textSecondary }} className="text-xs text-right mt-1">
                {additionalDetails.length}/1000
              </Text>
            </View>
          )}

          {/* Error Message */}
          {error && (
            <View
              className="flex-row items-center mx-5 mb-4 p-3 rounded-xl"
              style={{ backgroundColor: '#EF444420' }}
            >
              <AlertTriangle size={18} color="#EF4444" />
              <Text style={{ color: '#EF4444' }} className="text-sm ml-2 flex-1">
                {error}
              </Text>
            </View>
          )}

          {/* Submit Button */}
          <View className="px-5 mt-2">
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitDisabled}
              className="py-4 rounded-xl items-center justify-center"
              style={{
                backgroundColor: isSubmitDisabled ? colors.card : '#EF4444',
                opacity: isSubmitDisabled ? 0.6 : 1,
              }}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className="text-base font-semibold"
                  style={{ color: isSubmitDisabled ? colors.textSecondary : 'white' }}
                >
                  Submit Report
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Cancel Button */}
          <TouchableOpacity
            onPress={handleClose}
            disabled={isSubmitting}
            className="items-center py-4 mt-2"
            activeOpacity={0.7}
          >
            <Text style={{ color: colors.textSecondary }} className="text-base">
              Cancel
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}
