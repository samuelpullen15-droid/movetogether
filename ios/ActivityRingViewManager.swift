//
//  ActivityRingViewManager.swift
//  MoveTogether
//
//  Native module to expose Apple's HKActivityRingView to React Native
//

import Foundation
import UIKit
import HealthKit
import HealthKitUI

@objc(ActivityRingViewManager)
class ActivityRingViewManager: RCTViewManager {
  
  override func view() -> UIView! {
    return ActivityRingView()
  }
  
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}

class ActivityRingView: UIView {
  private var ringView: HKActivityRingView!
  private var activitySummary: HKActivitySummary!
  
  // Props from React Native
  private var moveProgress: Double = 0
  private var moveGoal: Double = 500
  private var exerciseProgress: Double = 0
  private var exerciseGoal: Double = 30
  private var standProgress: Double = 0
  private var standGoal: Double = 12
  
  override init(frame: CGRect) {
    super.init(frame: frame)
    setupView()
  }
  
  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupView()
  }
  
  private func setupView() {
    ringView = HKActivityRingView()
    ringView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(ringView)
    
    NSLayoutConstraint.activate([
      ringView.topAnchor.constraint(equalTo: topAnchor),
      ringView.bottomAnchor.constraint(equalTo: bottomAnchor),
      ringView.leadingAnchor.constraint(equalTo: leadingAnchor),
      ringView.trailingAnchor.constraint(equalTo: trailingAnchor)
    ])
    
    updateActivitySummary()
  }
  
  private func updateActivitySummary() {
    let summary = HKActivitySummary()
    
    // Set current values
    summary.activeEnergyBurned = HKQuantity(unit: .kilocalorie(), doubleValue: moveProgress)
    summary.appleExerciseTime = HKQuantity(unit: .minute(), doubleValue: exerciseProgress)
    summary.appleStandHours = HKQuantity(unit: .count(), doubleValue: standProgress)
    
    // Set goals
    summary.activeEnergyBurnedGoal = HKQuantity(unit: .kilocalorie(), doubleValue: moveGoal)
    summary.appleExerciseTimeGoal = HKQuantity(unit: .minute(), doubleValue: exerciseGoal)
    summary.appleStandHoursGoal = HKQuantity(unit: .count(), doubleValue: standGoal)
    
    ringView.setActivitySummary(summary, animated: true)
  }
  
  // MARK: - Props setters
  
  @objc func setMoveProgress(_ value: Double) {
    moveProgress = value
    updateActivitySummary()
  }
  
  @objc func setMoveGoal(_ value: Double) {
    moveGoal = value
    updateActivitySummary()
  }
  
  @objc func setExerciseProgress(_ value: Double) {
    exerciseProgress = value
    updateActivitySummary()
  }
  
  @objc func setExerciseGoal(_ value: Double) {
    exerciseGoal = value
    updateActivitySummary()
  }
  
  @objc func setStandProgress(_ value: Double) {
    standProgress = value
    updateActivitySummary()
  }
  
  @objc func setStandGoal(_ value: Double) {
    standGoal = value
    updateActivitySummary()
  }
}
