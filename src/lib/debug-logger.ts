import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG_LOG_KEY = '@debug_activity_ring_logs';
const MAX_LOG_ENTRIES = 100; // Keep last 100 entries

/**
 * Write a log entry - stores in AsyncStorage and logs to console
 * You can read logs via: AsyncStorage.getItem('@debug_activity_ring_logs')
 */
export async function writeDebugLog(entry: {
  location?: string;
  message: string;
  data?: any;
  timestamp?: number;
  sessionId?: string;
  runId?: string;
  hypothesisId?: string;
}): Promise<void> {
  try {
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: entry.timestamp || Date.now(),
      location: entry.location || 'unknown',
      message: entry.message,
      data: entry.data || {},
      sessionId: entry.sessionId || 'debug-session',
      runId: entry.runId || 'run1',
      hypothesisId: entry.hypothesisId || 'unknown',
    };

    // Always log to console (this is what you'll see in terminal)
    console.log(`[DEBUG-LOG] ${logEntry.location}: ${logEntry.message}`, logEntry.data);

    // Also store in AsyncStorage for retrieval
    try {
      const existingLogsJson = await AsyncStorage.getItem(DEBUG_LOG_KEY) || '[]';
      const existingLogs = JSON.parse(existingLogsJson);
      existingLogs.push(logEntry);
      
      // Keep only last MAX_LOG_ENTRIES
      const trimmedLogs = existingLogs.slice(-MAX_LOG_ENTRIES);
      
      await AsyncStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(trimmedLogs));
    } catch (storageError) {
      // AsyncStorage write failed, but console log already happened
      console.warn('[DebugLogger] Failed to store log:', storageError);
    }
  } catch (error) {
    // Fallback - at least console log happened above
    console.log('[DebugLogger] Error:', error);
  }
}

/**
 * Get all stored debug logs (for debugging purposes)
 */
export async function getDebugLogs(): Promise<any[]> {
  try {
    const logsJson = await AsyncStorage.getItem(DEBUG_LOG_KEY) || '[]';
    return JSON.parse(logsJson);
  } catch {
    return [];
  }
}

/**
 * Clear stored debug logs
 */
export async function clearDebugLogs(): Promise<void> {
  await AsyncStorage.removeItem(DEBUG_LOG_KEY);
}
