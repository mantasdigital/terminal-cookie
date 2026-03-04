// src/leaderboard/submit.js — Git submission logic

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createSubmission } from './leaderboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const SUBMISSIONS_DIR = join(PROJECT_ROOT, 'data', 'submissions');
const SCORES_PATH = join(PROJECT_ROOT, 'saves', 'scores.json');

/**
 * Load local scores from saves/scores.json.
 */
export function loadLocalScores() {
  try {
    return JSON.parse(readFileSync(SCORES_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Generate a submission file in data/submissions/<id>.json.
 * Returns { id, path, entry } or throws.
 */
export function generateSubmissionFile(stats, name, org) {
  const entry = createSubmission(stats, name, org);
  const filename = `${entry.id}.json`;
  const filepath = join(SUBMISSIONS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
  return { id: entry.id, path: filepath, entry };
}

/**
 * Check if git is available and we're in a repo.
 */
export function isGitAvailable() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: PROJECT_ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gh CLI is available.
 */
export function isGhAvailable() {
  try {
    execSync('gh --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a git branch with the submission, add and commit.
 * Returns { branch, committed } or throws.
 */
export function createSubmitBranch(id, filePath) {
  const branch = `leaderboard/submit-${id}`;
  const relativePath = filePath.replace(PROJECT_ROOT + '/', '');

  try {
    // Stash any existing changes
    execSync('git stash --include-untracked', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  } catch {
    // No changes to stash, that's fine
  }

  try {
    execSync(`git checkout -b ${branch}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    execSync(`git add "${relativePath}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    execSync(`git commit -m "leaderboard: submit score ${id}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    return { branch, committed: true };
  } catch (err) {
    // Try to go back to previous branch
    try { execSync('git checkout -', { cwd: PROJECT_ROOT, stdio: 'pipe' }); } catch { /* best effort */ }
    try { execSync('git stash pop', { cwd: PROJECT_ROOT, stdio: 'pipe' }); } catch { /* best effort */ }
    throw new Error(`Git branch creation failed: ${err.message}`);
  }
}

/**
 * Get push/PR instructions as a string.
 */
export function getInstructions(branch, hasGh) {
  const lines = [
    '',
    'Next steps:',
    `  1. Push your branch:  git push -u origin ${branch}`,
  ];

  if (hasGh) {
    lines.push(`  2. Create a PR:       gh pr create --title "Leaderboard submission" --body "Score submission via --submit-score"`);
  } else {
    lines.push(`  2. Open a PR on GitHub from the '${branch}' branch`);
  }

  lines.push(
    `  3. Wait for the repo owner to review and merge`,
    '',
    'Your submission will appear on the leaderboard after the owner runs --merge-leaderboard.',
  );

  return lines.join('\n');
}
