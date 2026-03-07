/**
 * Passive game runner — background game loop for MCP server mode.
 * Auto-advances dungeon rooms, resolves combat, queues pending actions.
 */

import { generateDungeon, getAvailableMoves, moveToRoom, clearRoom, getFlavorText } from '../game/dungeon.js';
import { generateRoomEnemies } from '../game/enemies.js';
import { createCombat } from '../game/combat.js';
import { generateLoot, sellValue } from '../game/loot.js';
import { awardXP } from '../game/team.js';
import { formatCrumbs } from '../ui/format.js';
import { createStoryManager } from '../game/story.js';

let nextPendingId = 1;

/**
 * Create the passive background runner.
 * @param {object} options
 * @param {object} options.engine - Game engine instance
 * @param {object} options.rng - RNG instance (engine.rng)
 * @param {object} options.settings - Settings instance
 * @param {object} options.scores - Scores instance
 * @returns {object} Passive runner instance
 */
export function createPassiveRunner({ engine, rng, settings, scores, sessions }) {
  let intervalHandle = null;
  let tickCount = 0;

  const state = engine.getStateRef();

  /**
   * Append an entry to the passive log (capped at 50).
   */
  function log(msg) {
    state.passiveLog.push({ time: Date.now(), msg });
    if (state.passiveLog.length > 50) {
      state.passiveLog = state.passiveLog.slice(-50);
    }
  }

  /**
   * Queue a pending action that needs user input.
   */
  function queuePending(type, description, choices, data = {}) {
    const id = `pa_${nextPendingId++}`;
    state.pendingActions.push({
      id,
      type,
      description,
      choices,
      data,
      createdAt: Date.now(),
    });
    return id;
  }

  /**
   * Auto-resolve a room in the dungeon.
   */
  function resolveRoom(dungeon, room) {
    switch (room.type) {
      case 'empty':
        handleEmptyRoom(dungeon, room);
        break;
      case 'monster':
        handleMonsterRoom(dungeon, room);
        break;
      case 'boss':
        handleBossRoom(dungeon, room);
        break;
      case 'trap':
        handleTrapRoom(dungeon, room);
        break;
      case 'shrine':
        handleShrineRoom(dungeon, room);
        break;
      case 'loot':
        handleLootRoom(dungeon, room);
        break;
      case 'miniboss':
        handleMinibossRoom(dungeon, room);
        break;
      case 'npc':
        handleNPCRoom(dungeon, room);
        break;
      default:
        handleEmptyRoom(dungeon, room);
    }
    clearRoom(dungeon);
  }

  function handleEmptyRoom(dungeon, room) {
    const flavor = getFlavorText(dungeon, rng) || 'The room is quiet.';
    log(`Room ${room.id}: ${flavor}`);
  }

  function handleMonsterRoom(dungeon, room) {
    const enemies = generateRoomEnemies({
      biome: dungeon.biome,
      level: dungeon.level,
      rng,
      roomType: 'monster',
    });

    const aliveTeam = state.team.filter(m => m.alive && m.currentHp > 0);
    if (aliveTeam.length === 0) {
      log(`Room ${room.id}: Monsters block the path but your team is dead!`);
      return;
    }

    const combat = createCombat({ team: aliveTeam, enemies, rng });
    const result = combat.autoResolveAll();

    // Sync HP back to team — combatants only has survivors, so track who survived
    const survivorIds = new Set();
    for (const c of combat.combatants) {
      if (c.side === 'team') {
        survivorIds.add(c.id);
        const member = state.team.find(m => m.id === c.id);
        if (member) {
          member.currentHp = c.currentHp;
          if (c.currentHp <= 0) member.alive = false;
        }
      }
    }
    // Mark team members who fought but aren't in survivors as dead
    for (const m of aliveTeam) {
      if (!survivorIds.has(m.id)) {
        m.currentHp = 0;
        m.alive = false;
      }
    }

    if (result.outcome === 'victory') {
      const slain = enemies.length;
      state.stats.monstersSlain = (state.stats.monstersSlain || 0) + slain;
      scores.increment('monsters_slain', slain);

      // Award XP
      for (const member of state.team.filter(m => m.alive)) {
        awardXP(member, dungeon.level);
      }

      // Generate drops
      const drops = [];
      for (const enemy of enemies) {
        if (rng.chance(enemy.dropChance || 0.3)) {
          const loot = generateLoot({ level: dungeon.level, rng, minRarity: enemy.minRarity });
          if (loot) drops.push(loot);
        }
      }

      if (drops.length > 0 && state.passiveConfig.autoLoot) {
        for (const item of drops) {
          if (state.passiveConfig.autoSell) {
            const value = sellValue(item);
            state.crumbs += value;
            state._mcpEarned = (state._mcpEarned ?? 0) + value;
            log(`Auto-sold ${item.name} for ${value} crumbs`);
          } else {
            state.inventory.push(item);
            log(`Looted: ${item.name} [${item.rarity}]`);
          }
        }
      } else if (drops.length > 0) {
        queuePending('loot', `Combat drops: ${drops.map(d => d.name).join(', ')}`,
          ['take_all', 'sell_all', 'choose'],
          { items: drops });
      }

      log(`Room ${room.id}: Victory! Defeated ${slain} enemies in ${result.rounds} rounds.`);
    } else {
      log(`Room ${room.id}: Defeat... your team was overwhelmed.`);
    }
  }

  function handleBossRoom(dungeon, room) {
    const enemies = generateRoomEnemies({
      biome: dungeon.biome,
      level: dungeon.level,
      rng,
      roomType: 'boss',
    });

    const aliveTeam = state.team.filter(m => m.alive && m.currentHp > 0);
    if (aliveTeam.length === 0) {
      log(`Room ${room.id}: A powerful boss guards this room but your team is dead!`);
      return;
    }

    // Boss fights always queue as pending for user decision
    queuePending('boss_fight',
      `BOSS: ${enemies[0].name} (HP: ${enemies[0].maxHp}, ATK: ${enemies[0].stats.atk})`,
      ['fight', 'retreat'],
      { enemies, roomId: room.id, dungeonLevel: dungeon.level });
    log(`Room ${room.id}: BOSS encountered! ${enemies[0].name} blocks your path.`);
  }

  function handleMinibossRoom(dungeon, room) {
    const enemies = generateRoomEnemies({
      biome: dungeon.biome,
      level: dungeon.level,
      rng,
      roomType: 'monster',
    });

    // Minibosses are tougher: buff stats by 50%
    for (const e of enemies) {
      e.stats.hp = Math.round(e.stats.hp * 1.5);
      e.maxHp = e.stats.hp;
      e.currentHp = e.stats.hp;
      e.stats.atk = Math.round(e.stats.atk * 1.3);
      e.stats.def = Math.round(e.stats.def * 1.2);
    }

    const aliveTeam = state.team.filter(m => m.alive && m.currentHp > 0);
    if (aliveTeam.length === 0) {
      log(`Room ${room.id}: A miniboss blocks the path but your team is dead!`);
      return;
    }

    const combat = createCombat({ team: aliveTeam, enemies, rng });
    const result = combat.autoResolveAll();

    const survivorIds = new Set();
    for (const c of combat.combatants) {
      if (c.side === 'team') {
        survivorIds.add(c.id);
        const member = state.team.find(m => m.id === c.id);
        if (member) {
          member.currentHp = c.currentHp;
          if (c.currentHp <= 0) member.alive = false;
        }
      }
    }
    for (const m of aliveTeam) {
      if (!survivorIds.has(m.id)) {
        m.currentHp = 0;
        m.alive = false;
      }
    }

    if (result.outcome === 'victory') {
      const slain = enemies.length;
      state.stats.monstersSlain = (state.stats.monstersSlain || 0) + slain;
      scores.increment('monsters_slain', slain);

      for (const member of state.team.filter(m => m.alive)) {
        awardXP(member, dungeon.level);
      }

      // Miniboss guaranteed loot
      const item = generateLoot({ level: dungeon.level, rng, minRarity: 'Rare' });
      if (item) {
        if (state.passiveConfig.autoLoot) {
          if (state.passiveConfig.autoSell) {
            const value = sellValue(item);
            state.crumbs += value;
            state._mcpEarned = (state._mcpEarned ?? 0) + value;
            log(`Room ${room.id}: Miniboss defeated! Auto-sold ${item.name} for ${value} crumbs.`);
          } else {
            state.inventory.push(item);
            log(`Room ${room.id}: Miniboss defeated! Looted ${item.name} [${item.rarity}]`);
          }
        } else {
          queuePending('loot', `Miniboss drop: ${item.name}`, ['take', 'sell', 'leave'], { items: [item] });
          log(`Room ${room.id}: Miniboss defeated! Loot awaits.`);
        }
      } else {
        log(`Room ${room.id}: Miniboss defeated in ${result.rounds} rounds!`);
      }
    } else {
      log(`Room ${room.id}: Defeated by the miniboss...`);
    }
  }

  function handleTrapRoom(dungeon, room) {
    const aliveTeam = state.team.filter(m => m.alive && m.currentHp > 0);
    if (aliveTeam.length === 0) return;

    // Dodge roll using team's best SPD
    const bestSpd = Math.max(...aliveTeam.map(m => m.stats?.spd ?? 5));
    const roll = rng.roll();
    const modifier = Math.floor(bestSpd / 4);
    const total = Math.min(roll + modifier, 20);

    if (total >= 10) {
      log(`Room ${room.id}: Trap detected and avoided! (Roll: ${total})`);
    } else {
      // Trap damage to random member
      const victim = aliveTeam[rng.int(0, aliveTeam.length - 1)];
      const dmg = Math.max(1, rng.int(2, 4 + dungeon.level));
      victim.currentHp = Math.max(0, victim.currentHp - dmg);
      if (victim.currentHp <= 0) victim.alive = false;
      log(`Room ${room.id}: ${victim.name} hit by trap for ${dmg} damage! (Roll: ${total})`);
    }
  }

  function handleShrineRoom(dungeon, room) {
    const aliveTeam = state.team.filter(m => m.alive);
    if (aliveTeam.length === 0) return;

    // Heal team
    for (const member of aliveTeam) {
      const heal = Math.floor(member.maxHp * 0.3);
      member.currentHp = Math.min(member.maxHp, member.currentHp + heal);
    }
    log(`Room ${room.id}: Shrine discovered! Team healed 30%.`);
  }

  function handleLootRoom(dungeon, room) {
    const item = generateLoot({ level: dungeon.level, rng });
    if (!item) {
      log(`Room ${room.id}: Empty chest.`);
      return;
    }

    if (state.passiveConfig.autoLoot) {
      if (state.passiveConfig.autoSell) {
        const value = sellValue(item);
        state.crumbs += value;
        state._mcpEarned = (state._mcpEarned ?? 0) + value;
        log(`Room ${room.id}: Found and auto-sold ${item.name} for ${value} crumbs.`);
      } else {
        state.inventory.push(item);
        log(`Room ${room.id}: Found ${item.name} [${item.rarity}]!`);
      }
    } else {
      queuePending('loot', `Found: ${item.name} [${item.rarity}]`,
        ['take', 'sell', 'leave'],
        { items: [item] });
    }
  }

  function handleNPCRoom(dungeon, room) {
    log(`Room ${room.id}: Encountered a mysterious figure. They share wisdom and move on.`);
    state.crumbs += 2;
    state._mcpEarned = (state._mcpEarned ?? 0) + 2;
  }

  /**
   * Main tick — advance dungeon by one room.
   */
  function tick() {
    tickCount++;

    // Keep MCP session alive between tool calls
    if (sessions) sessions.heartbeat();

    // Only tick if in dungeon and have a dungeon
    if (!state.dungeonProgress) return;
    const dungeon = state.dungeonProgress;

    // Skip if there are unresolved boss fights
    const hasBossPending = state.pendingActions.some(a => a.type === 'boss_fight');
    if (hasBossPending) return;

    // Check if dungeon is complete
    if (dungeon.completed) {
      const crumbReward = dungeon.level * 50;
      state.crumbs += crumbReward;
      state._mcpEarned = (state._mcpEarned ?? 0) + crumbReward;
      state.stats.runs = (state.stats.runs || 0) + 1;
      scores.recordDungeonClear(dungeon.level);
      log(`Dungeon complete! +${crumbReward} crumbs.`);
      state.dungeonProgress = null;
      return;
    }

    // Advance to next room
    const moves = getAvailableMoves(dungeon);
    if (moves.length === 0) {
      // Dead end — dungeon complete by default
      dungeon.completed = true;
      const crumbReward = dungeon.level * 30;
      state.crumbs += crumbReward;
      state._mcpEarned = (state._mcpEarned ?? 0) + crumbReward;
      state.stats.runs = (state.stats.runs || 0) + 1;
      scores.recordDungeonClear(dungeon.level);
      log(`Dead end reached. Dungeon cleared! +${crumbReward} crumbs.`);
      state.dungeonProgress = null;
      return;
    }

    // Pick next room (prefer unvisited)
    const unvisited = moves.filter(id => !dungeon.rooms[id].visited);
    const nextRoomId = unvisited.length > 0
      ? unvisited[rng.int(0, unvisited.length - 1)]
      : moves[rng.int(0, moves.length - 1)];

    moveToRoom(dungeon, nextRoomId);
    const room = dungeon.rooms[nextRoomId];

    // Update dungeonProgress tracking
    dungeon.roomsCleared = (dungeon.roomsCleared || 0) + 1;

    // Resolve the room
    resolveRoom(dungeon, room);

    // Tick story modifiers
    const story = createStoryManager(state);
    story.tickModifiers();

    // Check if all team members are dead
    const anyAlive = state.team.some(m => m.alive && m.currentHp > 0);
    if (!anyAlive && state.team.length > 0) {
      state.stats.deaths = (state.stats.deaths || 0) + 1;
      log('All team members have fallen. Dungeon failed.');
      state.dungeonProgress = null;
    }

    // Fire scheduler events
    engine.scheduler.tick();
  }

  /**
   * Award passive crumbs for any MCP tool interaction.
   */
  function passiveEarning(toolName) {
    state.totalToolCalls = (state.totalToolCalls || 0) + 1;
    // Base earning per AI tool call
    const base = 2;
    // Milestone bonus every 10 calls
    const milestone = state.totalToolCalls % 10 === 0 ? 5 : 0;
    const earned = base + milestone;
    state.crumbs += earned;
    state._mcpEarned = (state._mcpEarned ?? 0) + earned;
    state.stats.crumbsEarned = (state.stats.crumbsEarned || 0) + earned;
    if (milestone > 0) {
      log(`Milestone! ${state.totalToolCalls} tool calls. +${earned} crumbs!`);
    }
    return earned;
  }

  /**
   * Drain the passive log — returns all entries and clears the log.
   */
  function drain() {
    const entries = [...state.passiveLog];
    state.passiveLog = [];
    return entries;
  }

  /**
   * Build a status line for appending to MCP responses.
   */
  function statusLine() {
    const parts = [`Crumbs: ${formatCrumbs(state.crumbs)}`];

    if (state.team.length > 0) {
      const alive = state.team.filter(m => m.alive).length;
      parts.push(`Team: ${alive}/${state.team.length}`);
    }

    if (state.dungeonProgress) {
      const d = state.dungeonProgress;
      const roomInfo = `Room ${d.currentRoom}/${d.rooms ? d.rooms.length - 1 : d.totalRooms}`;
      parts.push(`Dungeon Lv.${d.level}: ${roomInfo}`);
    }

    if (state.pendingActions.length > 0) {
      parts.push(`Pending: ${state.pendingActions.length}`);
    }

    const nextEvent = engine.scheduler.nextEventIn();
    if (nextEvent !== null) {
      parts.push(`Next event: ~${Math.ceil(nextEvent / 1000)}s`);
    }

    parts.push(`Ticks: ${tickCount}`);

    return `[COOKIE] ${parts.join(' | ')}`;
  }

  /**
   * Resolve a pending action by id.
   */
  function resolvePending(actionId, choice) {
    const idx = state.pendingActions.findIndex(a => a.id === actionId);
    if (idx === -1) return { error: `No pending action with id ${actionId}` };

    const action = state.pendingActions[idx];
    state.pendingActions.splice(idx, 1);

    switch (action.type) {
      case 'loot':
        return resolveLootAction(action, choice);
      case 'boss_fight':
        return resolveBossFight(action, choice);
      case 'vault_input':
        // Vault entries must be entered in the terminal — never via AI
        state.pendingActions.splice(idx, 0, action); // re-insert, not resolved
        return { error: 'Vault credentials must be entered directly in the terminal via: terminal-cookie --vault' };
      default:
        return { result: `Action ${actionId} resolved with choice: ${choice}` };
    }
  }

  function resolveLootAction(action, choice) {
    const items = action.data.items || [];
    if (choice === 'take_all' || choice === 'take') {
      for (const item of items) state.inventory.push(item);
      return { result: `Took ${items.length} item(s).` };
    }
    if (choice === 'sell_all' || choice === 'sell') {
      let total = 0;
      for (const item of items) {
        const v = sellValue(item);
        state.crumbs += v;
        state._mcpEarned = (state._mcpEarned ?? 0) + v;
        total += v;
      }
      return { result: `Sold ${items.length} item(s) for ${total} crumbs.` };
    }
    if (choice === 'leave') {
      return { result: 'Left the loot behind.' };
    }
    return { result: `Unknown choice: ${choice}` };
  }

  function resolveBossFight(action, choice) {
    if (choice === 'retreat') {
      log('Retreated from boss fight.');
      return { result: 'Retreated from the boss.' };
    }

    const aliveTeam = state.team.filter(m => m.alive && m.currentHp > 0);
    if (aliveTeam.length === 0) {
      return { error: 'No alive team members to fight.' };
    }

    const enemies = action.data.enemies;
    const combat = createCombat({ team: aliveTeam, enemies, rng });
    const result = combat.autoResolveAll();

    // Sync HP back — combatants only has survivors
    const survivorIds = new Set();
    for (const c of combat.combatants) {
      if (c.side === 'team') {
        survivorIds.add(c.id);
        const member = state.team.find(m => m.id === c.id);
        if (member) {
          member.currentHp = c.currentHp;
          if (c.currentHp <= 0) member.alive = false;
        }
      }
    }
    // Mark team members who fought but aren't in survivors as dead
    for (const m of aliveTeam) {
      if (!survivorIds.has(m.id)) {
        m.currentHp = 0;
        m.alive = false;
      }
    }

    if (result.outcome === 'victory') {
      const level = action.data.dungeonLevel || 1;
      state.stats.monstersSlain = (state.stats.monstersSlain || 0) + enemies.length;

      for (const member of state.team.filter(m => m.alive)) {
        awardXP(member, level);
      }

      // Boss guaranteed loot
      const drops = [];
      for (const enemy of enemies) {
        const loot = generateLoot({ level, rng, minRarity: 'Rare', qualityBonus: enemy.lootQuality || 0 });
        if (loot) drops.push(loot);
      }
      for (const item of drops) state.inventory.push(item);

      const crumbReward = level * 100;
      state.crumbs += crumbReward;
      state._mcpEarned = (state._mcpEarned ?? 0) + crumbReward;
      log(`Boss defeated! +${crumbReward} crumbs. Loot: ${drops.map(d => d.name).join(', ') || 'none'}`);
      return { result: `Victory! ${result.rounds} rounds. +${crumbReward} crumbs.`, log: result.log };
    } else {
      state.stats.deaths = (state.stats.deaths || 0) + 1;
      log('Defeated by the boss...');
      return { result: 'Defeat. The boss was too powerful.', log: result.log };
    }
  }

  /**
   * Start the background tick interval.
   */
  function start() {
    if (intervalHandle) return;
    const interval = state.passiveConfig?.tickIntervalMs || 15000;
    intervalHandle = setInterval(() => {
      engine.mutex.withLock(() => {
        try { tick(); } catch (err) {
          if (process.stderr) process.stderr.write(`[passive-runner] tick error: ${err.message}\n`);
        }
      });
    }, interval);
  }

  /**
   * Stop the background tick.
   */
  function stop() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  /**
   * Restart with new interval.
   */
  function restart() {
    stop();
    start();
  }

  return {
    start,
    stop,
    restart,
    tick,
    drain,
    statusLine,
    passiveEarning,
    resolvePending,
    get tickCount() { return tickCount; },
  };
}
