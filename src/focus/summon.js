// src/focus/summon.js — Cross-platform window focus

import { execSync } from 'node:child_process';

/**
 * Map TERM_PROGRAM to macOS application names for AppleScript.
 */
const MAC_TERMINAL_MAP = {
  'apple_terminal': 'Terminal',
  'iterm.app': 'iTerm2',
  'iterm2': 'iTerm2',
  'alacritty': 'Alacritty',
  'hyper': 'Hyper',
  'warp': 'Warp',
  'kitty': 'kitty',
  'wezterm': 'WezTerm',
  'ghostty': 'Ghostty',
};

/**
 * Attempt to bring the terminal window to the foreground.
 * @param {{ os: string, terminal: string, displayServer: string, isWindowsTerminal: boolean }} platform
 * @returns {boolean} true if focus was attempted successfully
 */
export function summonWindow(platform) {
  try {
    if (platform.os === 'darwin') {
      return summonMac(platform.terminal);
    }
    if (platform.os === 'win32') {
      return summonWindows(platform.isWindowsTerminal);
    }
    if (platform.os === 'linux') {
      if (platform.displayServer === 'x11') {
        return summonLinuxX11();
      }
      // Wayland: no reliable way to focus
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

function summonMac(terminal) {
  const termKey = terminal.toLowerCase();
  const appName = MAC_TERMINAL_MAP[termKey] || 'Terminal';
  try {
    execSync(`osascript -e 'tell application "${appName}" to activate'`, { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    // Fallback to generic Terminal if specific app failed
    if (appName !== 'Terminal') {
      try {
        execSync(`osascript -e 'tell application "Terminal" to activate'`, { stdio: 'ignore', timeout: 3000 });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function summonWindows(isWindowsTerminal) {
  const script = isWindowsTerminal
    ? `Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'; $p = Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { [Native.Win]::SetForegroundWindow($p.MainWindowHandle) }`
    : `Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();'; [Native.Win]::SetForegroundWindow([Native.Win]::GetConsoleWindow())`;
  try {
    execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function summonLinuxX11() {
  // Try wmctrl first
  try {
    execSync('wmctrl -a "Terminal Cookie"', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    // Fallback to xdotool
    try {
      execSync('xdotool search --name "Terminal Cookie" windowactivate', { stdio: 'ignore', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}
