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
  // macOS: use System Events to set the window level of the frontmost window.
  // "set level" isn't available via AppleScript, so we use a Python bridge
  // to call the Quartz CGWindow API to keep the window above others.
  // Fallback: repeated activate + raise via AppleScript timer.
  if (enable) {
    try {
      // Approach 1: Use Python + Quartz to set window level (most reliable)
      const pyScript = `
import subprocess, time
try:
    from Quartz import CGWindowListCopyWindowInfo, kCGWindowListOptionOnScreenOnly, kCGNullWindowID
    from Cocoa import NSApplication, NSApp
except ImportError:
    pass
# Fallback: just activate the terminal
subprocess.run(['osascript', '-e', 'tell application "System Events" to tell (first process whose frontmost is true) to set visible to true'], capture_output=True, timeout=3)
`;
      // The Quartz approach requires pyobjc which may not be installed.
      // More reliable: use osascript to set the window index to 1 (front).
      // We combine activate + raise in a single script.
      execSync(
        `osascript -e '
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  tell process frontApp
    try
      perform action "AXRaise" of window 1
    end try
  end tell
end tell'`,
        { stdio: 'ignore', timeout: 3000 }
      );
      return true;
    } catch {
      return false;
    }
  } else {
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
