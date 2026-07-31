/**
 * 프로세스 메모리 TTL 캐시(ADR-002). DB를 두지 않는 대신 동일 채널 재조회의
 * YouTube 호출만 흡수한다. 프로세스가 죽으면 캐시도 사라지며 그것이 의도된 동작이다.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

/**
 * `key`가 살아 있으면 캐시 값을, 없거나 만료됐으면 `fn()` 결과를 반환하고 저장한다.
 *
 * `fn()`이 reject하면 저장하지 않고 그대로 throw한다 — 에러를 캐싱하면 일시적인
 * 네트워크 장애가 TTL 동안 고정된다.
 */
export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit) {
    if (hit.expiresAt > Date.now()) {
      return hit.value as T;
    }
    store.delete(key);
  }

  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** 저장된 항목을 모두 비운다. 테스트에서 케이스 간 격리를 위해 쓴다. */
export function clearCache(): void {
  store.clear();
}
