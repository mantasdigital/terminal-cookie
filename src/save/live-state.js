/**
 * Live state bridge — shared state file that syncs between the terminal game
 * and MCP server so both can run simultaneously.
 *
 * Both sides write state changes to `saves/live.json` and poll for external
 * modifications. A `writerPid` field prevents a process from reloading its
 * own writes.
 */

import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = join(__dirname, '..', '..', 'saves');
const LIVE_PATH = join(SAVES_DIR, 'live.json');
const POLL_INTERVAL_MS = 1000;

/**
 * Create a live-state bridge.
 * @param {object} options
 * @param {function} options.getState  - Returns current game state object
 * @param {function} options.setState  - Merges external state: (externalState) => void
 * @param {string}   [options.label]   - Process label for logging ('game' or 'mcp')
 * @returns {object} Bridge instance
 */
export function createLiveState({ getState, setState, label = 'unknown' }) {
  const pid = process.pid;
  let lastMtimeMs = 0;
  let lastWriteMs = 0;
  let pollHandle = null;

  function ensureDir() {
    if (!existsSync(SAVES_DIR)) {
      mkdirSync(SAVES_DIR, { recursive: true });
    }
  }

  /**
   * Write current state to the live file.
   */
  function write() {
    ensureDir();
    try {
      const state = getState();
      const data = {
        ...state,
        _live: {
          writerPid: pid,
          writerLabel: label,
          writtenAt: Date.now(),
        },
      };
      writeFileSync(LIVE_PATH, JSON.stringify(data, null, 2), 'utf-8');
      lastWriteMs = Date.now();
      // Update our mtime tracker so we don't reload our own write
      try {
        lastMtimeMs = statSync(LIVE_PATH).mtimeMs;
      } catch { /* ignore */ }
    } catch {
      // best-effort write
    }
  }

  /**
   * Check if the live file was modified by another process and load if so.
   * Returns true if external state was loaded.
   */
  function poll() {
    if (!existsSync(LIVE_PATH)) return false;

    try {
      const stat = statSync(LIVE_PATH);
      if (stat.mtimeMs <= lastMtimeMs) return false;

      // File changed — read it
      const raw = readFileSync(LIVE_PATH, 'utf-8');
      const data = JSON.parse(raw);

      // Don't reload our own writes
      if (data._live?.writerPid === pid) {
        lastMtimeMs = stat.mtimeMs;
        return false;
      }

      // External change detected — merge it
      const { _live, _tavernRoster, ...stateData } = data;
      setState(stateData);
      lastMtimeMs = stat.mtimeMs;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start polling for external changes and writing state periodically.
   */
  function start() {
    if (pollHandle) return;

    // Poll first to pick up any external changes (e.g. hook crumbs)
    // before writing our state, so we don't overwrite them.
    poll();
    write();

    pollHandle = setInterval(() => {
      // Check for external changes first
      const externalUpdate = poll();

      // Write our state (but not if we just loaded external state — let it settle)
      if (!externalUpdate) {
        write();
      }
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop polling.
   */
  function stop() {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    // Final write
    write();
  }

  return {
    start,
    stop,
    write,
    poll,
    get livePath() { return LIVE_PATH; },
  };
}
