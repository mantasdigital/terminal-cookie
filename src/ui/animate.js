/**
 * src/ui/animate.js — Animation engine for Terminal Cookie
 *
 * Provides Sprite, AnimationScene, and helpers for combat/cutscene visuals.
 * Self-contained with no external dependencies. Works with the existing
 * bufferWrite(row, col, text) + color() renderer interface at 30fps.
 */

// ── Sprite ──────────────────────────────────────────────────────────

class Sprite {
  /**
   * @param {object} opts
   * @param {string[]} opts.art - Array of ASCII art lines
   * @param {number} opts.row - Starting row position
   * @param {number} opts.col - Starting column position
   * @param {string} [opts.color] - ANSI color name (e.g. 'red', 'cyan')
   * @param {string} [opts.id] - Unique identifier
   */
  constructor({ art, row, col, color, id }) {
    this.id = id || `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.art = art || [];
    this.row = row;
    this.col = col;
    this.color = color || null;
    this.visible = true;
    this.opacity = 1; // 1 = full, 0 = invisible (used for fade logic)

    // Internal animation state
    this._moveAnim = null;   // { fromRow, fromCol, toRow, toCol, elapsed, duration }
    this._flashAnim = null;  // { originalColor, flashColor, elapsed, duration }
    this._shakeAnim = null;  // { amplitude, elapsed, duration }
    this._lifetime = null;   // { elapsed, duration } - auto-remove after duration
    this._floatAnim = null;  // { elapsed, duration, startRow } - float upward effect
  }

  /**
   * Smoothly interpolate position over time.
   * @param {number} toRow
   * @param {number} toCol
   * @param {number} durationMs
   */
  moveTo(toRow, toCol, durationMs) {
    this._moveAnim = {
      fromRow: this.row,
      fromCol: this.col,
      toRow,
      toCol,
      elapsed: 0,
      duration: Math.max(1, durationMs),
    };
  }

  /**
   * Change the ASCII art lines.
   * @param {string[]} art
   */
  setArt(art) {
    this.art = art;
  }

  /**
   * Change the color.
   * @param {string} color
   */
  setColor(color) {
    this.color = color;
  }

  /**
   * Temporarily flash a different color, then revert.
   * @param {string} flashColor
   * @param {number} durationMs
   */
  flash(flashColor, durationMs) {
    this._flashAnim = {
      originalColor: this.color,
      flashColor,
      elapsed: 0,
      duration: Math.max(1, durationMs),
    };
    this.color = flashColor;
  }

  /**
   * Horizontal shake effect using sin-wave offset.
   * @param {number} amplitude - Max pixel offset
   * @param {number} durationMs
   */
  shake(amplitude, durationMs) {
    this._shakeAnim = {
      amplitude,
      elapsed: 0,
      duration: Math.max(1, durationMs),
    };
  }

  /**
   * Float upward effect (row decrements over time).
   * @param {number} durationMs
   */
  floatUp(durationMs) {
    this._floatAnim = {
      startRow: this.row,
      elapsed: 0,
      duration: Math.max(1, durationMs),
    };
  }

  /**
   * Set a lifetime — sprite becomes invisible after duration.
   * @param {number} durationMs
   */
  setLifetime(durationMs) {
    this._lifetime = {
      elapsed: 0,
      duration: Math.max(1, durationMs),
    };
  }

  /**
   * Check if any animations are still active.
   * @returns {boolean}
   */
  isAnimating() {
    return !!(this._moveAnim || this._flashAnim || this._shakeAnim || this._floatAnim);
  }

  /**
   * Check if the sprite has expired its lifetime.
   * @returns {boolean}
   */
  isExpired() {
    return this._lifetime !== null && this._lifetime.elapsed >= this._lifetime.duration;
  }

  /**
   * Advance all active animations by deltaMs.
   * @param {number} deltaMs
   */
  update(deltaMs) {
    // Move animation
    if (this._moveAnim) {
      const m = this._moveAnim;
      m.elapsed += deltaMs;
      const t = Math.min(1, m.elapsed / m.duration);
      // Ease-out quad: t*(2-t)
      const ease = t * (2 - t);
      this.row = m.fromRow + (m.toRow - m.fromRow) * ease;
      this.col = m.fromCol + (m.toCol - m.fromCol) * ease;
      if (t >= 1) {
        this.row = m.toRow;
        this.col = m.toCol;
        this._moveAnim = null;
      }
    }

    // Flash animation
    if (this._flashAnim) {
      const f = this._flashAnim;
      f.elapsed += deltaMs;
      if (f.elapsed >= f.duration) {
        this.color = f.originalColor;
        this._flashAnim = null;
      }
    }

    // Shake animation
    if (this._shakeAnim) {
      this._shakeAnim.elapsed += deltaMs;
      if (this._shakeAnim.elapsed >= this._shakeAnim.duration) {
        this._shakeAnim = null;
      }
    }

    // Float up animation
    if (this._floatAnim) {
      const fl = this._floatAnim;
      fl.elapsed += deltaMs;
      const t = Math.min(1, fl.elapsed / fl.duration);
      // Float up by 3 rows over duration
      this.row = fl.startRow - Math.floor(t * 3);
      // Fade out in last 40% of duration
      if (t > 0.6) {
        this.opacity = Math.max(0, 1 - (t - 0.6) / 0.4);
      }
      if (t >= 1) {
        this._floatAnim = null;
        this.visible = false;
      }
    }

    // Lifetime tracking
    if (this._lifetime) {
      this._lifetime.elapsed += deltaMs;
      if (this._lifetime.elapsed >= this._lifetime.duration) {
        this.visible = false;
      }
    }
  }

  /**
   * Render the sprite to the screen buffer.
   * @param {object} renderer - Terminal renderer with bufferWrite, color methods
   */
  render(renderer) {
    if (!this.visible || this.opacity <= 0 || this.art.length === 0) return;

    // Calculate shake offset
    let colOffset = 0;
    if (this._shakeAnim) {
      const s = this._shakeAnim;
      const freq = 20; // oscillations per second
      const phase = (s.elapsed / 1000) * freq * Math.PI * 2;
      // Decay amplitude over duration
      const decay = 1 - (s.elapsed / s.duration);
      colOffset = Math.round(Math.sin(phase) * s.amplitude * decay);
    }

    const drawRow = Math.round(this.row);
    const drawCol = Math.round(this.col) + colOffset;

    for (let i = 0; i < this.art.length; i++) {
      const line = this.art[i];
      if (!line) continue;
      const r = drawRow + i;
      if (r < 0 || r >= (renderer.capabilities?.rows ?? 999)) continue;
      const c = Math.max(0, drawCol);
      if (c >= (renderer.capabilities?.cols ?? 999)) continue;

      // Dim text if opacity < 1 (for fade effects)
      let text = line;
      if (this.color && renderer.color) {
        text = renderer.color(line, this.color);
      }
      if (this.opacity < 0.5 && renderer.dim) {
        text = renderer.dim(line);
      }
      renderer.bufferWrite(r, c, text);
    }
  }
}

// ── AnimationScene ──────────────────────────────────────────────────

class AnimationScene {
  constructor() {
    this._sprites = [];       // Sprite[]
    this._events = [];        // { delayMs, callback, fired }[]
    this._elapsed = 0;
  }

  /**
   * Add a sprite to the scene.
   * @param {Sprite} sprite
   */
  addSprite(sprite) {
    this._sprites.push(sprite);
  }

  /**
   * Remove a sprite by id.
   * @param {string} id
   */
  removeSprite(id) {
    this._sprites = this._sprites.filter(s => s.id !== id);
  }

  /**
   * Get a sprite by id.
   * @param {string} id
   * @returns {Sprite|undefined}
   */
  getSprite(id) {
    return this._sprites.find(s => s.id === id);
  }

  /**
   * Schedule a future event.
   * @param {number} delayMs - Ms from scene start
   * @param {function} callback
   */
  addEvent(delayMs, callback) {
    this._events.push({ delayMs, callback, fired: false });
  }

  /**
   * Advance all sprites and fire due events.
   * @param {number} deltaMs
   */
  update(deltaMs) {
    this._elapsed += deltaMs;

    // Fire scheduled events
    for (const evt of this._events) {
      if (!evt.fired && this._elapsed >= evt.delayMs) {
        evt.fired = true;
        try { evt.callback(); } catch (e) { /* ignore callback errors */ }
      }
    }

    // Update sprites
    for (const sprite of this._sprites) {
      sprite.update(deltaMs);
    }

    // Garbage collect expired sprites
    this._sprites = this._sprites.filter(s => !s.isExpired());
  }

  /**
   * Render all sprites (earlier in array = farther back; later = on top).
   * @param {object} renderer
   */
  render(renderer) {
    for (const sprite of this._sprites) {
      sprite.render(renderer);
    }
  }

  /**
   * Check if the scene is done: all events fired and no active animations.
   * @returns {boolean}
   */
  isFinished() {
    const allEventsFired = this._events.every(e => e.fired);
    const noActiveAnims = !this._sprites.some(s => s.isAnimating() || (s._lifetime && !s.isExpired()));
    return allEventsFired && noActiveAnims;
  }

  /**
   * Get the total number of visible sprites.
   * @returns {number}
   */
  get spriteCount() {
    return this._sprites.filter(s => s.visible).length;
  }

  /**
   * Get elapsed scene time in ms.
   * @returns {number}
   */
  get elapsed() {
    return this._elapsed;
  }

  /**
   * Reset the scene.
   */
  reset() {
    this._sprites = [];
    this._events = [];
    this._elapsed = 0;
  }
}

// ── Helper: Damage Number ───────────────────────────────────────────

/**
 * Create a damage number sprite that floats upward and fades out.
 * @param {number|string} value - Damage value to display
 * @param {number} row - Starting row
 * @param {number} col - Starting column
 * @param {boolean} isCrit - True for critical hit (yellow, bigger text)
 * @returns {Sprite}
 */
function createDamageNumber(value, row, col, isCrit) {
  const text = isCrit ? `*${value}*` : `${value}`;
  const color = isCrit ? 'yellow' : 'red';

  const sprite = new Sprite({
    art: [text],
    row,
    col,
    color,
    id: `dmg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });

  sprite.floatUp(600);
  sprite.setLifetime(600);

  return sprite;
}

