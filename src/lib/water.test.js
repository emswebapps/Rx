import { test } from 'node:test';
import assert from 'node:assert';

import {
  mergeWater, glassesOnDay, nextWaterDue, waterReminderTag, addGlass, removeLastGlass,
  waterDaySummary, DEFAULT_WATER,
} from './water.js';

const M = 60 * 1000;
const at = (h, m = 0) => new Date(2026, 8, 24, h, m, 0, 0).getTime();
const CFG = { enabled: true, everyMinutes: 60, goal: 4, until: '20:00' };
const DOSE = [{ id: 'd', takenAt: at(8), status: 'taken' }];

test('off by default, and a saved config fills in the gaps', () => {
  assert.strictEqual(DEFAULT_WATER.enabled, false);
  const c = mergeWater({ enabled: true, goal: 10 });
  assert.strictEqual(c.everyMinutes, 60);
  assert.strictEqual(c.goal, 10);
  assert.strictEqual(mergeWater({ until: 'nonsense' }).until, '20:00');
});

test('nothing is due before the first dose of the day', () => {
  assert.strictEqual(nextWaterDue([], [], CFG, at(9)), null);
});

test('the first glass is due an interval after the first dose', () => {
  assert.strictEqual(nextWaterDue([], DOSE, CFG, at(8, 30)), at(9));
});

test('logging a glass resets the clock', () => {
  assert.strictEqual(nextWaterDue([at(8, 40)], DOSE, CFG, at(8, 45)), at(9, 40));
});

test('a skipped dose does not start the clock', () => {
  assert.strictEqual(nextWaterDue([], [{ takenAt: at(8), status: 'skipped' }], CFG, at(9)), null);
});

test('goes quiet once the goal is met', () => {
  const log = [at(9), at(10), at(11), at(12)];
  assert.strictEqual(nextWaterDue(log, DOSE, CFG, at(12, 5)), null);
});

test('goes quiet past the cutoff', () => {
  assert.strictEqual(nextWaterDue([at(19, 30)], DOSE, CFG, at(19, 35)), null);
});

test('off means off', () => {
  assert.strictEqual(nextWaterDue([], DOSE, { ...CFG, enabled: false }, at(10)), null);
});

test('the reminder tag moves on with each missed interval and each glass', () => {
  assert.strictEqual(waterReminderTag([], DOSE, CFG, at(8, 59), 'd'), null);
  assert.strictEqual(waterReminderTag([], DOSE, CFG, at(9, 5), 'd'), 'rx-water-d-0-0');
  assert.strictEqual(waterReminderTag([], DOSE, CFG, at(10, 5), 'd'), 'rx-water-d-0-1');
  assert.strictEqual(waterReminderTag([at(10, 10)], DOSE, CFG, at(11, 15), 'd'), 'rx-water-d-1-0');
});

test('adding and undoing a glass', () => {
  let log = addGlass([], at(9));
  log = addGlass(log, at(10));
  assert.strictEqual(glassesOnDay(log, at(12)).length, 2);
  log = removeLastGlass(log, at(12));
  assert.deepStrictEqual(glassesOnDay(log, at(12)), [at(9)]);
  // Nothing today to take back: unchanged.
  assert.deepStrictEqual(removeLastGlass([at(9) - 24 * 60 * M], at(12)), [at(9) - 24 * 60 * M]);
});

test('a glass log does not grow for ever', () => {
  const ancient = at(9) - 60 * 24 * 60 * M;
  assert.deepStrictEqual(addGlass([ancient], at(9)), [at(9)]);
});

test('the day summary is capped at the goal', () => {
  const log = [at(9), at(10), at(11), at(12), at(13)];
  assert.deepStrictEqual(waterDaySummary(log, CFG, at(20)), { applicable: true, glasses: 5, goal: 4, ratio: 1 });
  assert.strictEqual(waterDaySummary(log, { enabled: false }, at(20)).applicable, false);
});
