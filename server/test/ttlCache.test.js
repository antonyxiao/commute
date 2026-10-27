const test = require('node:test');
const assert = require('node:assert/strict');

const { TtlCache } = require('../src/utils/ttlCache');

function createClock() {
  let current = 0;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

test('entries expire after their TTL', () => {
  const clock = createClock();
  const cache = new TtlCache({ ttl: 100, now: clock.now });

  cache.set('a', 1);
  assert.equal(cache.get('a'), 1);

  clock.advance(99);
  assert.equal(cache.get('a'), 1);

  clock.advance(2);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.size, 0);
});

test('per-entry TTL overrides the default', () => {
  const clock = createClock();
  const cache = new TtlCache({ ttl: 100, now: clock.now });

  cache.set('short', 1, 10);
  cache.set('long', 2, 1000);

  clock.advance(20);
  assert.equal(cache.get('short'), undefined);
  assert.equal(cache.get('long'), 2);
});

test('least recently used entries are evicted when full', () => {
  const clock = createClock();
  const cache = new TtlCache({ ttl: 1000, max: 2, now: clock.now });

  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1); // a is now most recently used

  cache.set('c', 3);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.size, 2);
});

test('set replaces existing values without growing', () => {
  const clock = createClock();
  const cache = new TtlCache({ ttl: 1000, max: 2, now: clock.now });

  cache.set('a', 1);
  cache.set('a', 2);
  assert.equal(cache.get('a'), 2);
  assert.equal(cache.size, 1);
});
