// src/voice/platforms/linux.js — Linux speech recognition
// Tries in order: vosk (Python), pocketsphinx, arecord amplitude detection.

import { spawn, execSync } from 'node:child_process';

/**
 * Check if a command-line tool is available.
 * @param {string} cmd
 * @returns {boolean}
 */
function hasCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which recognition backend is available.
 * @returns {'vosk'|'pocketsphinx'|'arecord'|null}
 */
function detectBackend() {
  if (hasCommand('python3')) {
    try {
      execSync('python3 -c "import vosk"', { stdio: 'ignore', timeout: 3000 });
      return 'vosk';
    } catch { /* not installed */ }
  }
  if (hasCommand('pocketsphinx_continuous')) return 'pocketsphinx';
  if (hasCommand('arecord')) return 'arecord';
  return null;
}

function createVoskListener(keywords) {
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
  const pyScript = `
import sys, json, vosk, sounddevice as sd
vosk.SetLogLevel(-1)
model = vosk.Model(lang="en-us")
rec = vosk.KaldiRecognizer(model, 16000, json.dumps(${JSON.stringify(keywords)}))
def callback(indata, frames, time, status):
    if rec.AcceptWaveform(bytes(indata)):
        result = json.loads(rec.Result())
        text = result.get("text", "").strip().lower()
        if text:
            print(text, flush=True)
with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype="int16", channels=1, callback=callback):
    while True:
        sd.sleep(100)
`;

  let childProc = null;
  let wordCallback = null;

  return {
    start() {
      childProc = spawn('python3', ['-c', pyScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let buffer = '';
      childProc.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const word = line.trim().toLowerCase();
          if (word && keywordSet.has(word) && wordCallback) {
            wordCallback(word);
          }
        }
      });
      childProc.on('error', () => { childProc = null; });
      childProc.on('exit', () => { childProc = null; });
    },
    stop() {
      if (childProc) { childProc.kill('SIGTERM'); childProc = null; }
    },
    onWord(cb) { wordCallback = cb; },
  };
}

function createPocketsphinxListener(keywords) {
  let childProc = null;
  let wordCallback = null;
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

  return {
    start() {
      childProc = spawn('pocketsphinx_continuous', [
        '-inmic', 'yes',
        '-keyphrase', keywords[0] || 'cookie',
        '-kws_threshold', '1e-20',
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
          if (word && keywordSet.has(word) && wordCallback) {
            wordCallback(word);
          }
        }
      });
      childProc.on('error', () => { childProc = null; });
      childProc.on('exit', () => { childProc = null; });
    },
    stop() {
      if (childProc) { childProc.kill('SIGTERM'); childProc = null; }
    },
    onWord(cb) { wordCallback = cb; },
  };
}

function createArecordListener(keywords) {
  let childProc = null;
  let wordCallback = null;
  const defaultWord = keywords[0] || 'cookie';

  return {
    start() {
      childProc = spawn('arecord', [
        '-f', 'S16_LE', '-r', '16000', '-c', '1', '-t', 'raw', '-',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let cooldown = false;
      childProc.stdout.on('data', (data) => {
        if (cooldown) return;
        const samples = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
        let maxAmplitude = 0;
        for (let i = 0; i < samples.length; i++) {
          const abs = Math.abs(samples[i]);
          if (abs > maxAmplitude) maxAmplitude = abs;
        }
        if (maxAmplitude > 3200 && wordCallback) {
          wordCallback(defaultWord);
          cooldown = true;
          setTimeout(() => { cooldown = false; }, 500);
        }
      });
      childProc.on('error', () => { childProc = null; });
      childProc.on('exit', () => { childProc = null; });
    },
    stop() {
      if (childProc) { childProc.kill('SIGTERM'); childProc = null; }
    },
    onWord(cb) { wordCallback = cb; },
  };
}

/**
 * Create a Linux speech recognizer.
 * Automatically selects the best available backend.
 */
export function createLinuxRecognizer() {
  const backend = detectBackend();
  let listener = null;
  let wordCallback = null;

  return {
    /**
     * Start listening for the given keywords.
     * @param {string[]} keywords
     */
    start(keywords) {
      if (listener) return;
      if (backend === 'vosk') {
        listener = createVoskListener(keywords);
      } else if (backend === 'pocketsphinx') {
        listener = createPocketsphinxListener(keywords);
      } else if (backend === 'arecord') {
        listener = createArecordListener(keywords);
      } else {
        return;
      }
      if (wordCallback) listener.onWord(wordCallback);
      listener.start();
    },

    /** Stop listening and kill spawned processes. */
    stop() {
      if (listener) { listener.stop(); listener = null; }
    },

    /**
     * Register callback for recognized words.
     * @param {function} callback - Called with (word: string)
     */
    onWord(callback) {
      wordCallback = callback;
      if (listener) listener.onWord(callback);
    },

    /**
     * Check if any Linux speech recognition backend is available.
     * @returns {boolean}
     */
    isAvailable() {
      return backend !== null;
    },

    /** @returns {string|null} The detected backend name */
    get backendName() {
      return backend;
    },
  };
}
