#!/bin/bash

# Script to increment iOS build number for TestFlight uploads
# Usage: ./scripts/increment-build.sh [build_number]
# If no build_number is provided, it will increment the current build number by 1

INFO_PLIST="ios/MoveTogether/Info.plist"

if [ ! -f "$INFO_PLIST" ]; then
  echo "Error: Info.plist not found at $INFO_PLIST"
  exit 1
fi

# Get current build number
CURRENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$INFO_PLIST" 2>/dev/null)

if [ -z "$CURRENT_BUILD" ]; then
  echo "Error: Could not read current build number from Info.plist"
  exit 1
fi

# Determine new build number
if [ -z "$1" ]; then
  # Increment by 1
  NEW_BUILD=$((CURRENT_BUILD + 1))
else
  # Use provided build number
  NEW_BUILD=$1
fi

# Update build number
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEW_BUILD" "$INFO_PLIST"

if [ $? -eq 0 ]; then
  echo "✅ Build number updad: $CURRENT_BUILD → $NEW_BUILD"
  echo "📱 Current version: $(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$INFO_PLIST")"
  echo "🔢 New build number: $NEW_BUILD"
else
  echo "❌ Error updating build number"
  exit 1
fi
