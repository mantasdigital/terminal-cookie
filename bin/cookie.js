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
  reset: args.includes('--reset'),
  version: args.includes('--version') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h'),
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
    `  --debug       Enable debug logging\n` +
    `  --mcp         Start MCP server on stdio\n` +
    `  --reset       Delete all save data\n` +
    `  --version     Print version and exit\n` +
    `  --help        Show this help message\n\n` +
    `Aliases: tcookie\n`
  );
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

  // Start the engine
  try {
    const { createEngine } = await import(join(PROJECT_ROOT, 'src', 'core', 'engine.js'));
    engine = createEngine();
    await engine.start();
  } catch (err) {
    log.error(`Engine failed to start: ${err.stack || err.message}`);
    process.stderr.write(`Failed to start game: ${err.message}\n`);
    process.exit(1);
  }
}
