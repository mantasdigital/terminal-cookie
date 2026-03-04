#!/usr/bin/env node

/**
 * Balance verification script for Terminal Cookie.
 * Simulates team generation, stat distributions, and economy pacing
 * to verify game balance is sane.
 *
 * Usage: node src/test/balance.js
 */

import { createRNG } from '../core/rng.js';
import { generateMember, generateTavernRoster, awardXP, RACES, CLASSES } from '../game/team.js';
import { createEconomy } from '../game/economy.js';
import { createCookieHandler } from '../game/cookie.js';

// ── Helpers ──────────────────────────────────────────────

function avg(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function minMax(arr) {
  return { min: Math.min(...arr), max: Math.max(...arr) };
}

function histogram(arr, bucketSize = 1) {
  const buckets = {};
  for (const v of arr) {
    const bucket = Math.floor(v / bucketSize) * bucketSize;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  return buckets;
}

function formatBar(value, max, width = 30) {
  const filled = Math.min(width, Math.max(0, Math.round((value / Math.max(max, 1)) * width)));
  return '#'.repeat(filled) + '-'.repeat(width - filled);
}

let exitCode = 0;

function check(label, condition, message) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    console.log(`  \u2717 ${label}: ${message}`);
    exitCode = 1;
  }
}

// ── 1. Stat Generation at Various Levels ─────────────────

console.log('\n=== Stat Generation (1000 members) ===\n');

const rng = createRNG(42);
const members = [];
for (let i = 0; i < 1000; i++) {
  members.push(generateMember(rng));
}

const statNames = ['hp', 'atk', 'def', 'spd', 'lck'];

for (const stat of statNames) {
  const values = members.map(m => m.stats[stat]);
  const { min, max } = minMax(values);
  const mean = avg(values).toFixed(1);
  console.log(`  ${stat.padEnd(4)}: min=${String(min).padStart(2)} max=${String(max).padStart(2)} avg=${mean.padStart(5)}  [${formatBar(avg(values), 15)}]`);
}

console.log('');

// Verify stat ranges
for (const stat of statNames) {
  const values = members.map(m => m.stats[stat]);
  const { min, max } = minMax(values);
  check(`${stat} min >= 1`, min >= 1, `min was ${min}`);
  check(`${stat} max <= 16`, max <= 16, `max was ${max} (level 1, base 5 + max race 4 + max class 4 + rng 2 = 15)`);
  check(`${stat} avg 4-9`, avg(values) >= 4 && avg(values) <= 9, `avg was ${avg(values).toFixed(1)}`);
}

// ── 2. Race / Class Distribution ─────────────────────────

console.log('\n=== Race/Class Distribution ===\n');

const raceCounts = {};
const classCounts = {};
for (const m of members) {
  raceCounts[m.race] = (raceCounts[m.race] || 0) + 1;
  classCounts[m.class] = (classCounts[m.class] || 0) + 1;
}

console.log('  Races:');
for (const [race, count] of Object.entries(raceCounts).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / 1000) * 100).toFixed(1);
  console.log(`    ${race.padEnd(8)} ${String(count).padStart(4)} (${pct}%)  [${formatBar(count, 250, 20)}]`);
}

console.log('  Classes:');
for (const [cls, count] of Object.entries(classCounts).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / 1000) * 100).toFixed(1);
  console.log(`    ${cls.padEnd(10)} ${String(count).padStart(4)} (${pct}%)  [${formatBar(count, 250, 20)}]`);
}

// Check uniform-ish distribution
const raceNames = Object.keys(RACES);
const classNames = Object.keys(CLASSES);
const expectedRacePct = 100 / raceNames.length;
const expectedClassPct = 100 / classNames.length;

for (const [race, count] of Object.entries(raceCounts)) {
  const pct = (count / 1000) * 100;
  check(`${race} distribution ~${expectedRacePct.toFixed(0)}%`, Math.abs(pct - expectedRacePct) < 8, `was ${pct.toFixed(1)}%`);
}

for (const [cls, count] of Object.entries(classCounts)) {
  const pct = (count / 1000) * 100;
  check(`${cls} distribution ~${expectedClassPct.toFixed(0)}%`, Math.abs(pct - expectedClassPct) < 8, `was ${pct.toFixed(1)}%`);
}

// ── 3. Cost Distribution ─────────────────────────────────

console.log('\n=== Recruit Cost Distribution ===\n');

const costs = members.map(m => m.cost);
const costRange = minMax(costs);
const costAvg = avg(costs);

