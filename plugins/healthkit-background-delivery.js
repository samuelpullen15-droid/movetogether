const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// HealthKitBackgroundDelivery.swift — core background delivery logic
const SWIFT_BACKGROUND_DELIVERY = `//
//  HealthKitBackgroundDelivery.swift
//  MoveTogether
//

import Foundation
import HealthKit

class HealthKitBackgroundDelivery: NSObject {
    static let shared = HealthKitBackgroundDelivery()

    private let healthStore = HKHealthStore()
    private let backgroundQueue = DispatchQueue(label: "com.movetogether.healthkit.background", qos: .background)

    // Health data types we want to observe
    private let observedTypes: [HKSampleType] = [
        HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
        HKQuantityType.quantityType(forIdentifier: .appleExerciseTime)!,
        HKQuantityType.quantityType(forIdentifier: .appleStandTime)!,
        HKQuantityType.quantityType(forIdentifier: .stepCount)!
    ]

    private var observerQueries: [HKObserverQuery] = []

    private override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Register HealthKit observer queries with background delivery
    /// Must be called on every app launch for background delivery to work
    func registerObservers(completion: @escaping (Bool, Error?) -> Void) {
        // Request authorization first
        let typesToRead = Set(observedTypes + [HKObjectType.activitySummaryType()])

        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, NSError(domain: "HealthKit", code: -1, userInfo: [NSLocalizedDescriptionKey: "HealthKit is not available on this device"]))
            return
        }

        healthStore.requestAuthorization(toShare: nil, read: typesToRead) { [weak self] success, error in
            guard let self = self else { return }

            if let error = error {
                print("HealthKit authorization failed: \\(error.localizedDescription)")
                completion(false, error)
                return
            }

            guard success else {
                print("HealthKit authorization denied")
                completion(false, NSError(domain: "HealthKit", code: -2, userInfo: [NSLocalizedDescriptionKey: "HealthKit authorization denied"]))
                return
            }

            print("HealthKit authorization granted")

            // Stop any existing queries
            self.stopObservers()

            // Register observer queries and enable background delivery
            self.setupObserverQueries()

            completion(true, nil)
        }
    }

    /// Stop all active observer queries
    func stopObservers() {
        observerQueries.forEach { healthStore.stop($0) }
        observerQueries.removeAll()
        print("Stopped all HealthKit observer queries")
    }

    // MARK: - Private Methods

    private func setupObserverQueries() {
        for type in observedTypes {
            // Create observer query
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] query, completionHandler, error in
                guard let self = self else {
                    completionHandler()
                    return
                }

                if let error = error {
                    print("Observer query error for \\(type.identifier): \\(error.localizedDescription)")
                    completionHandler()
                    return
                }

                print("HealthKit observer triggered for: \\(type.identifier)")

                // Handle new data on background queue
                self.backgroundQueue.async {
                    self.handleNewData()
                    completionHandler()
                }
            }

            // Start the observer query
            healthStore.execute(query)
            observerQueries.append(query)

            // Enable background delivery for this type
            healthStore.enableBackgroundDelivery(for: type, frequency: .immediate) { success, error in
                if let error = error {
                    print("Failed to enable background delivery for \\(type.identifier): \\(error.localizedDescription)")
                } else if success {
                    print("Background delivery enabled for: \\(type.identifier)")
                } else {
                    print("Background delivery not enabled for: \\(type.identifier)")
                }
            }
        }

        print("Registered \\(observedTypes.count) HealthKit observer queries")
    }

    private func handleNewData() {
        print("Handling new HealthKit data...")

        // Get today's date components
        let calendar = Calendar.current
        let now = Date()
        let today = calendar.startOfDay(for: now)

        // Create a group to coordinate async operations
        let group = DispatchGroup()

        var moveCalories: Double = 0
        var exerciseMinutes: Double = 0
        var standHours: Int = 0
        var steps: Double = 0
        var moveGoal: Double = 0
        var exerciseGoal: Double = 0
        var standGoal: Int = 0

        // Query Activity Summary
        group.enter()
        queryActivitySummary(for: today) { summary in
            if let summary = summary {
                moveCalories = summary.activeEnergyBurned.doubleValue(for: .kilocalorie())
                exerciseMinutes = summary.appleExerciseTime.doubleValue(for: .minute())
                standHours = Int(summary.appleStandHours.doubleValue(for: .count()))
                moveGoal = summary.activeEnergyBurnedGoal.doubleValue(for: .kilocalorie())
                exerciseGoal = summary.appleExerciseTimeGoal.doubleValue(for: .minute())
                standGoal = Int(summary.appleStandHoursGoal.doubleValue(for: .count()))

                print("Activity Summary - Move: \\(moveCalories)/\\(moveGoal) kcal, Exercise: \\(exerciseMinutes)/\\(exerciseGoal) min, Stand: \\(standHours)/\\(standGoal) hrs")
            } else {
                print("No activity summary available for today")
            }
            group.leave()
        }

        // Query Step Count
        group.enter()
        queryStepCount(for: today) { count in
            steps = count
            print("Steps: \\(steps)")
            group.leave()
        }

        // When all queries complete, send to Supabase
        group.notify(queue: backgroundQueue) {
            self.sendToSupabase(
                date: today,
                moveCalories: moveCalories,
                exerciseMinutes: exerciseMinutes,
                standHours: standHours,
                steps: steps
            )
        }
    }

    private func queryActivitySummary(for date: Date, completion: @escaping (HKActivitySummary?) -> Void) {
        let calendar = Calendar.current
        var dateComponents = calendar.dateComponents([.year, .month, .day, .era], from: date)

        let predicate = HKQuery.predicateForActivitySummary(with: dateComponents)

        let query = HKActivitySummaryQuery(predicate: predicate) { query, summaries, error in
            if let error = error {
                print("Activity summary query error: \\(error.localizedDescription)")
                completion(nil)
                return
            }

            completion(summaries?.first)
        }

        healthStore.execute(query)
    }

    private func queryStepCount(for date: Date, completion: @escaping (Double) -> Void) {
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            completion(0)
            return
        }

        let calendar = Calendar.current
        let endDate = calendar.startOfDay(for: Date().addingTimeInterval(86400)) // Tomorrow at midnight
        let predicate = HKQuery.predicateForSamples(withStart: date, end: endDate, options: .strictStartDate)

        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { query, result, error in
            if let error = error {
                print("Step count query error: \\(error.localizedDescription)")
                completion(0)
                return
            }

            let sum = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            completion(sum)
        }

        healthStore.execute(query)
    }

    private func sendToSupabase(date: Date, moveCalories: Double, exerciseMinutes: Double, standHours: Int, steps: Double) {
        // Get Supabase configuration
        guard let supabaseURL = getSupabaseURL(),
              let anonKey = getSupabaseAnonKey() else {
            print("Supabase configuration not found")
            return
        }

        // Get user session token
        guard let accessToken = getUserAccessToken() else {
            print("No user session token found - user may not be logged in")
            return
        }

        // Get user ID
        guard let userId = getUserId() else {
            print("No user ID found")
            return
        }

        // Format date as YYYY-MM-DD in local timezone
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = TimeZone.current
        let dateString = dateFormatter.string(from: date)

        // Prepare request
        let url = URL(string: "\\(supabaseURL)/functions/v1/calculate-daily-score")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \\(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "userId": userId,
            "date": dateString,
            "moveCalories": moveCalories,
            "exerciseMinutes": exerciseMinutes,
            "standHours": standHours,
            "steps": steps
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            print("Failed to serialize request body: \\(error.localizedDescription)")
            return
        }

        print("Sending health data to Supabase for \\(dateString)...")

        // Send request
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("Network error: \\(error.localizedDescription)")
                return
            }

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    print("Successfully sent health data to Supabase")

                    if let data = data, let responseString = String(data: data, encoding: .utf8) {
                        print("Response: \\(responseString)")
                    }
                } else {
                    print("Supabase request failed with status code: \\(httpResponse.statusCode)")

                    if let data = data, let responseString = String(data: data, encoding: .utf8) {
                        print("Error response: \\(responseString)")
                    }
                }
            }
        }

        task.resume()
    }

    // MARK: - Configuration & User Session Helpers

    private func getSupabaseURL() -> String? {
        if let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String {
            return url
        }
        if let url = Bundle.main.object(forInfoDictionaryKey: "EXUpdatesURL") as? String {
            return url
        }
        if let url = UserDefaults.standard.string(forKey: "supabaseUrl") {
            return url
        }
        return nil
    }

    private func getSupabaseAnonKey() -> String? {
        if let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String {
            return key
        }
        if let key = UserDefaults.standard.string(forKey: "supabaseAnonKey") {
            return key
        }
        return nil
    }

    private func getUserAccessToken() -> String? {
        if let token = UserDefaults.standard.string(forKey: "supabaseAccessToken") {
            return token
        }
        if let token = UserDefaults.standard.string(forKey: "accessToken") {
            return token
        }
        if let token = getKeychainValue(forKey: "supabaseAccessToken") {
            return token
        }
        return nil
    }

    private func getUserId() -> String? {
        if let userId = UserDefaults.standard.string(forKey: "supabaseUserId") {
            return userId
        }
        if let userId = UserDefaults.standard.string(forKey: "userId") {
            return userId
        }
        return nil
    }

    private func getKeychainValue(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }
}
`;

