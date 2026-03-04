// src/config/validate.js — Data file validation

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Schema definitions for data files.
 * Each key is a filename, each value describes the expected structure.
 */
const SCHEMAS = {
  'security-rules.json': {
    type: 'array',
    items: {
      required: ['id', 'name', 'pattern', 'type', 'riskLevel', 'description', 'recommendation'],
      types: {
        id: 'string',
        name: 'string',
        pattern: 'string',
        type: 'string',
        riskLevel: 'string',
        description: 'string',
        recommendation: 'string',
      },
    },
  },
  'biomes.json': {
    type: 'array',
    items: {
      required: ['id', 'name', 'description', 'flavorTexts', 'enemyPool', 'curses', 'colors'],
      types: {
        id: 'string',
        name: 'string',
        description: 'string',
        flavorTexts: 'array',
        enemyPool: 'array',
        curses: 'array',
        colors: 'object',
      },
    },
  },
  'loot-tables.json': {
    type: 'array',
    items: {
      required: ['id', 'name', 'rarity', 'type'],
      types: {
        id: 'string',
        name: 'string',
        rarity: 'string',
        type: 'string',
      },
    },
  },
  'events.json': {
    type: 'array',
    items: {
      required: ['id', 'name', 'type', 'dangerLevel', 'description', 'effect', 'biomes'],
      types: {
        id: 'string',
        name: 'string',
        type: 'string',
        dangerLevel: 'number',
        description: 'string',
        effect: 'object',
        biomes: ['array', 'string'],
      },
    },
  },
};

/**
 * Validate a single item against a schema.
 */
function validateItem(item, schema, file, index) {
  const errors = [];
  if (typeof item !== 'object' || item === null) {
    errors.push({ file, field: `[${index}]`, message: 'Expected an object' });
    return errors;
  }

  for (const field of schema.required) {
    if (!(field in item)) {
      errors.push({ file, field: `[${index}].${field}`, message: `Missing required field "${field}"` });
      continue;
    }

    const expectedType = schema.types[field];
    const value = item[field];

    if (Array.isArray(expectedType)) {
      // Multiple acceptable types
      const ok = expectedType.some(t => checkType(value, t));
      if (!ok) {
        errors.push({ file, field: `[${index}].${field}`, message: `Expected one of [${expectedType.join(', ')}], got ${typeOf(value)}` });
      }
    } else if (expectedType && !checkType(value, expectedType)) {
      errors.push({ file, field: `[${index}].${field}`, message: `Expected ${expectedType}, got ${typeOf(value)}` });
    }
  }

  return errors;
}

function checkType(value, expected) {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === expected;
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Validate all data files in the given directory.
 * @param {string} dataDir - Path to the data/ directory
 * @returns {{ valid: boolean, errors: Array<{ file: string, field: string, message: string }> }}
 */
export function validateDataFiles(dataDir) {
  const errors = [];
  let files;

  try {
    files = readdirSync(dataDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    return { valid: false, errors: [{ file: dataDir, field: '', message: `Cannot read data directory: ${err.message}` }] };
  }

  for (const file of files) {
    const schema = SCHEMAS[file];
    if (!schema) continue; // No schema defined, skip

    const filePath = join(dataDir, file);
    let parsed;

    try {
      const raw = readFileSync(filePath, 'utf-8');
      parsed = JSON.parse(raw);
    } catch (err) {
      errors.push({ file, field: '', message: `Invalid JSON: ${err.message}` });
      continue;
    }

    if (schema.type === 'array') {
      if (!Array.isArray(parsed)) {
        errors.push({ file, field: '', message: 'Expected top-level array' });
        continue;
      }
      for (let i = 0; i < parsed.length; i++) {
        errors.push(...validateItem(parsed[i], schema.items, file, i));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
