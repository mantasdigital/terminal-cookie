// src/voice/platforms/win32.js — Windows speech recognition
// Uses PowerShell with System.Speech.Recognition.SpeechRecognitionEngine.

import { spawn, execSync } from 'node:child_process';

/**
 * Create a Windows speech recognizer.
 * Spawns a PowerShell process with System.Speech grammar for keyword detection.
 */
export function createWindowsRecognizer() {
  let childProc = null;
  let wordCallback = null;

  function buildPowerShellScript(keywords) {
    const choicesStr = keywords.map(k => `'${k}'`).join(', ');
    return `
Add-Type -AssemblyName System.Speech
$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$choices = New-Object System.Speech.Recognition.Choices
$choices.Add(@(${choicesStr}))
$grammar = New-Object System.Speech.Recognition.Grammar(
  (New-Object System.Speech.Recognition.GrammarBuilder($choices))
)
$recognizer.LoadGrammar($grammar)
$recognizer.SetInputToDefaultAudioDevice()

while ($true) {
  try {
    $result = $recognizer.Recognize()
    if ($result -ne $null -and $result.Confidence -ge 0.6) {
      [Console]::Out.WriteLine($result.Text.ToLower())
      [Console]::Out.Flush()
    }
  } catch {
    Start-Sleep -Milliseconds 100
  }
}
`;
  }

  return {
    /**
     * Start listening for the given keywords.
     * @param {string[]} keywords
     */
    start(keywords) {
      if (childProc) return;

      const script = buildPowerShellScript(keywords);

      childProc = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', script,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let buffer = '';
      childProc.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const word = line.trim().toLowerCase();
          if (word && wordCallback) {
            wordCallback(word);
          }
        }
      });

      childProc.stderr.on('data', () => {});
      childProc.on('error', () => { childProc = null; });
      childProc.on('exit', () => { childProc = null; });
    },

    /** Stop listening and kill the PowerShell process. */
    stop() {
      if (childProc) {
        childProc.kill('SIGTERM');
        childProc = null;
      }
    },

    /**
     * Register callback for recognized words.
     * @param {function} callback - Called with (word: string)
     */
    onWord(callback) {
      wordCallback = callback;
    },

    /**
     * Check if Windows speech recognition is available.
     * @returns {boolean}
     */
    isAvailable() {
      try {
        execSync(
          'powershell.exe -NoProfile -NonInteractive -Command "[void][System.Reflection.Assembly]::LoadWithPartialName(\'System.Speech\')"',
          { stdio: 'ignore', timeout: 5000 },
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}
