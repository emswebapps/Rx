import { test } from 'node:test';
import assert from 'node:assert';

import {
  okMeals, avoidMeals, findMeal, avoidHits, saveMeal, proteinFor, proteinTotal, grams,
} from './mealLibrary.js';

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
  assert.deepStrictEqual(findMeal(added, 'greek yogurt'), { id: 'new', name: 'Greek yogurt', status: 'ok', note: '', protein: null, createdAt: 100 });

  const moved = saveMeal(LIST, { name: '2 Eggs', status: 'avoid' }, 'ignored');
  assert.strictEqual(moved.length, LIST.length);
  assert.strictEqual(findMeal(moved, '2 eggs').status, 'avoid');
  assert.strictEqual(saveMeal(LIST, { name: '  ' }, 'x'), LIST);
});

test('protein comes from the list, for a whole meal or for all of its parts', () => {
  const list = [
    { id: 'a', name: '2 eggs + Ready bar', protein: 27 },
    { id: 'b', name: 'Ranch pouch', protein: 17 },
    { id: 'c', name: 'Crackers', protein: 2 },
    { id: 'd', name: 'Jerky stick', protein: '7' },
    { id: 'e', name: 'Toast' },
  ];
  assert.strictEqual(proteinFor(list, '2 Eggs + Ready Bar'), 27);
  assert.strictEqual(proteinFor(list, 'Ranch pouch + crackers + jerky stick'), 26);
  // One part with no number and the total isn't guessed at.
  assert.strictEqual(proteinFor(list, 'Ranch pouch + toast'), null);
  assert.strictEqual(proteinFor(list, 'Pizza'), null);
  assert.deepStrictEqual(proteinTotal(list, ['2 eggs + Ready bar', 'Ranch pouch, crackers, jerky stick', 'Pizza']),
    { grams: 53, known: 2, unknown: 1 });
  assert.strictEqual(grams(''), null);
  assert.strictEqual(grams('-3'), null);
  assert.strictEqual(grams('26.55'), 26.6);
});

test('saving keeps the protein number', () => {
  const list = saveMeal([], { name: 'Ranch pouch', protein: '17' }, 'x', 1);
  assert.strictEqual(list[0].protein, 17);
});
