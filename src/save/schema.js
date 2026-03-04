// src/save/schema.js — Save file validation and version-aware schema checking

import { CURRENT_VERSION } from '../core/migration.js';

/**
 * Schema definitions by version.
 * Each version describes required fields and their types.
 */
const SCHEMAS = {
  1: {
    required: {
      version: 'number',
      currentState: 'string',
      team: 'array',
      inventory: 'array',
      crumbs: 'number',
      stats: 'object',
    },
    optional: {
      seed: 'number',
      savedAt: 'string',
      dungeonProgress: ['object', 'null'],
      settings: 'object',
      economy: 'object',
      checksum: 'string',
    },
    statsRequired: {
      runs: 'number',
      deaths: 'number',
      crumbsEarned: 'number',
      monstersSlain: 'number',
    },
    teamItemSchema: {
      required: {
        id: 'number',
        name: 'string',
        race: 'string',
        class: 'string',
        level: 'number',
        alive: 'boolean',
      }
    },
  }
};

function typeCheck(value, expected) {
  if (Array.isArray(expected)) {
    return expected.some(t => typeCheck(value, t));
  }
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  if (expected === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === expected;
}

/**
 * Validate save data against the schema for its version.
 * @param {object} data - Save data to validate
 * @returns {{ valid: boolean, errors: string[], version: number }}
 */
export function validateSave(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Save data is not an object'], version: 0 };
  }

  const version = data.version;
  if (typeof version !== 'number') {
    errors.push('Missing or invalid "version" field (expected number)');
    return { valid: false, errors, version: 0 };
  }

  if (version > CURRENT_VERSION) {
    errors.push(`Save version ${version} is newer than supported version ${CURRENT_VERSION}`);
    return { valid: false, errors, version };
  }

  const schema = SCHEMAS[version];
  if (!schema) {
    errors.push(`No schema defined for version ${version}`);
    return { valid: false, errors, version };
  }

  // Check required fields
  for (const [field, expectedType] of Object.entries(schema.required)) {
    if (!(field in data)) {
      errors.push(`Missing required field "${field}"`);
      continue;
    }
    if (!typeCheck(data[field], expectedType)) {
      errors.push(`Field "${field}" expected ${expectedType}, got ${typeof data[field]}`);
    }
  }

  // Check stats sub-object
  if (schema.statsRequired && data.stats && typeof data.stats === 'object') {
    for (const [field, expectedType] of Object.entries(schema.statsRequired)) {
      if (!(field in data.stats)) {
        errors.push(`Missing required stats field "stats.${field}"`);
      } else if (!typeCheck(data.stats[field], expectedType)) {
        errors.push(`Field "stats.${field}" expected ${expectedType}, got ${typeof data.stats[field]}`);
      }
    }
  }

  // Validate team array items
  if (schema.teamItemSchema && Array.isArray(data.team)) {
    for (let i = 0; i < data.team.length; i++) {
      const member = data.team[i];
      if (typeof member !== 'object' || member === null) {
        errors.push(`team[${i}] is not an object`);
        continue;
      }
      for (const [field, expectedType] of Object.entries(schema.teamItemSchema.required)) {
        if (!(field in member)) {
          errors.push(`team[${i}] missing required field "${field}"`);
        } else if (!typeCheck(member[field], expectedType)) {
          errors.push(`team[${i}].${field} expected ${expectedType}, got ${typeof member[field]}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, version };
}

/**
 * Get the current save schema version.
 * @returns {number}
 */
export function getCurrentVersion() {
  return CURRENT_VERSION;
}