// HealthKitBackgroundDeliveryManager.swift — React Native bridge (Swift)
const SWIFT_MANAGER = `//
//  HealthKitBackgroundDeliveryManager.swift
//  MoveTogether
//

import Foundation
import React

@objc(HealthKitBackgroundDeliveryManager)
class HealthKitBackgroundDeliveryManager: NSObject {

    @objc
    func registerObservers(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        HealthKitBackgroundDelivery.shared.registerObservers { success, error in
            if let error = error {
                reject("HEALTHKIT_BACKGROUND_DELIVERY_ERROR", error.localizedDescription, error)
            } else if success {
                resolve(["success": true, "message": "HealthKit background delivery registered"])
            } else {
                reject("HEALTHKIT_BACKGROUND_DELIVERY_ERROR", "Failed to register observers", nil)
            }
        }
    }

    @objc
    func stopObservers(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        HealthKitBackgroundDelivery.shared.stopObservers()
        resolve(["success": true, "message": "HealthKit observers stopped"])
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
`;

// HealthKitBackgroundDeliveryManager.m — React Native bridge (Objective-C)
const OBJC_BRIDGE = `//
//  HealthKitBackgroundDeliveryManager.m
//  MoveTogether
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HealthKitBackgroundDeliveryManager, NSObject)

RCT_EXTERN_METHOD(registerObservers:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopObservers:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

@end
`;

