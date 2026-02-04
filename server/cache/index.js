const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const cache = new Map(); // key -> {ts, value}

export function cacheGet(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return v.value;
}

export function cacheSet(key, value) {
  cache.set(key, { ts: Date.now(), value });
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}
