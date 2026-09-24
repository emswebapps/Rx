import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Share2, Copy, Check, MessageSquare, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { mergeWater } from '../lib/water.js';
import { dosesCSV, effectsCSV, fullBackup, exportName } from '../lib/export.js';
import { CLOUD_FIELDS } from '../utils/storage';
import { mergeKit, DEFAULT_WARNING_SIGNS } from '../lib/kit.js';
import { BRAKE_VARIANTS, buildBrakeMessage, buildAgreement, smsHref } from '../lib/message.js';
import { suggestedOnset, formatHours } from '../lib/window.js';
import { pageStyle } from '../components/medsUi.jsx';
import InstallCard from '../components/InstallCard.jsx';

/**
 * The things you decide once, while you're fine, so none of them have to be
 * decided while you're not.
 *
 * Most of this screen is the crash protocol's setup rather than the medication
 * list's, which is why it reads the way it does — the medications themselves
 * are edited on their own pages, under the Meds tab.
 */
export default function SettingsView() {
  const app = useApp();
  const {
    crashKit, updateCrashKit, settings, notifPrefs, persistNotifPrefs,
    crashSessions, crashDoses,
  } = app;
  const kit = mergeKit(crashKit);
  const navigate = useNavigate();
  const [newSign, setNewSign] = useState('');
  const partnerName = kit.partnerName || settings.spouseName || '';
  const inferred = suggestedOnset(crashSessions, crashDoses);

  const removeSign = (id) => {
    const isDefault = DEFAULT_WARNING_SIGNS.some((d) => d.id === id);
    updateCrashKit({
      removedSigns: isDefault ? [...(crashKit.removedSigns || []), id] : (crashKit.removedSigns || []),
      warningSigns: kit.warningSigns.filter((s) => s.id !== id),
    });
  };

  const addSign = () => {
    if (!newSign.trim()) return;
    updateCrashKit({
      warningSigns: [...kit.warningSigns, { id: `c-${Date.now()}`, text: newSign.trim() }],
    });
    setNewSign('');
  };

  const setCrashPref = (key, value) => persistNotifPrefs({
    ...notifPrefs,
    crash: { ...notifPrefs.crash, [key]: value },
  });

  const section = { marginBottom: '2rem' };
  const h2 = {
    fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em',
    color: 'var(--muted)', marginBottom: '0.75rem',
  };

  return (
    <div className="app-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Settings
        </h1>
      </div>

      <p style={{
        fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5,
        marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)',
      }}>
        Your medications, doses, notes and history are yours. Nothing in Rx is
        shared with anyone.
      </p>

      {/* Renders nothing once Rx is on a home screen, or in a browser that
          can neither install it nor be told how. */}
      <InstallCard variant="row" />

      <div style={section}>
        <h2 style={h2}>WHAT I’VE NOTICED</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.875rem' }}>
          How your medications actually behave, in your own words. Pinned notes
          show up on the crash screen.
        </p>
        <button
          onClick={() => navigate('/notes')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.875rem 1rem', borderRadius: '0.875rem', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: '0.875rem', fontWeight: 600,
          }}
        >
          <span>Open my notes</span>
          <ChevronRight size={16} style={{ color: 'var(--subtle)' }} />
        </button>
      </div>

      <div style={section}>
        <h2 style={h2}>THE BASICS</h2>
        <label className="app-label">His name</label>
        <input
          value={kit.partnerName}
          onChange={(e) => updateCrashKit({ partnerName: e.target.value })}
          placeholder={settings.spouseName || 'Optional'}
          className="app-input"
          style={{ width: '100%', marginBottom: '1rem' }}
        />

        <label className="app-label">How long the rule lasts</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[15, 20, 30, 45].map((m) => (
            <button
              key={m}
              onClick={() => updateCrashKit({ timerMinutes: m })}
              style={{
                flex: 1, padding: '0.875rem 0.5rem', borderRadius: '0.75rem', cursor: 'pointer',
                fontSize: '0.9375rem', fontWeight: 700,
                color: kit.timerMinutes === m ? '#fff' : 'var(--text)',
                backgroundColor: kit.timerMinutes === m ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${kit.timerMinutes === m ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <AgreementCard kit={kit} partnerName={partnerName} onSave={(t) => updateCrashKit({ agreementText: t })} h2={h2} section={section} />

      <div style={section}>
        <h2 style={h2}>THE PHRASE</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.875rem' }}>
          Agree on this with him now, while nothing is happening. Then it means
          “I’m coming back,” not “I’m done.”
        </p>
        <textarea
          value={kit.brakePhrase}
          onChange={(e) => updateCrashKit({ brakePhrase: e.target.value })}
          rows={3}
          placeholder={buildBrakeMessage({}, kit.brakeVariantId, kit.partnerName)}
          className="app-input"
          style={{ width: '100%', resize: 'vertical', lineHeight: 1.5, marginBottom: '0.75rem' }}
        />
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {BRAKE_VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => updateCrashKit({ brakeVariantId: v.id, brakePhrase: '' })}
              style={{
                padding: '0.4375rem 0.75rem', borderRadius: '9999px', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: 700,
                color: kit.brakeVariantId === v.id && !kit.brakePhrase ? 'var(--accent-text)' : 'var(--muted)',
                backgroundColor: kit.brakeVariantId === v.id && !kit.brakePhrase ? 'var(--accent-soft)' : 'var(--surface2)',
                border: `1px solid ${kit.brakeVariantId === v.id && !kit.brakePhrase ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div style={section}>
        <h2 style={h2}>MY TIMING</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.875rem' }}>
          Log when you take your meds and Today shows tonight’s likely window.
          These are just your own numbers — nothing here is advice about medication.
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.875rem' }}>
          These two cover a dose that isn’t attached to anything on your{' '}
          <strong style={{ color: 'var(--text)' }}>medications</strong> list — the
          plain one-tap log, and everything you logged before that list existed.
          Anything on the list uses its own numbers instead.
        </p>

        <label className="app-label">The crash usually starts</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[3, 3.5, 4, 4.5, 5].map((h) => (
            <button
              key={h}
              onClick={() => updateCrashKit({ onsetHours: h })}
              style={pickStyle(kit.onsetHours === h)}
            >
              {h}h
            </button>
          ))}
        </div>

        <label className="app-label">and lasts about</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[3, 4, 5, 6].map((h) => (
            <button
              key={h}
              onClick={() => updateCrashKit({ durationHours: h })}
              style={pickStyle(kit.durationHours === h)}
            >
              {h}h
            </button>
          ))}
        </div>

        {inferred && Math.abs(inferred.hours - kit.onsetHours) >= 0.25 && (
          <div style={{
            marginTop: '1rem', padding: '1rem', borderRadius: '0.875rem',
            backgroundColor: 'var(--accent-soft)', border: '1px solid var(--accent)',
          }}>
            <p style={{ fontSize: '0.9375rem', color: 'var(--accent-text)', lineHeight: 1.5 }}>
              Your last {inferred.samples} crashes started about{' '}
              <strong>{formatHours(inferred.hours)}</strong> after your dose.
            </p>
            <button
              onClick={() => updateCrashKit({ onsetHours: inferred.hours })}
              style={{
                marginTop: '0.75rem', padding: '0.625rem 1rem', borderRadius: '0.75rem',
                border: 'none', cursor: 'pointer', backgroundColor: 'var(--accent)',
                color: '#fff', fontSize: '0.875rem', fontWeight: 700,
              }}
            >
              Use that instead
            </button>
          </div>
        )}
      </div>

      <div style={section}>
        <h2 style={h2}>FOR MY DOCTOR, AND MY DATA</h2>
        <button onClick={() => navigate('/report')} className="app-btn-primary" style={{ width: '100%', marginBottom: '0.625rem' }}>
          Doctor visit report
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <DownloadButton
            label="Doses (spreadsheet)"
            name={exportName('doses', 'csv')}
            type="text/csv"
            build={() => dosesCSV(app.crashMeds, app.crashDoses)}
          />
          <DownloadButton
            label="Check-ins (spreadsheet)"
            name={exportName('check-ins', 'csv')}
            type="text/csv"
            build={() => effectsCSV(app.crashMeds, app.rxEffects)}
          />
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <DownloadButton
            label="Full backup — everything"
            name={exportName('backup', 'json')}
            type="application/json"
            build={() => fullBackup(app, Object.keys(CLOUD_FIELDS))}
          />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.625rem' }}>
          Saved to this device only — nothing is sent anywhere. The spreadsheets open in Numbers, Excel or Google Sheets.
        </p>
      </div>

      <WaterSettings
        water={mergeWater(kit.water)}
        onChange={(patch) => {
          const next = { ...mergeWater(kit.water), ...patch };
          // Stamped the first time it's switched on, so the days before it
          // don't count against the compliance score.
          if (patch.enabled && !next.since) next.since = Date.now();
          updateCrashKit({ water: next });
        }}
        h2={h2}
        section={section}
      />

      <div style={section}>
        <h2 style={h2}>MY YELLOW LIGHTS</h2>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {kit.warningSigns.map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.8125rem 0.875rem', borderRadius: '0.75rem',
              backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
            }}>
              <span style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.4 }}>{s.text}</span>
              <button
                onClick={() => removeSign(s.id)}
                aria-label="Remove"
                style={{ background: 'none', border: 'none', color: 'var(--subtle)', cursor: 'pointer', padding: 0 }}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={newSign}
            onChange={(e) => setNewSign(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSign(); }}
            placeholder="Add one in your own words"
            className="app-input"
            style={{ flex: 1 }}
          />
          <button onClick={addSign} aria-label="Add" style={{
            width: '2.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', color: 'var(--text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div style={section}>
        <h2 style={h2}>WHAT BUZZES MY PHONE</h2>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <Toggle
            checked={notifPrefs.crash?.timerEnd ?? true}
            onChange={(v) => setCrashPref('timerEnd', v)}
            label="When the timer runs out"
            hint="Says only that the time is up — never what it was about."
          />
          <Toggle
            checked={notifPrefs.crash?.windowHeadsUp ?? true}
            onChange={(v) => setCrashPref('windowHeadsUp', v)}
            label="Half an hour before my window"
            hint="Only once you've logged a dose. Nothing to log, nothing to send."
          />
          <Toggle
            checked={notifPrefs.crash?.crashNote ?? true}
            onChange={(v) => setCrashPref('crashNote', v)}
            label="As my window opens"
            hint="Opens straight onto your anchors. It never starts a session on its own."
          />
          <Toggle
            checked={notifPrefs.crash?.escrowOpened ?? true}
            onChange={(v) => setCrashPref('escrowOpened', v)}
            label="When something I held opens"
            hint="The morning after. Never quotes what you wrote."
          />
          <Toggle
            checked={notifPrefs.crash?.doseDue ?? true}
            onChange={(v) => setCrashPref('doseDue', v)}
            label="When a dose comes due"
            hint="Once, at the time you set. It goes quiet after that rather than asking again."
          />
          <Toggle
            checked={notifPrefs.crash?.doseLate === true}
            onChange={(v) => setCrashPref('doseLate', v)}
            label="And again if I still haven't logged it"
            hint="Off unless you want it. One more buzz, within the hour after the grace runs out — then it stops for the day."
          />
          <Toggle
            checked={notifPrefs.crash?.ruleReminders ?? true}
            onChange={(v) => setCrashPref('ruleReminders', v)}
            label="My rules, at the time I set them"
            hint="Your own words, buzzed back at you. A before-the-dose rule stops once you've logged it."
          />
          <Toggle
            checked={notifPrefs.crash?.routineWait ?? true}
            onChange={(v) => setCrashPref('routineWait', v)}
            label="When a routine wait is up"
            hint="The moment the wait you started ends — to the second while the app is open, within a few minutes when it isn't."
          />
          <Toggle
            checked={notifPrefs.crash?.water ?? true}
            onChange={(v) => setCrashPref('water', v)}
            label="Water reminders"
            hint="Every interval after your first dose, until the goal or the cutoff. Tap “Drank one” to log it from the lock screen."
          />
          <Toggle
            checked={notifPrefs.crash?.effectCheckIn ?? true}
            onChange={(v) => setCrashPref('effectCheckIn', v)}
            label="“How’s it working?” check-ins"
            hint="Ninety minutes after a dose, and again as it wears off. A few taps; they build your effect curve."
          />
          <Toggle
            checked={notifPrefs.crash?.supplyGap ?? true}
            onChange={(v) => setCrashPref('supplyGap', v)}
            label="If I’ll run out before my refill date"
            hint="Counted from the pills you actually have. As soon as it’s true, and again three days before you run out."
          />
          <Toggle
            checked={notifPrefs.crash?.refillLow ?? true}
            onChange={(v) => setCrashPref('refillLow', v)}
            label="When a supply is running low"
            hint="The day it crosses your threshold, and again when it's nearly gone."
          />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.75rem' }}>
          None of these ever name a medication, a dose or a rule on the lock
          screen. They say there’s something to look at; what it is stays behind
          your login.
        </p>
      </div>

      <p style={{
        fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.6,
        paddingTop: '1rem', borderTop: '1px solid var(--border)',
      }}>
        This is a tool you built for yourself, not treatment. If a night ever goes
        somewhere darker than a crash, that’s a person to call, not an app.
      </p>
    </div>
  );
}

/**
 * Hand a file to the browser. The text is built only on tap, so a big history
 * costs nothing until it's asked for.
 */
function DownloadButton({ label, name, type, build }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([build()], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button
      onClick={download}
      style={{
        width: '100%', padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
        backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
        color: 'var(--text)', fontSize: '0.8125rem', fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

/** How much, how often, and until when — all the user's own numbers. */
function WaterSettings({ water, onChange, h2, section }) {
  return (
    <div style={section}>
      <h2 style={h2}>WATER</h2>
      <Toggle
        checked={water.enabled}
        onChange={(enabled) => onChange({ enabled })}
        label="Track water"
        hint="A glass counter on Today, and a nudge every so often once you’ve taken your first dose."
      />
      {water.enabled && (
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.875rem' }}>
          <div>
            <label className="app-label">Remind me every</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[45, 60, 90, 120].map((m) => (
                <button key={m} onClick={() => onChange({ everyMinutes: m })} style={pickStyle(water.everyMinutes === m)}>
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label className="app-label">Glasses a day</label>
              <input
                type="number" min="1" max="20" step="1" inputMode="numeric"
                value={water.goal}
                onChange={(e) => onChange({ goal: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                className="app-input" style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="app-label">Stop reminding at</label>
              <input
                type="time"
                value={water.until}
                onChange={(e) => onChange({ until: e.target.value })}
                className="app-input" style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pickStyle(on) {
  return {
    flex: 1, padding: '0.875rem 0.25rem', borderRadius: '0.75rem', cursor: 'pointer',
    fontSize: '0.9375rem', fontWeight: 700,
    color: on ? '#fff' : 'var(--text)',
    backgroundColor: on ? 'var(--accent)' : 'var(--surface2)',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
  };
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer',
      padding: '1rem', borderRadius: '0.875rem',
      backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: '1.125rem', height: '1.125rem', accentColor: 'var(--accent)', marginTop: '0.125rem' }}
      />
      <span style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.4 }}>
        {label}
        <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
          {hint}
        </span>
      </span>
    </label>
  );
}

/**
 * The message you send him once, on a good day. This is what lets the
 * in-the-moment message be four words long — he already knows what they mean.
 */
function AgreementCard({ kit, partnerName, onSave, h2, section }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => buildAgreement(kit, partnerName));
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const commit = (next) => { setText(next); onSave(next); };
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const btn = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem',
    padding: '0.8125rem', borderRadius: '0.875rem', border: '1px solid var(--border)',
    backgroundColor: 'var(--surface2)', color: 'var(--text)',
    fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
  };

  return (
    <div style={section}>
      <h2 style={h2}>WHAT HE NEEDS TO KNOW</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.875rem' }}>
        Send this to him once, on a day like today. It’s the reason the message in
        the moment can be four words long — he’ll already know what they mean.
        Nothing of yours is shared; this is just a message you choose to send.
      </p>

      {open ? (
        <textarea
          value={text}
          onChange={(e) => commit(e.target.value)}
          rows={14}
          className="app-input"
          style={{ width: '100%', resize: 'vertical', lineHeight: 1.55, fontSize: '0.9375rem' }}
        />
      ) : (
        <div
          onClick={() => setOpen(true)}
          style={{
            padding: '1rem', borderRadius: '0.875rem', cursor: 'pointer',
            backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
            fontSize: '0.9375rem', color: 'var(--muted)', lineHeight: 1.55,
            maxHeight: '9rem', overflow: 'hidden', whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none', border: 'none', padding: '0.625rem 0', cursor: 'pointer',
          color: 'var(--accent-text)', fontSize: '0.875rem', fontWeight: 700,
        }}
      >
        {open ? 'Done editing' : 'Read it all / edit'}
      </button>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {canShare && (
          <button onClick={() => navigator.share({ text }).catch(() => {})} style={btn}>
            <Share2 size={16} />Send
          </button>
        )}
        <a href={smsHref(text)} style={btn}><MessageSquare size={16} />Text</a>
        <button onClick={copy} style={btn}>
          {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
