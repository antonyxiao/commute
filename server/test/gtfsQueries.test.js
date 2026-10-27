const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTripsAtStopQuery } = require('../src/services/gtfsQueries');

test('builds a parameterized query for the given weekday column', () => {
  const query = buildTripsAtStopQuery('monday');

  assert.match(query, /c\.monday = 1/);
  assert.match(query, /st\.stop_id = \?/);
  assert.match(query, /cd\.date = \?/);
  assert.match(query, /c\.start_date <= \?/);
});

test('rejects an unknown weekday column', () => {
  assert.throws(() => buildTripsAtStopQuery('monday; DROP TABLE trips'), /Invalid service day/);
  assert.throws(() => buildTripsAtStopQuery(''), /Invalid service day/);
});

test('never interpolates the stop id or date', () => {
  const query = buildTripsAtStopQuery('friday');
  assert.doesNotMatch(query, /100002|20261025/);
});
