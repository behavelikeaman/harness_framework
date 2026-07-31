import { describe, expect, it } from "vitest";

import { median, parseISO8601Duration, scoreVideos } from "@/lib/viral-score";
import type { VideoStats } from "@/types/youtube";

const NOW = new Date("2026-07-31T00:00:00.000Z");

function video(overrides: Partial<VideoStats> & { id: string }): VideoStats {
  return {
    title: `video ${overrides.id}`,
    publishedAt: "2026-07-21T00:00:00.000Z", // NOW 기준 10일 전
    viewCount: 1_000,
    likeCount: 50,
    commentCount: 10,
    durationSeconds: 600,
    thumbnailUrl: `https://i.ytimg.com/vi/${overrides.id}/hqdefault.jpg`,
    tags: [],
    ...overrides,
  };
}

describe("parseISO8601Duration", () => {
  it("초 단위 형식을 변환한다", () => {
    expect(parseISO8601Duration("PT45S")).toBe(45);
  });

  it("시·분·초 복합 형식을 변환한다", () => {
    expect(parseISO8601Duration("PT1H2M3S")).toBe(3723);
  });

  it("분 단위만 있는 형식을 변환한다", () => {
    expect(parseISO8601Duration("PT10M")).toBe(600);
  });

  it("일 단위가 포함된 형식을 변환한다", () => {
    expect(parseISO8601Duration("P1DT2H")).toBe(93_600);
  });

  it("파싱 불가 입력은 throw하지 않고 0을 반환한다", () => {
    expect(parseISO8601Duration("not-a-duration")).toBe(0);
    expect(parseISO8601Duration("")).toBe(0);
    expect(parseISO8601Duration("P")).toBe(0);
    expect(parseISO8601Duration("PT")).toBe(0);
  });
});

describe("median", () => {
  it("빈 배열은 0을 반환한다", () => {
    expect(median([])).toBe(0);
  });

  it("홀수 길이는 가운데 값을 반환한다", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("짝수 길이는 가운데 두 값의 평균을 반환한다", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const values = [5, 1, 3];
    median(values);
    expect(values).toEqual([5, 1, 3]);
  });
});

