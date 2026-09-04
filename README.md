# Rx

A medication tracker built around ADHD stimulants: what you take, when you took
it, how many are left, and when the bottle can be filled again.

Live at **https://emswebapps.github.io/Rx/** — installable to a home screen on
iOS and Android.

## What it does

Five tabs, each a real page with its own URL.

| Tab | What it's for |
|---|---|
| **Today** | Every dose due today, one row each, one tap to log or skip |
| **Meds** | What you take: name, strength, form, times, days, supply, refill date |
| **Supply** | How many are left, how long that lasts, and when each can be filled |
| **History** | Whether you've actually been taking them — plus the crash sessions |
| **Settings** | Reminders, the crash protocol's setup, and what may buzz your phone |

### The schedule model

A medication has **one or more times a day**, each with its own **amount**, and
**the days of the week** it's taken on.

- A twice-daily medication is one entry with two times, not two entries. Each
  time is tracked separately, so the morning can be taken while the afternoon is
  still due.
- A time can hang off another medication instead of the clock — *"six hours
  after the morning one"* — in which case a late morning drags it late too.
- Days off are first-class. A weekdays-only medication is simply not due at the
  weekend: it produces no rows, so a deliberate drug holiday can never read as
  two missed doses or break a streak.
- Amounts feed the supply maths. Sixty tablets at three a day on weekdays is
  twenty-eight days, and the app says twenty-eight.

Medications saved under the older one-dose-a-day shape are migrated **on read**,
carrying `supply.perDose` across as that dose's amount. Nothing is rewritten in
storage, so an old document and a new one behave identically and there is never
a half-converted state.

### Logging, and skipping

A dose can be **taken** or **skipped**, and the two are different. A skip is a
decision — it is excluded from adherence entirely rather than counted as a miss,
and it settles the evening's predicted window immediately instead of waiting out
the grace period. Without that, the only way to keep an honest record would be
to lie about having taken something, which is the one habit a compliance tool
must never train.

Dose reminders carry **Take**, **Snooze 15m** and **Skip** buttons, handled by
the service worker without opening the app. If the worker can't write — auth
state in a service worker is not guaranteed across browsers — it opens the app
on Today rather than silently swallowing the tap.

### Adherence

`src/lib/adherence.js` computes a thirty-day history: a day-by-day grid, the
on-time rate, the current run and the best one, and which medication slips most.

It is careful about what it does not know. Medications are edited in place, so
there is no record of what the schedule *used* to be — re-reading last week uses
this week's times. The lookback is capped at thirty days and the History page
says so plainly rather than implying more precision than exists. A medication
carries `createdAt` and `archivedAt` so the weeks before it existed, or after it
stopped, are excluded rather than counted as clean.

### The crash protocol

A step-by-step tool for the hours after stimulant medication wears off, when
emotional reactions get loud enough to feel like facts. It is one row on Today
and its own route at `/crash` — a tool inside a medication tracker, not the
shape of it. Seven steps, a thirty-minute timer, an escrow that holds a message
until 9 AM, and a private locker of "anchors" to read when nothing else is
believable.

## Data

Rx shares a Firebase project **and a Firestore document** with the finance app
it was extracted from:

    users/{uid}/data/app

Both are served from `emswebapps.github.io`, so they are the same origin: one
login, one localStorage cache, one source of truth. Rx writes only the `crash*`
keys, `notifPrefs` and `settings`, always with `{ merge: true }`, so neither app
stands on the other. Splitting Rx into its own repository therefore cost no data
and needed no migration.

If the two are ever pointed at different Firebase projects,
`src/utils/firestoreSync.js` is the file to change — and a migration will be
needed.

## Layout

```
src/
  lib/          pure logic, all unit-tested — no React, no Firebase
                meds.js       the regimen: schedules, slots, supply
                adherence.js  streaks, on-time rate, day history
                window.js     when the evening gets hard
                protocol.js   the crash session state machine
                stats.js      crash session history
  screens/      one file per page, plus screens/crash/ for the protocol
  components/   shared UI
  context/      auth, and the single app-state provider
  utils/        storage cache, Firestore sync, notifications
functions/      the scheduled reminder Cloud Function
  regimen.js    a CommonJS port of lib/meds.js, held to the same fixture
```

### The parity contract

`functions/regimen.js` is a hand-maintained CommonJS port of `src/lib/meds.js`,
because the client is ESM and Cloud Functions are not. The two are kept honest
by a shared fixture:

    functions/fixtures/regimen-cases.json

`src/lib/regimen.parity.test.js` asserts the ESM module against it and
`functions/test/regimen.test.js` asserts the CommonJS one. **Any change to the
regimen maths must touch both files**, then regenerate the fixture:

```bash
TZ=America/New_York node scripts/make-regimen-fixtures.mjs
```

Regenerate deliberately — never to turn a red parity test green without reading
why the answer moved.

## Notifications

Nothing Rx sends ever names a medication, a strength, a rule or a time. A
lock-screen preview is visible to whoever is holding the phone, so every body is
a fixed string: useless to a stranger, complete to the person who taps it open.
`functions/test/reminders.test.js` sweeps a full day of every message kind —
with every optional nudge switched on — and fails if a single user-authored
word appears in one.

The dose reminders are push-only and each is switchable on its own. One is off
by default: *and again if I still haven't logged it*. Past its grace a dose
counts as missed and there is nothing useful left to say about it, so the second
buzz is opt-in, fires at most once per dose per day, and only inside the hour
after the grace runs out.

## Develop

```bash
npm install
npm run dev
```

## Test

```bash
npm test                  # the pure logic, via node --test — no extra deps
npm --prefix functions test   # the reminder selection and the CJS parity port
```

## Build and deploy

```bash
npm run build
```

Pushing to `main` builds and publishes to GitHub Pages. The Cloud Function
deploys separately:

```bash
npm --prefix functions install
firebase deploy --only functions:rx
```

The `rx` codebase name matters: the finance app deploys its own functions to the
same Firebase project, and an unscoped `firebase deploy --only functions` from
either repository would delete the other's.

Icons are generated and committed, so CI never runs sharp:

```bash
npm run icons
```
