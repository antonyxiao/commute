const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toGTFSDate,
  isValidGTFSDate,
  getDayNameFromGTFSDate,
  getServiceDayColumn,
  timeToMinutes,
  minutesToClock,
  formatGTFSTime,
  getNowMinutesInTimeZone,
  formatTimestamp,
} = require('../src/utils/dateUtils');

test('toGTFSDate uses the Vancouver timezone (PST)', () => {
  assert.equal(toGTFSDate(new Date('2026-01-15T07:59:00Z')), '20260114');
  assert.equal(toGTFSDate(new Date('2026-01-15T08:00:00Z')), '20260115');
});

test('toGTFSDate uses the Vancouver timezone (PDT)', () => {
  assert.equal(toGTFSDate(new Date('2026-07-15T06:59:00Z')), '20260714');
  assert.equal(toGTFSDate(new Date('2026-07-15T07:00:00Z')), '20260715');
});

test('isValidGTFSDate rejects malformed or impossible dates', () => {
  assert.equal(isValidGTFSDate('20261025'), true);
  assert.equal(isValidGTFSDate('20261301'), false);
  assert.equal(isValidGTFSDate('20260231'), false);
  assert.equal(isValidGTFSDate('2026-10-25'), false);
  assert.equal(isValidGTFSDate(null), false);
});

test('getDayNameFromGTFSDate is independent of the server timezone', () => {
  assert.equal(getDayNameFromGTFSDate('20260115'), 'thursday');
  assert.equal(getDayNameFromGTFSDate('20261025'), 'sunday');
  assert.equal(getDayNameFromGTFSDate('bad'), null);
});

test('getServiceDayColumn only allows known weekday columns', () => {
  assert.equal(getServiceDayColumn('monday'), 'monday');
  assert.equal(getServiceDayColumn('monday; DROP TABLE trips'), null);
  assert.equal(getServiceDayColumn(undefined), null);
});

test('timeToMinutes handles extended GTFS hours', () => {
  assert.equal(timeToMinutes('08:07'), 487);
  assert.equal(timeToMinutes('25:05:00'), 1505);
  assert.equal(timeToMinutes(null), -1);
});

test('minutesToClock wraps around midnight and zero-pads', () => {
  assert.equal(minutesToClock(1505), '01:05');
  assert.equal(minutesToClock(1440), '00:00');
  assert.equal(minutesToClock(-5), '23:55');
  assert.equal(minutesToClock(487), '08:07');
});

test('formatGTFSTime normalizes times past 24h', () => {
  assert.equal(formatGTFSTime('25:05:00'), '01:05');
  assert.equal(formatGTFSTime('08:07'), '08:07');
  assert.equal(formatGTFSTime(null), null);
});

test('formatTimestamp renders Vancouver local time in both DST periods', () => {
  assert.equal(formatTimestamp(Date.parse('2026-01-15T20:05:00Z') / 1000), '12:05');
  assert.equal(formatTimestamp(Date.parse('2026-07-15T19:05:00Z') / 1000), '12:05');
});

test('getNowMinutesInTimeZone returns minutes after Vancouver midnight', () => {
  assert.equal(getNowMinutesInTimeZone(new Date('2026-01-15T08:00:00Z')), 0);
  assert.equal(getNowMinutesInTimeZone(new Date('2026-01-15T20:05:00Z')), 12 * 60 + 5);
  assert.equal(getNowMinutesInTimeZone(new Date('2026-07-15T19:05:00Z')), 12 * 60 + 5);
});
