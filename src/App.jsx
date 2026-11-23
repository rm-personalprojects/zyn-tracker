import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Square,
  Settings2,
  Undo2,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  History,
  Download,
  Upload,
} from 'lucide-react';
import {
  logicalDateStr,
  cutoffTimestamp,
  computeSchedule,
  formatClock,
  formatDuration,
  formatGapShort,
} from './schedule.js';
import { getJSON, setJSON, removeKey, listKeys, buildBackup, restoreBackup } from './storage.js';

const DEFAULT_SETTINGS = { target: 6, cutoff: '23:00' };
const dayKey = (dateStr) => `zyn-day-${dateStr}`;

function loadState() {
  const today = logicalDateStr();
  const active = getJSON('zyn-active', null);
  return {
    settings: { ...DEFAULT_SETTINGS, ...getJSON('zyn-settings', {}) },
    dateStr: today,
    entries: getJSON(dayKey(today), { entries: [] }).entries || [],
    activeStart: active?.start ?? null,
    activeDate: active?.start ? active.date || today : null,
  };
}

function loadHistory() {
  return listKeys('zyn-day-')
    .sort()
    .reverse()
    .slice(0, 7)
    .map((k) => {
      const d = getJSON(k, { entries: [] });
      return { date: k.replace('zyn-day-', ''), count: (d.entries || []).length, target: d.target ?? null };
    });
}

