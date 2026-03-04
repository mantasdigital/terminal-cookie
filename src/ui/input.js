// src/ui/input.js — Cross-platform input handler
// Raw-mode keypress parsing, debounce, paste detection, special key mapping.

import { EventEmitter } from 'events';

const DEBOUNCE_MS = 50;        // max 20 inputs/sec
const PASTE_THRESHOLD_MS = 5;  // chars arriving within 5ms = paste
const PASTE_MIN_CHARS = 3;

// ANSI escape sequences for special keys
const SPECIAL_KEYS = {
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
  '\x1bOA': 'up',
  '\x1bOB': 'down',
  '\x1bOC': 'right',
  '\x1bOD': 'left',
  '\r':     'enter',
  '\n':     'enter',
  '\x1b':   'escape',
  '\t':     'tab',
  ' ':      'space',
  '\x7f':   'backspace',
  '\b':     'backspace',
  '\x1b[3~': 'delete',
  '\x1b[H': 'home',
  '\x1b[F': 'end',
  '\x1b[5~': 'pageup',
  '\x1b[6~': 'pagedown',
};

/**
 * Create an input handler instance.
 * @returns {object} handler with start/stop/onKey/onPaste/waitForKey
 */
export function createInputHandler() {
  const emitter = new EventEmitter();
  let running = false;
  let lastEventTime = 0;
  let pasteBuffer = '';
  let pasteTimer = null;
  let keyCallback = null;
  let pasteCallback = null;

  function parseKey(data) {
    const str = data.toString();

    // Ctrl-C
    if (str === '\x03') {
      return { key: 'ctrl-c', raw: data, timestamp: Date.now() };
    }

    // Known special keys
    if (SPECIAL_KEYS[str] !== undefined) {
      return { key: SPECIAL_KEYS[str], raw: data, timestamp: Date.now() };
    }

    // Ctrl+<letter> (0x01 - 0x1a excluding already handled)
    const code = str.charCodeAt(0);
    if (str.length === 1 && code >= 1 && code <= 26 && code !== 3 && code !== 9 && code !== 13 && code !== 27) {
      const letter = String.fromCharCode(code + 96);
      return { key: `ctrl-${letter}`, raw: data, timestamp: Date.now() };
    }

    // Printable character(s)
    return { key: str, raw: data, timestamp: Date.now() };
  }

  function handleData(data) {
    if (!running) return;

    const now = Date.now();
    const str = data.toString();

    // Check for known multi-byte escape sequences BEFORE paste detection.
    // Arrow keys etc. are 3+ bytes and would otherwise trigger the paste detector,
    // causing them to be split into individual chars (\x1b → escape → exits app).
    if (SPECIAL_KEYS[str] !== undefined) {
      lastEventTime = now;
      emitKey(data);
      return;
    }

    // Paste detection: multiple chars arriving at once or in quick succession
    if (str.length >= PASTE_MIN_CHARS || (pasteBuffer.length > 0 && (now - lastEventTime) < PASTE_THRESHOLD_MS)) {
      pasteBuffer += str;
      lastEventTime = now;

      // Reset paste flush timer
      if (pasteTimer) clearTimeout(pasteTimer);
      pasteTimer = setTimeout(() => {
        if (pasteBuffer.length >= PASTE_MIN_CHARS && pasteCallback) {
          pasteCallback(pasteBuffer);
        } else {
          // Not enough for paste — process as individual keys
          for (const ch of pasteBuffer) {
            emitKey(Buffer.from(ch));
          }
        }
        pasteBuffer = '';
        pasteTimer = null;
      }, PASTE_THRESHOLD_MS + 1);
      return;
    }

    // Debounce check
    if ((now - lastEventTime) < DEBOUNCE_MS) return;
    lastEventTime = now;

    emitKey(data);
  }

  function emitKey(data) {
    const event = parseKey(data);

    // Ctrl-C always emits quit
    if (event.key === 'ctrl-c') {
      emitter.emit('quit', event);
      return;
    }

    if (keyCallback) keyCallback(event);
    emitter.emit('key', event);
  }

  function handleSignal() {
    emitter.emit('quit', { key: 'signal', raw: Buffer.alloc(0), timestamp: Date.now() });
  }

  function start() {
    if (running) return;
    running = true;

    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', handleData);

    // Graceful shutdown on SIGTERM/SIGINT (same as Ctrl-C)
    process.on('SIGTERM', handleSignal);
    process.on('SIGINT', handleSignal);
  }

  function stop() {
    running = false;
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeListener('data', handleData);
    process.stdin.pause();
    process.removeListener('SIGTERM', handleSignal);
    process.removeListener('SIGINT', handleSignal);
  }

  function onKey(cb) {
    keyCallback = cb;
  }

  function onPaste(cb) {
    pasteCallback = cb;
  }

  /**
   * Wait for a single keypress, with optional timeout.
   * @param {number} [timeoutMs=0] - 0 means wait forever
   * @returns {Promise<{key: string, raw: Buffer, timestamp: number}|null>}
   */
  function waitForKey(timeoutMs = 0) {
    return new Promise((resolve) => {
      let timer = null;
      const prevCallback = keyCallback;

      function cleanup() {
        keyCallback = prevCallback;
        if (timer) clearTimeout(timer);
      }

      keyCallback = (event) => {
        cleanup();
        resolve(event);
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          cleanup();
          resolve(null);
        }, timeoutMs);
      }
    });
  }

  /**
   * Programmatically inject a key event, as if the user pressed it.
   * Used by the voice controller to feed recognized commands into the input pipeline.
   * @param {string} key - The key name to emit (e.g. 'enter', 'escape', 'e', 'space')
   */
  function emitKeyProgrammatic(key) {
    if (!running) return;
    const event = { key, raw: Buffer.from(key), timestamp: Date.now() };

    if (key === 'ctrl-c') {
      emitter.emit('quit', event);
      return;
    }

    if (keyCallback) keyCallback(event);
    emitter.emit('key', event);
  }

  return {
    start,
    stop,
    onKey,
    onPaste,
    waitForKey,
    emitKey: emitKeyProgrammatic,
    emitter,
  };
}
