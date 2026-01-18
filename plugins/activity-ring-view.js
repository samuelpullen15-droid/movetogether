const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_CODE = `import Foundation
import UIKit
import HealthKit
import HealthKitUI

@objc(ActivityRingView)
class ActivityRingView: UIView {
  private var activityRingView: HKActivityRingView?
  
  @objc var moveProgress: Double = 0 {
    didSet { updateRings() }
  }
  @objc var moveGoal: Double = 500 {
    didSet { updateRings() }
  }
  @objc var exerciseProgress: Double = 0 {
    didSet { updateRings() }
  }
  @objc var exerciseGoal: Double = 30 {
    didSet { updateRings() }
  }
  @objc var standProgress: Double = 0 {
    didSet { updateRings() }
  }
  @objc var standGoal: Double = 12 {
    didSet { updateRings() }
  }
  
  override init(frame: CGRect) {
    super.init(frame: frame)
    setupActivityRingView()
  }
  
  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupActivityRingView()
  }
  
  private func setupActivityRingView() {
    let ringView = HKActivityRingView()
    ringView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(ringView)
    
    NSLayoutConstraint.activate([
      ringView.topAnchor.constraint(equalTo: topAnchor),
      ringView.bottomAnchor.constraint(equalTo: bottomAnchor),
      ringView.leadingAnchor.constraint(equalTo: leadingAnchor),
      ringView.trailingAnchor.constraint(equalTo: trailingAnchor)
    ])
    
    self.activityRingView = ringView
    updateRings()
  }
  
  private func updateRings() {
    guard let ringView = activityRingView else { return }
    
    let summary = HKActivitySummary()
    
    let moveQuantity = HKQuantity(unit: .kilocalorie(), doubleValue: moveProgress)
    let moveGoalQuantity = HKQuantity(unit: .kilocalorie(), doubleValue: max(moveGoal, 1))
    summary.activeEnergyBurned = moveQuantity
    summary.activeEnergyBurnedGoal = moveGoalQuantity
    
    let exerciseQuantity = HKQuantity(unit: .minute(), doubleValue: exerciseProgress)
    let exerciseGoalQuantity = HKQuantity(unit: .minute(), doubleValue: max(exerciseGoal, 1))
    summary.appleExerciseTime = exerciseQuantity
    summary.appleExerciseTimeGoal = exerciseGoalQuantity
    
    let standQuantity = HKQuantity(unit: .count(), doubleValue: standProgress)
    let standGoalQuantity = HKQuantity(unit: .count(), doubleValue: max(standGoal, 1))
    summary.appleStandHours = standQuantity
    summary.appleStandHoursGoal = standGoalQuantity
    
    ringView.setActivitySummary(summary, animated: true)
  }
}
`;

const OBJC_HEADER = `#import <React/RCTViewManager.h>

@interface ActivityRingViewManager : RCTViewManager
@end
`;

