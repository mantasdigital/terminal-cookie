// src/focus/notify.js — Notification system

import { execSync } from 'node:child_process';

/**
 * Send ANSI bell character to stdout.
 */
export function bell() {
  try {
    process.stdout.write('\x07');
  } catch {
    // Silent fail if stdout is not writable
  }
}

/**
 * Flash the terminal title with a warning prefix, restoring after 3 seconds.
 * @param {string} text - The alert text to display
 */
export function flashTitle(text) {
  const originalTitle = process.title;
  try {
    // Set terminal title via escape sequence
    process.stdout.write(`\x1b]0;\u26a0 ${text}\x07`);
    setTimeout(() => {
      try {
        process.stdout.write(`\x1b]0;${originalTitle || 'Terminal Cookie'}\x07`);
      } catch {
        // Silent fail
      }
    }, 3000);
  } catch {
    // Silent fail
  }
}

/**
 * Send an OS-native notification.
 * @param {string} title
 * @param {string} body
 * @param {{ os: string }} platform
 */
export function osNotify(title, body, platform) {
  try {
    if (platform.os === 'darwin') {
      const safeTitle = title.replace(/"/g, '\\"');
      const safeBody = body.replace(/"/g, '\\"');
      execSync(`osascript -e 'display notification "${safeBody}" with title "${safeTitle}"'`, { stdio: 'ignore', timeout: 3000 });
    } else if (platform.os === 'win32') {
      const safeTitle = title.replace(/'/g, "''");
      const safeBody = body.replace(/'/g, "''");
      const script = `[void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.BalloonTipTitle = '${safeTitle}'; $n.BalloonTipText = '${safeBody}'; $n.Visible = $true; $n.ShowBalloonTip(5000)`;
      execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'ignore', timeout: 5000 });
    } else if (platform.os === 'linux') {
      const safeTitle = title.replace(/"/g, '\\"');
      const safeBody = body.replace(/"/g, '\\"');
      execSync(`notify-send "${safeTitle}" "${safeBody}"`, { stdio: 'ignore', timeout: 3000 });
    }
  } catch {
    // Silent fail — notifications are best-effort
  }
}
