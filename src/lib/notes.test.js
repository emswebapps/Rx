import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNote, sortNotes, pinnedNotes, notesForMed, notesOfKind, preview, isBlank,
} from './notes.js';

const note = (over = {}) => ({ id: Math.random().toString(36).slice(2), text: 'x', createdAt: 1000, ...over });

test('a note saved before a field existed still reads correctly', () => {
  const n = normalizeNote({ id: 'a', text: 'something' });
  assert.equal(n.kind, 'other');
  assert.equal(n.pinned, false);
  assert.equal(n.medId, null);
});

test('an unrecognised kind falls back rather than disappearing from every filter', () => {
  assert.equal(normalizeNote({ kind: 'nonsense' }).kind, 'other');
});

test('pinned notes come first, then newest', () => {
  const list = [
    note({ id: 'old', createdAt: 100 }),
    note({ id: 'new', createdAt: 900 }),
    note({ id: 'pin', createdAt: 50, pinned: true }),
  ];
  assert.deepEqual(sortNotes(list).map((n) => n.id), ['pin', 'new', 'old']);
});

test('a pinned note with no text is not surfaced at a bad moment', () => {
  const list = [note({ id: 'empty', text: '   ', pinned: true }), note({ id: 'real', pinned: true })];
  assert.deepEqual(pinnedNotes(list).map((n) => n.id), ['real']);
});

test('notes tie to a medication, and asking for none returns none', () => {
  const list = [note({ id: 'a', medId: 'xr' }), note({ id: 'b', medId: 'ir' }), note({ id: 'c' })];
  assert.deepEqual(notesForMed(list, 'xr').map((n) => n.id), ['a']);
  assert.deepEqual(notesForMed(list, null), []);
});

test('notes filter by kind', () => {
  const list = [note({ id: 'a', kind: 'timing' }), note({ id: 'b', kind: 'effect' })];
  assert.deepEqual(notesOfKind(list, 'timing').map((n) => n.id), ['a']);
});

test('preview cuts on a word boundary, not mid-word', () => {
  const long = 'the quick brown fox jumps over the lazy dog and keeps on going well past the limit';
  const p = preview(long, 30);
  assert.ok(p.endsWith('…'));
  assert.ok(!/\w…$/.test(p) || p.split(' ').length > 1);
  assert.ok(p.length <= 31);
});

test('preview leaves a short note alone', () => {
  assert.equal(preview('short one', 30), 'short one');
});

test('whitespace is not a note', () => {
  assert.equal(isBlank({ text: '   \n ' }), true);
  assert.equal(isBlank({ text: 'a' }), false);
});
