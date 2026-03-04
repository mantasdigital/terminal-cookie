// src/config/settings.js — User settings management

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_SETTINGS = {
  focus: { autoFocus: false, bell: false, stickyTop: false },
  security: { vaultEnabled: false, autoRedact: false, encryptedClipboard: false },
  game: { colorBlindMode: false, compactMode: false, debugLogging: false, showAIStatus: true },
  voice: {
    enabled: false,
    triggerWord: 'cookie',
    commands: {
      cookie: 'click',
      trash: 'deny',
      roll: 'combat_roll',
      go: 'explore',
      bag: 'inventory',
      save: 'save_game',
      help: 'show_help',
      pause: 'pause_game',
    },
    windowWords: {},
    sensitivity: 0.7,
    feedbackSound: true,
  },
  classifierHistory: {},
  trustedPatterns: [],
};

/**
 * Deep-merge source into target, filling missing keys with defaults.
 * Removes keys from loaded data that are not in the defaults schema.
 */
function sanitize(loaded, defaults) {
  if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
    return loaded !== undefined ? loaded : defaults;
  }
  const result = {};
  for (const key of Object.keys(defaults)) {
    if (key in loaded && typeof loaded[key] === typeof defaults[key]) {
      result[key] = sanitize(loaded[key], defaults[key]);
    } else {
      result[key] = structuredClone(defaults[key]);
    }
  }
  return result;
}

/**
 * Create a settings manager.
 * @param {string} settingsPath - Path to settings.json
 * @returns {object} Settings instance with get/set/save/load/reset/getAll/getBonuses
 */
export function createSettings(settingsPath) {
  let data = structuredClone(DEFAULT_SETTINGS);

  function ensureDir() {
    mkdirSync(dirname(settingsPath), { recursive: true });
  }

  const settings = {
    /**
     * Get a setting by dot-notated key (e.g. "focus.bell").
     */
    get(key) {
      const parts = key.split('.');
      let current = data;
      for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
      }
      return current;
    },

    /**
     * Set a setting by dot-notated key.
     */
    set(key, value) {
      const parts = key.split('.');
      let current = data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    },

    /**
     * Save settings to disk.
     */
    save() {
      try {
        ensureDir();
        writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {
        // Silent fail — best effort
      }
    },

    /**
     * Load settings from disk. Fills missing keys with defaults, strips unknown keys.
     */
    load() {
      try {
        const raw = readFileSync(settingsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        data = sanitize(parsed, DEFAULT_SETTINGS);
      } catch {
        data = structuredClone(DEFAULT_SETTINGS);
      }
    },

    /**
     * Reset all settings to defaults.
     */
    reset() {
      data = structuredClone(DEFAULT_SETTINGS);
    },

    /**
     * Get a deep clone of all settings.
     */
    getAll() {
      return structuredClone(data);
    },

    /**
     * Compute game bonuses based on current settings.
     * @returns {{ crumbMultiplier: number, lootFindBonus: number, xpMultiplier: number, titles: string[] }}
     */
    getBonuses() {
      let crumbMultiplier = 1.0;
      let lootFindBonus = 0;
      let xpMultiplier = 1.0;
      const titles = [];

      // Focus bonuses
      const focus = data.focus;
      if (focus.autoFocus) crumbMultiplier += 0.15;
      if (focus.bell) lootFindBonus += 0.05;
      if (focus.stickyTop) xpMultiplier += 0.10;
      if (focus.autoFocus && focus.bell && focus.stickyTop) {
        titles.push('Cookie Guardian');
      }

      // Security bonuses
      const security = data.security;
      if (security.vaultEnabled) crumbMultiplier += 0.10;
      if (security.autoRedact) lootFindBonus += 0.05;
      if (security.encryptedClipboard) xpMultiplier += 0.05;
      if (security.vaultEnabled && security.autoRedact && security.encryptedClipboard) {
        titles.push('Security Master');
      }

      // Accessibility bonus
      if (data.game.colorBlindMode) lootFindBonus += 0.02;

      // Voice bonuses
      const voice = data.voice;
      if (voice.enabled) {
        crumbMultiplier += 0.20;
        if (voice.triggerWord && voice.triggerWord !== 'cookie') {
          xpMultiplier += 0.05;
        }
        if (voice.enabled && voice.triggerWord && voice.feedbackSound
            && Object.keys(voice.commands).length > 0) {
          titles.push('Voice Commander');
        }
      }

      return { crumbMultiplier, lootFindBonus, xpMultiplier, titles };
    },
  };

  return settings;
}
