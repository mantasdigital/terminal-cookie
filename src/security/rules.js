import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', '..', 'data', 'security-rules.json');
const TRUSTED_PATH = join(__dirname, '..', '..', 'data', 'trusted-patterns.json');

let cachedRules = null;
let trustedPatterns = new Set();

function loadTrustedPatterns() {
  try {
    const data = readFileSync(TRUSTED_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    trustedPatterns = new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    trustedPatterns = new Set();
  }
}

function saveTrustedPatterns() {
  writeFileSync(TRUSTED_PATH, JSON.stringify([...trustedPatterns], null, 2), 'utf-8');
}

function validateRule(rule, index) {
  const required = ['id', 'name', 'pattern', 'type', 'riskLevel', 'description', 'recommendation'];
  for (const field of required) {
    if (!rule[field] || typeof rule[field] !== 'string') {
      throw new Error(`Rule at index ${index} missing or invalid field: ${field}`);
    }
  }
  const validRisk = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (!validRisk.includes(rule.riskLevel)) {
    throw new Error(`Rule "${rule.id}" has invalid riskLevel: ${rule.riskLevel}`);
  }
  try {
    new RegExp(rule.pattern);
  } catch (e) {
    throw new Error(`Rule "${rule.id}" has invalid regex pattern: ${e.message}`);
  }
  return true;
}

export function loadRules() {
  const raw = readFileSync(RULES_PATH, 'utf-8');
  const rules = JSON.parse(raw);
  if (!Array.isArray(rules)) {
    throw new Error('security-rules.json must contain an array');
  }
  rules.forEach((rule, i) => validateRule(rule, i));
  cachedRules = rules;
  loadTrustedPatterns();
  return rules;
}

export function matchRules(text) {
  if (!cachedRules) {
    loadRules();
  }

  const results = [];
  const lines = text.split('\n');

  for (const rule of cachedRules) {
    if (trustedPatterns.has(rule.id)) {
      continue;
    }

    const regex = new RegExp(rule.pattern, 'g');
    const matches = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(line)) !== null) {
        matches.push({
          line: lineIdx + 1,
          column: match.index + 1,
          match: match[0]
        });
        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) regex.lastIndex++;
      }
    }

    if (matches.length > 0) {
      results.push({
        rule: rule.id,
        matches,
        riskLevel: rule.riskLevel,
        description: rule.description,
        recommendation: rule.recommendation
      });
    }
  }

  return results;
}

export function addTrustedPattern(patternId) {
  if (!cachedRules) loadRules();
  const exists = cachedRules.some(r => r.id === patternId);
  if (!exists) {
    throw new Error(`Unknown pattern ID: ${patternId}`);
  }
  trustedPatterns.add(patternId);
  saveTrustedPatterns();
}

export function getTrustedPatterns() {
  loadTrustedPatterns();
  return [...trustedPatterns];
}
