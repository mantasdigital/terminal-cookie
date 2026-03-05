/**
 * Multi-terminal session tracker.
 * Each MCP server instance registers itself. More connected terminals = faster cookie mining.
 * Sessions expire after 60 seconds of inactivity.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomBytes } from 'crypto';

const SESSION_TTL_MS = 300_000; // 5 min inactivity = session expired
let exitHandlerRegistered = false;

/**
 * Create a session tracker that persists to a shared JSON file.
 * Multiple MCP server processes read/write the same file for coordination.
 * @param {string} filePath - Path to sessions.json
 * @returns {object} Session tracker instance
 */
export function createSessionTracker(filePath) {
  const sessionId = randomBytes(8).toString('hex');
  const pid = process.pid;

  function load() {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { sessions: {} };
    }
  }

  function save(data) {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // best-effort
    }
  }

  function prune(data) {
    const now = Date.now();
    for (const [id, session] of Object.entries(data.sessions)) {
      if (now - session.lastSeen > SESSION_TTL_MS) {
        delete data.sessions[id];
      }
    }
    return data;
  }

  /** Record a heartbeat for this session. Call on every tool invocation. */
  function heartbeat() {
    const data = prune(load());
    data.sessions[sessionId] = {
      pid,
      lastSeen: Date.now(),
      startedAt: data.sessions[sessionId]?.startedAt || Date.now(),
    };
    save(data);
  }

  /** Count currently active sessions (heartbeat within TTL). */
  function activeSessions() {
    const data = prune(load());
    return Object.keys(data.sessions).length;
  }

  /**
   * Mining speed multiplier based on active terminal count.
   * 1 terminal = x1.0, 2 = x1.5, 3 = x2.0, 4 = x2.5, 5+ = x3.0 (cap)
   */
  function multiplier() {
    const count = activeSessions();
    if (count <= 1) return 1.0;
    return Math.min(1.0 + (count - 1) * 0.5, 3.0);
  }

  /** Remove this session on shutdown. */
  function deregister() {
    const data = load();
    delete data.sessions[sessionId];
    save(data);
  }

  // Clean up on exit (only register once)
  if (!exitHandlerRegistered) {
    process.on('exit', deregister);
    exitHandlerRegistered = true;
  }

  // Register immediately
  heartbeat();

  return {
    heartbeat,
    activeSessions,
    multiplier,
    deregister,
    get sessionId() { return sessionId; },
  };
}
