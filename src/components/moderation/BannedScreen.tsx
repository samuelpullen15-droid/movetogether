// src/components/moderation/BannedScreen.tsx
//
// Full-screen blocker shown to banned/suspended users
// No way to bypass - must wait out suspension or appeal ban

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Linking,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useModeration } from '@/lib/moderation-context';
import { useAuthStore } from '@/lib/auth-store';

export function BannedScreen() {
  const { moderationStatus, checkStatus } = useModeration();
  const signOut = useAuthStore((s) => s.signOut);
  const [fadeAnim] = useState(new Animated.Value(1)); // Start visible to prevent black screen
  const [countdown, setCountdown] = useState<string>('');

  // Content is immediately visible - no fade animation to prevent black screen issues

  // Update countdown for suspended users
  useEffect(() => {
    if (moderationStatus?.status !== 'suspended' || !moderationStatus.suspension_ends_at) {
      return;
    }

    const updateCountdown = () => {
      const endsAt = new Date(moderationStatus.suspension_ends_at!).getTime();
      const now = Date.now();
      const diff = endsAt - now;

      if (diff <= 0) {
        setCountdown('Checking status...');
        checkStatus();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m remaining`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s remaining`);
      } else {
        setCountdown(`${seconds}s remaining`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [moderationStatus, checkStatus]);

  const isBanned = moderationStatus?.status === 'banned';
  const isSuspended = moderationStatus?.status === 'suspended';

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@movetogether.app?subject=Account%20Appeal');
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Icon */}
        <View style={[styles.iconContainer, isBanned ? styles.bannedIcon : styles.suspendedIcon]}>
          <Ionicons
            name={isBanned ? 'ban' : 'time-outline'}
            size={64}
            color="#FFFFFF"
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {isBanned ? 'Account Banned' : 'Account Suspended'}
        </Text>

        {/* Message */}
        <Text style={styles.message}>
          {moderationStatus?.message || (isBanned
            ? 'Your account has been permanently banned for violating our community guidelines.'
            : 'Your account has been temporarily suspended.'
          )}
        </Text>

        {/* Reason (for bans) */}
        {isBanned && moderationStatus?.ban_reason && (
          <View style={styles.reasonContainer}>
            <Text style={styles.reasonLabel}>Reason:</Text>
            <Text style={styles.reasonText}>{moderationStatus.ban_reason}</Text>
          </View>
        )}

        {/* Countdown (for suspensions) */}
        {isSuspended && countdown && (
          <View style={styles.countdownContainer}>
            <Ionicons name="hourglass-outline" size={24} color="#F59E0B" />
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}

        {/* Guidelines reminder */}
        <View style={styles.guidelinesContainer}>
          <Text style={styles.guidelinesTitle}>Community Guidelines</Text>
          <Text style={styles.guidelinesText}>
            MoveTogether is committed to maintaining a safe, respectful community for all users.
            Violations of our guidelines may result in warnings, suspensions, or permanent bans.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {/* Appeal button (for bans) */}
          {isBanned && (
            <TouchableOpacity
              style={styles.appealButton}
              onPress={handleContactSupport}
              activeOpacity={0.8}
            >
              <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
              <Text style={styles.appealButtonText}>Contact Support</Text>
            </TouchableOpacity>
          )}

          {/* Refresh button (for suspensions) */}
          {isSuspended && (
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={checkStatus}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={20} color="#FA114F" />
              <Text style={styles.refreshButtonText}>Check Status</Text>
            </TouchableOpacity>
          )}

          {/* Sign out button */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#6B7280" />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Appeal info */}
        {isBanned && moderationStatus?.appeal_info && (
          <Text style={styles.appealInfo}>
            {moderationStatus.appeal_info}
          </Text>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  bannedIcon: {
    backgroundColor: '#DC2626',
  },
  suspendedIcon: {
    backgroundColor: '#F59E0B',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  reasonContainer: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 14,
    color: '#F87171',
    lineHeight: 20,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 8,
  },
  countdownText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F59E0B',
  },
  guidelinesContainer: {
    backgroundColor: 'rgba(250, 17, 79, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    width: '100%',
  },
  guidelinesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FA114F',
    marginBottom: 8,
  },
  guidelinesText: {
    fontSize: 13,
    color: '#FDA4AF',
    lineHeight: 20,
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  appealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FA114F',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  appealButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 17, 79, 0.1)',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FA114F',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  appealInfo: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
  },
});