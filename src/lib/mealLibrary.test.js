import { test } from 'node:test';
import assert from 'node:assert';

import { okMeals, avoidMeals, findMeal, avoidHits, saveMeal } from './mealLibrary.js';

const LIST = [
  { id: '1', name: '2 eggs', status: 'ok' },
  { id: '2', name: 'Protein bar + string cheese', status: 'ok' },
  { id: '3', name: 'OJ', status: 'avoid', note: 'Vitamin C — my pharmacist said so' },
  { id: '4', name: 'Grapefruit', status: 'avoid' },
  { id: '5', name: '', status: 'ok' },
];

test('the approved and avoided lists are separate, A–Z, and skip blanks', () => {
  assert.deepStrictEqual(okMeals(LIST).map((m) => m.name), ['2 eggs', 'Protein bar + string cheese']);
  assert.deepStrictEqual(avoidMeals(LIST).map((m) => m.name), ['Grapefruit', 'OJ']);
});

test('a meal is found by name whatever the case or spacing', () => {
  assert.strictEqual(findMeal(LIST, '  2  EGGS ').id, '1');
  assert.strictEqual(findMeal(LIST, 'toast'), null);
});

test('something on the avoid list is spotted inside what was typed', () => {
  assert.deepStrictEqual(avoidHits(LIST, 'Bagel + OJ').map((m) => m.name), ['OJ']);
  assert.deepStrictEqual(avoidHits(LIST, 'grapefruit juice').map((m) => m.name), ['Grapefruit']);
  // Whole words only.
  assert.deepStrictEqual(avoidHits([{ name: 'egg', status: 'avoid' }], 'eggplant'), []);
  assert.deepStrictEqual(avoidHits(LIST, '2 eggs'), []);
});

test('saving adds a new meal, or updates the one with that name', () => {
  const added = saveMeal(LIST, { name: 'Greek yogurt' }, 'new', 100);
  assert.strictEqual(added.length, LIST.length + 1);
  assert.deepStrictEqual(findMeal(added, 'greek yogurt'), { id: 'new', name: 'Greek yogurt', status: 'ok', note: '', createdAt: 100 });

  const moved = saveMeal(LIST, { name: '2 Eggs', status: 'avoid' }, 'ignored');
  assert.strictEqual(moved.length, LIST.length);
  assert.strictEqual(findMeal(moved, '2 eggs').status, 'avoid');
  assert.strictEqual(saveMeal(LIST, { name: '  ' }, 'x'), LIST);
});
