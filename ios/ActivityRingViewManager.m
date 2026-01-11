//
//  ActivityRingViewManager.m
//  MoveTogether
//
//  Objective-C bridge for the ActivityRingView native module
//

#import <React/RCTViewManager.h>

@interface RCT_EXTERN_REMAP_MODULE(ActivityRingView, ActivityRingViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(moveProgress, double)
RCT_EXPORT_VIEW_PROPERTY(moveGoal, double)
RCT_EXPORT_VIEW_PROPERTY(exerciseProgress, double)
RCT_EXPORT_VIEW_PROPERTY(exerciseGoal, double)
RCT_EXPORT_VIEW_PROPERTY(standProgress, double)
RCT_EXPORT_VIEW_PROPERTY(standGoal, double)

@end