// ── Helper: Attack Effect ───────────────────────────────────────────

/**
 * ASCII particle attack effects:
 *  - 'slash': -->  moving from attacker to target
 *  - 'magic': *~*  sparkle burst
 *  - 'crit':  ===> bold strike
 *  - 'fumble': !   pops above attacker
 *  - 'arrow': --->  fast projectile
 *
 * @param {string} type - Effect type
 * @param {number} fromRow
 * @param {number} fromCol
 * @param {number} toRow
 * @param {number} toCol
 * @returns {Sprite}
 */
function createAttackEffect(type, fromRow, fromCol, toRow, toCol) {
  const EFFECTS = {
    slash:  { art: ['-->'],  color: 'white',  durationMs: 300 },
    magic:  { art: ['*~*'],  color: 'magenta', durationMs: 400 },
    crit:   { art: ['===>'], color: 'yellow', durationMs: 350 },
    fumble: { art: ['!'],    color: 'red',    durationMs: 400 },
    arrow:  { art: ['--->'], color: 'cyan',   durationMs: 250 },
    heal:   { art: ['+'],    color: 'green',  durationMs: 400 },
  };

  const effect = EFFECTS[type] || EFFECTS.slash;

  const sprite = new Sprite({
    art: effect.art,
    row: fromRow,
    col: fromCol,
    color: effect.color,
    id: `fx_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });

  if (type === 'fumble') {
    // Fumble just shakes in place above the attacker
    sprite.row = fromRow - 1;
    sprite.shake(1, effect.durationMs);
  } else {
    // Move from attacker toward target
    sprite.moveTo(toRow, toCol, effect.durationMs);
  }

  sprite.setLifetime(effect.durationMs);

  return sprite;
}

// ── Helper: Hit Flash ───────────────────────────────────────────────

/**
 * Create a brief impact flash at the target location.
 * @param {number} row
 * @param {number} col
 * @param {boolean} isCrit
 * @returns {Sprite}
 */
function createHitFlash(row, col, isCrit) {
  const art = isCrit ? ['* * *', ' *** ', '* * *'] : [' * ', '***', ' * '];
  const sprite = new Sprite({
    art,
    row: row - 1,
    col: col - 1,
    color: isCrit ? 'yellow' : 'white',
    id: `hit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });
  sprite.setLifetime(200);
  return sprite;
}

export { Sprite, AnimationScene, createDamageNumber, createAttackEffect, createHitFlash };
