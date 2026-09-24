import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import DoseHistory from './DoseHistory.jsx';
import ComplianceHistory from './ComplianceHistory.jsx';
import EffectsHistory from './EffectsHistory.jsx';
import { Segmented, pageStyle } from '../components/medsUi.jsx';
import { summarize, historySentence, rankMoves } from '../lib/stats.js';
import { formatClock } from '../lib/time.js';
import { suggestedOnset, formatHours } from '../lib/window.js';
import { mergeKit, findMove } from '../lib/kit.js';
import { signTimings } from '../lib/behaviors.js';

const OUTCOME_LABEL = {
  'let-it-go': 'It settled',
  'still-matters': 'Still mattered',
  talked: 'We talked',
};

/**
 * The argument for the 30 minutes, made with the user's own data — which is the
 * only form of it that's believable at 9pm.
 *
 * Hidden entirely until there are three sessions to draw on: a thin number here
 * reads as discouraging, and showing nothing is better than showing "1 of 2".
 */
function SessionsHistory() {
  const { crashSessions, crashDrafts, crashDoses, crashKit, crashBehaviors } = useApp();
  const kit = mergeKit(crashKit);
  const finished = crashSessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
  const summary = summarize(crashSessions, crashDrafts);
  const sentence = finished.length >= 3 ? historySentence(summary) : null;
  const inferred = suggestedOnset(crashSessions, crashDoses);
  const ranked = rankMoves(crashSessions);

  // Which signs arrive earliest, measured from the dose rather than the clock.
  // Empty until a sign has been tagged enough times to mean something — see
  // the sample floor in behaviors.js.
  const timings = signTimings(crashBehaviors, crashSessions, crashDoses, kit.warningSigns);
  const latest = timings.length ? timings[timings.length - 1].hours : 0;

  // When your evenings actually go wrong, by hour. Unlike the crash screens,
  // nothing here is urgent, so a real chart is affordable.
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const s of crashSessions) {
    if (typeof s.startedAt === 'number') byHour[new Date(s.startedAt).getHours()].count += 1;
  }
  const busiest = Math.max(...byHour.map((b) => b.count));
  const hourLabel = (h) => (h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`);

  return (
    <div>

      {sentence ? (
        <div style={{
          padding: '1.25rem', borderRadius: '1rem', marginBottom: '1.75rem',
          backgroundColor: 'var(--accent-soft)', border: '1px solid var(--accent)',
        }}>
          <p style={{ fontSize: '1.0625rem', color: 'var(--accent-text)', lineHeight: 1.55, fontWeight: 600 }}>
            {sentence}
          </p>
        </div>
      ) : (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.55, marginBottom: '1.75rem' }}>
          {finished.length === 0
            ? 'Once you’ve been through this a few times, this page will tell you what actually tends to happen.'
            : 'A couple more times through and there’ll be enough here to be worth reading.'}
        </p>
      )}

      {crashSessions.length >= 3 && busiest > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            WHEN IT USUALLY HITS
          </h2>
          {/* Plain divs rather than a chart library: CSS custom properties don't
              resolve inside SVG fill attributes, so a themed recharts bar paints
              nothing in either mode. This also keeps recharts out of the bundle. */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '5rem' }}>
            {byHour.map((b) => (
              <div key={b.hour} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div
                  title={`${hourLabel(b.hour)} — ${b.count}`}
                  style={{
                    width: '100%',
                    height: b.count ? `${Math.max(8, (b.count / busiest) * 100)}%` : '2px',
                    borderRadius: '2px',
                    backgroundColor: b.count === busiest && b.count > 0
                      ? 'var(--accent)'
                      : b.count > 0 ? 'var(--accent-soft)' : 'var(--border)',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '2px', marginTop: '0.375rem' }}>
            {byHour.map((b) => (
              <div key={b.hour} style={{
                flex: 1, textAlign: 'center', fontSize: '0.5625rem', color: 'var(--subtle)',
              }}>
                {b.hour % 4 === 0 ? hourLabel(b.hour) : ''}
              </div>
            ))}
          </div>
          {inferred && (
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
              Across {inferred.samples} nights, it starts about{' '}
              <strong style={{ color: 'var(--text)' }}>{formatHours(inferred.hours)}</strong> after your dose.
            </p>
          )}
        </div>
      )}

      {timings.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '0.5rem' }}>
            WHAT SHOWS UP FIRST
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.875rem' }}>
            How long after a dose each one tends to arrive. The one at the top is
            the earliest warning you actually get.
          </p>
          {/* Plain divs again, for the reason given above the chart. */}
          <div style={{ display: 'grid', gap: '0.625rem' }}>
            {timings.map((t, i) => (
              <div key={t.signId}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.3125rem',
                }}>
                  <span style={{
                    flex: 1, fontSize: '0.875rem', lineHeight: 1.4,
                    color: i === 0 ? 'var(--text)' : 'var(--subtle)',
                    fontWeight: i === 0 ? 700 : 500,
                  }}>
                    {t.text}
                  </span>
                  <span style={{
                    fontSize: '0.8125rem', color: 'var(--subtle)', flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatHours(t.hours)} · {t.count}×
                  </span>
                </div>
                <div style={{
                  height: '0.3125rem', borderRadius: '9999px',
                  backgroundColor: 'var(--surface2)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${latest > 0 ? Math.max(4, (t.hours / latest) * 100) : 100}%`,
                    height: '100%',
                    backgroundColor: i === 0 ? 'var(--accent)' : 'var(--accent-soft)',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ranked.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            WHAT ACTUALLY HELPS YOU
          </h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {ranked.map((r) => {
              const opt = findMove(kit, r.id);
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.625rem',
                  padding: '0.75rem 0.875rem', borderRadius: '0.75rem',
                  backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: '1.125rem' }}>{opt?.emoji || '•'}</span>
                  <span style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--text)', fontWeight: 600 }}>
                    {opt?.label || r.id}
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.uses}× · {r.avgDrop > 0 ? `−${r.avgDrop}` : `+${Math.abs(r.avgDrop)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {finished.map((s) => (
            <div key={s.id} className="app-card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                  {new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>{formatClock(s.startedAt)}</span>
                {s.intensity != null && s.intensityAfter != null && (
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.875rem', fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: s.intensityAfter < s.intensity ? 'var(--positive-text)' : 'var(--muted)',
                  }}>
                    {s.intensity} → {s.intensityAfter}
                  </span>
                )}
              </div>

              {s.outcome && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.375rem' }}>
                  {OUTCOME_LABEL[s.outcome] || s.outcome}
                </p>
              )}

              {/* The most useful artifact in the whole feature: reading your own
                  story column back at 3pm, when it reads very differently. */}
              {(s.stories || []).length > 0 && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--subtle)', marginBottom: '0.375rem' }}>
                    WHAT YOUR BRAIN WAS TELLING YOU
                  </p>
                  {s.stories.map((st) => (
                    <p key={st.id} style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                      {st.text}
                    </p>
                  ))}
                </div>
              )}

              {s.outcomeNote && (
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.5, marginTop: '0.625rem', fontStyle: 'italic' }}>
                  {s.outcomeNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * History, in two halves.
 *
 * Doses first, because "have I been taking them?" is the question asked most
 * often. The crash sessions are the other half, unchanged — CrashScreen links
 * straight to them with ?tab=sessions.
 */
export default function HistoryView() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = ['sessions', 'score', 'effects'].includes(params.get('tab')) ? params.get('tab') : 'doses';

  return (
    <div className="app-page" style={pageStyle}>
      <h1 style={{
        fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)',
        letterSpacing: '-0.02em', paddingTop: '1rem', marginBottom: '1.25rem',
      }}>
        History
      </h1>
      <button onClick={() => navigate('/report')} style={{
        display: 'block', marginTop: '-0.75rem', marginBottom: '1rem', padding: 0, background: 'none', border: 'none',
        cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-text)',
      }}>
        Doctor visit report →
      </button>

      <Segmented
        options={[
          { key: 'doses', label: 'Doses' },
          { key: 'score', label: 'Score' },
          { key: 'effects', label: 'Effects' },
          { key: 'sessions', label: 'Crashes' },
        ]}
        value={tab}
        onChange={(next) => setParams(next === 'doses' ? {} : { tab: next }, { replace: true })}
        style={{ marginBottom: '1.5rem' }}
      />

      {tab === 'doses' ? <DoseHistory />
        : tab === 'score' ? <ComplianceHistory />
          : tab === 'effects' ? <EffectsHistory /> : <SessionsHistory />}
    </div>
  );
}
