// src/ui/resize.js — Terminal resize handler
// Listens to SIGWINCH with debounce, updates capabilities and re-renders.

const DEBOUNCE_MS = 100;

/**
 * Create a resize handler that manages terminal resize events.
 * @param {object} renderer - renderer instance from terminal.js
 * @returns {{ onResize: (cb: Function) => void, destroy: () => void }}
 */
export function createResizeHandler(renderer) {
  const callbacks = [];
  let debounceTimer = null;

  function handleResize() {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      debounceTimer = null;

      const cols = process.stdout.columns || 80;
      const rows = process.stdout.rows || 24;

      // Update the renderer's capabilities
      renderer.updateCapabilities({ cols, rows });
      renderer.initBuffer();

      // Notify all registered callbacks
      for (const cb of callbacks) {
        try {
          cb({ cols, rows });
        } catch (err) {
          // Silently ignore callback errors to avoid crashing
        }
      }
    }, DEBOUNCE_MS);
  }

  // Listen for SIGWINCH (terminal resize signal, Unix only)
  if (process.platform !== 'win32') {
    process.on('SIGWINCH', handleResize);
  }

  // On Windows, poll stdout dimensions as fallback (Windows has no SIGWINCH)
  let winPollTimer = null;
  if (process.platform === 'win32') {
    let lastCols = process.stdout.columns;
    let lastRows = process.stdout.rows;
    winPollTimer = setInterval(() => {
      const cols = process.stdout.columns || 80;
      const rows = process.stdout.rows || 24;
      if (cols !== lastCols || rows !== lastRows) {
        lastCols = cols;
        lastRows = rows;
        handleResize();
      }
    }, 500);
  }

  /**
   * Register a callback for resize events.
   * @param {Function} cb - called with { cols, rows }
   */
  function onResize(cb) {
    if (typeof cb === 'function') {
      callbacks.push(cb);
    }
  }

  /**
   * Clean up listeners and timers.
   */
  function destroy() {
    if (process.platform !== 'win32') {
      process.removeListener('SIGWINCH', handleResize);
    }
    if (winPollTimer) clearInterval(winPollTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    callbacks.length = 0;
  }

  return {
    onResize,
    destroy,
  };
}
