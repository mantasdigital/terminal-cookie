// src/voice/keywords.js — Trigger word to key action mapping
// Maps recognized voice words to keyboard keys the input system understands.

// Command name → key string (what input.js emits)
const COMMAND_TO_KEY = {
  click: 'enter',
  deny: 'd',
  combat_roll: 'space',
  explore: 'e',
  inventory: 'i',
  save_game: 'f5',
  show_help: '?',
  pause_game: 'p',
  accept: 'a',
  reject: 'd',
  select_1: '1',
  select_2: '2',
};

/**
 * Compute Levenshtein distance between two strings.
 * Used for fuzzy matching to tolerate speech recognition errors.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/**
 * Create a keyword mapping instance.
 * @param {object} config - voice settings from settings.js
 */
export function createKeywordMap(config = {}) {
  // word → command name (e.g. "cookie" → "click")
  const wordToCommand = new Map();
  // windowId → trigger word
  const windowWords = new Map();

  // Load default and config mappings
  const commands = config.commands || {
    cookie: 'click',
    trash: 'deny',
    roll: 'combat_roll',
    go: 'explore',
    bag: 'inventory',
    save: 'save_game',
    help: 'show_help',
    pause: 'pause_game',
    yes: 'accept',
    no: 'reject',
  };

  for (const [word, command] of Object.entries(commands)) {
    wordToCommand.set(word.toLowerCase().trim(), command);
  }

  // Always ensure yes/no are mapped
  if (!wordToCommand.has('yes')) wordToCommand.set('yes', 'accept');
  if (!wordToCommand.has('no')) wordToCommand.set('no', 'reject');

  // Load input word mappings (voice words for choice 1 and choice 2)
  const inputWords = config.inputWords || { choice1: 'yes', choice2: 'no' };
  if (inputWords.choice1) {
    wordToCommand.set(inputWords.choice1.toLowerCase().trim(), 'select_1');
  }
  if (inputWords.choice2) {
    wordToCommand.set(inputWords.choice2.toLowerCase().trim(), 'select_2');
  }

  // Per-terminal input word overrides
  if (config.windowWords) {
    for (const [key, word] of Object.entries(config.windowWords)) {
      if (key.endsWith('_choice1')) {
        wordToCommand.set(word.toLowerCase().trim(), 'select_1');
      } else if (key.endsWith('_choice2')) {
        wordToCommand.set(word.toLowerCase().trim(), 'select_2');
      }
    }
  }

  // Load window words from config
  if (config.windowWords) {
    for (const [winId, word] of Object.entries(config.windowWords)) {
      windowWords.set(String(winId), word.toLowerCase().trim());
    }
  }

  // Max edit distance for fuzzy matching (scales with word length)
  function maxDistance(word) {
    if (word.length <= 3) return 0; // Short words must be exact
    if (word.length <= 5) return 1;
    return 2;
  }

  return {
    /**
     * Map a recognized word to a key string for input.js.
     * Uses fuzzy matching to tolerate slight recognition errors.
     * @param {string} word - The recognized word
     * @returns {string|null} Key string or null if no match
     */
    mapWordToKey(word) {
      if (!word) return null;
      const normalized = word.toLowerCase().trim();

      // Exact match first
      const command = wordToCommand.get(normalized);
      if (command) {
        return COMMAND_TO_KEY[command] || command;
      }

      // Fuzzy match: find closest word within edit distance threshold
      let bestMatch = null;
      let bestDist = Infinity;

      for (const [knownWord, cmd] of wordToCommand) {
        const dist = levenshtein(normalized, knownWord);
        const threshold = maxDistance(knownWord);
        if (dist <= threshold && dist < bestDist) {
          bestDist = dist;
          bestMatch = cmd;
        }
      }

      if (bestMatch) {
        return COMMAND_TO_KEY[bestMatch] || bestMatch;
      }

      return null;
    },

    /**
     * Add a custom word → key mapping.
     * @param {string} word
     * @param {string} key - Key string for input.js
     */
    addMapping(word, key) {
      wordToCommand.set(word.toLowerCase().trim(), key);
    },

    /**
     * Remove a word mapping.
     * @param {string} word
     */
    removeMapping(word) {
      wordToCommand.delete(word.toLowerCase().trim());
    },

    /**
     * Get the trigger word assigned to a specific terminal window.
     * @param {string} windowId
     * @returns {string|null}
     */
    getWindowWord(windowId) {
      return windowWords.get(String(windowId)) || null;
    },

    /**
     * Set a custom trigger word for a specific terminal window.
     * @param {string} windowId
     * @param {string} word
     */
    setWindowWord(windowId, word) {
      windowWords.set(String(windowId), word.toLowerCase().trim());
    },

    /**
     * Get all current word → command mappings.
     * @returns {Array<[string, string]>}
     */
    getMappings() {
      return [...wordToCommand.entries()];
    },

    /**
     * Get all known keywords for speech recognition grammar.
     * @returns {string[]}
     */
    getKeywords() {
      return [...wordToCommand.keys()];
    },
  };
}
