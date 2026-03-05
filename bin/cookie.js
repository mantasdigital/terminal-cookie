#!/usr/bin/env node

// bin/cookie.js — Main entry point for Terminal Cookie

import { mkdirSync, writeFileSync, readFileSync, statSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// -- Version check ----------------------------------------------------------

const [major] = process.versions.node.split('.');
if (parseInt(major, 10) < 18) {
  process.stderr.write(
    `Terminal Cookie requires Node.js 18 or later.\n` +
    `You are running Node.js ${process.versions.node}.\n` +
    `Please upgrade: https://nodejs.org/\n`
  );
  process.exit(1);
}

// -- Paths ------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const CONFIG_DIR = join(homedir(), '.terminal-cookie');
const LOG_PATH = join(CONFIG_DIR, 'debug.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

// -- CLI arg parsing --------------------------------------------------------

const args = process.argv.slice(2);
const flags = {
  debug: args.includes('--debug'),
  mcp: args.includes('--mcp'),
  mine: args.includes('--mine'),
  setupHooks: args.includes('--setup-hooks'),
  reset: args.includes('--reset'),
  version: args.includes('--version') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h'),
  leaderboard: args.includes('--leaderboard'),
  submitScore: args.includes('--submit-score'),
  mergeLeaderboard: args.includes('--merge-leaderboard'),
  updateReadme: args.includes('--update-readme'),
};

// -- Logging ----------------------------------------------------------------

mkdirSync(CONFIG_DIR, { recursive: true });

function rotateLog() {
  try {
    const stats = statSync(LOG_PATH);
    if (stats.size >= MAX_LOG_SIZE) {
      renameSync(LOG_PATH, LOG_PATH + '.old');
    }
  } catch {
    // File may not exist yet
  }
}

function writeLog(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try {
    rotateLog();
    writeFileSync(LOG_PATH, line, { flag: 'a' });
  } catch {
    // Best effort
  }
}

export const log = {
  error(msg) {
    writeLog('ERROR', typeof msg === 'string' ? msg : String(msg));
  },
  warn(msg) {
    writeLog('WARN', typeof msg === 'string' ? msg : String(msg));
  },
  debug(msg) {
    if (flags.debug) {
      writeLog('DEBUG', typeof msg === 'string' ? msg : String(msg));
    }
  },
};

// -- Commands ---------------------------------------------------------------

if (flags.version) {
  const require = createRequire(import.meta.url);
  const pkg = require(join(PROJECT_ROOT, 'package.json'));
  process.stdout.write(`Terminal Cookie v${pkg.version}\n`);
  process.exit(0);
}

if (flags.help) {
  process.stdout.write(
    `Terminal Cookie - Cookie dungeon game + AI security monitor + MCP server\n\n` +
    `Usage: terminal-cookie [options]\n\n` +
    `Options:\n` +
    `  --debug             Enable debug logging\n` +
    `  --mcp               Start MCP server on stdio\n` +
    `  --setup-hooks       Install Claude Code hooks for auto cookie mining\n` +
    `  --mine              Mine crumbs silently (used by hooks internally)\n` +
    `  --reset             Delete all save data\n` +
    `  --leaderboard       Show the community leaderboard\n` +
    `  --submit-score      Submit your score to the leaderboard via git\n` +
    `  --merge-leaderboard Merge approved submissions into the leaderboard (repo owner)\n` +
    `  --update-readme     Update README.md leaderboard table from data (repo owner)\n` +
    `  --version           Print version and exit\n` +
    `  --help              Show this help message\n\n` +
    `Aliases: tcookie\n`
  );
  process.exit(0);
}

if (flags.setupHooks) {
  // Auto-configure Claude Code hooks so every interaction mines cookies.
  // Adds UserPromptSubmit + Stop hooks to ~/.claude/settings.json
  const CLAUDE_DIR = join(homedir(), '.claude');
  const CLAUDE_SETTINGS = join(CLAUDE_DIR, 'settings.json');
  const mineCmd = `node ${join(PROJECT_ROOT, 'bin', 'cookie.js')} --mine`;

  mkdirSync(CLAUDE_DIR, { recursive: true });

  let settings = {};
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};

  const cookieHook = {
    hooks: [{ type: 'command', command: mineCmd }],
    timeout: 3000,
  };

  // Add hooks for every user input and every Claude response
  for (const event of ['UserPromptSubmit', 'Stop']) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }
    // Don't duplicate if already installed
    const alreadyInstalled = settings.hooks[event].some(
      h => h.hooks?.some(inner => inner.command?.includes('cookie.js') && inner.command?.includes('--mine'))
    );
    if (!alreadyInstalled) {
      settings.hooks[event].push(cookieHook);
    }
  }

  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2), 'utf-8');
  process.stdout.write(
    `Cookie mining hooks installed!\n\n` +
    `Every time you:\n` +
    `  - Send a message to Claude\n` +
    `  - Claude finishes responding\n` +
    `  - Select any choice (yes, no, remember, etc.)\n` +
    `...you automatically mine +3 crumbs.\n\n` +
    `Hooks added to: ${CLAUDE_SETTINGS}\n` +
    `To remove: edit that file and delete the "UserPromptSubmit" and "Stop" hook entries.\n`
  );
  process.exit(0);
}

