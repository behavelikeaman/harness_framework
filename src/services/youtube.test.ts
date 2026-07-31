import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearCache } from "@/lib/cache";
import {
  YoutubeError,
  fetchRecentVideos,
  resolveChannel,
} from "@/services/youtube";

const originalKey = process.env.YOUTUBE_API_KEY;

/** fetch 스텁이 돌려줄 Response 대역. 실제 네트워크는 절대 타지 않는다. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function channelResponse(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: "UC1234567890123456789012",
        snippet: {
          title: "데일리 바이럴",
          customUrl: "@dailyviral",
          thumbnails: { medium: { url: "https://img/medium.jpg" } },
        },
        statistics: { subscriberCount: "120000", videoCount: "342" },
        contentDetails: {
          relatedPlaylists: { uploads: "UU1234567890123456789012" },
        },
        ...overrides,
      },
    ],
  };
}

function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

/** 스텁된 fetch가 호출된 모든 URL. */
function calledUrls(): string[] {
  return fetchMock().mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  clearCache();
  process.env.YOUTUBE_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) {
    delete process.env.YOUTUBE_API_KEY;
  } else {
    process.env.YOUTUBE_API_KEY = originalKey;
  }
});

describe("resolveChannel", () => {
  it("@handle 입력은 forHandle 파라미터로 channels.list를 호출한다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    await resolveChannel("@dailyviral");

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const url = new URL(calledUrls()[0]);
    expect(url.pathname).toBe("/youtube/v3/channels");
    expect(url.searchParams.get("forHandle")).toBe("@dailyviral");
    expect(url.searchParams.get("id")).toBeNull();
    expect(url.searchParams.get("part")).toBe(
      "snippet,statistics,contentDetails",
    );
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("@ 없는 handle 입력에도 @를 붙여 forHandle로 호출한다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    await resolveChannel("dailyviral");

    expect(new URL(calledUrls()[0]).searchParams.get("forHandle")).toBe(
      "@dailyviral",
    );
  });

  it("UC로 시작하는 24자 ID 입력은 id 파라미터로 호출한다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    await resolveChannel("UC1234567890123456789012");

    const url = new URL(calledUrls()[0]);
    expect(url.searchParams.get("id")).toBe("UC1234567890123456789012");
    expect(url.searchParams.get("forHandle")).toBeNull();
  });

  it("핸들 URL에서 handle을 추출한다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    await resolveChannel("https://www.youtube.com/@dailyviral");

    expect(new URL(calledUrls()[0]).searchParams.get("forHandle")).toBe(
      "@dailyviral",
    );
  });

  it("채널 URL에서 UC ID를 추출한다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    await resolveChannel(
      "https://youtube.com/channel/UC1234567890123456789012/videos",
    );

    const url = new URL(calledUrls()[0]);
    expect(url.searchParams.get("id")).toBe("UC1234567890123456789012");
    expect(url.searchParams.get("forHandle")).toBeNull();
  });

  it("응답을 ChannelSummary로 정규화한다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    await expect(resolveChannel("@dailyviral")).resolves.toEqual({
      id: "UC1234567890123456789012",
      title: "데일리 바이럴",
      handle: "@dailyviral",
      thumbnailUrl: "https://img/medium.jpg",
      subscriberCount: 120000,
      videoCount: 342,
      uploadsPlaylistId: "UU1234567890123456789012",
    });
  });

  it("구독자 비공개 채널은 subscriberCount가 0이 된다", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(channelResponse({ statistics: { videoCount: "12" } })),
    );

    const channel = await resolveChannel("@dailyviral");
    expect(channel.subscriberCount).toBe(0);
    expect(channel.videoCount).toBe(12);
  });

  it("items가 비어 있으면 kind가 not_found인 YoutubeError를 던진다", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ items: [] }));

    await expect(resolveChannel("@nobody")).rejects.toMatchObject({
      name: "YoutubeError",
      kind: "not_found",
    });
    await expect(resolveChannel("@nobody")).rejects.toBeInstanceOf(YoutubeError);
  });

  it("HTTP 403이면 kind가 quota인 YoutubeError를 던진다", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: {} }, 403));

    await expect(resolveChannel("@dailyviral")).rejects.toMatchObject({
      kind: "quota",
    });
  });

  it("HTTP 404면 kind가 not_found다", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: {} }, 404));

    await expect(resolveChannel("@dailyviral")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("그 외 비정상 응답은 kind가 unknown이다", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: {} }, 500));

    await expect(resolveChannel("@dailyviral")).rejects.toMatchObject({
      kind: "unknown",
    });
  });

  it("fetch가 reject해도 kind가 unknown인 YoutubeError로 감싼다", async () => {
    fetchMock().mockRejectedValue(
      new Error("connect ECONNREFUSED https://www.googleapis.com/?key=REAL"),
    );

    await expect(resolveChannel("@dailyviral")).rejects.toMatchObject({
      kind: "unknown",
    });
  });

  it("에러 메시지에 요청 URL과 API 키를 담지 않는다", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: {} }, 403));

    const error = await resolveChannel("@dailyviral").catch(
      (e: unknown) => e as YoutubeError,
    );

    expect(error.message).not.toContain("test-key");
    expect(error.message).not.toContain("key=");
    expect(error.message).not.toContain("googleapis.com");
    expect(String(error.stack)).not.toContain("test-key");
  });

  it("같은 입력을 두 번 호출하면 캐시가 fetch를 흡수한다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    const first = await resolveChannel("@dailyviral");
    const second = await resolveChannel("@dailyviral");

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("동일 채널을 가리키는 다른 표기(URL, 대소문자)도 같은 캐시를 쓴다", async () => {
    fetchMock().mockResolvedValue(jsonResponse(channelResponse()));

    await resolveChannel("@dailyviral");
    await resolveChannel("https://www.youtube.com/@DailyViral");

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("빈 입력은 fetch 없이 not_found로 거절한다", async () => {
    await expect(resolveChannel("   ")).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe("fetchRecentVideos", () => {
  const playlistPayload = {
    items: [
      { contentDetails: { videoId: "vid1" } },
      { contentDetails: { videoId: "vid2" } },
    ],
  };

  const videosPayload = {
    items: [
      {
        id: "vid1",
        snippet: {
          title: "롱폼 영상",
          publishedAt: "2026-07-01T00:00:00Z",
          thumbnails: {
            medium: { url: "https://img/vid1-medium.jpg" },
            default: { url: "https://img/vid1-default.jpg" },
          },
          tags: ["viral", "growth"],
        },
        statistics: { viewCount: "150000", likeCount: "4200", commentCount: "310" },
        contentDetails: { duration: "PT12M30S" },
      },
      {
        id: "vid2",
        snippet: {
          title: "쇼츠",
          publishedAt: "2026-07-10T00:00:00Z",
          thumbnails: { default: { url: "https://img/vid2-default.jpg" } },
        },
        statistics: { viewCount: "900000" },
        contentDetails: { duration: "PT45S" },
      },
    ],
  };

  it("playlistItems → videos 순으로 정확히 2회 호출한다", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(playlistPayload))
      .mockResolvedValueOnce(jsonResponse(videosPayload));

    await fetchRecentVideos("UU1234567890123456789012");

    expect(fetchMock()).toHaveBeenCalledTimes(2);

    const playlistUrl = new URL(calledUrls()[0]);
    expect(playlistUrl.pathname).toBe("/youtube/v3/playlistItems");
    expect(playlistUrl.searchParams.get("part")).toBe("contentDetails");
    expect(playlistUrl.searchParams.get("playlistId")).toBe(
      "UU1234567890123456789012",
    );
    expect(playlistUrl.searchParams.get("maxResults")).toBe("50");

    const videosUrl = new URL(calledUrls()[1]);
    expect(videosUrl.pathname).toBe("/youtube/v3/videos");
    expect(videosUrl.searchParams.get("part")).toBe(
      "snippet,statistics,contentDetails",
    );
    expect(videosUrl.searchParams.get("id")).toBe("vid1,vid2");
  });

  it("maxResults는 API 상한인 50을 넘지 않는다", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValue(jsonResponse(videosPayload));

    await fetchRecentVideos("UUxyz");

    const maxResults = Number(
      new URL(calledUrls()[0]).searchParams.get("maxResults"),
    );
    expect(maxResults).toBeLessThanOrEqual(50);
  });

  it("응답을 VideoStats로 정규화한다", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(playlistPayload))
      .mockResolvedValueOnce(jsonResponse(videosPayload));

    const videos = await fetchRecentVideos("UU1234567890123456789012");

    expect(videos[0]).toEqual({
      id: "vid1",
      title: "롱폼 영상",
      publishedAt: "2026-07-01T00:00:00Z",
      viewCount: 150000,
      likeCount: 4200,
      commentCount: 310,
      durationSeconds: 750,
      thumbnailUrl: "https://img/vid1-medium.jpg",
      tags: ["viral", "growth"],
    });
  });

  it("likeCount·commentCount 필드가 없으면 0으로 채운다", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(playlistPayload))
      .mockResolvedValueOnce(jsonResponse(videosPayload));

    const videos = await fetchRecentVideos("UU1234567890123456789012");

    expect(videos[1].likeCount).toBe(0);
    expect(videos[1].commentCount).toBe(0);
    expect(videos[1].viewCount).toBe(900000);
  });

  it("medium 썸네일이 없으면 default로 폴백하고, tags가 없으면 빈 배열이다", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(playlistPayload))
      .mockResolvedValueOnce(jsonResponse(videosPayload));

    const videos = await fetchRecentVideos("UU1234567890123456789012");

    expect(videos[1].thumbnailUrl).toBe("https://img/vid2-default.jpg");
    expect(videos[1].tags).toEqual([]);
    expect(videos[1].durationSeconds).toBe(45);
  });

  it("videoId가 0개면 videos.list를 호출하지 않고 빈 배열을 반환한다", async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ items: [] }));

    await expect(fetchRecentVideos("UUempty")).resolves.toEqual([]);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("같은 재생목록을 두 번 조회하면 캐시가 fetch를 흡수한다", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(playlistPayload))
      .mockResolvedValueOnce(jsonResponse(videosPayload));

    await fetchRecentVideos("UU1234567890123456789012");
    await fetchRecentVideos("UU1234567890123456789012");

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("HTTP 403이면 kind가 quota다", async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ error: {} }, 403));

    await expect(fetchRecentVideos("UUxyz")).rejects.toMatchObject({
      kind: "quota",
    });
  });
});

