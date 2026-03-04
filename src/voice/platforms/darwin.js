// src/voice/platforms/darwin.js — macOS speech recognition
// Uses osascript with NSSpeechRecognizer to listen for keywords.

import { spawn, execSync } from 'node:child_process';

/**
 * Create a macOS speech recognizer.
 * Uses AppleScript to run NSSpeechRecognizer with a keyword grammar.
 */
export function createDarwinRecognizer() {
  let childProc = null;
  let wordCallback = null;

  function buildAppleScript(keywords) {
    const keywordList = keywords.map(k => `"${k}"`).join(', ');
    return `
use framework "AppKit"
use scripting additions

on run
  set recognizer to current application's NSSpeechRecognizer's alloc()'s init()
  set commandList to {${keywordList}}
  set nsList to current application's NSArray's arrayWithArray:commandList
  recognizer's setCommands:nsList
  recognizer's setListensInForegroundOnly:false
  recognizer's setBlocksOtherRecognizers:false
  recognizer's setDelegate:me
  recognizer's startListening()

  repeat
    delay 0.1
  end repeat
end run
`;
  }

  return {
    /**
     * Start listening for the given keywords.
     * @param {string[]} keywords
     */
    start(keywords) {
      if (childProc) return;

      const script = buildAppleScript(keywords);

      childProc = spawn('osascript', ['-l', 'AppleScript', '-e', script], {
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

    /** Stop listening and kill the recognition process. */
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
     * Check if macOS speech recognition is available.
     * @returns {boolean}
     */
    isAvailable() {
      try {
        execSync('which osascript', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
  };
}