if (flags.mine) {
  // Silent cookie mine — called by Claude Code hooks on every interaction.
  // Reads live.json, adds crumbs, writes back. Fast and silent (no stdout).
  const LIVE_PATH = join(PROJECT_ROOT, 'saves', 'live.json');
  const SAVES_DIR = join(PROJECT_ROOT, 'saves');
  try {
    mkdirSync(SAVES_DIR, { recursive: true });
    let data = {};
    if (existsSync(LIVE_PATH)) {
      data = JSON.parse(readFileSync(LIVE_PATH, 'utf-8'));
    }
    const crumbsEarned = 3;
    data.crumbs = (data.crumbs || 0) + crumbsEarned;
    if (!data.stats) data.stats = {};
    data.stats.crumbsEarned = (data.stats.crumbsEarned || 0) + crumbsEarned;
    data._live = {
      writerPid: process.pid,
      writerLabel: 'hook',
      writtenAt: Date.now(),
    };
    writeFileSync(LIVE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Silent fail — hooks must not break the user's workflow
  }
  process.exit(0);
}

if (flags.leaderboard) {
  const { loadLeaderboard, formatLeaderboardFull } = await import(join(PROJECT_ROOT, 'src', 'leaderboard', 'leaderboard.js'));
  const lb = loadLeaderboard();
  process.stdout.write(formatLeaderboardFull(lb.entries) + '\n');
  process.exit(0);
}

if (flags.submitScore) {
  const { createInterface } = await import('node:readline');
  const { loadLocalScores, generateSubmissionFile, isGitAvailable, isGhAvailable, createSubmitBranch, getInstructions } = await import(join(PROJECT_ROOT, 'src', 'leaderboard', 'submit.js'));

  const scores = loadLocalScores();
  if (!scores) {
    process.stderr.write('No local scores found in saves/scores.json.\nPlay some games first to build up stats!\n');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  process.stdout.write('\n=== Submit Score to Leaderboard ===\n\n');
  process.stdout.write(`Your stats:\n`);
  process.stdout.write(`  Dungeons cleared: ${scores.dungeons_cleared ?? 0}\n`);
  process.stdout.write(`  Highest level:    ${scores.highest_level ?? 0}\n`);
  process.stdout.write(`  Total clicks:     ${scores.total_clicks ?? 0}\n`);
  process.stdout.write(`  Total crumbs:     ${scores.total_crumbs_earned ?? 0}\n`);
  process.stdout.write(`  Monsters killed:  ${scores.monsters_killed ?? 0}\n\n`);

  const name = await ask('Display name (required): ');
  if (!name || name.trim().length === 0) {
    process.stderr.write('Name is required.\n');
    rl.close();
    process.exit(1);
  }
  const org = await ask('Organization (optional, press Enter to skip): ');
  rl.close();

  try {
    const { id, path, entry } = generateSubmissionFile(scores, name, org || null);
    process.stdout.write(`\nSubmission created: ${path}\n`);

    if (isGitAvailable()) {
      process.stdout.write('Creating git branch...\n');
      const { branch } = createSubmitBranch(id, path);
      const hasGh = isGhAvailable();
      process.stdout.write(`Branch created: ${branch}\n`);
      process.stdout.write(getInstructions(branch, hasGh) + '\n');
    } else {
      process.stdout.write('\nGit not available. To submit manually:\n');
      process.stdout.write(`  1. Commit the file: ${path}\n`);
      process.stdout.write('  2. Push to a branch and open a PR\n');
    }
  } catch (err) {
    process.stderr.write(`Submission failed: ${err.message}\n`);
    process.exit(1);
  }
  process.exit(0);
}

if (flags.mergeLeaderboard) {
  const { loadLeaderboard, saveLeaderboard, mergeSubmissions } = await import(join(PROJECT_ROOT, 'src', 'leaderboard', 'leaderboard.js'));
  const lb = loadLeaderboard();
  const result = mergeSubmissions(lb);

  if (result.merged === 0 && result.errors.length === 0) {
    process.stdout.write('No submissions to merge.\n');
    process.exit(0);
  }

  if (result.merged > 0) {
    saveLeaderboard(lb);
    process.stdout.write(`Merged ${result.merged} submission(s) into leaderboard.\n`);
  }
  if (result.skipped > 0) {
    process.stdout.write(`Skipped ${result.skipped} submission(s).\n`);
  }
  for (const err of result.errors) {
    process.stderr.write(`  Error: ${err}\n`);
  }

  // Auto-commit if in git
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['add', 'data/leaderboard.json'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', `leaderboard: merge ${result.merged} submission(s)`], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    process.stdout.write('Changes committed to git.\n');
  } catch {
    process.stdout.write('Remember to commit data/leaderboard.json.\n');
  }
  process.exit(0);
}

if (flags.updateReadme) {
  const { loadLeaderboard, rankEntries } = await import(join(PROJECT_ROOT, 'src', 'leaderboard', 'leaderboard.js'));
  const readmePath = join(PROJECT_ROOT, 'README.md');
  const lb = loadLeaderboard();
  const ranked = rankEntries(lb.entries);

  // Sanitize strings for safe Markdown table insertion
  function sanitizeMd(str) {
    if (!str) return '-';
    return str.replace(/[|[\]()<>\\`*_{}#!~\n\r]/g, '').trim().substring(0, 40) || '-';
  }

  // Build markdown table
  const tableLines = [
    '| # | Player | Org | Dungeons | Level | Clicks | Crumbs |',
    '|---|--------|-----|----------|-------|--------|--------|',
  ];
  if (ranked.length === 0) {
    tableLines.push('| | *No scores yet — be the first!* | | | | | |');
  } else {
    for (let i = 0; i < ranked.length; i++) {
      const e = ranked[i];
      tableLines.push(`| ${i + 1} | ${sanitizeMd(e.name)} | ${sanitizeMd(e.org)} | ${e.dungeons_cleared ?? 0} | ${e.highest_level ?? 0} | ${e.total_clicks ?? 0} | ${e.total_crumbs_earned ?? 0} |`);
    }
  }
  const newTable = tableLines.join('\n');

  const readme = readFileSync(readmePath, 'utf-8');
  const startMarker = '<!-- LEADERBOARD:START -->';
  const endMarker = '<!-- LEADERBOARD:END -->';
  const startIdx = readme.indexOf(startMarker);
  const endIdx = readme.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    process.stderr.write('Could not find LEADERBOARD markers in README.md\n');
    process.exit(1);
  }

  const updated = readme.substring(0, startIdx + startMarker.length) + '\n' + newTable + '\n' + readme.substring(endIdx);
  writeFileSync(readmePath, updated, 'utf-8');
  process.stdout.write(`README.md leaderboard updated (${ranked.length} entries).\n`);
  process.exit(0);
}

if (flags.reset) {
  const savesDir = join(PROJECT_ROOT, 'saves');
  if (existsSync(savesDir)) {
    process.stdout.write('This will delete all save data. Press Enter to confirm or Ctrl+C to cancel...\n');
    await new Promise((resolve) => {
      process.stdin.once('data', resolve);
    });
    try {
      rmSync(savesDir, { recursive: true, force: true });
      mkdirSync(savesDir, { recursive: true });
      process.stdout.write('Save data cleared.\n');
    } catch (err) {
      process.stderr.write(`Failed to reset saves: ${err.message}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write('No save data found.\n');
  }
  process.exit(0);
}

if (flags.mcp) {
  log.debug('Starting MCP server on stdio');
  // NOTE: Do NOT write to stdout here — MCP uses stdio for JSON-RPC.
  // Any non-protocol text on stdout corrupts the handshake.
  process.stderr.write('Terminal Cookie MCP server starting...\n');

  // Graceful shutdown when parent process closes stdin or sends signals
  function mcpShutdown() {
    log.debug('MCP server shutting down');
    process.exit(0);
  }
  process.on('SIGINT', mcpShutdown);
  process.on('SIGTERM', mcpShutdown);
  process.on('SIGHUP', mcpShutdown);
  // When the parent closes the stdio pipe, exit cleanly
  process.stdin.on('end', mcpShutdown);
  process.stdin.on('close', mcpShutdown);

  try {
    await import(join(PROJECT_ROOT, 'src', 'mcp', 'server.js'));
  } catch (err) {
    log.error(`MCP server failed: ${err.message}`);
    process.stderr.write(`MCP server failed to start: ${err.message}\n`);
    process.exit(1);
  }
  // MCP server keeps the process alive via stdio
} else {
  // -- Default: run the game --------------------------------------------------

  log.debug('Starting Terminal Cookie game');

  // Detect terminal capabilities
  const { detectCapabilities } = await import(join(PROJECT_ROOT, 'src', 'ui', 'compat.js'));
  const capabilities = detectCapabilities();
  log.debug(`Terminal: ${capabilities.terminal}, Colors: ${capabilities.colors}, Size: ${capabilities.cols}x${capabilities.rows}`);

  if (capabilities.belowMinimum) {
    process.stderr.write(
      `Terminal window is too small (${capabilities.cols}x${capabilities.rows}).\n` +
      `Minimum required: 60 columns x 20 rows.\n` +
      `Please resize your terminal and try again.\n`
    );
    process.exit(1);
  }

  // Global error handler
  let engine = null;

  process.on('uncaughtException', async (err) => {
    log.error(`Uncaught exception: ${err.stack || err.message}`);
    try {
      if (engine && typeof engine.shutdown === 'function') {
        await engine.shutdown();
      }
    } catch {
      // Best-effort autosave
    }
    process.stderr.write(
      `\nSomething went wrong. Your progress has been auto-saved.\n` +
      `Error: ${err.message}\n` +
      `Check ${LOG_PATH} for details.\n`
    );
    process.exit(1);
  });

  // Graceful shutdown
  async function gracefulShutdown() {
    log.debug('Graceful shutdown initiated');
    // Restore terminal: leave alternate screen, show cursor, disable raw mode
    process.stdout.write('\x1b[?25h\x1b[?1049l');
    try {
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
    } catch { /* best effort */ }
    try {
      if (engine && typeof engine.shutdown === 'function') {
        await engine.shutdown();
      }
    } catch {
      // Best effort
    }
    process.stdout.write('\nGoodbye, cookie adventurer!\n');
    process.exit(0);
  }

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGHUP', gracefulShutdown);

  // Start the game
  try {
    const { runGame } = await import(join(PROJECT_ROOT, 'src', 'game', 'index.js'));
    await runGame({ debug: flags.debug });
  } catch (err) {
    log.error(`Engine failed to start: ${err.stack || err.message}`);
    process.stderr.write(`Failed to start game: ${err.message}\n`);
    process.exit(1);
  }
}