/**
 * Expo config plugin to add HealthKit background delivery native module.
 * Copies Swift + Objective-C files into the Xcode project and adds them
 * to the build sources.
 */
function withHealthKitBackgroundDelivery(config) {
  // Step 1: Write native files to ios/MoveTogether/
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosPath = path.join(cfg.modRequest.projectRoot, 'ios', 'MoveTogether');

      if (!fs.existsSync(iosPath)) {
        fs.mkdirSync(iosPath, { recursive: true });
      }

      // Write core background delivery Swift file
      fs.writeFileSync(
        path.join(iosPath, 'HealthKitBackgroundDelivery.swift'),
        SWIFT_BACKGROUND_DELIVERY
      );

      // Write React Native bridge Swift file
      fs.writeFileSync(
        path.join(iosPath, 'HealthKitBackgroundDeliveryManager.swift'),
        SWIFT_MANAGER
      );

      // Write Objective-C bridge file
      fs.writeFileSync(
        path.join(iosPath, 'HealthKitBackgroundDeliveryManager.m'),
        OBJC_BRIDGE
      );

      console.log('[withHealthKitBackgroundDelivery] Created native files (2 Swift + 1 Objective-C)');

      return cfg;
    },
  ]);

  // Step 2: Add files to Xcode project build sources
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
      const filesToAdd = [
        'HealthKitBackgroundDelivery.swift',
        'HealthKitBackgroundDeliveryManager.swift',
        'HealthKitBackgroundDeliveryManager.m',
      ];

      for (const fileName of filesToAdd) {
        try {
          xcodeProject.addSourceFile(
            targetName + '/' + fileName,
            { target: xcodeProject.getFirstTarget().uuid },
            targetGroupKey
          );
          console.log(`[withHealthKitBackgroundDelivery] Added ${fileName} to Xcode project`);
        } catch (e) {
          console.log(`[withHealthKitBackgroundDelivery] ${fileName} may already exist in project`);
        }
      }
    }

    return cfg;
  });

  return config;
}

module.exports = withHealthKitBackgroundDelivery;
