// src/voice/voice.js — Main voice controller
// Lazy-loaded only when voice.enabled setting is ON.
// Emits the same input events as keyboard so all existing widgets/screens work unchanged.

import { createKeywordMap } from './keywords.js';

/**
 * Create the voice controller.
 * @param {object} settings - Voice settings (the voice sub-object from settings.js)
 * @param {object} inputHandler - Input handler instance (from input.js), must have emitKey()
 * @returns {object} Voice controller instance
 */
export function createVoiceController(settings, inputHandler) {
  const voiceConfig = settings || {};
  const keywordMap = createKeywordMap(voiceConfig);
  let recognizer = null;
  let listening = false;
  let triggerWord = (voiceConfig.triggerWord || 'cookie').toLowerCase().trim();

  // Load per-window trigger words from config
  if (voiceConfig.windowWords) {
    for (const [winId, word] of Object.entries(voiceConfig.windowWords)) {
      keywordMap.setWindowWord(winId, word);
    }
  }

  function feedbackBell() {
    if (voiceConfig.feedbackSound !== false) {
      process.stdout.write('\x07');
    }
  }

  function handleRecognizedWord(word) {
    if (!listening) return;

    const key = keywordMap.mapWordToKey(word);
    if (key) {
      feedbackBell();
      inputHandler.emitKey(key);
    }
  }

  const controller = {
    /**
     * Start voice recognition.
     * Lazy-loads the platform recognizer on first call.
     */
    async start() {
      if (listening) return;

      try {
        if (!recognizer) {
          const { createRecognizer } = await import('./recognizer.js');
          recognizer = await createRecognizer();
        }

        if (!recognizer.isAvailable()) {
          if (process.stderr?.write) {
            process.stderr.write('[voice] Speech recognition not available on this platform. Voice control disabled.\n');
          }
          return;
        }

        recognizer.onWord(handleRecognizedWord);
        recognizer.start(keywordMap.getKeywords());
        listening = true;
      } catch (err) {
        if (process.stderr?.write) {
          process.stderr.write(`[voice] Failed to start: ${err.message}\n`);
        }
      }
    },

    /** Stop voice recognition. Kills any spawned processes. */
    stop() {
      listening = false;
      if (recognizer) {
        recognizer.stop();
      }
    },

    /** @returns {boolean} Whether voice recognition is currently active */
    isListening() {
      return listening;
    },

    /**
     * Set the global trigger word.
     * @param {string} word
     */
    setTriggerWord(word) {
      triggerWord = word.toLowerCase().trim();
      if (listening && recognizer) {
        recognizer.stop();
        recognizer.start(keywordMap.getKeywords());
      }
    },

    /**
     * Set a trigger word for a specific terminal window.
     * @param {string} windowId
     * @param {string} word
     */
    setWindowWord(windowId, word) {
      keywordMap.setWindowWord(windowId, word);
    },

    /**
     * Add a custom voice command mapping.
     * @param {string} word - Voice trigger word
     * @param {string} key - Key to emit (same as input.js key names)
     */
    addCommand(word, key) {
      keywordMap.addMapping(word, key);
      if (listening && recognizer) {
        recognizer.stop();
        recognizer.start(keywordMap.getKeywords());
      }
    },

    /**
     * Remove a voice command mapping.
     * @param {string} word
     */
    removeCommand(word) {
      keywordMap.removeMapping(word);
    },

    /** @returns {string} The current global trigger word */
    get triggerWord() {
      return triggerWord;
    },

    /** @returns {object} The keyword map instance */
    get keywordMap() {
      return keywordMap;
    },
  };

  return controller;
}
