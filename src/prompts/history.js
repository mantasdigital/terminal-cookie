// Frequency table for classifier training
// Tracks classifications and corrections to build per-source bias

import { readFile, writeFile } from 'node:fs/promises';

function hashPattern(pattern) {
  // Simple string hash for pattern storage
  let hash = 0;
  const str = String(pattern).toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash & hash; // Convert to 32bit int
  }
  return 'p' + Math.abs(hash).toString(36);
}

export function createHistory() {
  // storage: { [sourceId]: { [patternHash]: { type, count, corrections: { [newType]: count } } } }
  let storage = {};

  return {
    record(source, pattern, type) {
      const src = source || '_default';
      const hash = hashPattern(pattern);
      if (!storage[src]) storage[src] = {};
      if (!storage[src][hash]) {
        storage[src][hash] = { type, count: 0, corrections: {} };
      }
      storage[src][hash].type = type;
      storage[src][hash].count++;
    },

    correct(source, pattern, oldType, newType) {
      const src = source || '_default';
      const hash = hashPattern(pattern);
      if (!storage[src]) storage[src] = {};
      if (!storage[src][hash]) {
        storage[src][hash] = { type: oldType, count: 1, corrections: {} };
      }
      const entry = storage[src][hash];
      entry.corrections[newType] = (entry.corrections[newType] || 0) + 1;
      // If enough corrections, update the primary type
      if (entry.corrections[newType] >= 3) {
        entry.type = newType;
      }
    },

    getBias(source, pattern) {
      const src = source || '_default';
      const hash = hashPattern(pattern);
      const entry = storage[src]?.[hash];
      if (!entry) return null;

      // Return bias if corrections >= 3 for any type
      const biases = {};
      let hasBias = false;
      for (const [type, count] of Object.entries(entry.corrections)) {
        if (count >= 3) {
          biases[type] = Math.min(0.1 + (count - 3) * 0.05, 0.3);
          hasBias = true;
        }
      }
      return hasBias ? biases : null;
    },

    getRecentTypes(source, limit = 3) {
      const src = source || '_default';
      const entries = storage[src];
      if (!entries) return [];
      return Object.values(entries)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map(e => e.type);
    },

    getStorage() {
      return storage;
    },

    async save(filePath) {
      await writeFile(filePath, JSON.stringify(storage, null, 2), 'utf8');
    },

    async load(filePath) {
      try {
        const data = await readFile(filePath, 'utf8');
        storage = JSON.parse(data);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        // File doesn't exist yet, start fresh
        storage = {};
      }
    },
  };
}