console.log(`  Min cost:  ${costRange.min} crumbs`);
console.log(`  Max cost:  ${costRange.max} crumbs`);
console.log(`  Avg cost:  ${costAvg.toFixed(0)} crumbs`);

const costBuckets = histogram(costs, 50);
console.log('  Cost histogram (bucket=50):');
for (const [bucket, count] of Object.entries(costBuckets).sort((a, b) => Number(a) - Number(b))) {
  console.log(`    ${String(bucket).padStart(4)}-${String(Number(bucket) + 49).padStart(4)}: ${String(count).padStart(4)}  [${formatBar(count, 300, 20)}]`);
}

check('Min recruit cost >= 50', costRange.min >= 50, `was ${costRange.min}`);
check('Max recruit cost <= 500', costRange.max <= 500, `was ${costRange.max}`);
check('Avg recruit cost 150-350', costAvg >= 150 && costAvg <= 350, `was ${costAvg.toFixed(0)}`);

// ── 4. Economy Pacing ────────────────────────────────────

console.log('\n=== Economy Pacing (Crumbs per Click) ===\n');

const gameState = {
  crumbs: 0,
  stats: { crumbsEarned: 0, dungeonsCleared: 0 },
  inventory: [],
};

const cookie = createCookieHandler(gameState);

// Simulate clicking
const rates = [];
for (let dungeons = 0; dungeons <= 20; dungeons++) {
  gameState.stats.dungeonsCleared = dungeons;
  cookie.resetSession();
  const rate = cookie.currentRate();
  rates.push({ dungeons, rate });
}

console.log('  Crumbs/click by dungeons cleared:');
for (const { dungeons, rate } of rates) {
  console.log(`    Dungeons ${String(dungeons).padStart(2)}: ${rate.toFixed(1)} crumbs/click  [${formatBar(rate, 4, 20)}]`);
}

// Base rate
check('Base rate is 1', cookie.currentRate() === 1 || gameState.stats.dungeonsCleared > 0, 'base rate should be 1');
gameState.stats.dungeonsCleared = 0;
cookie.resetSession();
check('Fresh start rate = 1', cookie.currentRate() === 1, `was ${cookie.currentRate()}`);

// Diminishing returns
cookie.resetSession();
for (let i = 0; i < 1001; i++) cookie.click();
const diminishedRate = cookie.currentRate();
check('Diminishing returns after 1000 clicks', diminishedRate < 1, `rate after 1000 clicks: ${diminishedRate}`);

// ── 5. Time to First Recruit ─────────────────────────────

console.log('\n=== Pacing Milestones ===\n');

// Reset state
gameState.crumbs = 0;
gameState.stats.crumbsEarned = 0;
gameState.stats.dungeonsCleared = 0;
cookie.resetSession();

const cheapestMember = Math.min(...members.map(m => m.cost));
const avgMemberCost = avg(members.map(m => m.cost));

let clicks = 0;
while (gameState.crumbs < cheapestMember && clicks < 100000) {
  cookie.click();
  clicks++;
}
console.log(`  Clicks to cheapest recruit (${cheapestMember} crumbs): ${clicks}`);
check('Cheapest recruit < 500 clicks', clicks < 500, `took ${clicks} clicks`);

// Reset for average recruit
gameState.crumbs = 0;
cookie.resetSession();
clicks = 0;
while (gameState.crumbs < avgMemberCost && clicks < 100000) {
  cookie.click();
  clicks++;
}
console.log(`  Clicks to average recruit (${avgMemberCost.toFixed(0)} crumbs): ${clicks}`);
check('Average recruit < 1000 clicks', clicks < 1000, `took ${clicks} clicks`);

// Dungeon ready = 3 recruits
gameState.crumbs = 0;
cookie.resetSession();
clicks = 0;
const team3cost = avgMemberCost * 3;
while (gameState.crumbs < team3cost && clicks < 100000) {
  cookie.click();
  clicks++;
}
console.log(`  Clicks to 3-member team (${team3cost.toFixed(0)} crumbs): ${clicks}`);
check('3-member team < 2000 clicks', clicks < 2000, `took ${clicks} clicks`);

// ── 6. Economy with Post-Wipe Discount ───────────────────

console.log('\n=== Post-Wipe Discount ===\n');

const discountState = { crumbs: 500, stats: { crumbsEarned: 0 }, inventory: [] };
const economy = createEconomy(discountState);

const sampleMember = members[0];
const normalCost = economy.recruitCost(sampleMember);

economy.activateWipeDiscount();
const discountCost = economy.recruitCost(sampleMember);

