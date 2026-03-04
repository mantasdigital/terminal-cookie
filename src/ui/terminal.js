// src/ui/terminal.js — Main terminal renderer with ANSI escape codes
// Screen-buffer system to reduce flicker. 16-color ANSI palette with color-blind safe mode.

const ESC = '\x1b[';

// 16 standard ANSI foreground colors
const FG = {
  black: '30', red: '31', green: '32', yellow: '33',
  blue: '34', magenta: '35', cyan: '36', white: '37',
  brightBlack: '90', brightRed: '91', brightGreen: '92', brightYellow: '93',
  brightBlue: '94', brightMagenta: '95', brightCyan: '96', brightWhite: '97',
};

// 16 standard ANSI background colors
const BG = {
  black: '40', red: '41', green: '42', yellow: '43',
  blue: '44', magenta: '45', cyan: '46', white: '47',
  brightBlack: '100', brightRed: '101', brightGreen: '102', brightYellow: '103',
  brightBlue: '104', brightMagenta: '105', brightCyan: '106', brightWhite: '107',
};

// Color-blind safe symbols for semantic meaning (used instead of relying on color alone)
const CB_SYMBOLS = {
  success: '[+]',
  error: '[X]',
  warning: '[!]',
  info: '[i]',
  health: '<3',
  mana: '~~',
  danger: '!!',
};

const RESET = `${ESC}0m`;

/**
 * Wrap text with ANSI color codes.
 * @param {string} text
 * @param {string} [fg] - foreground color name
 * @param {string} [bg] - background color name
 */
export function color(text, fg, bg) {
  if (!fg && !bg) return text;
  const codes = [];
  if (fg && FG[fg]) codes.push(FG[fg]);
  if (bg && BG[bg]) codes.push(BG[bg]);
  if (codes.length === 0) return text;
  return `${ESC}${codes.join(';')}m${text}${RESET}`;
}

export function bold(text) {
  return `${ESC}1m${text}${RESET}`;
}

export function dim(text) {
  return `${ESC}2m${text}${RESET}`;
}

function underline(text) {
  return `${ESC}4m${text}${RESET}`;
}

/**
 * Plain-text fallback versions (no escape codes).
 */
const plainHelpers = {
  color: (text) => text,
  bold: (text) => text,
  dim: (text) => text,
};

/**
 * Create a renderer instance.
 * @param {{ ansi: boolean, colors: string, rows: number, cols: number }} capabilities
 */
