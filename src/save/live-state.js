/**
 * Live state bridge — shared state file that syncs between the terminal game
 * and MCP server so both can run simultaneously.
 *
 * Both sides write state changes to `saves/live.json` and poll for external
 * modifications. A `writerPid` field prevents a process from reloading its
 * own writes.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
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
export function createLiveState({ getState, setState, label = 'unknown', skipInitialPoll = false }) {
  const pid = process.pid;
  let lastWriteMs = 0;
  let lastExternalJson = '';   // Track last-seen external JSON to avoid redundant setState calls
  let lastWrittenJson = '';    // Track our last write to skip our own changes
  let pollHandle = null;

  // Temporary debug log — writes to saves/live-debug.log
  const DEBUG_LOG = join(SAVES_DIR, 'live-debug.log');
  function _debugLog(msg) {
    try {
      const ts = new Date().toISOString();
      appendFileSync(DEBUG_LOG, `[${ts}] [${label}:${pid}] ${msg}\n`);
    } catch { /* ignore */ }
  }

  function ensureDir() {
    if (!existsSync(SAVES_DIR)) {
      mkdirSync(SAVES_DIR, { recursive: true });
    }
  }

  /**
   * Write current state to the live file.
   */
  function write() {
    try {
      ensureDir();
      const state = getState();
      // Exclude transient UI data that can cause serialization issues
      const { tavernRoster, activeCombat, rollBarState, ...serializableState } = state;
      const data = {
        ...serializableState,
        _live: {
          writerPid: pid,
          writerLabel: label,
          writtenAt: Date.now(),
        },
      };
      const json = JSON.stringify(data, null, 2);
      writeFileSync(LIVE_PATH, json, 'utf-8');
      lastWriteMs = Date.now();
      lastWrittenJson = json;
    } catch (err) {
      _debugLog(`write: error: ${err.message}`);
    }
  }

  /**
   * Check if the live file was modified by another process and load if so.
   * Always reads the file (no mtime optimization) to avoid race conditions
   * when multiple processes share the same live.json.
   * Returns true if external state was loaded.
   */
  function poll() {
    if (!existsSync(LIVE_PATH)) { _debugLog('poll: file not found'); return false; }

    try {
      const raw = readFileSync(LIVE_PATH, 'utf-8');

      // Skip if file content is identical to what we last wrote
      if (raw === lastWrittenJson) return false;

      // Skip if file content is identical to the last external state we loaded
      if (raw === lastExternalJson) return false;

      const data = JSON.parse(raw);

      // Don't reload our own writes (belt-and-suspenders with the JSON check above)
      if (data._live?.writerPid === pid) {
        lastWrittenJson = raw;
        return false;
      }

      // External change detected — merge it
      _debugLog(`poll: external change from ${data._live?.writerLabel}(${data._live?.writerPid}), crumbs=${data.crumbs}`);
      lastExternalJson = raw;
      const { _live, _tavernRoster, tavernRoster, activeCombat, rollBarState, ...stateData } = data;
      setState(stateData);
      return true;
    } catch (err) {
      _debugLog(`poll: error: ${err.message}`);
      return false;
    }
  }

  /**
   * Start polling for external changes and writing state periodically.
   */
  function start() {
    try {
      if (pollHandle) { _debugLog('start: already running, skipping'); return; }
      _debugLog(`start: skipInitialPoll=${skipInitialPoll}, LIVE_PATH=${LIVE_PATH}`);

      // Poll first to pick up any external changes (e.g. hook crumbs)
      // before writing our state, so we don't overwrite them.
      // Skip initial poll on new games to avoid loading stale crumbs.
      if (!skipInitialPoll) {
        const pollResult = poll();
        _debugLog(`start: initial poll returned ${pollResult}`);
      }
      write();
      _debugLog(`start: initial write done, crumbs=${getState().crumbs}`);

      pollHandle = setInterval(() => {
        try {
          // Check for external changes first
          const externalUpdate = poll();

          // Write our state (but not if we just loaded external state — let it settle)
          if (!externalUpdate) {
            write();
          }
        } catch (err) {
          _debugLog(`interval: error: ${err.message}`);
        }
      }, POLL_INTERVAL_MS);
      _debugLog('start: interval set');
    } catch (err) {
      // Log to stderr as fallback if debug log fails
      try { process.stderr.write(`[live-state] start error (${label}): ${err.message}\n`); } catch { /* ignore */ }
      _debugLog(`start: FATAL error: ${err.message}`);
    }
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
