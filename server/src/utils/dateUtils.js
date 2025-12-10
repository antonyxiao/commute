/**
 * Formats a Date object to YYYYMMDD string.
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string.
 */
function toGTFSDate(date) {
    const dateOptions = { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-CA', dateOptions).formatToParts(date);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}${m}${d}`;
}

/**
 * Parses a YYYYMMDD string into a Date object.
 * @param {string} dateString - The YYYYMMDD string.
 * @returns {Date} The Date object.
 */
function parseGTFSDate(dateString) {
    const y = parseInt(dateString.substring(0, 4));
    const m = parseInt(dateString.substring(4, 6)) - 1;
    const d = parseInt(dateString.substring(6, 8));
    return new Date(y, m, d);
}

/**
 * Gets the day name (lowercase) from a Date object.
 * @param {Date} date - The date object.
 * @returns {string} The day name.
 */
function getDayName(date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
}

/**
 * Helper to convert HH:MM to minutes from midnight.
 * @param {string} timeString - The time string (HH:MM or HH:MM:SS).
 * @returns {number} Minutes from midnight.
 */
function timeToMinutes(timeString) {
    if (!timeString) return -1;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

module.exports = {
    toGTFSDate,
    parseGTFSDate,
    getDayName,
    timeToMinutes
};
