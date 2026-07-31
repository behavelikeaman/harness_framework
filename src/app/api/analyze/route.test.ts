import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/analyze/route";
import { YoutubeError } from "@/services/youtube";
import type { ChannelAnalysis } from "@/types/analysis";
import type { ChannelSummary, VideoStats } from "@/types/youtube";

/**
 * YouTube 서비스 스텁. `importOriginal`로 `YoutubeError`는 실제 클래스를 유지한 채
 * 네트워크를 타는 두 함수만 갈아 끼운다 — 에러 매핑을 실물 그대로 검증하기 위해서다.
 */
const { resolveChannelMock, fetchRecentVideosMock } = vi.hoisted(() => ({
  resolveChannelMock: vi.fn(),
  fetchRecentVideosMock: vi.fn(),
}));

vi.mock("@/services/youtube", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/youtube")>();
  return {
    ...actual,
    resolveChannel: resolveChannelMock,
    fetchRecentVideos: fetchRecentVideosMock,
  };
});

const channel: ChannelSummary = {
  id: "UC1234567890123456789012",
  title: "데일리 바이럴",
  handle: "@dailyviral",
  thumbnailUrl: "https://img/channel.jpg",
  subscriberCount: 120_000,
  videoCount: 342,
  uploadsPlaylistId: "UU1234567890123456789012",
};

function videoStats(id: string, viewCount: number): VideoStats {
  return {
    id,
    title: `영상 ${id}`,
    publishedAt: "2026-07-01T00:00:00Z",
    viewCount,
    // 참여율을 동일하게 맞춰 조회수 차이만 순위에 반영되게 한다.
    likeCount: Math.round(viewCount * 0.05),
    commentCount: 0,
    durationSeconds: 600,
    thumbnailUrl: `https://img/${id}.jpg`,
    tags: ["태그"],
  };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  resolveChannelMock.mockReset();
  fetchRecentVideosMock.mockReset();
  // 에러 경로 테스트가 서버 로그를 stderr로 쏟지 않게 막는다.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/analyze", () => {
  it("정상 요청이면 200과 viralScore 내림차순 영상 목록을 반환한다", async () => {
    resolveChannelMock.mockResolvedValue(channel);
    fetchRecentVideosMock.mockResolvedValue([
      videoStats("low", 1_000),
      videoStats("high", 100_000),
      videoStats("mid", 5_000),
    ]);

    const response = await post({ channel: "@dailyviral" });
    const body = (await response.json()) as ChannelAnalysis;

    expect(response.status).toBe(200);
    expect(body.channel.id).toBe(channel.id);
    expect(body.videos.map((video) => video.id)).toEqual(["high", "mid", "low"]);
    expect(Date.parse(body.analyzedAt)).not.toBeNaN();

    const scores = body.videos.map((video) => video.viralScore);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it("업로드 재생목록 조회에는 resolveChannel이 돌려준 ID를 쓴다", async () => {
    resolveChannelMock.mockResolvedValue(channel);
    fetchRecentVideosMock.mockResolvedValue([]);

    await post({ channel: "@dailyviral" });

    expect(resolveChannelMock).toHaveBeenCalledWith("@dailyviral");
    expect(fetchRecentVideosMock).toHaveBeenCalledWith(channel.uploadsPlaylistId);
  });

  it("body에 channel이 없으면 400이다", async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "요청 형식이 올바르지 않습니다.",
    });
    expect(resolveChannelMock).not.toHaveBeenCalled();
  });

  it("channel이 빈 문자열이면 400이다", async () => {
    const response = await post({ channel: "" });

    expect(response.status).toBe(400);
    expect(resolveChannelMock).not.toHaveBeenCalled();
  });

  it("not_found면 404다", async () => {
    resolveChannelMock.mockRejectedValue(
      new YoutubeError("Channel not found.", "not_found"),
    );

    const response = await post({ channel: "@nope" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "채널을 찾을 수 없습니다.",
    });
  });

  it("quota면 429다", async () => {
    resolveChannelMock.mockRejectedValue(
      new YoutubeError("YouTube API responded with status 403.", "quota"),
    );

    const response = await post({ channel: "@dailyviral" });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "YouTube API 일일 할당량을 초과했습니다.",
    });
  });

  it("그 외 에러는 500이다", async () => {
    resolveChannelMock.mockRejectedValue(
      new YoutubeError("YouTube API request failed.", "unknown"),
    );

    const response = await post({ channel: "@dailyviral" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "요청을 처리하지 못했습니다.",
    });
  });

  it("예외 메시지에 API 키가 들어 있어도 응답 body로 새어 나가지 않는다", async () => {
    resolveChannelMock.mockRejectedValue(
      new Error(
        "fetch failed: https://www.googleapis.com/youtube/v3/channels?part=snippet&key=SECRET123",
      ),
    );

    const response = await post({ channel: "@dailyviral" });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("SECRET123");
    expect(text).not.toContain("googleapis.com");
    expect(text).not.toContain("key=");
    expect(JSON.parse(text)).toEqual({ error: "요청을 처리하지 못했습니다." });
  });

  it("fetchRecentVideos가 던진 키 포함 에러도 body에 노출하지 않는다", async () => {
    resolveChannelMock.mockResolvedValue(channel);
    fetchRecentVideosMock.mockRejectedValue(
      new YoutubeError("videos.list?id=x&key=SECRET123 failed", "unknown"),
    );

    const response = await post({ channel: "@dailyviral" });

    expect(await response.text()).not.toContain("SECRET123");
  });

  it("영상이 없어도 200과 빈 목록을 반환한다", async () => {
    resolveChannelMock.mockResolvedValue(channel);
    fetchRecentVideosMock.mockResolvedValue([]);

    const response = await post({ channel: "@dailyviral" });
    const body = (await response.json()) as ChannelAnalysis;

    expect(response.status).toBe(200);
    expect(body.videos).toEqual([]);
  });
});
