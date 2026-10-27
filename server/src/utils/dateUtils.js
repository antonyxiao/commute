const TIME_ZONE = 'America/Vancouver';

// Cached formatters for performance (avoid recreating on every call)
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
});

const DAY_COLUMNS = Object.freeze({
  sunday: 'sunday',
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
});

/**
 * Formats a Date object to YYYYMMDD in the agency's local timezone.
 * @param {Date} date
 * @returns {string}
 */
function toGTFSDate(date) {
  const parts = dateFormatter.formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}${m}${d}`;
}

/**
 * Validates a YYYYMMDD string.
 * @param {string} dateString
 * @returns {boolean}
 */
function isValidGTFSDate(dateString) {
  if (typeof dateString !== 'string' || !/^\d{8}$/.test(dateString)) return false;
  const y = Number(dateString.slice(0, 4));
  const m = Number(dateString.slice(4, 6));
  const d = Number(dateString.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Parses a YYYYMMDD string into a Date (UTC midnight).
 * @param {string} dateString
 * @returns {Date}
 */
function parseGTFSDate(dateString) {
  return new Date(
    Date.UTC(
      Number(dateString.slice(0, 4)),
      Number(dateString.slice(4, 6)) - 1,
      Number(dateString.slice(6, 8))
    )
  );
}

/**
 * Gets the lowercase weekday name for a YYYYMMDD service date.
 * Uses UTC so the result is independent of the server's timezone.
 * @param {string} dateString
 * @returns {string|null}
 */
function getDayNameFromGTFSDate(dateString) {
  if (!isValidGTFSDate(dateString)) return null;
  return weekdayFormatter.format(parseGTFSDate(dateString)).toLowerCase();
}

/**
 * Gets the weekday name (lowercase) from a Date.
 * @param {Date} date
 * @returns {string}
 */
function getDayName(date) {
  return weekdayFormatter.format(date).toLowerCase();
}

/**
 * Returns the calendar.txt column for a weekday, or null if invalid.
 * Only columns in this allow-list may ever be interpolated into SQL.
 * @param {string} dayName
 * @returns {string|null}
 */
function getServiceDayColumn(dayName) {
  return DAY_COLUMNS[dayName] || null;
}

/**
 * Converts HH:MM[:SS] to minutes from midnight.
 * @param {string} timeString
 * @returns {number}
 */
function timeToMinutes(timeString) {
  if (!timeString || typeof timeString !== 'string') return -1;
  const [hours, minutes] = timeString.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return -1;
  return hours * 60 + minutes;
}

/**
 * Formats minutes-from-midnight into a zero-padded 24h clock string.
 * @param {number} minutes
 * @returns {string|null}
 */
function minutesToClock(minutes) {
  if (!Number.isFinite(minutes)) return null;
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats a GTFS time string (which may exceed 24h) into a 24h clock string.
 * e.g. "25:05:00" -> "01:05".
 * @param {string} timeString
 * @returns {string|null}
 */
function formatGTFSTime(timeString) {
  const minutes = timeToMinutes(timeString);
  return minutes < 0 ? null : minutesToClock(minutes);
}

/**
 * Minutes since midnight in the agency timezone.
 * @param {Date} [date]
 * @returns {number}
 */
function getNowMinutesInTimeZone(date = new Date()) {
  const parts = timeFormatter.formatToParts(date);
  const hours = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minutes = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hours * 60 + minutes;
}

/**
 * Formats a Unix timestamp (seconds) to HH:MM in the agency timezone.
 * @param {number} timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  return timeFormatter.format(new Date(timestamp * 1000));
}

module.exports = {
  TIME_ZONE,
  toGTFSDate,
  isValidGTFSDate,
  parseGTFSDate,
  getDayName,
  getDayNameFromGTFSDate,
  getServiceDayColumn,
  timeToMinutes,
  minutesToClock,
  formatGTFSTime,
  getNowMinutesInTimeZone,
  formatTimestamp,
};
