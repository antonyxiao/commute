const VANCOUVER_TZ = 'America/Vancouver';

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VANCOUVER_TZ,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VANCOUVER_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Minutes since midnight in Victoria (the agency timezone), regardless of the
 * device's own timezone.
 */
export function getNowMinutes(date = new Date()) {
  const parts = clockFormatter.formatToParts(date);
  const hours = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minutes = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hours * 60 + minutes;
}

export function getVancouverDateKey(date = new Date()) {
  const parts = dateKeyFormatter.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

/** Parses "HH:MM" (or "H:MM") into minutes; returns -1 when invalid. */
export function parseClock(value) {
  if (!value || typeof value !== 'string') return -1;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

export function formatClock(minutes) {
  if (!Number.isFinite(minutes)) return '--:--';
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The best known clock time for an arrival row. */
export function arrivalMinutes(arrival) {
  return parseClock(arrival?.real_time_arrival || arrival?.arrival_time);
}

/**
 * Service-day minutes used for ordering. The server includes `sortTime`, which
 * correctly handles GTFS times past 24:00 (e.g. 25:05 stays after 23:55).
 */
export function arrivalSortMinutes(arrival) {
  const sortTime = Number(arrival?.sortTime);
  return Number.isFinite(sortTime) ? sortTime : arrivalMinutes(arrival);
}

/** Human countdown such as "Now", "4 min", "1 h 12". */
export function formatCountdown(minutesAhead) {
  if (!Number.isFinite(minutesAhead)) return '--';
  if (minutesAhead < 1) return 'Now';
  if (minutesAhead < 60) return `${Math.round(minutesAhead)} min`;
  const hours = Math.floor(minutesAhead / 60);
  const mins = Math.round(minutesAhead % 60);
  return mins === 0 ? `${hours} h` : `${hours} h ${String(mins).padStart(2, '0')}`;
}

export function formatDelay(delayMinutes) {
  if (delayMinutes === null || delayMinutes === undefined) return null;
  if (delayMinutes === 0) return 'On time';
  return delayMinutes > 0 ? `+${delayMinutes} min` : `${delayMinutes} min`;
}

export function formatDateLabel(date) {
  if (!date) return 'Today';
  const today = getVancouverDateKey();
  const selected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

  if (selected === today) return 'Today';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = getVancouverDateKey(tomorrow);
  if (selected === tomorrowKey) return 'Tomorrow';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatUpdatedAgo(timestamp, now = Date.now()) {
  if (!timestamp) return 'Updating…';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 15) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ago`;
}

export function formatStopNumber(stop) {
  if (!stop) return '';
  return stop.stop_code || stop.platform_code || stop.stop_id || '';
}

export function normalizeColor(color, fallback = '2563EB') {
  if (typeof color !== 'string' || color.length === 0) return fallback;
  return color.replace(/^#/, '');
}
