/**
 * 순수 스코어링 레이어. I/O가 없고 `Date.now()`도 직접 부르지 않는다.
 * 현재 시각은 `now` 파라미터로 주입받아 테스트가 시간에 따라 깨지지 않게 한다.
 */

import type { ScoredVideo } from "@/types/analysis";
import type { VideoStats } from "@/types/youtube";

/** Shorts 판정 상한(초). */
const SHORT_MAX_SECONDS = 60;

/** 참여율 정규화 반감점 — 참여율 5%에서 0.5가 된다. */
const ENGAGEMENT_HALF_POINT = 0.05;

/** viralScore 가중치. 채널 기준선 대비 성과가 가장 크게 작용한다. */
const WEIGHT_PERFORMANCE = 0.5;
const WEIGHT_ENGAGEMENT = 0.3;
const WEIGHT_VELOCITY = 0.2;

const MS_PER_DAY = 86_400_000;

const DURATION_PATTERN =
  /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * YouTube `contentDetails.duration`(`PT1H2M3S`, `PT45S`, `P1DT2H` …)을 초로 바꾼다.
 * 파싱 실패 시 throw하지 않고 0을 반환한다 — 영상 한 편 때문에 분석 전체가 죽으면 안 된다.
 */
export function parseISO8601Duration(iso: string): number {
  if (typeof iso !== "string") return 0;

  const match = DURATION_PATTERN.exec(iso.trim());
  if (!match) return 0;

  const [, weeks, days, hours, minutes, seconds] = match;
  if (
    weeks === undefined &&
    days === undefined &&
    hours === undefined &&
    minutes === undefined &&
    seconds === undefined
  ) {
    // "P", "PT"처럼 단위가 하나도 없는 입력
    return 0;
  }

  const total =
    Number(weeks ?? 0) * 604_800 +
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);

  return Number.isFinite(total) ? total : 0;
}

/** 중앙값. 빈 배열은 0, 짝수 길이는 가운데 두 값의 평균. 원본 배열은 건드리지 않는다. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 0 이상의 값을 [0, 1)로 눌러 담는 포화 곡선. half에서 정확히 0.5가 된다. */
function saturate(value: number, half: number): number {
  if (!Number.isFinite(value) || value <= 0 || half <= 0) return 0;
  return value / (value + half);
}

/** publishedAt ~ now 경과일수. 미래·비정상 날짜는 1일로 취급한다. */
function elapsedDays(publishedAt: string, now: Date): number {
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(published)) return 1;

  const days = (now.getTime() - published) / MS_PER_DAY;
  return Number.isFinite(days) ? Math.max(days, 1) : 1;
}

/** 분모가 0이거나 비정상이면 0. 0으로 나누지 않는다. */
function ratio(value: number, base: number): number {
  if (base <= 0 || !Number.isFinite(base) || !Number.isFinite(value)) return 0;
  return value / base;
}

interface BaseMetrics {
  video: VideoStats;
  isShort: boolean;
  engagementRate: number;
  velocity: number;
}

/**
 * 영상 목록에 viralScore를 매겨 내림차순으로 반환한다.
 *
 * 기준선은 평균이 아닌 **중앙값**이며(ADR-005), Shorts와 롱폼은 조회수 스케일이
 * 근본적으로 달라 각각 별도의 중앙값을 쓴다.
 */
export function scoreVideos(videos: VideoStats[], now: Date = new Date()): ScoredVideo[] {
  if (videos.length === 0) return [];

  const base: BaseMetrics[] = videos.map((video) => {
    const isShort =
      video.durationSeconds > 0 && video.durationSeconds <= SHORT_MAX_SECONDS;
    const engagementRate = ratio(
      video.likeCount + video.commentCount,
      video.viewCount,
    );
    const velocity = video.viewCount / elapsedDays(video.publishedAt, now);

    return {
      video,
      isShort,
      engagementRate,
      velocity: Number.isFinite(velocity) ? velocity : 0,
    };
  });

  // Shorts / 롱폼 기준선을 분리해서 계산한다. 섞으면 롱폼이 전부 저성과로 찍힌다.
  const baseline = (isShort: boolean) => {
    const cohort = base.filter((item) => item.isShort === isShort);
    return {
      views: median(cohort.map((item) => item.video.viewCount)),
      velocity: median(cohort.map((item) => item.velocity)),
    };
  };
  const baselines = { short: baseline(true), long: baseline(false) };

  const scored: ScoredVideo[] = base.map((item) => {
    const cohort = item.isShort ? baselines.short : baselines.long;

    const performanceRatio = ratio(item.video.viewCount, cohort.views);
    const velocityRatio = ratio(item.velocity, cohort.velocity);

    // 세 지표를 각각 [0, 1)로 정규화한 뒤 가중합 → 결과는 항상 [0, 100).
    const score =
      WEIGHT_PERFORMANCE * saturate(performanceRatio, 1) +
      WEIGHT_ENGAGEMENT * saturate(item.engagementRate, ENGAGEMENT_HALF_POINT) +
      WEIGHT_VELOCITY * saturate(velocityRatio, 1);

    return {
      ...item.video,
      tags: [...item.video.tags],
      isShort: item.isShort,
      performanceRatio,
      engagementRate: item.engagementRate,
      velocity: item.velocity,
      viralScore: score * 100,
    };
  });

  return scored.sort((a, b) => b.viralScore - a.viralScore);
}
