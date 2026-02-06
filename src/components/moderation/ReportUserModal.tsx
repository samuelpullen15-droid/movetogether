// src/components/moderation/ReportUserModal.tsx
//
// Modal for users to report other users
// Secure: Only sends data to Edge Function, no client-side logic
// Anonymous: Reported user never sees who reported them

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

interface ReportUserModalProps {
  visible: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedUserName?: string;
}

type ReportCategory = 'inappropriate_content' | 'harassment' | 'spam' | 'fake_profile';

interface CategoryOption {
  value: ReportCategory;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const REPORT_CATEGORIES: CategoryOption[] = [
  {
    value: 'inappropriate_content',
    label: 'Inappropriate Content',
    description: 'Offensive photos, bio, or profile content',
    icon: 'warning-outline',
  },
  {
    value: 'harassment',
    label: 'Harassment',
    description: 'Bullying, threats, or unwanted contact',
    icon: 'hand-left-outline',
  },
  {
    value: 'spam',
    label: 'Spam',
    description: 'Promotional content, scams, or repetitive messages',
    icon: 'mail-unread-outline',
  },
  {
    value: 'fake_profile',
    label: 'Fake Profile',
    description: 'Impersonation, catfishing, or bot account',
    icon: 'person-outline',
  },
];

// Get Supabase URL from environment
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

export function ReportUserModal({
  visible,
  onClose,
  reportedUserId,
  reportedUserName,
}: ReportUserModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reportsRemaining, setReportsRemaining] = useState<number | null>(null);

  const handleSubmit = async () => {
    if (!selectedCategory) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Get current session for auth header
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setError('You must be logged in to submit a report');
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/submit-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            reported_user_id: reportedUserId,
            category: selectedCategory,
            description: description.trim() || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.rate_limited) {
          setError(data.error || 'You have reached your report limit. Please try again later.');
        } else if (data.duplicate) {
          setError('You have already reported this user for this reason recently.');
        } else {
          setError(data.error || 'Failed to submit report. Please try again.');
        }
        return;
      }

      setSuccess(true);
      setReportsRemaining(data.reports_remaining);

      // Auto-close after showing success
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      console.error('Report submission error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setSelectedCategory(null);
    setDescription('');
    setError(null);
    setSuccess(false);
    setReportsRemaining(null);
    onClose();
  };

  const renderContent = () => {
    if (success) {
      return (
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          </View>
          <Text style={styles.successTitle}>Report Submitted</Text>
          <Text style={styles.successMessage}>
            Thank you for helping keep our community safe. We'll review your report shortly.
          </Text>
          {reportsRemaining !== null && reportsRemaining < 5 && (
            <Text style={styles.remainingText}>
              {reportsRemaining} reports remaining today
            </Text>
          )}
        </View>
      );
    }

    return (
      <>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Report User</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {reportedUserName && (
          <Text style={styles.subtitle}>
            Report {reportedUserName}
          </Text>
        )}

        {/* Category Selection */}
        <Text style={styles.sectionTitle}>What's the issue?</Text>
        <View style={styles.categoriesContainer}>
          {REPORT_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.value}
              style={[
                styles.categoryOption,
                selectedCategory === category.value && styles.categoryOptionSelected,
              ]}
              onPress={() => setSelectedCategory(category.value)}
              activeOpacity={0.7}
            >
              <View style={styles.categoryIcon}>
                <Ionicons
                  name={category.icon}
                  size={24}
                  color={selectedCategory === category.value ? '#FA114F' : '#9CA3AF'}
                />
              </View>
              <View style={styles.categoryText}>
                <Text
                  style={[
                    styles.categoryLabel,
                    selectedCategory === category.value && styles.categoryLabelSelected,
                  ]}
                >
                  {category.label}
                </Text>
                <Text style={styles.categoryDescription}>{category.description}</Text>
              </View>
              {selectedCategory === category.value && (
                <Ionicons name="checkmark-circle" size={24} color="#FA114F" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Optional Description */}
        {selectedCategory && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Additional details (optional)</Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Provide any additional context that might help us review this report..."
              placeholderTextColor="#6B7280"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{description.length}/2000</Text>
          </View>
        )}

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Privacy Notice */}
        <View style={styles.privacyNotice}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#6B7280" />
          <Text style={styles.privacyText}>
            Your report is anonymous. The reported user will not know who submitted this report.
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, !selectedCategory && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!selectedCategory || isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="flag" size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Submit Report</Text>
            </>
          )}
        </TouchableOpacity>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderContent()}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  categoriesContainer: {
    gap: 12,
    marginBottom: 24,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryOptionSelected: {
    borderColor: '#FA114F',
    backgroundColor: 'rgba(250, 17, 79, 0.1)',
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryText: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  categoryLabelSelected: {
    color: '#FA114F',
  },
  categoryDescription: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  descriptionContainer: {
    marginBottom: 24,
  },
  descriptionInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 100,
    maxHeight: 200,
  },
  charCount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#EF4444',
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    gap: 8,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#374151',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  remainingText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 16,
  },
});
