# Development Setup Guide

## Fast Refresh / Hot Reload Setup

### Prerequisites
1. **Metro must be running** before opening the app
2. **App must be connected to Metro** to load JavaScript bundle
3. **Only rebuild in Xcode when native code changes** (Swift/Objective-C files)

### Correct Workflow:

**1. Start Metro FIRST:**
```bash
npx expo start --dev-client
```
Wait until you see: `› Metro waiting on exp://...`

**2. THEN open the app on your device:**
- The app should automatically connect to Metro
- If not, shake device → "Configure Bundler" → Enter Metro URL

**3. For JavaScript/TypeScript changes:**
- Just save the file
- Fast Refresh should update automatically
- **NO rebuild needed**

**4. Only rebuild in Xcode when:**
- You change Swift files (`ActivityRingViewManager.swift`)
- You change Objective-C files (`.m` files)
- You add/remove native modules
- You change `app.json` native config

### Troubleshooting Fast Refresh:

**If changes don't appear:**
1. Check Metro terminal - does it show "Fast Refresh" messages?
2. Shake device → "Reload" to force reload
3. Make sure Metro is still running
4. Check network - phone and computer on same Wi-Fi?

**If app shows black screen:**
1. Metro isn't connected
2. Shake device → "Configure Bundler" → Enter Metro URL
3. Or use tunnel mode: `npx expo start --dev-client --tunnel`

### Quick Commands:

```bash
# Start Metro with dev client
npx expo start --dev-client

# Start with tunnel (works from anywhere)
npx expo start --dev-client --tunnel

# Clear cache and restart
npx expo start --dev-client --clear --reset-cache
```

### Important:
- **Always start Metro BEFORE opening the app**
- **Keep Metro running while developing**
- **Only rebuild in Xcode for native code changes**
