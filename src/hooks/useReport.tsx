// src/hooks/useReport.tsx
//
// Hook for managing content reporting flow
// Provides openReportModal function and Modal component to render

import React, { useState, useCallback } from 'react';
import {
  ReportContentModal,
  ContentType,
} from '@/components/moderation/ReportContentModal';

interface ReportTarget {
  contentType: ContentType;
  contentId: string;
  reportedUserId: string;
  reportedUserName?: string;
}

interface UseReportReturn {
  /** Open the report modal for a specific piece of content */
  openReportModal: (
    contentType: ContentType,
    contentId: string,
    reportedUserId: string,
    reportedUserName?: string
  ) => void;
  /** Close the report modal */
  closeReportModal: () => void;
  /** Whether the modal is currently visible */
  isReportModalVisible: boolean;
  /** The Modal component to render (include this in your component tree) */
  ReportModal: React.FC;
}

/**
 * Hook for managing content reporting
 *
 * @example
 * ```tsx
 * function ProfileScreen({ user }) {
 *   const { openReportModal, ReportModal } = useReport();
 *
 *   return (
 *     <View>
 *       <Button
 *         title="Report User"
 *         onPress={() => openReportModal('profile', user.id, user.id, user.display_name)}
 *       />
 *       <ReportModal />
 *     </View>
 *   );
 * }
 * ```
 */
export function useReport(): UseReportReturn {
  const [isVisible, setIsVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const openReportModal = useCallback(
    (
      contentType: ContentType,
      contentId: string,
      reportedUserId: string,
      reportedUserName?: string
    ) => {
      setReportTarget({
        contentType,
        contentId,
        reportedUserId,
        reportedUserName,
      });
      setIsVisible(true);
    },
    []
  );

  const closeReportModal = useCallback(() => {
    setIsVisible(false);
    // Clear target after animation completes
    setTimeout(() => {
      setReportTarget(null);
    }, 300);
  }, []);

  const ReportModal: React.FC = useCallback(() => {
    if (!reportTarget) {
      return null;
    }

    return (
      <ReportContentModal
        visible={isVisible}
        onClose={closeReportModal}
        contentType={reportTarget.contentType}
        contentId={reportTarget.contentId}
        reportedUserId={reportTarget.reportedUserId}
        reportedUserName={reportTarget.reportedUserName}
      />
    );
  }, [isVisible, reportTarget, closeReportModal]);

  return {
    openReportModal,
    closeReportModal,
    isReportModalVisible: isVisible,
    ReportModal,
  };
}

// Re-export ContentType for convenience
export type { ContentType };
