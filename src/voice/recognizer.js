// src/voice/recognizer.js — Cross-platform speech recognition dispatch
// Lazy-loads the appropriate platform-specific recognizer.

/**
 * Create a recognizer for the current platform.
 * Lazy-loads the platform module only when instantiated.
 * @param {string} [platform] - Override platform detection (default: process.platform)
 * @returns {Promise<object>} Recognizer instance with start/stop/onWord/isAvailable
 */
export async function createRecognizer(platform) {
  const os = platform || process.platform;

  let recognizer;

  try {
    if (os === 'darwin') {
      const { createDarwinRecognizer } = await import('./platforms/darwin.js');
      recognizer = createDarwinRecognizer();
    } else if (os === 'win32') {
      const { createWindowsRecognizer } = await import('./platforms/win32.js');
      recognizer = createWindowsRecognizer();
    } else {
      const { createLinuxRecognizer } = await import('./platforms/linux.js');
      recognizer = createLinuxRecognizer();
    }
  } catch {
    recognizer = createNullRecognizer();
  }

  return recognizer;
}

/**
 * No-op recognizer for unsupported platforms.
 */
function createNullRecognizer() {
  return {
    start() {},
    stop() {},
    onWord() {},
    isAvailable() { return false; },
  };
}
