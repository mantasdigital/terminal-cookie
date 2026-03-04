// src/save/state.js — Save/load game state with atomic writes and corruption recovery

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { needsMigration, migrate, CURRENT_VERSION } from '../core/migration.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = join(__dirname, '..', '..', 'saves');
const MAX_SLOTS = 3;

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function slotPath(slot) {
  if (slot < 1 || slot > MAX_SLOTS) throw new Error(`Invalid save slot: ${slot}. Must be 1-${MAX_SLOTS}.`);
  return join(SAVES_DIR, `slot${slot}.save.json`);
}

function backupPath(slot) {
  return join(SAVES_DIR, `slot${slot}.save.bak`);
}

function tmpPath(slot) {
  return join(SAVES_DIR, `slot${slot}.save.tmp`);
}

function computeChecksum(data) {
  const content = JSON.stringify(data);
  return createHash('sha256').update(content).digest('hex');
}

function validateSaveData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Save data is not an object' };
  }
  if (typeof data.version !== 'number') {
    return { valid: false, error: 'Missing or invalid version field' };
  }
  if (!data.checksum || typeof data.checksum !== 'string') {
    return { valid: false, error: 'Missing checksum field' };
  }
  // Verify checksum
  const { checksum, ...rest } = data;
  const expected = computeChecksum(rest);
  if (checksum !== expected) {
    return { valid: false, error: 'Checksum mismatch — save file may be corrupted' };
  }
  return { valid: true };
}

/**
 * Save game state to a slot with atomic write.
 * @param {number} slot - Save slot (1-3)
 * @param {object} gameState - Game state object to save
 * @returns {{ success: boolean, slot: number, error?: string }}
 */
export function saveGame(slot, gameState) {
  ensureDir(SAVES_DIR);

  const savePath = slotPath(slot);
  const bakPath = backupPath(slot);
  const tempPath = tmpPath(slot);

  // Prepare save data
  const saveData = {
    version: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    ...structuredClone(gameState)
  };
  // Remove any existing checksum before computing new one
  delete saveData.checksum;
  const checksum = computeChecksum(saveData);
  saveData.checksum = checksum;

  try {
    // Backup existing save before writing
    if (existsSync(savePath)) {
      try {
        const existing = readFileSync(savePath, 'utf-8');
        writeFileSync(bakPath, existing, 'utf-8');
      } catch {
        // Best effort backup
      }
    }

    // Atomic write: write to temp, then rename
    writeFileSync(tempPath, JSON.stringify(saveData, null, 2), 'utf-8');
    renameSync(tempPath, savePath);

    return { success: true, slot };
  } catch (err) {
    return { success: false, slot, error: err.message };
  }
}

/**
 * Load game state from a slot.
 * @param {number} slot - Save slot (1-3)
 * @returns {{ success: boolean, data?: object, slot: number, error?: string, fromBackup?: boolean }}
 */
export function loadGame(slot) {
  const savePath = slotPath(slot);
  const bakPath = backupPath(slot);

  // Try primary save
  if (existsSync(savePath)) {
    try {
      const raw = readFileSync(savePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validation = validateSaveData(parsed);

      if (validation.valid) {
        const { checksum, ...data } = parsed;
        // Migrate if needed
        const final = needsMigration(data) ? migrate(data) : data;
        return { success: true, data: final, slot };
      }
      // Checksum failed — try backup
    } catch {
      // Parse failed — try backup
    }
  }

  // Try backup
  if (existsSync(bakPath)) {
    try {
      const raw = readFileSync(bakPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validation = validateSaveData(parsed);

      if (validation.valid) {
        const { checksum, ...data } = parsed;
        const final = needsMigration(data) ? migrate(data) : data;
        return { success: true, data: final, slot, fromBackup: true };
      }
    } catch {
      // Backup also failed
    }
  }

  if (!existsSync(savePath) && !existsSync(bakPath)) {
    return { success: false, slot, error: 'No save data found in this slot' };
  }

  return { success: false, slot, error: 'Save data is corrupted and backup is unavailable or also corrupted' };
}

/**
 * List all save slots with metadata.
 * @returns {Array<{ slot: number, exists: boolean, savedAt?: string, version?: number }>}
 */
export function listSlots() {
  const slots = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const path = slotPath(i);
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(raw);
        slots.push({
          slot: i,
          exists: true,
          savedAt: parsed.savedAt || 'unknown',
          version: parsed.version || 0,
          crumbs: parsed.crumbs ?? 0,
          teamSize: parsed.team?.length ?? 0,
          currentState: parsed.currentState || 'unknown'
        });
      } catch {
        slots.push({ slot: i, exists: true, savedAt: 'corrupted' });
      }
    } else {
      slots.push({ slot: i, exists: false });
    }
  }
  return slots;
}

/**
 * Delete a save slot.
 * @param {number} slot
 */
export function deleteSlot(slot) {
  const savePath = slotPath(slot);
  const bakPath = backupPath(slot);
  const tempPath = tmpPath(slot);

  for (const p of [savePath, bakPath, tempPath]) {
    if (existsSync(p)) {
      writeFileSync(p, '', 'utf-8'); // Overwrite before delete for safety
      try { renameSync(p, p + '.del'); } catch { /* ignore */ }
    }
  }
}
