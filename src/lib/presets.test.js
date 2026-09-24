import { test } from 'node:test';
import assert from 'node:assert';

import { irPresetTarget, withIrRoutines, irPresetLines } from './presets.js';
import { routineSteps } from './routine.js';

const IR = {
  id: 'ir', name: 'Adderall', strength: '20 mg', active: true,
  schedule: {
    days: [0, 1, 2, 3, 4, 5, 6],
    times: [
      { id: 'a', mode: 'clock', time: '06:00' },
      { id: 'b', mode: 'clock', time: '10:00' },
      { id: 'c', mode: 'clock', time: '14:00' },
    ],
  },
};

test('finds an Adderall with doses still to set up, and nothing else', () => {
  assert.strictEqual(irPresetTarget([IR]).id, 'ir');
  assert.strictEqual(irPresetTarget([{ ...IR, name: 'Adderall XR' }]), null);
  assert.strictEqual(irPresetTarget([{ ...IR, name: 'Strattera' }]), null);
  assert.strictEqual(irPresetTarget([{ ...IR, active: false }]), null);
  const done = { ...IR, schedule: withIrRoutines(IR) };
  assert.strictEqual(irPresetTarget([done]), null);
});

test('the first dose gets the egg, the later ones the bar, each with 15 minutes', () => {
  const sched = withIrRoutines(IR, undefined, 1000);
  const texts = sched.times.map((t) => routineSteps(t).map((s) => (s.kind === 'meal' ? s.text : s.kind === 'wait' ? s.minutes : 'dose')));
  assert.deepStrictEqual(texts, [
    ['1 egg', 15, 'dose'],
    ['Ready Clean Bar', 15, 'dose'],
    ['Ready Clean Bar', 15, 'dose'],
  ]);
  assert.ok(sched.times.every((t) => t.routineSince === 1000));
  // Ids differ per dose, so each keeps its own check-offs.
  const ids = sched.times.flatMap((t) => t.routine.map((s) => s.id));
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('a dose that already has a routine is left alone', () => {
  const custom = [{ id: 'x', kind: 'meal', text: 'Oatmeal' }, { id: 'y', kind: 'dose' }];
  const med = { ...IR, schedule: { ...IR.schedule, times: [{ ...IR.schedule.times[0], routine: custom }, ...IR.schedule.times.slice(1)] } };
  const sched = withIrRoutines(med);
  assert.deepStrictEqual(sched.times[0].routine, custom);
  assert.deepStrictEqual(irPresetLines(med).map((l) => l.already), [true, false, false]);
  assert.strictEqual(irPresetLines(med)[1].text, 'Ready Clean Bar → 15 min → take');
});