const OBJC_IMPL = `#import "ActivityRingViewManager.h"
#import <HealthKit/HealthKit.h>
#import <HealthKitUI/HealthKitUI.h>

@interface ActivityRingView : UIView
@property (nonatomic, strong) HKActivityRingView *activityRingView;
@property (nonatomic, assign) double moveProgress;
@property (nonatomic, assign) double moveGoal;
@property (nonatomic, assign) double exerciseProgress;
@property (nonatomic, assign) double exerciseGoal;
@property (nonatomic, assign) double standProgress;
@property (nonatomic, assign) double standGoal;
@end

@implementation ActivityRingView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _moveGoal = 500;
    _exerciseGoal = 30;
    _standGoal = 12;
    [self setupActivityRingView];
  }
  return self;
}

- (void)setupActivityRingView {
  _activityRingView = [[HKActivityRingView alloc] init];
  _activityRingView.translatesAutoresizingMaskIntoConstraints = NO;
  [self addSubview:_activityRingView];
  
  [NSLayoutConstraint activateConstraints:@[
    [_activityRingView.topAnchor constraintEqualToAnchor:self.topAnchor],
    [_activityRingView.bottomAnchor constraintEqualToAnchor:self.bottomAnchor],
    [_activityRingView.leadingAnchor constraintEqualToAnchor:self.leadingAnchor],
    [_activityRingView.trailingAnchor constraintEqualToAnchor:self.trailingAnchor]
  ]];
  
  [self updateRings];
}

- (void)setMoveProgress:(double)moveProgress {
  _moveProgress = moveProgress;
  [self updateRings];
}

- (void)setMoveGoal:(double)moveGoal {
  _moveGoal = moveGoal;
  [self updateRings];
}

- (void)setExerciseProgress:(double)exerciseProgress {
  _exerciseProgress = exerciseProgress;
  [self updateRings];
}

- (void)setExerciseGoal:(double)exerciseGoal {
  _exerciseGoal = exerciseGoal;
  [self updateRings];
}

- (void)setStandProgress:(double)standProgress {
  _standProgress = standProgress;
  [self updateRings];
}

- (void)setStandGoal:(double)standGoal {
  _standGoal = standGoal;
  [self updateRings];
}

- (void)updateRings {
  HKActivitySummary *summary = [[HKActivitySummary alloc] init];
  
  summary.activeEnergyBurned = [HKQuantity quantityWithUnit:[HKUnit kilocalorieUnit] doubleValue:_moveProgress];
  summary.activeEnergyBurnedGoal = [HKQuantity quantityWithUnit:[HKUnit kilocalorieUnit] doubleValue:MAX(_moveGoal, 1)];
  
  summary.appleExerciseTime = [HKQuantity quantityWithUnit:[HKUnit minuteUnit] doubleValue:_exerciseProgress];
  summary.appleExerciseTimeGoal = [HKQuantity quantityWithUnit:[HKUnit minuteUnit] doubleValue:MAX(_exerciseGoal, 1)];
  
  summary.appleStandHours = [HKQuantity quantityWithUnit:[HKUnit countUnit] doubleValue:_standProgress];
  summary.appleStandHoursGoal = [HKQuantity quantityWithUnit:[HKUnit countUnit] doubleValue:MAX(_standGoal, 1)];
  
  [_activityRingView setActivitySummary:summary animated:YES];
}

@end

@implementation ActivityRingViewManager

RCT_EXPORT_MODULE()

- (UIView *)view {
  return [[ActivityRingView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(moveProgress, double)
RCT_EXPORT_VIEW_PROPERTY(moveGoal, double)
RCT_EXPORT_VIEW_PROPERTY(exerciseProgress, double)
RCT_EXPORT_VIEW_PROPERTY(exerciseGoal, double)
RCT_EXPORT_VIEW_PROPERTY(standProgress, double)
RCT_EXPORT_VIEW_PROPERTY(standGoal, double)

@end
`;

function withActivityRingView(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosPath = path.join(cfg.modRequest.projectRoot, 'ios', 'MoveTogether');
      
      if (!fs.existsSync(iosPath)) {
        fs.mkdirSync(iosPath, { recursive: true });
      }
      
      // Write Objective-C header
      fs.writeFileSync(path.join(iosPath, 'ActivityRingViewManager.h'), OBJC_HEADER);
      
      // Write Objective-C implementation (contains both view and manager)
      fs.writeFileSync(path.join(iosPath, 'ActivityRingViewManager.m'), OBJC_IMPL);
      
      console.log('✅ Created ActivityRingView native files (Objective-C)');
      
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const targetName = 'MoveTogether';
    
    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    let targetGroupKey = null;
    
    for (const key in groups) {
      const group = groups[key];
      if (group && (group.name === targetName || group.path === targetName)) {
        targetGroupKey = key;
        break;
      }
    }
    
    if (targetGroupKey) {
      try {
        xcodeProject.addSourceFile(
          targetName + '/ActivityRingViewManager.m',
          { target: xcodeProject.getFirstTarget().uuid },
          targetGroupKey
        );
        console.log('✅ Added ActivityRingViewManager.m to Xcode project');
      } catch (e) {
        console.log('⚠️ File may already exist in project');
      }
    }
    
    return cfg;
  });

  return config;
}

module.exports = withActivityRingView;