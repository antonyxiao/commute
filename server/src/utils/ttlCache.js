/**
 * Small bounded TTL cache. Prevents the unbounded in-memory caches that used
 * to grow forever with every stop/date combination.
 */
class TtlCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.ttl] Default time-to-live in milliseconds.
   * @param {number} [options.max] Maximum number of entries before eviction.
   * @param {() => number} [options.now] Clock (injectable for tests).
   */
  constructor({ ttl = 10000, max = 1000, now = Date.now } = {}) {
    this.ttl = ttl;
    this.max = max;
    this.now = now;
    this.store = new Map();
  }

  /**
   * @param {string} key
   * @returns {*} The cached value, or undefined when missing/expired.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency so the oldest-used key is evicted first.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl] Optional per-entry TTL.
   */
  set(key, value, ttl = this.ttl) {
    if (this.store.has(key)) this.store.delete(key);

    if (this.store.size >= this.max) {
      // Drop the least recently used entry (Map preserves insertion order).
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }

    this.store.set(key, { value, expiresAt: this.now() + ttl });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { TtlCache };
