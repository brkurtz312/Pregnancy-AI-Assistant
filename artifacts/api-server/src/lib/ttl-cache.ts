/**
 * Minimal in-memory TTL cache with single-flight (in-flight request) dedup.
 *
 * Suitable for values that are identical for every caller, so the cache can
 * safely live in process memory. Under Autoscale (multiple instances), each
 * instance simply warms its own copy independently — there is no correctness
 * issue because every instance would compute the same value anyway.
 */
export class TtlCache<K, V> {
  private readonly store = new Map<K, { value: V; expiresAt: number }>();
  private readonly inFlight = new Map<K, Promise<V>>();

  constructor(private readonly ttlMs: number) {}

  /**
   * Returns the cached value for `key` if present and unexpired. Otherwise runs
   * `producer` to compute it, caches the result, and returns it. Concurrent
   * misses for the same key share a single `producer` call. Failures are not
   * cached, so the next request retries.
   */
  async getOrCompute(
    key: K,
    producer: () => Promise<V>,
  ): Promise<{ value: V; hit: boolean }> {
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { value: cached.value, hit: true };
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return { value: await pending, hit: true };
    }

    const promise = producer()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return { value: await promise, hit: false };
  }
}
