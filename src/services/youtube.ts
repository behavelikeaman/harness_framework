/**
 * YouTube Data API v3 래퍼. route handler에서만 import한다.
 *
 * quota 규칙(ADR-003): 채널 1회 분석은 `channels.list`(1) + `playlistItems.list`(1) +
 * `videos.list`(1) = 3 units다. `search.list`는 호출당 100 units라 어떤 경우에도 쓰지 않는다.
 */

import { getOrSet } from "@/lib/cache";
import { getYoutubeApiKey } from "@/lib/env";
import { parseISO8601Duration } from "@/lib/viral-score";
import type { ChannelSummary, VideoStats } from "@/types/youtube";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** ADR-002의 10분 TTL. */
const CACHE_TTL_MS = 600_000;

/** `playlistItems.list`의 API 상한. 초과하면 400이다. */
const MAX_RESULTS = 50;

export class YoutubeError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_found" | "quota" | "unknown",
  ) {
    super(message);
    this.name = "YoutubeError";
  }
}

/** 호출 대상 식별자. handle은 `@`가 붙은 형태로 정규화된다. */
type ChannelTarget =
  | { kind: "handle"; value: string }
  | { kind: "id"; value: string };

interface Thumbnails {
  medium?: { url?: string };
  default?: { url?: string };
}

interface ChannelItem {
  id?: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Thumbnails };
  statistics?: { subscriberCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface PlaylistItem {
  contentDetails?: { videoId?: string };
}

interface VideoItem {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    thumbnails?: Thumbnails;
    tags?: string[];
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: { duration?: string };
}

/**
 * API를 호출하고 JSON을 돌려준다.
 *
 * 어떤 에러 경로에서도 요청 URL을 메시지에 담지 않는다 — URL 쿼리에 API 키가 들어 있어
 * 그대로 로그와 API 응답으로 새어 나간다.
 */
async function callApi<T>(
  endpoint: "channels" | "playlistItems" | "videos",
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("key", getYoutubeApiKey());

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    // 원본 예외 메시지에 요청 URL이 포함될 수 있어 삼킨다.
    throw new YoutubeError("YouTube API request failed.", "unknown");
  }

  if (!response.ok) {
    throw new YoutubeError(
      `YouTube API responded with status ${response.status}.`,
      statusToKind(response.status),
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new YoutubeError("YouTube API returned an invalid response.", "unknown");
  }
}

function statusToKind(status: number): YoutubeError["kind"] {
  if (status === 403) return "quota";
  if (status === 404) return "not_found";
  return "unknown";
}

/** URL에서 handle 또는 채널 ID 토큰을 뽑는다. */
function extractFromUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new YoutubeError("Unsupported channel input.", "not_found");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const [first, second] = segments;

  if (first === undefined) {
    throw new YoutubeError("Unsupported channel input.", "not_found");
  }
  if (first === "channel" || first === "c" || first === "user") {
    if (second === undefined) {
      throw new YoutubeError("Unsupported channel input.", "not_found");
    }
    return second;
  }
  return first;
}

/** `@handle` / `handle` / `UC...` / 채널 URL을 단일 호출 대상으로 정규화한다. */
function parseChannelInput(input: string): ChannelTarget {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new YoutubeError("Channel input is empty.", "not_found");
  }

  const token = /^https?:\/\//i.test(trimmed)
    ? extractFromUrl(trimmed)
    : trimmed;

  if (/^UC[\w-]{22}$/.test(token)) {
    return { kind: "id", value: token };
  }

  const handle = token.startsWith("@") ? token : `@${token}`;
  if (handle.length < 2) {
    throw new YoutubeError("Unsupported channel input.", "not_found");
  }
  return { kind: "handle", value: handle };
}

/** 캐시 키. handle은 대소문자를 구분하지 않고, ID는 원문 그대로 쓴다. */
function cacheKeyOf(target: ChannelTarget): string {
  return target.kind === "handle"
    ? `channel:${target.value.toLowerCase()}`
    : `channel:${target.value}`;
}

/** 문자열로 오는 통계값을 숫자로. 필드가 없으면(좋아요 숨김 등) 0. */
function toCount(value: string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickThumbnail(thumbnails: Thumbnails | undefined): string {
  return thumbnails?.medium?.url ?? thumbnails?.default?.url ?? "";
}

function toChannelSummary(item: ChannelItem): ChannelSummary {
  const uploads = item.contentDetails?.relatedPlaylists?.uploads;
  if (!item.id || !uploads) {
    throw new YoutubeError("Channel uploads playlist not found.", "not_found");
  }

  const customUrl = item.snippet?.customUrl;
  const handle = customUrl
    ? customUrl.startsWith("@")
      ? customUrl
      : `@${customUrl}`
    : null;

  return {
    id: item.id,
    title: item.snippet?.title ?? "",
    handle,
    thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
    subscriberCount: toCount(item.statistics?.subscriberCount),
    videoCount: toCount(item.statistics?.videoCount),
    uploadsPlaylistId: uploads,
  };
}

function toVideoStats(item: VideoItem): VideoStats {
  return {
    id: item.id ?? "",
    title: item.snippet?.title ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
    viewCount: toCount(item.statistics?.viewCount),
    likeCount: toCount(item.statistics?.likeCount),
    commentCount: toCount(item.statistics?.commentCount),
    durationSeconds: parseISO8601Duration(item.contentDetails?.duration ?? ""),
    thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
    tags: item.snippet?.tags ?? [],
  };
}

/**
 * 채널 핸들·ID·URL을 `ChannelSummary`로 해석한다. `channels.list` 1회 = 1 unit.
 * 핸들 해석에 `search.list`(100 units)를 쓰지 않고 `forHandle`로 처리한다.
 */
export async function resolveChannel(input: string): Promise<ChannelSummary> {
  const target = parseChannelInput(input);

  return getOrSet(cacheKeyOf(target), CACHE_TTL_MS, async () => {
    const data = await callApi<{ items?: ChannelItem[] }>("channels", {
      part: "snippet,statistics,contentDetails",
      ...(target.kind === "handle"
        ? { forHandle: target.value }
        : { id: target.value }),
    });

    const item = data.items?.[0];
    if (!item) {
      throw new YoutubeError("Channel not found.", "not_found");
    }
    return toChannelSummary(item);
  });
}

/**
 * 업로드 재생목록의 최근 영상 지표를 가져온다.
 * `playlistItems.list`(1 unit) → `videos.list`(1 unit) = 2 units.
 */
export async function fetchRecentVideos(
  uploadsPlaylistId: string,
): Promise<VideoStats[]> {
  return getOrSet(`videos:${uploadsPlaylistId}`, CACHE_TTL_MS, async () => {
    const playlist = await callApi<{ items?: PlaylistItem[] }>("playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(MAX_RESULTS),
    });

    const videoIds = (playlist.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => typeof id === "string" && id !== "")
      .slice(0, MAX_RESULTS);

    // 영상이 없으면 videos.list를 호출하지 않는다 — 빈 조회에 1 unit을 버릴 이유가 없다.
    if (videoIds.length === 0) return [];

    const videos = await callApi<{ items?: VideoItem[] }>("videos", {
      part: "snippet,statistics,contentDetails",
      id: videoIds.join(","),
    });

    return (videos.items ?? []).map(toVideoStats);
  });
}
