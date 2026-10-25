import NodeCache from 'node-cache';

// Cache resolved IDs for 24 hours
export const idCache = new NodeCache({ stdTTL: 86400 });

// Only non-null results are cached, so failed lookups retry.
export async function cachedRemoteSearch<T>(key: string, search: () => Promise<T | null>): Promise<T | null> {
  const cached = idCache.get<T>(key);
  if (cached) return cached;
  const result = await search();
  if (result) idCache.set(key, result);
  return result;
}
