// src/save/scores.js — Persistent stats that survive across saves

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCORES_PATH = join(__dirname, '..', '..', 'saves', 'scores.json');

const DEFAULT_STATS = {
  total_clicks: 0,
  total_deaths: 0,
  dungeons_cleared: 0,
  highest_level: 0,
  total_loot: 0,
  monsters_killed: 0,
  longest_survival_streak: 0,
  threats_detected: 0,
  security_settings_enabled: 0,
  total_crumbs_earned: 0,
  total_items_sold: 0,
  total_recruits_hired: 0,
  highest_crumbs: 0,
  runs_completed: 0,
  current_survival_streak: 0,
};

function ensureDir() {
  const dir = dirname(SCORES_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a scores tracker instance.
 * @param {string} [scoresPath] - Optional custom path to scores.json
 * @returns {object} Scores instance
 */
export function createScores(scoresPath) {
  const filePath = scoresPath || SCORES_PATH;
  let stats = { ...DEFAULT_STATS };

  const scores = {
    /**
     * Load scores from disk. Fills missing keys with defaults.
     */
    load() {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const key of Object.keys(DEFAULT_STATS)) {
            if (typeof parsed[key] === 'number') {
              stats[key] = parsed[key];
            }
          }
        }
      } catch {
        stats = { ...DEFAULT_STATS };
      }
    },

    /**
     * Save scores to disk.
     */
    save() {
      ensureDir();
      writeFileSync(filePath, JSON.stringify(stats, null, 2), 'utf-8');
    },

    /**
     * Increment a stat by the given amount.
     * @param {string} key - Stat key
     * @param {number} [amount=1] - Amount to add
     */
    increment(key, amount = 1) {
      if (key in stats) {
        stats[key] += amount;
      }
    },

    /**
     * Set a stat to a value if it's higher than current (for "highest" stats).
     * @param {string} key
     * @param {number} value
     */
    setMax(key, value) {
      if (key in stats && value > stats[key]) {
        stats[key] = value;
      }
    },

    /**
     * Set a stat to a specific value.
     * @param {string} key
     * @param {number} value
     */
    set(key, value) {
      if (key in stats) {
        stats[key] = value;
      }
    },

    /**
     * Get a specific stat.
     * @param {string} key
     * @returns {number}
     */
    get(key) {
      return stats[key] ?? 0;
    },

    /**
     * Get all stats as a plain object.
     * @returns {object}
     */
    getAll() {
      return { ...stats };
    },

    /**
     * Record a death event — updates relevant stats.
     */
    recordDeath() {
      stats.total_deaths++;
      stats.current_survival_streak = 0;
    },

    /**
     * Record a dungeon clear — updates relevant stats.
     * @param {number} level - Dungeon level cleared
     */
    recordDungeonClear(level) {
      stats.dungeons_cleared++;
      stats.current_survival_streak++;
      scores.setMax('highest_level', level);
      scores.setMax('longest_survival_streak', stats.current_survival_streak);
    },

    /**
     * Record a cookie click.
     * @param {number} crumbsEarned
     */
    recordClick(crumbsEarned) {
      stats.total_clicks++;
      stats.total_crumbs_earned += crumbsEarned;
    },

    /**
     * Record a security threat detected.
     */
    recordThreat() {
      stats.threats_detected++;
    },

    /**
     * Format stats for display.
     * @returns {string}
     */
    formatDisplay() {
      const lines = [
        '=== HIGH SCORES & STATS ===',
        '',
        `  Total Clicks:          ${stats.total_clicks.toLocaleString()}`,
        `  Total Crumbs Earned:   ${stats.total_crumbs_earned.toLocaleString()}`,
        `  Highest Crumbs:        ${stats.highest_crumbs.toLocaleString()}`,
        `  Dungeons Cleared:      ${stats.dungeons_cleared}`,
        `  Highest Level:         ${stats.highest_level}`,
        `  Monsters Killed:       ${stats.monsters_killed}`,
        `  Total Loot Found:      ${stats.total_loot}`,
        `  Total Deaths:          ${stats.total_deaths}`,
        `  Recruits Hired:        ${stats.total_recruits_hired}`,
        `  Longest Streak:        ${stats.longest_survival_streak}`,
        `  Threats Detected:      ${stats.threats_detected}`,
        `  Security Features On:  ${stats.security_settings_enabled}`,
        '',
        '===========================',
      ];
      return lines.join('\n');
    },
  };

  return scores;
}
