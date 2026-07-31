import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearCache, getOrSet } from "@/lib/cache";

const TTL = 600_000;

beforeEach(() => {
  clearCache();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getOrSet", () => {
  it("첫 호출에서 fn을 실행하고 값을 반환한다", async () => {
    const fn = vi.fn(async () => "value");

    await expect(getOrSet("k", TTL, fn)).resolves.toBe("value");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("TTL 안에서는 fn을 다시 실행하지 않는다", async () => {
    const fn = vi.fn(async () => "value");

    await getOrSet("k", TTL, fn);
    vi.advanceTimersByTime(TTL - 1);
    await expect(getOrSet("k", TTL, fn)).resolves.toBe("value");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("TTL이 지나면 fn을 다시 실행한다", async () => {
    let call = 0;
    const fn = vi.fn(async () => `value-${++call}`);

    await getOrSet("k", TTL, fn);
    vi.advanceTimersByTime(TTL + 1);

    await expect(getOrSet("k", TTL, fn)).resolves.toBe("value-2");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("키가 다르면 서로 간섭하지 않는다", async () => {
    await getOrSet("a", TTL, async () => 1);
    await getOrSet("b", TTL, async () => 2);

    await expect(getOrSet("a", TTL, async () => 99)).resolves.toBe(1);
    await expect(getOrSet("b", TTL, async () => 99)).resolves.toBe(2);
  });

  it("fn이 reject하면 에러를 그대로 던진다", async () => {
    await expect(
      getOrSet("k", TTL, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("실패한 결과는 캐싱하지 않는다 — 일시적 장애가 TTL 동안 고정되면 안 된다", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("recovered");

    await expect(getOrSet("k", TTL, fn)).rejects.toThrow("boom");
    await expect(getOrSet("k", TTL, fn)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clearCache는 저장된 항목을 모두 지운다", async () => {
    const fn = vi.fn(async () => "value");

    await getOrSet("k", TTL, fn);
    clearCache();
    await getOrSet("k", TTL, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
