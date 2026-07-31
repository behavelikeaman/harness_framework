import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/recommend/route";
import { RecommendError } from "@/services/recommend";
import type { ContentIdea, ScoredVideo } from "@/types/analysis";
import type { ChannelSummary } from "@/types/youtube";

/** `RecommendError`는 실제 클래스를 유지하고 `generateIdeas`만 스텁한다. */
const { generateIdeasMock } = vi.hoisted(() => ({ generateIdeasMock: vi.fn() }));

vi.mock("@/services/recommend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/recommend")>();
  return { ...actual, generateIdeas: generateIdeasMock };
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

function scoredVideo(index: number): ScoredVideo {
  return {
    id: `video-${index}`,
    title: `영상 ${index}`,
    publishedAt: "2026-07-01T00:00:00Z",
    viewCount: 100_000 - index * 1_000,
    likeCount: 5_000,
    commentCount: 300,
    durationSeconds: 620,
    thumbnailUrl: `https://img/${index}.jpg`,
    tags: [`태그${index}`],
    isShort: false,
    performanceRatio: 3.2,
    engagementRate: 0.053,
    velocity: 3_300,
    viralScore: 80 - index,
  };
}

function idea(index: number): ContentIdea {
  return {
    title: `기획안 ${index}`,
    hook: "첫 15초 훅",
    format: "10분 튜토리얼",
    rationale: "근거 영상이 중앙값 대비 3.2배",
    referenceVideoIds: ["video-0"],
  };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  generateIdeasMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/recommend", () => {
  it("정상 요청이면 200과 ideas를 반환한다", async () => {
    const ideas = Array.from({ length: 5 }, (_, i) => idea(i));
    generateIdeasMock.mockResolvedValue(ideas);

    const response = await post({
      channel,
      topVideos: [scoredVideo(0), scoredVideo(1)],
    });
    const body = (await response.json()) as { ideas: ContentIdea[] };

    expect(response.status).toBe(200);
    expect(body.ideas).toHaveLength(5);
    expect(body.ideas[0]).toEqual(idea(0));
    expect(generateIdeasMock).toHaveBeenCalledTimes(1);
  });

  it("topVideos가 9개면 400이고 서비스를 호출하지 않는다", async () => {
    const response = await post({
      channel,
      topVideos: Array.from({ length: 9 }, (_, i) => scoredVideo(i)),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "요청 형식이 올바르지 않습니다.",
    });
    expect(generateIdeasMock).not.toHaveBeenCalled();
  });

  it("topVideos가 8개면 통과한다", async () => {
    generateIdeasMock.mockResolvedValue([]);

    const response = await post({
      channel,
      topVideos: Array.from({ length: 8 }, (_, i) => scoredVideo(i)),
    });

    expect(response.status).toBe(200);
  });

  it("channel이 없으면 400이다", async () => {
    const response = await post({ topVideos: [] });

    expect(response.status).toBe(400);
    expect(generateIdeasMock).not.toHaveBeenCalled();
  });

  it("rate_limit이면 429다", async () => {
    generateIdeasMock.mockRejectedValue(
      new RecommendError("Anthropic API rate limit exceeded.", "rate_limit"),
    );

    const response = await post({ channel, topVideos: [scoredVideo(0)] });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("auth면 500이고 키 정보를 노출하지 않는다", async () => {
    generateIdeasMock.mockRejectedValue(
      new RecommendError("x-api-key=sk-ant-SECRET123 is invalid.", "auth"),
    );

    const response = await post({ channel, topVideos: [scoredVideo(0)] });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("SECRET123");
    expect(JSON.parse(text)).toEqual({
      error: "AI 추천 설정에 문제가 있습니다.",
    });
  });

  it("그 외 에러는 500이다", async () => {
    generateIdeasMock.mockRejectedValue(
      new RecommendError("Idea generation failed.", "unknown"),
    );

    const response = await post({ channel, topVideos: [scoredVideo(0)] });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "요청을 처리하지 못했습니다.",
    });
  });
});
