const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Swift native module code
const SWIFT_MODULE_CODE = `import Foundation
import HealthKit

@objc(ActivitySummaryModule)
class ActivitySummaryModule: NSObject {

  private lazy var healthStore: HKHealthStore = {
    return HKHealthStore()
  }()

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func getActivityGoals(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    print("[ActivitySummaryModule] getActivityGoals called")

    guard HKHealthStore.isHealthDataAvailable() else {
      print("[ActivitySummaryModule] HealthKit is not available on this device")
      reject("health_unavailable", "HealthKit is not available on this device", nil)
      return
    }

    print("[ActivitySummaryModule] HealthKit is available - querying directly")
    // Don't request authorization here - it should already be granted via the main
    // HealthKit permissions flow. This prevents a second permission popup.
    // If not authorized, the query will simply return no data.
    self.queryActivitySummary(resolve: resolve, reject: reject)
  }

  private func queryActivitySummary(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    print("[ActivitySummaryModule] queryActivitySummary called")

    // Create a predicate for today's activity summary
    let calendar = Calendar.current
    let now = Date()
    let startOfDay = calendar.startOfDay(for: now)

    // Create date components for the predicate - MUST include calendar
    var startComponents = calendar.dateComponents([.year, .month, .day], from: startOfDay)
    startComponents.calendar = calendar
    var endComponents = calendar.dateComponents([.year, .month, .day], from: now)
    endComponents.calendar = calendar

    print("[ActivitySummaryModule] Query date range: \\(startComponents) to \\(endComponents)")

    let predicate = HKQuery.predicate(forActivitySummariesBetweenStart: startComponents, end: endComponents)

    let query = HKActivitySummaryQuery(predicate: predicate) { (query, summaries, error) in
      print("[ActivitySummaryModule] Query callback received")

      // Dispatch to main queue for React Native callback
      DispatchQueue.main.async {
        if let error = error {
          print("[ActivitySummaryModule] Query error: \\(error.localizedDescription)")
          // Return defaults instead of rejecting - authorization may not be granted yet
          // or user may not have an Apple Watch
          resolve([
            "moveGoal": 500,
            "exerciseGoal": 30,
            "standGoal": 12,
            "hasData": false
          ])
          return
        }

        print("[ActivitySummaryModule] Query returned \\(summaries?.count ?? 0) summaries")

        guard let summary = summaries?.first else {
          // No activity summary found for today - return default values
          // This can happen if the user doesn't have an Apple Watch or hasn't set goals
          print("[ActivitySummaryModule] No activity summary found for today - returning hasData=false")
          resolve([
            "moveGoal": 500,
            "exerciseGoal": 30,
            "standGoal": 12,
            "hasData": false
          ])
          return
        }

        // Extract the goals from the activity summary
        let moveGoal = summary.activeEnergyBurnedGoal.doubleValue(for: .kilocalorie())
        let exerciseGoal = summary.appleExerciseTimeGoal.doubleValue(for: .minute())
        let standGoal = summary.appleStandHoursGoal.doubleValue(for: .count())

        // Also get current progress
        let moveCalories = summary.activeEnergyBurned.doubleValue(for: .kilocalorie())
        let exerciseMinutes = summary.appleExerciseTime.doubleValue(for: .minute())
        let standHours = summary.appleStandHours.doubleValue(for: .count())

        print("[ActivitySummaryModule] Found activity summary:")
        print("  - Move Goal: \\(moveGoal) kcal, Progress: \\(moveCalories) kcal")
        print("  - Exercise Goal: \\(exerciseGoal) min, Progress: \\(exerciseMinutes) min")
        print("  - Stand Goal: \\(standGoal) hrs, Progress: \\(standHours) hrs")

        resolve([
          "moveGoal": moveGoal,
          "exerciseGoal": exerciseGoal,
          "standGoal": standGoal,
          "moveCalories": moveCalories,
          "exerciseMinutes": exerciseMinutes,
          "standHours": standHours,
          "hasData": true
        ])
      }
    }

    print("[ActivitySummaryModule] Executing query...")
    self.healthStore.execute(query)
    print("[ActivitySummaryModule] Query execution started")
  }
}
`;

// Objective-C bridge code
const OBJC_BRIDGE_CODE = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ActivitySummaryModule, NSObject)

RCT_EXTERN_METHOD(getActivityGoals:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

// Bridging header content
const BRIDGING_HEADER_CONTENT = `//
// Use this file to import your target's public headers that you would like to expose to Swift.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
`;

function withActivitySummaryModule(config) {
  // Add Swift and Objective-C files
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const projectName = config.modRequest.projectName || 'MoveTogether';
      const iosPath = path.join(projectRoot, 'ios', projectName);

      // Ensure the directory exists
      if (!fs.existsSync(iosPath)) {
        fs.mkdirSync(iosPath, { recursive: true });
      }

      // Write Swift file
      const swiftPath = path.join(iosPath, 'ActivitySummaryModule.swift');
      fs.writeFileSync(swiftPath, SWIFT_MODULE_CODE);
      console.log(`[withActivitySummaryModule] Created ${swiftPath}`);

      // Write Objective-C bridge file
      const objcPath = path.join(iosPath, 'ActivitySummaryModule.m');
      fs.writeFileSync(objcPath, OBJC_BRIDGE_CODE);
      console.log(`[withActivitySummaryModule] Created ${objcPath}`);

      // Update bridging header
      const bridgingHeaderPath = path.join(iosPath, `${projectName}-Bridging-Header.h`);
      fs.writeFileSync(bridgingHeaderPath, BRIDGING_HEADER_CONTENT);
      console.log(`[withActivitySummaryModule] Updated ${bridgingHeaderPath}`);

      return config;
    },
  ]);

  // Add files to Xcode project
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectName = config.modRequest.projectName || 'MoveTogether';

    // Find the main group
    const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;

    // Get the project's source group
    const projectGroup = xcodeProject.findPBXGroupKey({ name: projectName }) ||
                         xcodeProject.findPBXGroupKey({ path: projectName });

    if (projectGroup) {
      // Add Swift file to project
      const swiftFile = xcodeProject.addSourceFile(
        `${projectName}/ActivitySummaryModule.swift`,
        { target: xcodeProject.getFirstTarget().uuid },
        projectGroup
      );

      // Add Objective-C file to project
      const objcFile = xcodeProject.addSourceFile(
        `${projectName}/ActivitySummaryModule.m`,
        { target: xcodeProject.getFirstTarget().uuid },
        projectGroup
      );

      console.log('[withActivitySummaryModule] Added files to Xcode project');
    }

    return config;
  });

  return config;
}

module.exports = withActivitySummaryModule;
