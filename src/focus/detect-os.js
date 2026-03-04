// src/focus/detect-os.js — Platform detection for focus system

/**
 * Detect the current platform and its focus/notification capabilities.
 * @returns {{ os: string, terminal: string, displayServer: string, isWindowsTerminal: boolean, isCmdExe: boolean, canFocus: boolean, canSticky: boolean, canNotify: boolean }}
 */
export function detectPlatform() {
  const env = process.env;
  const os = process.platform;

  const terminal = env.TERM_PROGRAM || env.TERM || (os === 'win32' ? 'cmd' : 'unknown');

  const isWindowsTerminal = !!(os === 'win32' && env.WT_SESSION);
  const isCmdExe = !!(os === 'win32' && !env.WT_SESSION && !env.ConEmuANSI);

  let displayServer = 'unknown';
  if (os === 'linux') {
    const sessionType = (env.XDG_SESSION_TYPE || '').toLowerCase();
    if (sessionType === 'wayland') {
      displayServer = 'wayland';
    } else if (sessionType === 'x11' || env.DISPLAY) {
      displayServer = 'x11';
    }
  }

  let canFocus = false;
  let canSticky = false;
  let canNotify = false;

  if (os === 'darwin') {
    canFocus = true;
    canSticky = true;
    canNotify = true;
  } else if (os === 'win32') {
    canFocus = true;
    canSticky = true;
    canNotify = true;
  } else if (os === 'linux') {
    if (displayServer === 'x11') {
      canFocus = true;
      canSticky = true;
      canNotify = true;
    } else if (displayServer === 'wayland') {
      // Wayland restricts window management; notifications still work
      canFocus = false;
      canSticky = false;
      canNotify = true;
    }
  }

  return {
    os,
    terminal,
    displayServer,
    isWindowsTerminal,
    isCmdExe,
    canFocus,
    canSticky,
    canNotify,
  };
}
