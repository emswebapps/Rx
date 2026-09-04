// The message to the partner.
//
// The hard requirement: it has to say "I'm struggling" without landing as
// "you did something wrong" and without landing as "I'm done talking to you."
// Every variant therefore commits to coming back. That isn't a style
// preference — a timeout without a return is stonewalling, and it's the thing
// that makes the other person feel worse than the argument would have.
//
// `hasReturnCommitment` exists so a unit test can hold the line on that if
// someone (including a future me) adds a variant in a hurry.

export const BRAKE_VARIANTS = [
  {
    id: 'short',
    label: 'Short',
    text: 'I’m crashing. I love you. Nothing needs to be solved right now — I’ll come back to it in a bit.',
  },
  {
    id: 'explain',
    label: 'Explains it',
    text: 'My meds are wearing off and I don’t trust my reactions right now. This isn’t about you. I need 30 minutes, then I’ll come back to it.',
  },
  {
    id: 'midconvo',
    label: 'Mid-conversation',
    text: 'I’m getting overloaded and I don’t want to say something I don’t mean. I’m not leaving this — I just need to pick it back up in a little while.',
  },
  {
    id: 'headsup',
    label: 'Heads up',
    text: 'Heads up, I’m in a crash. If I get short with you, that’s the crash talking, not you. Give me half an hour and I’ll come find you.',
  },
  {
    id: 'reassure',
    label: 'Reassuring',
    text: 'I’m having a hard hour and my brain is being unkind to me about us. You haven’t done anything. I’m going to reset and I’ll come back to you.',
  },
];

export const DEFAULT_VARIANT_ID = 'short';

// Phrases that promise a return. Kept as one list so the test and the builder
// can't drift apart.
const RETURN_PHRASES = [
  'come back',
  'coming back',
  'come find you',
  'pick it back up',
  'be back',
];

// Second-person constructions that turn a timeout into an accusation.
const BLAME_PHRASES = [
  'you always',
  'you never',
  'your fault',
  'you made me',
  'if you would',
  'you don’t care',
  "you don't care",
];

export function hasReturnCommitment(text) {
  const t = String(text || '').toLowerCase();
  return RETURN_PHRASES.some((p) => t.includes(p));
}

export function hasBlame(text) {
  const t = String(text || '').toLowerCase();
  return BLAME_PHRASES.some((p) => t.includes(p));
}

export function variantById(id) {
  return BRAKE_VARIANTS.find((v) => v.id === id) || BRAKE_VARIANTS[0];
}

/**
 * The message to actually send. A custom phrase saved in the kit wins over the
 * canned variants — the point is that this sounds like the user, not like an
 * app. `{name}` anywhere in the text is replaced with the partner's name, and
 * cleaned up if there isn't one.
 */
export function buildBrakeMessage(kit = {}, variantId, partnerName) {
  const custom = typeof kit.brakePhrase === 'string' ? kit.brakePhrase.trim() : '';
  const base = custom || variantById(variantId || kit.brakeVariantId).text;
  const name = String(partnerName ?? kit.partnerName ?? '').trim();
  return applyName(base, name);
}

export function applyName(text, name) {
  const clean = String(name || '').trim();
  if (clean) return String(text).replace(/\{name\}/g, clean);
  // No name set: drop the placeholder and any comma or space left stranded
  // in front of it, so "I love you, {name}." doesn't become "I love you, ."
  return String(text).replace(/,?\s*\{name\}/g, '');
}

// iOS and Android both accept `sms:?&body=`; the bare `?body=` form fails on
// one of them depending on version, so this is the safe shape.
export function smsHref(text) {
  return `sms:?&body=${encodeURIComponent(text)}`;
}

// A gentle read on how an edited message might land. This NEVER blocks sending
// and never says the message is wrong — it's a mirror held up at a moment when
// the user's own read on tone is the thing they've told us not to trust.
// Phrased as "this might land as", because anything stronger is the app taking
// his side.
const TONE_CHECKS = [
  { re: /\byou (always|never)\b/i, level: 'warn', message: 'Absolutes usually land as an accusation.' },
  // Second-person negation reads as a charge sheet — except in the
  // constructions that do the opposite and let him off the hook ("you don't
  // have to fix it", "you didn't do anything"). Those are the warmest lines in
  // the standing agreement, and flagging them would be exactly backwards.
  { re: /\byou (don’t|don't|didn’t|didn't|won’t|won't|aren’t|aren't)\b(?!\s+(have to|need to|deserve|do anything|have anything))/i, level: 'warn', message: 'This might land as a list of what he isn’t doing.' },
  { re: /\b(you made me|you make me|because of you)\b/i, level: 'warn', message: 'This puts the crash on him.' },
  { re: /\bwhy (do|did|are|don’t|don't) you\b/i, level: 'warn', message: 'A “why do you” question asks him to defend himself.' },
];

export function toneWarnings(text) {
  const t = String(text || '');
  const out = [];
  for (const c of TONE_CHECKS) {
    if (c.re.test(t)) out.push({ level: c.level, message: c.message });
  }
  if (t.length > 400) {
    out.push({ level: 'info', message: 'Long messages sent at an 8/10 usually read as pressure.' });
  }
  if (t.trim().endsWith('?') && t.length > 120) {
    out.push({ level: 'info', message: 'This asks him to answer while you’re still crashing.' });
  }
  if (t.trim() && !hasReturnCommitment(t)) {
    out.push({ level: 'info', message: 'Add a line that says you’re coming back — that’s the part that keeps this from feeling like a wall.' });
  }
  return out;
}

// ── The standing agreement ──────────────────────────────────────────────────
// Sent once, on a good day, out of band. This is what lets the in-the-moment
// message afford to be four words long: he already knows what they mean.
//
// Note what it does NOT ask of him — it doesn't ask him to check in, draw her
// out, or work out what's wrong. Those are the instincts that make a crash
// louder, and naming them plainly is kinder than letting him guess wrong and
// feel like he failed.
export const DEFAULT_AGREEMENT = `There’s something I want to set up with you for the evenings, while things are good and I can explain it properly.

When my meds wear off I get flooded. Everything you say lands wrong, and I lose access to all the evidence that you love me. It isn’t about you and it isn’t something you caused.

So if I say “I’m crashing,” here’s what it means: I need about 30 minutes, I’m not angry at you, and I am coming back. It is never me leaving the conversation.

What helps most is if you say something like “ok, take your time,” and then let it be. You don’t have to fix it, follow me, or work out what’s wrong — that all makes it louder. Half an hour later I’ll be myself again and we can talk about whatever it actually was.

Thank you for being patient with this.`;

export function buildAgreement(kit = {}, partnerName) {
  const custom = typeof kit.agreementText === 'string' ? kit.agreementText.trim() : '';
  return applyName(custom || DEFAULT_AGREEMENT, partnerName ?? kit.partnerName ?? '');
}
