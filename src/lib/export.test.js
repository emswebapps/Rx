import { test } from 'node:test';
import assert from 'node:assert';

import { csvField, toCSV, dosesCSV, effectsCSV, fullBackup, exportName } from './export.js';

const at = (h, m = 0) => new Date(2026, 8, 24, h, m).getTime();
const IR = {
  id: 'ir', name: 'Adderall IR', strength: '20 mg', graceMinutes: 45,
  schedule: { times: [{ id: 't1', mode: 'clock', time: '08:00', amount: 1 }], days: [0, 1, 2, 3, 4, 5, 6] },
};

test('fields with commas, quotes or newlines are quoted', () => {
  assert.strictEqual(csvField('plain'), 'plain');
  assert.strictEqual(csvField('a, b'), '"a, b"');
  assert.strictEqual(csvField('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csvField('two\nlines'), '"two\nlines"');
  assert.strictEqual(csvField(null), '');
  assert.strictEqual(toCSV(['a', 'b'], [[1, 'x,y']]), 'a,b\r\n1,"x,y"');
});

test('doses come out one row each, oldest first, with timing', () => {
  const csv = dosesCSV([IR], [
    { id: 'late', medId: 'ir', takenAt: at(10), status: 'taken', amount: 1 },
    { id: 'skip', medId: 'ir', takenAt: at(9) - 24 * 3600e3, status: 'skipped' },
  ]).split('\r\n');
  assert.strictEqual(csv[0], 'date,time,medication,strength,amount,status,timing,logged from');
  assert.match(csv[1], /^2026-09-23,09:00,Adderall IR,20 mg,,skipped,,app$/);
  assert.match(csv[2], /^2026-09-24,10:00,Adderall IR,20 mg,1,taken,late,app$/);
});

test('check-ins come out with side effects named; dismissed prompts are left out', () => {
  const csv = effectsCSV([IR], [
    { at: at(9, 30), medId: 'ir', phase: 'working', focus: 4, mood: 3, sideEffects: ['headache', 'jittery'], note: 'good, mostly' },
    { at: at(12), medId: 'ir', phase: 'wearing', dismissed: true },
  ]).split('\r\n');
  assert.strictEqual(csv.length, 2);
  assert.strictEqual(csv[1], '2026-09-24,09:30,Adderall IR,working,4,3,,Headache; Jittery,"good, mostly"');
});

test('the backup carries every slice asked for', () => {
  const json = JSON.parse(fullBackup({ crashDoses: [1], rxNotes: [] }, ['crashDoses', 'rxNotes', 'rxWater'], at(12)));
  assert.strictEqual(json.app, 'Rx');
  assert.deepStrictEqual(json.data, { crashDoses: [1], rxNotes: [], rxWater: null });
  assert.strictEqual(exportName('doses', 'csv', at(12)), 'rx-doses-2026-09-24.csv');
});
