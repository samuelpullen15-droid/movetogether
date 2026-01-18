import { getDebugLogs } from './debug-logger';

/**
 * Utility to read and display debug logs
 * Call this from the React Native app or console to see stored logs
 */
export async function readAndDisplayLogs() {
  try {
    const logs = await getDebugLogs();
    console.log('=== DEBUG LOGS ===');
    console.log(JSON.stringify(logs, null, 2));
    console.log('=== END DEBUG LOGS ===');
    return logs;
  } catch (error) {
    console.error('Error reading debug logs:', error);
    return [];
  }
}

// Make it available globally for easy access from console
if (typeof global !== 'undefined') {
  (global as any).readDebugLogs = readAndDisplayLogs;
}