export function createRenderer(capabilities) {
  let caps = { ...capabilities };
  const useAnsi = caps.ansi;
  let colorBlindSafe = false;
  let inAlternateScreen = false;

  // Screen buffer: array of row strings
  let buffer = [];
  let bufferDirty = false;

  function initBuffer() {
    buffer = new Array(caps.rows).fill('');
    bufferDirty = false;
  }
  initBuffer();

  /** Enter the alternate screen buffer (prevents scrollback pollution). */
  function enterAltScreen() {
    if (useAnsi && !inAlternateScreen) {
      rawWrite(`${ESC}?1049h`);
      inAlternateScreen = true;
    }
  }

  /** Leave the alternate screen buffer (restores original terminal content). */
  function leaveAltScreen() {
    if (useAnsi && inAlternateScreen) {
      rawWrite(`${ESC}?1049l`);
      inAlternateScreen = false;
    }
  }

  // ---- low-level ANSI helpers ----

  function rawWrite(str) {
    process.stdout.write(str);
  }

  function clear() {
    if (useAnsi) {
      rawWrite(`${ESC}2J${ESC}H`);
    } else {
      rawWrite('\n'.repeat(caps.rows));
    }
    initBuffer();
  }

  function moveTo(row, col) {
    if (useAnsi) {
      rawWrite(`${ESC}${row + 1};${col + 1}H`);
    }
  }

  function hideCursor() {
    if (useAnsi) rawWrite(`${ESC}?25l`);
  }

  function showCursor() {
    if (useAnsi) rawWrite(`${ESC}?25h`);
  }

  function write(text, fg, bg) {
    if (useAnsi && caps.colors !== 'mono') {
      rawWrite(color(text, fg, bg));
    } else {
      rawWrite(text);
    }
  }

  function writeLine(row, text, fg, bg) {
    if (row < 0 || row >= caps.rows) return;
    moveTo(row, 0);
    // Clear the line first
    if (useAnsi) rawWrite(`${ESC}2K`);
    write(text, fg, bg);
  }

  // ---- buffer write methods ----

  function bufferWrite(row, col, text) {
    if (row < 0 || row >= caps.rows) return;
    // Pad the row if needed
    while (buffer[row].length < col) {
      buffer[row] += ' ';
    }
    buffer[row] = buffer[row].substring(0, col) + text + buffer[row].substring(col + stripAnsi(text).length);
    bufferDirty = true;
  }

  function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  // ---- high-level drawing ----

  function drawBox(row, col, width, height, title) {
    const tl = '+', tr = '+', bl = '+', br = '+';
    const h = '-', v = '|';

    let topBar = tl + h.repeat(width - 2) + tr;
    if (title) {
      const titleStr = ` ${title} `;
      const pos = Math.max(2, Math.floor((width - titleStr.length) / 2));
      topBar = tl + h.repeat(pos - 1) + titleStr + h.repeat(Math.max(0, width - pos - 1 - titleStr.length)) + tr;
    }

    bufferWrite(row, col, useAnsi ? color(topBar, 'cyan') : topBar);

    for (let i = 1; i < height - 1; i++) {
      const line = v + ' '.repeat(width - 2) + v;
      bufferWrite(row + i, col, useAnsi ? color(line, 'cyan') : line);
    }

    const bottom = bl + h.repeat(width - 2) + br;
    bufferWrite(row + height - 1, col, useAnsi ? color(bottom, 'cyan') : bottom);
  }

  function drawProgressBar(row, col, width, value, max, barColor) {
    const inner = width - 2;
    const filled = Math.round((value / Math.max(max, 1)) * inner);
    const empty = inner - filled;
    const filledStr = '#'.repeat(filled);
    const emptyStr = '-'.repeat(empty);
    const bar = '[' + (useAnsi ? color(filledStr, barColor || 'green') : filledStr) + emptyStr + ']';
    bufferWrite(row, col, bar);
  }

  function render() {
    if (!bufferDirty) return;
    hideCursor();
    for (let r = 0; r < buffer.length; r++) {
      if (buffer[r] !== '') {
        moveTo(r, 0);
        if (useAnsi) rawWrite(`${ESC}2K`);
        rawWrite(buffer[r]);
      }
    }
    showCursor();
    bufferDirty = false;
  }

  function showHeader(text) {
    const padded = centerText(text, caps.cols);
    writeLine(0, useAnsi ? bold(color(padded, 'brightYellow')) : padded);
  }

  function showStatus(text) {
    writeLine(caps.rows - 1, useAnsi ? dim(color(text, 'white')) : text);
  }

  function showNotification(text, level) {
    const colorMap = { info: 'cyan', warn: 'yellow', error: 'red', success: 'green' };
    const symbolMap = { info: CB_SYMBOLS.info, warn: CB_SYMBOLS.warning, error: CB_SYMBOLS.error, success: CB_SYMBOLS.success };
    const fg = colorMap[level] || 'white';
    const sym = colorBlindSafe ? (symbolMap[level] || '') + ' ' : '';
    const row = caps.rows - 2;
    const msg = sym + text;
    writeLine(row, useAnsi ? color(msg, fg) : msg);
  }

  function centerText(text, width) {
    const stripped = stripAnsi(text);
    if (stripped.length >= width) return text;
    const pad = Math.floor((width - stripped.length) / 2);
    return ' '.repeat(pad) + text;
  }

  function updateCapabilities(newCaps) {
    caps = { ...caps, ...newCaps };
    initBuffer();
  }

  return {
    clear,
    moveTo,
    write,
    writeLine,
    drawBox,
    drawProgressBar,
    render,
    showHeader,
    showStatus,
    showNotification,
    hideCursor,
    showCursor,
    bufferWrite,
    initBuffer,
    stripAnsi,
    centerText,
    updateCapabilities,
    enterAltScreen,
    leaveAltScreen,
    get capabilities() { return caps; },
    set colorBlindSafe(val) { colorBlindSafe = val; },
    get colorBlindSafe() { return colorBlindSafe; },
    // expose helpers
    color: useAnsi ? color : plainHelpers.color,
    bold: useAnsi ? bold : plainHelpers.bold,
    dim: useAnsi ? dim : plainHelpers.dim,
  };
}
