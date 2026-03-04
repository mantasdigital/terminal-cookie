// src/leaderboard/leaderboard.js — Core leaderboard module

import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const LEADERBOARD_PATH = join(PROJECT_ROOT, 'data', 'leaderboard.json');
const SUBMISSIONS_DIR = join(PROJECT_ROOT, 'data', 'submissions');

/**
 * Load the leaderboard from data/leaderboard.json.
 * Returns { version, updated_at, entries } or a default empty leaderboard.
 */
export function loadLeaderboard() {
  try {
    const raw = readFileSync(LEADERBOARD_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { version: 1, updated_at: new Date().toISOString(), entries: [] };
  }
}

/**
 * Save the leaderboard to data/leaderboard.json.
 */
export function saveLeaderboard(leaderboard) {
  leaderboard.updated_at = new Date().toISOString();
  writeFileSync(LEADERBOARD_PATH, JSON.stringify(leaderboard, null, 2) + '\n', 'utf-8');
}

/**
 * Sort entries by dungeons_cleared (desc), then highest_level (desc).
 */
export function rankEntries(entries) {
  return [...entries].sort((a, b) => {
    if (b.dungeons_cleared !== a.dungeons_cleared) return b.dungeons_cleared - a.dungeons_cleared;
    return b.highest_level - a.highest_level;
  });
}

/**
 * Format compact leaderboard for MENU screen (one line per entry).
 */
export function formatLeaderboardCompact(entries, limit = 5) {
  const ranked = rankEntries(entries).slice(0, limit);
  if (ranked.length === 0) return '  No scores yet. Be the first!';

  const lines = ['  --- Leaderboard ---'];
  for (let i = 0; i < ranked.length; i++) {
    const e = ranked[i];
    const name = e.name.length > 12 ? e.name.substring(0, 11) + '~' : e.name;
    const org = e.org ? ` [${e.org}]` : '';
    lines.push(`  ${i + 1}. ${name}${org} - ${e.dungeons_cleared}D Lv${e.highest_level}`);
  }
  return lines.join('\n');
}

/**
 * Format full leaderboard for MCP/overlay display.
 */
export function formatLeaderboardFull(entries) {
  const ranked = rankEntries(entries);
  if (ranked.length === 0) {
    return [
      '  === LEADERBOARD ===',
      '',
      '  No entries yet.',
      '  Submit your score with --submit-score!',
      '',
      '  =====================',
    ].join('\n');
  }

  const lines = [
    '  === LEADERBOARD ===',
    '',
    '  #   Name             Org          Dungeons  Level  Clicks    Crumbs',
    '  ' + '-'.repeat(70),
  ];

  for (let i = 0; i < ranked.length; i++) {
    const e = ranked[i];
    const rank = String(i + 1).padEnd(4);
    const name = (e.name || 'Anonymous').padEnd(17).substring(0, 17);
    const org = (e.org || '-').padEnd(13).substring(0, 13);
    const dungeons = String(e.dungeons_cleared ?? 0).padEnd(10);
    const level = String(e.highest_level ?? 0).padEnd(7);
    const clicks = String(e.total_clicks ?? 0).padEnd(10);
    const crumbs = String(e.total_crumbs_earned ?? 0);
    lines.push(`  ${rank}${name}${org}${dungeons}${level}${clicks}${crumbs}`);
  }

  lines.push('');
  lines.push(`  Total entries: ${ranked.length}`);
  lines.push('  =====================');

  return lines.join('\n');
}

/**
 * Compute a SHA-256 checksum of stats for integrity verification.
 */
export function computeChecksum(stats) {
  const payload = JSON.stringify({
    total_clicks: stats.total_clicks ?? 0,
    total_crumbs_earned: stats.total_crumbs_earned ?? 0,
    dungeons_cleared: stats.dungeons_cleared ?? 0,
    highest_level: stats.highest_level ?? 0,
    monsters_killed: stats.monsters_killed ?? 0,
    total_deaths: stats.total_deaths ?? 0,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Create a submission entry from local stats.
 */
export function createSubmission(stats, name, org) {
  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const entry = {
    id,
    name: name.trim(),
    org: org ? org.trim() : null,
    submitted_at: new Date().toISOString(),
    total_clicks: stats.total_clicks ?? 0,
    total_crumbs_earned: stats.total_crumbs_earned ?? 0,
    highest_crumbs: stats.highest_crumbs ?? 0,
    dungeons_cleared: stats.dungeons_cleared ?? 0,
    highest_level: stats.highest_level ?? 0,
    monsters_killed: stats.monsters_killed ?? 0,
    total_deaths: stats.total_deaths ?? 0,
    total_loot: stats.total_loot ?? 0,
    total_recruits_hired: stats.total_recruits_hired ?? 0,
    runs_completed: stats.runs_completed ?? 0,
    checksum: computeChecksum(stats),
  };
  return entry;
}

/**
 * Validate a submission entry schema.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateSubmission(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['Entry must be an object'] };
  }

  const required = ['id', 'name', 'submitted_at', 'checksum'];
  for (const field of required) {
    if (!entry[field]) errors.push(`Missing required field: ${field}`);
  }

  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    errors.push('Name must be a non-empty string');
  }
  if (entry.name && entry.name.length > 40) {
    errors.push('Name must be 40 characters or less');
  }
  if (entry.org && entry.org.length > 40) {
    errors.push('Org must be 40 characters or less');
  }

  // Plausibility checks
  const clicks = entry.total_clicks ?? 0;
  const crumbs = entry.total_crumbs_earned ?? 0;
  if (clicks === 0 && crumbs > 10000) {
    errors.push('Implausible: 0 clicks but high crumbs');
  }
  if ((entry.dungeons_cleared ?? 0) > 0 && (entry.monsters_killed ?? 0) === 0) {
    errors.push('Implausible: dungeons cleared but no monsters killed');
  }

  // Verify checksum
  const expected = computeChecksum(entry);
  if (entry.checksum !== expected) {
    errors.push('Checksum mismatch — stats may have been tampered with');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge approved submission files into the leaderboard.
 * Deduplicates by id. Returns { merged: number, skipped: number, errors: string[] }.
 */
export function mergeSubmissions(leaderboard) {
  let files;
  try {
    files = readdirSync(SUBMISSIONS_DIR).filter(f => f.endsWith('.json') && f !== '.gitkeep');
  } catch {
    return { merged: 0, skipped: 0, errors: ['Cannot read submissions directory'] };
  }

  if (files.length === 0) {
    return { merged: 0, skipped: 0, errors: [] };
  }

  const existingIds = new Set(leaderboard.entries.map(e => e.id));
  let merged = 0;
  let skipped = 0;
  const errors = [];

  for (const file of files) {
    const filePath = join(SUBMISSIONS_DIR, file);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(raw);
      const validation = validateSubmission(entry);

      if (!validation.valid) {
        errors.push(`${file}: ${validation.errors.join('; ')}`);
        skipped++;
        continue;
      }

      if (existingIds.has(entry.id)) {
        skipped++;
      } else {
        // Only keep known fields to prevent property injection
        const sanitized = {
          id: entry.id,
          name: entry.name,
          org: entry.org || null,
          submitted_at: entry.submitted_at,
          total_clicks: entry.total_clicks ?? 0,
          total_crumbs_earned: entry.total_crumbs_earned ?? 0,
          highest_crumbs: entry.highest_crumbs ?? 0,
          dungeons_cleared: entry.dungeons_cleared ?? 0,
          highest_level: entry.highest_level ?? 0,
          monsters_killed: entry.monsters_killed ?? 0,
          total_deaths: entry.total_deaths ?? 0,
          total_loot: entry.total_loot ?? 0,
          total_recruits_hired: entry.total_recruits_hired ?? 0,
          runs_completed: entry.runs_completed ?? 0,
          checksum: entry.checksum,
        };
        leaderboard.entries.push(sanitized);
        existingIds.add(entry.id);
        merged++;
      }

      // Remove processed file
      unlinkSync(filePath);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      skipped++;
    }
  }

  // Re-sort
  leaderboard.entries = rankEntries(leaderboard.entries);

  return { merged, skipped, errors };
}
