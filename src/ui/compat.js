// src/ui/compat.js — Terminal capability detection
// No external dependencies, uses process.stdout and env vars only.

const MIN_COLS = 60;
const MIN_ROWS = 20;

/**
 * Detect terminal color support level.
 * Returns 'truecolor' | '256' | '16' | 'mono'.
 */
function detectColorSupport() {
  const env = process.env;

  // Explicitly disabled
  if (env.NO_COLOR !== undefined) return 'mono';
  if (env.FORCE_COLOR === '0') return 'mono';

  // Explicit truecolor indicators
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 'truecolor';

  // Known truecolor terminals
  const termProgram = (env.TERM_PROGRAM || '').toLowerCase();
  if (['iterm.app', 'hyper', 'warp', 'alacritty', 'ghostty'].includes(termProgram)) return 'truecolor';

  // Windows Terminal supports truecolor
  if (env.WT_SESSION) return 'truecolor';

  const term = (env.TERM || '').toLowerCase();

  // 256 color detection
  if (term.includes('256color') || env.COLORTERM === 'yes') return '256';

  // Basic 16-color terminals
  if (term.includes('color') || term.includes('ansi') || term.includes('xterm') || term.includes('screen') || term.includes('vt100')) return '16';

  // stdout is a TTY — assume at least basic colors
  if (process.stdout.isTTY) return '16';

  return 'mono';
}

/**
 * Detect whether the terminal supports ANSI escape sequences.
 */
function detectAnsiSupport() {
  const env = process.env;
  const platform = process.platform;

  // Windows: ANSI support depends on terminal
  if (platform === 'win32') {
    // Windows Terminal has full ANSI support
    if (env.WT_SESSION) return true;
    // ConEmu / cmder
    if (env.ConEmuANSI === 'ON') return true;
    // Modern Windows 10+ cmd.exe with VT processing — if stdout is TTY, assume yes
    if (process.stdout.isTTY) return true;
    return false;
  }

  // Unix-like: if stdout is a TTY, ANSI is supported
  if (process.stdout.isTTY) return true;

  // Piped / non-TTY — no ANSI
  return false;
}

/**
 * Detect terminal capabilities.
 * @returns {{ ansi: boolean, colors: 'mono'|'16'|'256'|'truecolor', rows: number, cols: number, platform: string, terminal: string, isWindowsTerminal: boolean, isCmdExe: boolean, belowMinimum: boolean }}
 */
export function detectCapabilities() {
  const env = process.env;
  const platform = process.platform;

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  const terminal = env.TERM_PROGRAM || env.TERM || (platform === 'win32' ? 'cmd' : 'unknown');

  const isWindowsTerminal = !!(platform === 'win32' && env.WT_SESSION);
  const isCmdExe = !!(platform === 'win32' && !env.WT_SESSION && !env.ConEmuANSI);

  const ansi = detectAnsiSupport();
  const colors = ansi ? detectColorSupport() : 'mono';

  const belowMinimum = cols < MIN_COLS || rows < MIN_ROWS;

  return {
    ansi,
    colors,
    rows,
    cols,
    platform,
    terminal,
    isWindowsTerminal,
    isCmdExe,
    belowMinimum,
  };
}
