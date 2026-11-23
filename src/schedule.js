// Pure date and spacing logic. No React, no storage, so it can be unit-tested.

export const MIN_GAP_MS = 15 * 60 * 1000;
export const FALLBACK_GAP_MS = 60 * 60 * 1000;

// Your "day" runs from 5am to 5am, not midnight to midnight. A Zyn at 1am
// counts toward the night before, which matches how a cutoff like 01:00 works.
export const DAY_ROLLS_AT_HOUR = 5;

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The tracking day a timestamp belongs to, e.g. "2026-11-23". */
export function logicalDateStr(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(d.getHours() - DAY_ROLLS_AT_HOUR);
  return ymd(d);
}

/** The cutoff time on a tracking day. Early-morning cutoffs land on the next calendar day. */
export function cutoffTimestamp(dateStr, cutoffHHMM) {
  const [h, m] = cutoffHHMM.split(':').map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  if (h < DAY_ROLLS_AT_HOUR) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * When the next Zyn is due. Remaining uses are spread evenly between the last
 * one and the cutoff. Once you're at or past target, or past the cutoff, it
 * falls back to the day's nominal gap so the countdown never disappears.
 */
export function computeSchedule(entries, target, cutoffMs) {
  const used = entries.length;
  if (used === 0) return { nextAllowed: null, spacingStart: null, gapMs: null };

  const lastEnd = entries[used - 1].end;
  const firstEnd = entries[0].end;
  const remaining = target - used;

  const nominalGap =
    cutoffMs > firstEnd && target > 1
      ? Math.max(MIN_GAP_MS, (cutoffMs - firstEnd) / (target - 1))
      : FALLBACK_GAP_MS;

  const gapMs =
    remaining >= 1 && cutoffMs > lastEnd
      ? Math.max(MIN_GAP_MS, (cutoffMs - lastEnd) / remaining)
      : nominalGap;

  return { nextAllowed: lastEnd + gapMs, spacingStart: lastEnd, gapMs };
}

export function formatClock(ms) {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}${d.getHours() >= 12 ? 'pm' : 'am'}`;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatGapShort(ms) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
