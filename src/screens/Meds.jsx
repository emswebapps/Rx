import { useNavigate } from 'react-router-dom';
import { Plus, Pill, Clock, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNow } from '../lib/useCountdown.js';
import { formatClock } from '../lib/time.js';
import { PillGlyph, pillLook } from '../components/PillShape.jsx';
import {
  normalizeMed, expectedDosesToday, supplyStatus, rulesForMed, formatOffset, frequencyLabel,
} from '../lib/meds.js';
import { ViewHeader, SupplyBar, pageStyle } from '../components/medsUi.jsx';

const STATE_LABEL = {
  taken: { text: 'Taken', color: 'var(--positive-text)' },
  due: { text: 'Due now', color: 'var(--accent-text)' },
  upcoming: { text: 'Later today', color: 'var(--subtle)' },
  skipped: { text: 'Not logged', color: 'var(--muted)' },
  'skipped-on-purpose': { text: 'Skipped', color: 'var(--muted)' },
  unknown: { text: 'No time set', color: 'var(--muted)' },
  off: { text: 'Not today', color: 'var(--muted)' },
};

/**
 * What you take.
 *
 * Everything on this screen was typed in by the person reading it. The app
 * holds the list, does the arithmetic, and repeats it back — it has no opinion
 * about any of it, and there is nothing here it filled in on their behalf.
 */
/**
 * "8:00 AM, 2:00 PM · weekdays" — the whole schedule in one line.
 *
 * A medication with several times used to have to be entered several times, so
 * a card only ever had one clock to show. Now it can have four, and the card
 * has to say so without becoming a table.
 */
function describeSchedule(med) {
  const m = normalizeMed(med);
  const times = m.schedule.times.map((t) => (t.mode === 'offset'
    ? `+${t.offsetHours}h`
    : formatClockString(t.time)));
  const label = frequencyLabel(m);
  const when = label === 'Every day' ? '' : ` · ${label}`;

  return times.length ? `${times.join(', ')}${when}` : '';
}

/** "08:00" as it reads on a clock, without needing a timestamp to format. */
function formatClockString(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return '';
  let h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${suffix}`;
}

export default function MedsView() {
  const { crashMeds, crashDoses } = useApp();
  const navigate = useNavigate();
  const now = useNow({ tick: 60_000, syncKey: `${crashMeds.length}:${crashDoses.length}` });

  const expected = expectedDosesToday(crashMeds, crashDoses, now);
  // A medication can produce several rows now, so the card summarises them:
  // the next one still ahead, or the last one that happened.
  const byMedId = new Map();
  for (const e of expected) {
    const prev = byMedId.get(e.medId);
    if (!prev) { byMedId.set(e.medId, e); continue; }
    const rank = (x) => ({ due: 0, upcoming: 1, taken: 2, 'skipped-on-purpose': 3, skipped: 4, unknown: 5 }[x.state] ?? 6);
    if (rank(e) < rank(prev)) byMedId.set(e.medId, e);
  }

  // Straight to a blank page, which writes nothing until it is saved. The old
  // version created the medication first and opened an editor over the top, so
  // backing out left an "Untitled" row on this list for good.
  const add = () => navigate('/meds/new');

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader
        title="Medications"
        action={(
          <button onClick={add} aria-label="Add a medication" style={{
            width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'var(--accent)', color: '#fff', flexShrink: 0,
          }}>
            <Plus size={18} />
          </button>
        )}
      />

      {crashMeds.length === 0 ? (
        <div style={{ paddingTop: '2rem', textAlign: 'center' }}>
          <Pill size={30} style={{ color: 'var(--muted)', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Add what you take and when you take it. The app uses the times to
            work out when your evening is likely to get hard — and to say so
            before it does, rather than after.
          </p>
          <button onClick={add} className="app-btn-primary" style={{ width: '100%' }}>
            Add a medication
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {crashMeds.map((raw) => {
            const med = normalizeMed(raw);
            const e = byMedId.get(med.id);
            const state = e ? e.state : 'unknown';
            const label = STATE_LABEL[state];
            const supply = supplyStatus(med, now);
            const rules = rulesForMed(med);

            return (
              <button
                key={med.id}
                onClick={() => navigate(`/meds/${med.id}`)}
                className="app-card"
                style={{
                  padding: '1rem', textAlign: 'left', cursor: 'pointer', width: '100%',
                  border: `1px solid ${supply.low ? 'var(--warn)' : 'var(--border)'}`,
                  opacity: med.active === false ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <PillGlyph {...pillLook(med)} size={28} faded={med.active === false} />
                  <span style={{ flex: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                    {med.name || 'Untitled'}
                  </span>
                  {supply.low && <AlertTriangle size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />}
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: label.color, flexShrink: 0 }}>
                    {med.active === false ? 'Archived' : label.text}
                  </span>
                </div>

                <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.1875rem' }}>
                  {[med.strength, describeSchedule(med)].filter(Boolean).join(' · ')
                    || 'No strength or time set'}
                </p>

                {supply.tracked || supply.refillAt ? (
                  <div style={{ marginTop: '0.75rem' }}><SupplyBar status={supply} /></div>
                ) : null}

                {rules.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.75rem',
                    fontSize: '0.75rem', color: 'var(--muted)',
                  }}>
                    <Clock size={12} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatOffset(rules[0].offsetMinutes)} — {rules[0].text}
                      {rules.length > 1 && ` · +${rules.length - 1} more`}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
