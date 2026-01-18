import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { AchievementCelebration } from '@/components/AchievementCelebration';
import { AchievementTier } from '@/lib/achievements-types';

interface CelebrationItem {
  id: string;
  achievementId: string;
  tier: AchievementTier;
}

interface CelebrationContextType {
  showCelebration: (achievementId: string, tier: AchievementTier) => void;
}

const CelebrationContext = createContext<CelebrationContextType | null>(null);

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [currentCelebration, setCurrentCelebration] = useState<CelebrationItem | null>(null);
  const queue = useRef<CelebrationItem[]>([]);
  const isShowing = useRef(false);

  const showNext = useCallback(() => {
    if (queue.current.length > 0 && !isShowing.current) {
      isShowing.current = true;
      const next = queue.current.shift()!;
      setCurrentCelebration(next);
    }
  }, []);

  const showCelebration = useCallback((achievementId: string, tier: AchievementTier) => {
    const item: CelebrationItem = {
      id: `${achievementId}-${tier}-${Date.now()}`,
      achievementId,
      tier,
    };

    queue.current.push(item);
    
    if (!isShowing.current) {
      showNext();
    }
  }, [showNext]);

  const handleClose = useCallback(() => {
    setCurrentCelebration(null);
    isShowing.current = false;
    
    setTimeout(() => {
      showNext();
    }, 300);
  }, [showNext]);

  return (
    <CelebrationContext.Provider value={{ showCelebration }}>
      <View style={StyleSheet.absoluteFill}>
        {children}
      </View>
      {currentCelebration && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
          <AchievementCelebration
            visible={true}
            achievementId={currentCelebration.achievementId}
            tier={currentCelebration.tier}
            onClose={handleClose}
          />
        </View>
      )}
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  const context = useContext(CelebrationContext);
  if (!context) {
    throw new Error('useCelebration must be used within a CelebrationProvider');
  }
  return context;
}