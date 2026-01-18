# Activity Ring Native Module Setup

The Activity Ring component requires native iOS files to be added to your Xcode project.

## Files Created

1. `ios/MoveTogether/ActivityRingViewManager.swift` - Swift implementation
2. `ios/MoveTogether/ActivityRingViewManager.m` - Objective-C bridge

## Steps to Add to Xcode

**IMPORTANT:** If you see "Tried to register two views with the same name" error, the files are added twice in Xcode. Follow these steps to fix:

1. **Open Xcode:**
   ```bash
   open ios/MoveTogether.xcworkspace
   ```

2. **Check for Duplicate Files:**
   - In Project Navigator, search for "ActivityRingViewManager"
   - If you see the files listed TWICE (once in root `ios/` and once in `MoveTogether/`), remove the ones in the root
   - Right-click on duplicate files → "Delete" → "Remove Reference" (NOT "Move to Trash")

3. **Add Swift File (if not already added):**
   - Right-click on `MoveTogether` folder (blue icon) in Project Navigator
   - Select "Add Files to MoveTogether..."
   - Navigate to `ios/MoveTogether/ActivityRingViewManager.swift`
   - ⚠️ **UNCHECK "Copy items if needed"** (files are already in the folder)
   - ✅ Check "Add to targets: MoveTogether"
   - Click "Add"

4. **Add Objective-C File (if not already added):**
   - Right-click on `MoveTogether` folder
   - Select "Add Files to MoveTogether..."
   - Navigate to `ios/MoveTogether/ActivityRingViewManager.m`
   - ⚠️ **UNCHECK "Copy items if needed"** (files are already in the folder)
   - ✅ Check "Add to targets: MoveTogether"
   - Click "Add"

5. **Verify Files Are Added Once:**
   - In Project Navigator, you should see each file listed ONCE under `MoveTogether`
   - Select each file and check the "Target Membership" in File Inspector (right panel)
   - ✅ "MoveTogether" should be checked
   - ❌ No other targets should be checked

4. **Verify Bridging Header:**
   - Open `ios/MoveTogether/MoveTogether-Bridging-Header.h`
   - Make sure it imports React Native:
   ```objc
   #import <React/RCTViewManager.h>
   #import <React/RCTUIManager.h>
   #import <React/RCTBridgeModule.h>
   ```

5. **Verify Framework Linking:**
   - Select your project in Project Navigator
   - Select the "MoveTogether" target
   - Go to "Build Phases" tab
   - Expand "Link Binary With Libraries"
   - Make sure these are present:
     - `HealthKit.framework`
     - `HealthKitUI.framework`
     - `React-Core` (should already be there)

6. **Clean and Rebuild:**
   - **CRITICAL:** Clean build folder: `Product` → `Clean Build Folder` (Shift+Cmd+K)
   - Close Xcode completely
   - Delete derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`
   - Reopen Xcode
   - Build: `Product` → `Build` (Cmd+B)
   - Or rebuild via Expo: `npx expo run:ios`

## Troubleshooting "Duplicate Registration" Error

If you still see "Tried to register two views with the same name ActivityRingView":

1. **Check Xcode Project File:**
   - In Project Navigator, select the project (blue icon at top)
   - Search for "ActivityRingViewManager" in the search box
   - Make sure each file appears only ONCE in the results

2. **Remove and Re-add:**
   - Remove both files from Xcode (Right-click → Delete → Remove Reference)
   - Clean build folder
   - Re-add the files following steps 3-4 above

3. **Check Build Phases:**
   - Select project → Target "MoveTogether" → "Build Phases"
   - Expand "Compile Sources"
   - Make sure `ActivityRingViewManager.swift` and `ActivityRingViewManager.m` appear only ONCE each

## Verification

After adding the files and rebuilding, the activity rings should display using Apple's native `HKActivityRingView` component.

If you see "Native module not loaded" error, the files aren't properly linked in Xcode.
