import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAKE_VARIANTS, buildBrakeMessage, hasReturnCommitment, hasBlame, applyName,
  variantById, smsHref,
  toneWarnings, buildAgreement, DEFAULT_AGREEMENT,
} from './message.js';

// The one that actually matters: a timeout without a promise to return is
// stonewalling, which is the thing this whole feature is trying to avoid.
test('every variant promises to come back', () => {
  for (const v of BRAKE_VARIANTS) {
    assert.ok(v.text.length > 0, `${v.id} is empty`);
    assert.ok(hasReturnCommitment(v.text), `${v.id} does not commit to returning`);
  }
});

test('no variant blames him', () => {
  for (const v of BRAKE_VARIANTS) {
    assert.equal(hasBlame(v.text), false, `${v.id} reads as an accusation`);
  }
});

test('a custom phrase wins over the canned ones', () => {
  const msg = buildBrakeMessage({ brakePhrase: 'code word' }, 'short');
  assert.equal(msg, 'code word');
});

test('a blank custom phrase falls back to the variant', () => {
  const msg = buildBrakeMessage({ brakePhrase: '   ' }, 'explain');
  assert.equal(msg, variantById('explain').text);
});

test('the partner name is substituted', () => {
  assert.equal(applyName('I love you, {name}.', 'Sam'), 'I love you, Sam.');
});

test('with no name set, the placeholder leaves nothing awkward behind', () => {
  assert.equal(applyName('I love you, {name}.', ''), 'I love you.');
  assert.equal(applyName('I love you {name}.', undefined), 'I love you.');
});

test('an unknown variant id falls back rather than crashing', () => {
  assert.equal(variantById('nope').id, BRAKE_VARIANTS[0].id);
  assert.ok(buildBrakeMessage({}, 'nope').length > 0);
});

test('the sms link uses the form both phones accept', () => {
  const href = smsHref('hi there');
  assert.ok(href.startsWith('sms:?&body='));
  assert.ok(href.includes('hi%20there'));
});

// A regression guard on the copy itself: nobody editing these variants later
// can accidentally make one of them accusatory.
test('no built-in variant trips a tone warning', () => {
  for (const v of BRAKE_VARIANTS) {
    const warns = toneWarnings(v.text).filter((w) => w.level === 'warn');
    assert.deepEqual(warns, [], `${v.id} reads as blaming`);
  }
});

test('tone check flags absolutes and blame, and stays quiet on a good message', () => {
  assert.ok(toneWarnings('you always do this').some((w) => w.level === 'warn'));
  assert.ok(toneWarnings('you made me feel this way').some((w) => w.level === 'warn'));
  assert.deepEqual(
    toneWarnings('I love you. I need 30 minutes and then I will come back.').filter((w) => w.level === 'warn'),
    [],
  );
});

test('a message with no return promise gets a nudge, not a block', () => {
  const w = toneWarnings('I need space.');
  assert.equal(w.every((x) => x.level === 'info'), true);
  assert.ok(w.some((x) => x.message.includes('coming back')));
});

test('tone check is safe on empty input', () => {
  assert.deepEqual(toneWarnings(''), []);
  assert.deepEqual(toneWarnings(undefined), []);
});

test('the standing agreement explains the phrase and promises the return', () => {
  const text = buildAgreement({});
  assert.ok(text.includes('I’m crashing'), 'it has to name the actual phrase');
  assert.ok(hasReturnCommitment(text));
  assert.equal(hasBlame(text), false);
  assert.deepEqual(toneWarnings(text).filter((w) => w.level === 'warn'), []);
});

test('a rewritten agreement wins over the default', () => {
  assert.equal(buildAgreement({ agreementText: 'ours' }), 'ours');
  assert.equal(buildAgreement({ agreementText: '  ' }), DEFAULT_AGREEMENT);
});

test('reassurance is not mistaken for blame', () => {
  for (const line of [
    'You don’t have to fix it.',
    'You didn’t do anything wrong.',
    'You don’t need to follow me.',
  ]) {
    assert.deepEqual(toneWarnings(line).filter((w) => w.level === 'warn'), [], line);
  }
});

test('the blunt second-person charge sheet is still caught', () => {
  for (const line of ['you don’t care', 'you didn’t answer me', 'you aren’t even listening']) {
    assert.ok(toneWarnings(line).some((w) => w.level === 'warn'), line);
  }
});