describe("quota 규칙 (ADR-003)", () => {
  it("채널 1회 분석은 정확히 3 units — channels 1 + playlistItems 1 + videos 1", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(channelResponse()))
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ contentDetails: { videoId: "vid1" } }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "vid1",
              snippet: { title: "t", publishedAt: "2026-07-01T00:00:00Z" },
              statistics: { viewCount: "10" },
              contentDetails: { duration: "PT1M" },
            },
          ],
        }),
      );

    const channel = await resolveChannel("@dailyviral");
    await fetchRecentVideos(channel.uploadsPlaylistId);

    expect(fetchMock()).toHaveBeenCalledTimes(3);
    expect(calledUrls().map((url) => new URL(url).pathname)).toEqual([
      "/youtube/v3/channels",
      "/youtube/v3/playlistItems",
      "/youtube/v3/videos",
    ]);
  });

  it("어떤 호출 URL에도 search가 등장하지 않는다 (search.list 금지)", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(channelResponse()))
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ contentDetails: { videoId: "vid1" } }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    const channel = await resolveChannel("https://www.youtube.com/@dailyviral");
    await fetchRecentVideos(channel.uploadsPlaylistId);

    expect(calledUrls().length).toBeGreaterThan(0);
    for (const url of calledUrls()) {
      expect(url).not.toContain("search");
    }
  });
});
