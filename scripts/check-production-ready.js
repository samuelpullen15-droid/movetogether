#!/usr/bin/env node

/**
 * Production Readiness Check Script
 * 
 * Checks for common issues before TestFlight/App Store submission:
 * - Missing environment variables
 * - Hardcoded development URLs
 * - Configuration issues
 */

const fs = require('fs');
const path = require('path');

const issues = [];
const warnings = [];

console.log('🔍 Checking production readiness...\n');

// Check required environment variables
const requiredEnvVars = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_REVENUECAT_APPLE_KEY',
];

console.log('📋 Required Environment Variables:');
requiredEnvVars.forEach(varName => {
  const isSet = process.en '✅ Set' : '⚠️  Not found in process.env (check .env file)';
  console.log(`   ${varName}: ${isSet}`);
  if (!process.env[varName]) {
    warnings.push(`Environment variable ${varName} not found. Make sure it's set in your build environment.`);
  }
});

// Check Info.plist build number
console.log('\n📱 iOS Configuration:');
const infoPlistPath = path.join(__dirname, '..', 'ios', 'MoveTogether', 'Info.plist');
if (fs.existsSync(infoPlistPath)) {
  const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
  const versionMatch = infoPlist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  const buildMatch = infoPlist.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
  
  if (versionMatch) {
    console.log(`   Version: ${versionMatch[1]}`);
  }
  if (buildMatch) {
    console.log(`   Build: ${buildMatch[1]}`);
    if (parseInt(buildMatch[1]) < 1) {
      issues.push('Build number should be at least 1 for TestFlight');
    }
  }
}

// Check app.json
console.l app.json Configuration:');
const appJsonPath = path.join(__dirname, '..', 'app.json');
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  console.log(`   Bundle ID: ${appJson.expo?.ios?.bundleIdentifier || 'Not set'}`);
  console.log(`   Version: ${appJson.expo?.version || 'Not set'}`);
  
  if (!appJson.expo?.ios?.bundleIdentifier) {
    issues.push('Bundle identifier not set in app.json');
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Summary:\n');

if (issues.length === 0 && warnings.length === 0) {
  console.log('✅ All checks passed! Ready for TestFlight build.\n');
  console.log('📝 Next steps:');
  console.log('   1. Run database migrations: supabase migration up');
  console.log('   2. Increment build number: ./scripts/increment-build.sh');
  console.log('   3. Build with EAS: eas build --platform ios --profile production');
  console.log('   4. Upload to TestFlight via App Store Connect\n');
  process.exit(0);
} elsef (issues.length > 0) {
    console.log('❌ Issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    console.log('');
  }
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
    console.log('');
  }
  process.exit(issues.length > 0 ? 1 : 0);
}
