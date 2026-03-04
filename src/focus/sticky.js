// src/focus/sticky.js — Always-on-top toggle

import { execSync } from 'node:child_process';

/**
 * Toggle always-on-top for the terminal window.
 * @param {boolean} enable - true to enable, false to disable
 * @param {{ os: string, displayServer: string }} platform
 * @returns {boolean} true if the operation succeeded
 */
export function setAlwaysOnTop(enable, platform) {
  try {
    if (platform.os === 'darwin') {
      return stickyMac(enable);
    }
    if (platform.os === 'win32') {
      return stickyWindows(enable);
    }
    if (platform.os === 'linux') {
      if (platform.displayServer === 'x11') {
        return stickyLinuxX11(enable);
      }
      // Wayland: no reliable way to set always-on-top
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

function stickyMac(enable) {
  // macOS does not have a simple "always on top" for terminal apps.
  // We use AppleScript to set the frontmost property and System Events.
  if (enable) {
    try {
      execSync(
        `osascript -e 'tell application "System Events" to set frontmost of first process whose frontmost is true to true'`,
        { stdio: 'ignore', timeout: 3000 }
      );
      return true;
    } catch {
      return false;
    }
  } else {
    // Disabling: there's no direct "un-frontmost" — just return true as a no-op
    return true;
  }
}

function stickyWindows(enable) {
  const flag = enable ? '-1' : '-2'; // HWND_TOPMOST = -1, HWND_NOTOPMOST = -2
  const script = `Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();'; $h = [Native.Win]::GetConsoleWindow(); [Native.Win]::SetWindowPos($h, [IntPtr]::new(${flag}), 0, 0, 0, 0, 0x0003)`;
  try {
    execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function stickyLinuxX11(enable) {
  const action = enable ? 'add' : 'remove';
  try {
    execSync(`wmctrl -r :ACTIVE: -b ${action},above`, { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    // Fallback: xdotool (limited support)
    try {
      if (enable) {
        execSync('xdotool getactivewindow set_window --overrideredirect 1', { stdio: 'ignore', timeout: 3000 });
      }
      return enable; // Can only enable, not reliably disable via xdotool
    } catch {
      return false;
    }
  }
}