async function shareOrDownload(filename, text) {
  const file = new File([text], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Zyn Tracker backup' });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const initial = useMemo(loadState, []);
  const [settings, setSettings] = useState(initial.settings);
  const [dateStr, setDateStr] = useState(initial.dateStr);
  const [entries, setEntries] = useState(initial.entries);
  const [activeStart, setActiveStart] = useState(initial.activeStart);
  const [activeDate, setActiveDate] = useState(initial.activeDate);
  const [now, setNow] = useState(Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null);
  const [notice, setNotice] = useState(null);
  const settingsTimer = useRef(null);
  const fileInput = useRef(null);

  // Tick every second, and refresh immediately when the app comes back from the background.
  // iOS pauses timers while the app is closed, but everything is computed from timestamps,
  // so one refresh on return is enough to catch up.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', tick);
    };
  }, []);

  useEffect(() => {
    const current = logicalDateStr(now);
    if (current !== dateStr) {
      setDateStr(current);
      setEntries(getJSON(dayKey(current), { entries: [] }).entries || []);
      setHistory(null);
    }
  }, [now, dateStr]);

  useEffect(() => {
    if (showHistory && history === null) setHistory(loadHistory());
  }, [showHistory, history]);

  useEffect(() => () => clearTimeout(settingsTimer.current), []);

  const flash = useCallback((text, tone = 'info') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      clearTimeout(settingsTimer.current);
      settingsTimer.current = setTimeout(() => setJSON('zyn-settings', next), 300);
      return next;
    });
  }, []);

  const saveDay = useCallback(
    (date, nextEntries) => {
      if (!setJSON(dayKey(date), { entries: nextEntries, target: settings.target })) {
        flash("That didn't save. Your phone may be low on storage.", 'error');
        return false;
      }
      return true;
    },
    [settings.target, flash]
  );

  const startZyn = useCallback(() => {
    if (activeStart) return;
    const start = Date.now();
    const d = logicalDateStr(start);
    setActiveStart(start);
    setActiveDate(d);
    setJSON('zyn-active', { start, date: d });
  }, [activeStart]);

  const finishZyn = useCallback(() => {
    if (!activeStart) return;
    const owningDate = activeDate || dateStr;
    const existing = getJSON(dayKey(owningDate), { entries: [] }).entries || [];
    const nextEntries = [...existing, { start: activeStart, end: Date.now() }];
    if (!saveDay(owningDate, nextEntries)) return;
    if (owningDate === dateStr) setEntries(nextEntries);
    setActiveStart(null);
    setActiveDate(null);
    setHistory(null);
    removeKey('zyn-active');
  }, [activeStart, activeDate, dateStr, saveDay]);

  const cancelActive = useCallback(() => {
    setActiveStart(null);
    setActiveDate(null);
    removeKey('zyn-active');
  }, []);

  const undoLast = useCallback(() => {
    if (entries.length === 0) return;
    const last = entries[entries.length - 1];
    if (!window.confirm(`Remove #${entries.length} (${formatClock(last.start)})?`)) return;
    const nextEntries = entries.slice(0, -1);
    if (saveDay(dateStr, nextEntries)) {
      setEntries(nextEntries);
      setHistory(null);
    }
  }, [entries, dateStr, saveDay]);

  const exportBackup = useCallback(async () => {
    const stamp = logicalDateStr();
    await shareOrDownload(`zyn-tracker-backup-${stamp}.json`, JSON.stringify(buildBackup(), null, 2));
  }, []);

  const importBackup = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!window.confirm('Replace everything in the tracker with this backup?')) return;
        restoreBackup(parsed);
        const fresh = loadState();
        setSettings(fresh.settings);
        setDateStr(fresh.dateStr);
        setEntries(fresh.entries);
        setActiveStart(fresh.activeStart);
        setActiveDate(fresh.activeDate);
        setHistory(null);
        flash('Backup restored');
      } catch (err) {
        flash(err?.message?.includes('backup') ? err.message : "That file couldn't be read as a backup.", 'error');
      }
    },
    [flash]
  );

  const avgDurationMs = useMemo(() => {
    const recent = entries.slice(-10).filter((e) => e.end > e.start);
    if (recent.length === 0) return 30 * 60 * 1000;
    return recent.reduce((a, e) => a + (e.end - e.start), 0) / recent.length;
  }, [entries]);

  const target = settings.target;
  const usedToday = entries.length;
  const isActive = activeStart != null;
  const cutoffMs = cutoffTimestamp(dateStr, settings.cutoff);
  const { nextAllowed, spacingStart, gapMs } = computeSchedule(entries, target, cutoffMs);

  let state;
  if (isActive) state = 'active';
  else if (usedToday === 0) state = 'first';
  else if (now >= nextAllowed) state = usedToday >= target ? 'atTarget' : 'ready';
  else state = 'waiting';

  const elapsedActive = isActive ? (now - activeStart) / 1000 : 0;
  const countdown = nextAllowed ? Math.max(0, (nextAllowed - now) / 1000) : 0;
  const spacingTotal = spacingStart && nextAllowed ? nextAllowed - spacingStart : 0;
  const waitFraction = spacingTotal > 0 ? Math.min(1, Math.max(0, (now - spacingStart) / spacingTotal)) : 0;
  const activeFraction = Math.min(1, (elapsedActive * 1000) / avgDurationMs);

  let ringColor, ringFraction, centerLabel, centerSub;
  if (state === 'active') {
    ringColor = '#c2410c';
    ringFraction = Math.max(0.06, activeFraction);
    centerLabel = formatDuration(elapsedActive);
    centerSub = 'in';
  } else if (state === 'waiting') {
    ringColor = usedToday >= target ? '#dc2626' : '#d97706';
    ringFraction = Math.max(0.06, waitFraction);
    centerLabel = formatDuration(countdown);
    centerSub = usedToday >= target ? 'past target' : 'until next';
  } else if (state === 'ready') {
    ringColor = '#059669';
    ringFraction = 1;
    centerLabel = 'Ready';
    centerSub = `#${usedToday + 1} of ${target}`;
  } else if (state === 'atTarget') {
    ringColor = '#dc2626';
    ringFraction = 1;
    centerLabel = `${usedToday}/${target}`;
    centerSub = usedToday === target ? 'target reached' : 'past target';
  } else {
    ringColor = '#475569';
    ringFraction = 1;
    centerLabel = 'Start';
    centerSub = 'first of the day';
  }

  const R = 100;
  const C = 2 * Math.PI * R;

  const buttonTone = isActive
    ? 'bg-orange-700 active:bg-orange-600'
    : state === 'waiting' || state === 'atTarget'
      ? 'bg-neutral-800 active:bg-neutral-700 text-slate-300'
      : 'bg-emerald-700 active:bg-emerald-600';

  const buttonText = isActive
    ? 'Finished'
    : usedToday === 0
      ? 'Log first Zyn'
      : state === 'waiting'
        ? 'Take one early'
        : state === 'atTarget'
          ? 'Take another'
          : 'Take one';

  const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500';

  return (
    <main className="safe-area min-h-dvh w-full max-w-md mx-auto text-slate-100 select-none">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Zyn tracker</h1>
          <p className="text-xs text-slate-500">
            {usedToday} of {target} today
            {gapMs ? ` · aiming ${formatGapShort(gapMs)} apart` : ''}
          </p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className={`w-11 h-11 flex items-center justify-center rounded-full bg-neutral-900 active:bg-neutral-800 ${focusRing}`}
          aria-label="Settings"
          aria-expanded={showSettings}
        >
          <Settings2 size={18} className="text-slate-400" />
        </button>
      </div>

      {notice && (
        <p
          role="status"
          className={`mb-4 text-xs rounded-md px-3 py-2 ${
            notice.tone === 'error' ? 'text-red-300 bg-red-950/60' : 'text-emerald-300 bg-emerald-950/60'
          }`}
        >
          {notice.text}
        </p>
      )}

      {showSettings && (
        <section className="mb-5 bg-neutral-900 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Daily target</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateSettings({ target: Math.max(1, target - 1) })}
                className={`w-10 h-10 flex items-center justify-center rounded-full bg-neutral-800 active:bg-neutral-700 ${focusRing}`}
                aria-label="Lower daily target"
              >
                <Minus size={16} />
              </button>
              <span className="w-6 text-center font-mono" aria-live="polite">
                {target}
              </span>
              <button
                onClick={() => updateSettings({ target: Math.min(40, target + 1) })}
                className={`w-10 h-10 flex items-center justify-center rounded-full bg-neutral-800 active:bg-neutral-700 ${focusRing}`}
                aria-label="Raise daily target"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-300" htmlFor="cutoff">
              Last one by
            </label>
            <input
              id="cutoff"
              type="time"
              value={settings.cutoff}
              onChange={(e) => e.target.value && updateSettings({ cutoff: e.target.value })}
              className={`bg-neutral-800 text-slate-100 text-base rounded-md px-3 py-1.5 border-none ${focusRing}`}
            />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your remaining Zyns get spread evenly between the last one and your cutoff, recalculated each time you log
            one. Your day resets at 5am, so a cutoff after midnight still counts as the same night.
          </p>
          <div className="border-t border-neutral-800 pt-4">
            <p className="text-xs text-slate-500 mb-3">
              Your data only lives on this phone. Save a backup every week or two in case you switch phones.
            </p>
            <div className="flex gap-2">
              <button
                onClick={exportBackup}
                className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-neutral-800 active:bg-neutral-700 text-sm ${focusRing}`}
              >
                <Download size={15} /> Export backup
              </button>
              <button
                onClick={() => fileInput.current?.click()}
                className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-neutral-800 active:bg-neutral-700 text-sm ${focusRing}`}
              >
                <Upload size={15} /> Restore
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={importBackup}
              />
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col items-center py-2">
        <svg
          width="240"
          height="240"
          viewBox="0 0 240 240"
          role="img"
          aria-label={`${centerLabel}, ${centerSub}`}
        >
          <circle cx="120" cy="120" r={R} fill="none" stroke="#1e293b" strokeWidth="12" />
          <circle
            cx="120"
            cy="120"
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${C * ringFraction} ${C}`}
            transform="rotate(-90 120 120)"
            style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
          />
          <text
            x="120"
            y="118"
            textAnchor="middle"
            fontSize="32"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="#f1f5f9"
          >
            {centerLabel}
          </text>
          <text x="120" y="146" textAnchor="middle" fontSize="14" fill="#64748b">
            {centerSub}
          </text>
        </svg>

        <button
          onClick={isActive ? finishZyn : startZyn}
          className={`mt-4 w-full max-w-xs flex items-center justify-center gap-2 h-14 rounded-full font-medium text-base text-white transition-colors ${focusRing} ${buttonTone}`}
        >
          {isActive ? <Square size={18} /> : <Play size={18} />}
          {buttonText}
        </button>

        {isActive && (
          <button onClick={cancelActive} className="mt-3 py-2 text-sm text-slate-500 active:text-slate-300">
            Cancel, started by mistake
          </button>
        )}

        {state === 'waiting' && (
          <p className="text-sm text-slate-500 mt-4 text-center px-4">
            Next one lands around {formatClock(nextAllowed)}. Going early just re-spaces the rest of the day.
          </p>
        )}
        {state === 'atTarget' && (
          <p className="text-sm text-slate-500 mt-4 text-center px-4">
            You've hit today's target. Anything more still gets logged, since honest data is more useful.
          </p>
        )}
      </section>

      <section className="mt-5 border-t border-neutral-900 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">Today</h2>
          {entries.length > 0 && (
            <button
              onClick={undoLast}
              className="text-sm text-slate-500 active:text-slate-300 flex items-center gap-1 py-1"
            >
              <Undo2 size={14} /> Undo last
            </button>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing logged yet today.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e, i) => {
              const gapFromPrev = i > 0 ? e.start - entries[i - 1].end : null;
              return (
                <li key={e.start} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 w-8">#{i + 1}</span>
                  <span className="font-mono text-slate-300 flex-1">{formatClock(e.start)}</span>
                  <span className="text-slate-600 text-xs w-20 text-right">
                    {formatDuration((e.end - e.start) / 1000)} in
                  </span>
                  <span className="text-slate-600 text-xs w-16 text-right">
                    {gapFromPrev != null ? `+${formatGapShort(gapFromPrev)}` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-5 border-t border-neutral-900 pt-3">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-slate-500 active:text-slate-300 py-1"
          aria-expanded={showHistory}
        >
          <History size={15} />
          Last 7 days
          {showHistory ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {showHistory && (
          <div className="mt-3 space-y-2">
            {!history || history.length === 0 ? (
              <p className="text-xs text-slate-600">No history yet. Log one and it'll show up here.</p>
            ) : (
              history.map((row) => {
                const rowTarget = row.target ?? target;
                const frac = Math.min(1, row.count / Math.max(1, rowTarget));
                const over = row.count > rowTarget;
                return (
                  <div key={row.date} className="flex items-center gap-2 text-xs">
                    <span className="w-11 text-slate-500 font-mono">{row.date.slice(5)}</span>
                    <div className="flex-1 h-2 bg-neutral-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${over ? 'bg-red-600' : 'bg-emerald-600'}`}
                        style={{ width: `${Math.round(frac * 100)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-slate-400 font-mono">
                      {row.count}/{rowTarget}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>
    </main>
  );
}