describe("scoreVideos", () => {
  it("빈 배열은 빈 배열을 반환한다", () => {
    expect(scoreVideos([], NOW)).toEqual([]);
  });

  it("영상이 1건이면 performanceRatio가 1이고 viralScore가 유한값이다", () => {
    const [scored] = scoreVideos([video({ id: "a" })], NOW);
    expect(scored.performanceRatio).toBe(1);
    expect(Number.isFinite(scored.viralScore)).toBe(true);
  });

  it("viewCount가 0이면 engagementRate가 0이고 NaN이 생기지 않는다", () => {
    const scored = scoreVideos(
      [
        video({ id: "zero", viewCount: 0, likeCount: 0, commentCount: 0 }),
        video({ id: "b", viewCount: 2_000 }),
      ],
      NOW,
    );
    const zero = scored.find((v) => v.id === "zero")!;
    expect(zero.engagementRate).toBe(0);
    expect(Number.isNaN(zero.performanceRatio)).toBe(false);
    expect(Number.isNaN(zero.velocity)).toBe(false);
    expect(Number.isNaN(zero.viralScore)).toBe(false);
  });

  it("60초 이하만 Shorts로 판정한다", () => {
    const scored = scoreVideos(
      [
        video({ id: "short", durationSeconds: 60 }),
        video({ id: "long", durationSeconds: 61 }),
        video({ id: "unknown", durationSeconds: 0 }),
      ],
      NOW,
    );
    expect(scored.find((v) => v.id === "short")!.isShort).toBe(true);
    expect(scored.find((v) => v.id === "long")!.isShort).toBe(false);
    expect(scored.find((v) => v.id === "unknown")!.isShort).toBe(false);
  });

  it("롱폼의 performanceRatio는 Shorts 조회수에 영향받지 않는다", () => {
    const longform = [
      video({ id: "l1", durationSeconds: 600, viewCount: 1_000 }),
      video({ id: "l2", durationSeconds: 600, viewCount: 2_000 }),
      video({ id: "l3", durationSeconds: 600, viewCount: 9_000 }),
    ];
    const shorts = (multiplier: number) => [
      video({ id: "s1", durationSeconds: 30, viewCount: 50_000 * multiplier }),
      video({ id: "s2", durationSeconds: 30, viewCount: 80_000 * multiplier }),
    ];

    const ratios = (multiplier: number) =>
      scoreVideos([...longform, ...shorts(multiplier)], NOW)
        .filter((v) => !v.isShort)
        .map((v) => [v.id, v.performanceRatio] as const)
        .sort();

    expect(ratios(1)).toEqual(ratios(10));
    // 롱폼 중앙값은 2000 → 9000짜리는 4.5배
    const l3 = scoreVideos([...longform, ...shorts(1)], NOW).find(
      (v) => v.id === "l3",
    )!;
    expect(l3.performanceRatio).toBe(4.5);
  });

  it("performanceRatio는 평균이 아닌 중앙값을 기준선으로 쓴다", () => {
    // 평균(2825) 기준이면 1000짜리 영상의 ratio는 0.35, 중앙값(1000) 기준이면 1
    const scored = scoreVideos(
      [
        video({ id: "a", viewCount: 500 }),
        video({ id: "b", viewCount: 1_000 }),
        video({ id: "c", viewCount: 1_000 }),
        video({ id: "d", viewCount: 100_000 }),
      ],
      NOW,
    );
    expect(scored.find((v) => v.id === "b")!.performanceRatio).toBe(1);
  });

  it("중앙값이 0이면 performanceRatio를 0으로 둔다", () => {
    const scored = scoreVideos(
      [
        video({ id: "a", viewCount: 0 }),
        video({ id: "b", viewCount: 0 }),
        video({ id: "c", viewCount: 100 }),
      ],
      NOW,
    );
    for (const v of scored) {
      expect(v.performanceRatio).toBe(0);
    }
  });

  it("velocity는 경과일수로 나눈 값이고 미래 날짜는 1일로 취급한다", () => {
    const scored = scoreVideos(
      [
        video({
          id: "past",
          viewCount: 1_000,
          publishedAt: "2026-07-21T00:00:00.000Z",
        }),
        video({
          id: "future",
          viewCount: 500,
          publishedAt: "2026-08-10T00:00:00.000Z",
        }),
        video({
          id: "today",
          viewCount: 300,
          publishedAt: "2026-07-31T00:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(scored.find((v) => v.id === "past")!.velocity).toBe(100);
    expect(scored.find((v) => v.id === "future")!.velocity).toBe(500);
    expect(scored.find((v) => v.id === "today")!.velocity).toBe(300);
  });

  it("engagementRate는 (좋아요 + 댓글) ÷ 조회수다", () => {
    const [scored] = scoreVideos(
      [video({ id: "a", viewCount: 1_000, likeCount: 80, commentCount: 20 })],
      NOW,
    );
    expect(scored.engagementRate).toBeCloseTo(0.1, 10);
  });

  it("모든 viralScore가 0 이상 100 이하의 유한값이다", () => {
    const scored = scoreVideos(
      [
        video({ id: "a", viewCount: 0, likeCount: 0, commentCount: 0 }),
        video({ id: "b", viewCount: 1_000_000, likeCount: 900_000, commentCount: 500_000 }),
        video({ id: "c", durationSeconds: 20, viewCount: 12 }),
        video({ id: "d", durationSeconds: 45, viewCount: 3_000_000 }),
        video({
          id: "e",
          publishedAt: "2026-08-30T00:00:00.000Z",
          viewCount: 42,
        }),
        video({ id: "f", publishedAt: "not-a-date", viewCount: 42 }),
      ],
      NOW,
    );
    for (const v of scored) {
      expect(Number.isFinite(v.viralScore)).toBe(true);
      expect(v.viralScore).toBeGreaterThanOrEqual(0);
      expect(v.viralScore).toBeLessThanOrEqual(100);
    }
  });

  it("viralScore 내림차순으로 정렬해 반환한다", () => {
    const scored = scoreVideos(
      [
        video({ id: "low", viewCount: 100 }),
        video({ id: "high", viewCount: 100_000 }),
        video({ id: "mid", viewCount: 5_000 }),
      ],
      NOW,
    );
    const scores = scored.map((v) => v.viralScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(scored[0].id).toBe("high");
  });

  it("입력 배열을 변경하지 않는다", () => {
    const input = [video({ id: "a" }), video({ id: "b", viewCount: 9_000 })];
    const snapshot = JSON.parse(JSON.stringify(input));
    scoreVideos(input, NOW);
    expect(input).toEqual(snapshot);
  });
});
