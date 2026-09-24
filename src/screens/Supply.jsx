import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertTriangle, CalendarClock, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNow } from '../lib/useCountdown.js';
import {
  activeMeds, supplyStatus, formatAmount, countMismatches, formatCountDiff,
} from '../lib/meds.js';
import { formatDayRelative } from '../lib/time.js';
import { SupplyBar, RunOutLine, ViewHeader, pageStyle } from '../components/medsUi.jsx';

/**
 * What's left, and when it can be filled.
 *
 * For a controlled substance the date the fill window opens is usually the
 * binding constraint rather than the pill count, so both are given equal weight
 * and the list is ordered by what needs doing rather than alphabetically.
 *
 * All the arithmetic is `supplyStatus` in meds.js. This screen's only job is to
 * put it somewhere you can see it without opening each medication in turn,
 * which is where it used to live.
 */

/** Short before the refill first, then refill-open, then low, then the rest. */
function urgency(status) {
  if (status.shortBeforeRefill) return -1;
  if (status.refillOpen) return 0;
  if (status.low) return 1;
  if (!status.tracked) return 3;
  return 2;
}

export default function SupplyView({ onBack }) {
  const { crashMeds, crashDoses, refillCrashMed, recordPillCount } = useApp();
  // The count check: which med, what was typed, and — once compared — the result.
  const [counting, setCounting] = useState(null);
  const [counted, setCounted] = useState('');
  const [countResult, setCountResult] = useState(null);
  const navigate = useNavigate();
  const now = useNow({ tick: 60_000, syncKey: `${crashMeds.length}:${crashDoses.length}` });
  const [filling, setFilling] = useState(null);
  const [count, setCount] = useState('');

  const rows = activeMeds(crashMeds)
    .map((med) => ({ med, status: supplyStatus(med, now, crashDoses) }))
    .sort((a, b) => urgency(a.status) - urgency(b.status)
      || (a.status.daysLeft ?? Infinity) - (b.status.daysLeft ?? Infinity));

  const submit = (medId) => {
    const n = Number(count);
    if (count === '' || Number.isNaN(n)) return;
    refillCrashMed(medId, n);
    setFilling(null);
    setCount('');
  };

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader title="Supply" onBack={onBack} />

      {rows.length === 0 ? (
        <div style={{ paddingTop: '2rem', textAlign: 'center' }}>
          <Package size={30} style={{ color: 'var(--muted)', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Once you’ve added a medication, tell it how many you have and the
            date you can fill it again — this page then does the counting.
          </p>
          <button onClick={() => navigate('/meds/new')} className="app-btn-primary" style={{ width: '100%' }}>
            Add a medication
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {rows.map(({ med, status }) => (
            <div
              key={med.id}
              className="app-card"
              style={{
                padding: '1rem',
                border: `1px solid ${status.shortBeforeRefill ? 'var(--danger)' : status.refillOpen ? 'var(--accent)' : status.low ? 'var(--warn)' : 'var(--border)'}`,
              }}
            >
              <button
                onClick={() => navigate(`/meds/${med.id}`)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'baseline', gap: '0.5rem',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ flex: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                  {med.name || 'Untitled'}
                </span>
                {status.low && <AlertTriangle size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />}
                <span style={{
                  fontSize: '0.8125rem', fontWeight: 700, flexShrink: 0,
                  color: status.tracked
                    ? (status.low ? 'var(--warn)' : 'var(--subtle)')
                    : 'var(--muted)',
                }}>
                  {status.tracked
                    ? (status.daysLeft === 0 ? 'None left' : `${status.daysLeft} days left`)
                    : 'Not counting'}
                </span>
              </button>

              {status.tracked && (
                <div style={{ marginTop: '0.75rem' }}>
                  <SupplyBar status={status} />
                  <RunOutLine status={status} />
                </div>
              )}

              {status.refillAt != null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.75rem',
                  fontSize: '0.8125rem', fontWeight: 600,
                  color: status.refillOpen ? 'var(--accent-text)' : 'var(--subtle)',
                }}>
                  <CalendarClock size={13} style={{ flexShrink: 0 }} />
                  <span>
                    {status.refillOpen ? 'You can refill this now'
                      : status.daysUntilRefill === 1 ? 'Can refill tomorrow'
                      : `Can refill in ${status.daysUntilRefill} days`}
                  </span>
                </div>
              )}

              {!status.tracked && (
                <button
                  onClick={() => navigate(`/meds/${med.id}`)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: '0.8125rem', color: 'var(--accent-text)', fontWeight: 600,
                    marginTop: '0.5rem',
                  }}
                >
                  Start counting these →
                </button>
              )}

              {status.tracked && (() => {
                const last = countMismatches(med)[0];
                return last ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.5rem' }}>
                    Last count {formatCountDiff(last.diff)}, {(() => { const r = formatDayRelative(last.at, now); return r === 'Today' || r === 'Yesterday' ? r.toLowerCase() : r; })()}
                  </p>
                ) : null;
              })()}

              {counting === med.id && (
                <div style={{
                  marginTop: '0.875rem', padding: '0.75rem', borderRadius: '0.75rem',
                  backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
                }}>
                  {countResult == null ? (
                    <>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
                        How many are in the bottle right now?
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="number" min="0" inputMode="numeric" autoFocus
                          value={counted}
                          onChange={(e) => setCounted(e.target.value)}
                          placeholder="Count them"
                          className="app-input" style={{ flex: 1 }}
                        />
                        <button
                          onClick={() => {
                            const n = Number(counted);
                            if (counted === '' || Number.isNaN(n)) return;
                            const diff = n - status.onHand;
                            if (diff === 0) {
                              recordPillCount(med.id, n, true);
                              setCountResult({ diff: 0, n });
                            } else {
                              setCountResult({ diff, n });
                            }
                          }}
                          className="app-btn-primary"
                          style={{ flexShrink: 0, opacity: counted === '' ? 0.5 : 1 }}
                        >
                          Check
                        </button>
                      </div>
                    </>
                  ) : countResult.diff === 0 ? (
                    <p style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--positive-text)' }}>
                      <Check size={16} /> Matches — {countResult.n} in the bottle, just as logged.
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--warn)' }}>
                        {formatCountDiff(countResult.diff)}: the app expected {status.onHand}, you counted {countResult.n}.
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.45, marginTop: '0.25rem' }}>
                        {countResult.diff < 0
                          ? 'Often a dose taken but not logged — or pills lost or dropped.'
                          : 'Often a dose logged that wasn’t actually taken.'}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                        <button
                          onClick={() => { recordPillCount(med.id, countResult.n, true); setCounting(null); }}
                          className="app-btn-primary" style={{ flex: 1 }}
                        >
                          Use my count
                        </button>
                        <button
                          onClick={() => { recordPillCount(med.id, countResult.n, false); setCounting(null); }}
                          style={{
                            flex: 1, borderRadius: '0.75rem', cursor: 'pointer', backgroundColor: 'var(--surface)',
                            border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
                          }}
                        >
                          Keep {status.onHand}
                        </button>
                      </div>
                    </>
                  )}
                  {(countResult == null || countResult.diff === 0) && (
                    <button
                      onClick={() => setCounting(null)}
                      style={{
                        marginTop: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: '0.8125rem', fontWeight: 600, color: 'var(--muted)',
                      }}
                    >
                      {countResult ? 'Done' : 'Cancel'}
                    </button>
                  )}
                </div>
              )}

              {filling === med.id ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
                  <input
                    type="number" min="0" inputMode="numeric" autoFocus
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    placeholder="How many?"
                    className="app-input" style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => submit(med.id)}
                    disabled={count === '' || Number.isNaN(Number(count))}
                    className="app-btn-primary"
                    style={{ opacity: count === '' ? 0.5 : 1, flexShrink: 0 }}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => { setFilling(null); setCount(''); }}
                    style={{
                      padding: '0 0.875rem', borderRadius: '0.75rem', cursor: 'pointer',
                      backgroundColor: 'var(--surface2)', color: 'var(--text)',
                      border: '1px solid var(--border)', fontSize: '0.875rem', fontWeight: 700,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => { setFilling(med.id); setCount(''); }}
                  style={{
                    marginTop: '0.875rem', padding: '0.5rem 0.875rem', borderRadius: '0.75rem',
                    cursor: 'pointer', backgroundColor: 'var(--surface2)', color: 'var(--text)',
                    border: '1px solid var(--border)', fontSize: '0.8125rem', fontWeight: 700,
                  }}
                >
                  I filled this
                </button>
                {status.tracked && counting !== med.id && (
                  <button
                    onClick={() => { setCounting(med.id); setCounted(''); setCountResult(null); }}
                    style={{
                      marginTop: '0.875rem', padding: '0.5rem 0.875rem', borderRadius: '0.75rem',
                      cursor: 'pointer', backgroundColor: 'var(--surface2)', color: 'var(--text)',
                      border: '1px solid var(--border)', fontSize: '0.8125rem', fontWeight: 700,
                    }}
                  >
                    Count check
                  </button>
                )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '1.5rem' }}>
        “Runs out” counts forward one scheduled dose at a time from the pills
        you have now, skipping days off and anything already logged today.
        Days left counts every scheduled dose and how many you take at each,
        scaled for the days you don’t take it — so a twice-daily weekday
        medication empties faster than a once-daily one. Logging a dose counts
        it out of the total; “I filled this” resets the count and clears the
        refill date it just met.
      </p>
    </div>
  );
}