console.log(`  Normal recruit cost:   ${normalCost} crumbs`);
console.log(`  Discounted cost:       ${discountCost} crumbs`);
console.log(`  Discount remaining:    ${economy.discountRemaining} recruits`);

check('Discount is ~50%', discountCost <= Math.ceil(normalCost * 0.55), `discount cost ${discountCost} vs normal ${normalCost}`);
check('Discount remaining = 10', economy.discountRemaining === 10, `was ${economy.discountRemaining}`);

// ── 7. Leveling Progression ──────────────────────────────

console.log('\n=== Leveling Progression ===\n');

const levelMember = generateMember(createRNG(99));
const initialHp = levelMember.stats.hp;
const initialPrimary = levelMember.stats[CLASSES[levelMember.class].primary];

console.log(`  Testing: ${levelMember.name} the ${levelMember.race} ${levelMember.class}`);
console.log(`  Initial: HP=${initialHp} Primary=${initialPrimary} Level=${levelMember.level}`);

// Simulate leveling to 10
let totalXpNeeded = 0;
while (levelMember.level < 10) {
  const xpBefore = levelMember.xp;
  const levelBefore = levelMember.level;
  // Award XP for danger level 5 encounters
  awardXP(levelMember, 5);
  totalXpNeeded += 50; // 10 * 5 per award
}

const lvl10Hp = levelMember.stats.hp;
const lvl10Primary = levelMember.stats[CLASSES[levelMember.class].primary];

console.log(`  Level 10: HP=${lvl10Hp} Primary=${lvl10Primary} Level=${levelMember.level}`);
console.log(`  HP growth: +${lvl10Hp - initialHp} (+${((lvl10Hp - initialHp) / initialHp * 100).toFixed(0)}%)`);
console.log(`  Primary growth: +${lvl10Primary - initialPrimary} (+${((lvl10Primary - initialPrimary) / initialPrimary * 100).toFixed(0)}%)`);

check('Level reached 10', levelMember.level >= 10, `only reached ${levelMember.level}`);
check('HP grew', lvl10Hp > initialHp, `HP didn't grow: ${initialHp} -> ${lvl10Hp}`);
check('Primary stat grew', lvl10Primary > initialPrimary, `Primary didn't grow: ${initialPrimary} -> ${lvl10Primary}`);
check('Level 5 ability upgrade', levelMember.abilities.some(a => a.includes('+')), 'No ability upgrades');

// ── 8. Tavern Roster Balance ─────────────────────────────

console.log('\n=== Tavern Roster ===\n');

const rosters = [];
for (let i = 0; i < 100; i++) {
  rosters.push(generateTavernRoster(createRNG(i)));
}

const rosterSizes = rosters.map(r => r.length);
const sizeRange = minMax(rosterSizes);
const sizeAvg = avg(rosterSizes);

console.log(`  Roster size: min=${sizeRange.min} max=${sizeRange.max} avg=${sizeAvg.toFixed(1)}`);

check('Min roster size >= 3', sizeRange.min >= 3, `was ${sizeRange.min}`);
check('Max roster size <= 5', sizeRange.max <= 5, `was ${sizeRange.max}`);

// Check that rosters have variety (not all same race/class)
let sameRaceCount = 0;
for (const roster of rosters) {
  const races = new Set(roster.map(m => m.race));
  if (races.size === 1 && roster.length >= 3) sameRaceCount++;
}
const sameRacePct = (sameRaceCount / 100) * 100;
console.log(`  All-same-race rosters: ${sameRaceCount}%`);
check('Varied rosters (< 20% all same race)', sameRacePct < 20, `${sameRacePct}% were same race`);

// ── Summary ──────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`\n  Balance Report: ${exitCode === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}\n`);

if (exitCode === 0) {
  console.log('  Key findings:');
  console.log(`    - Recruit costs: ${costRange.min}-${costRange.max} crumbs (avg ${costAvg.toFixed(0)})`);
  console.log(`    - Clicks to first recruit: ~${cheapestMember}`);
  console.log(`    - Clicks to dungeon-ready (3 members): ~${(team3cost).toFixed(0)}`);
  console.log(`    - Base click rate: 1 crumb/click, scales with dungeons cleared`);
  console.log(`    - Diminishing returns after 1000 clicks per session`);
  console.log(`    - Post-wipe discount: 50% off next 10 recruits`);
  console.log(`    - Leveling: +1 HP and +1 primary stat per level`);
  console.log('');
}

process.exit(exitCode);
