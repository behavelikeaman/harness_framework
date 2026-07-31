import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecommendError, generateIdeas } from "@/services/recommend";
import type { ScoredVideo } from "@/types/analysis";
import type { ChannelSummary } from "@/types/youtube";

/**
 * Anthropic SDK 스텁. 실 API 키 없이, 네트워크를 타지 않고 전부 검증한다.
 * `vi.mock` 팩토리는 호이스팅되므로 mock 함수는 `vi.hoisted`로 먼저 만든다.
 */
const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    readonly messages = { parse: parseMock };
    constructor(public readonly options: { apiKey: string }) {}
  }
  return { default: FakeAnthropic };
});

const originalKey = process.env.ANTHROPIC_API_KEY;

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

function idea(index: number) {
  return {
    title: `기획안 ${index}`,
    hook: "첫 15초 훅",
    format: "10분 튜토리얼",
    rationale: "근거 영상이 중앙값 대비 3.2배",
    referenceVideoIds: ["video-0"],
  };
}

function parsedIdeas(count = 5) {
  return {
    parsed_output: { ideas: Array.from({ length: count }, (_, i) => idea(i)) },
  };
}

/** `messages.parse`에 전달된 첫 번째 인자. */
function callArgs(): Record<string, unknown> {
  return parseMock.mock.calls[0][0] as Record<string, unknown>;
}

/** 프롬프트(system + user)를 하나의 문자열로 합친다. */
function promptText(): string {
  return JSON.stringify(callArgs());
}

/** 상태 코드를 가진 SDK 예외 대역. */
function statusError(status: number): Error {
  return Object.assign(new Error("boom"), { status });
}

beforeEach(() => {
  parseMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

describe("generateIdeas", () => {
  it("정상 응답이면 ContentIdea 5개를 반환한다", async () => {
    parseMock.mockResolvedValue(parsedIdeas());

    const ideas = await generateIdeas(channel, [scoredVideo(0), scoredVideo(1)]);

    expect(ideas).toHaveLength(5);
    expect(ideas[0]).toEqual({
      title: "기획안 0",
      hook: "첫 15초 훅",
      format: "10분 튜토리얼",
      rationale: "근거 영상이 중앙값 대비 3.2배",
      referenceVideoIds: ["video-0"],
    });
    expect(parseMock).toHaveBeenCalledTimes(1);
  });

  it("topVideos가 비면 SDK를 호출하지 않고 빈 배열을 반환한다", async () => {
    const ideas = await generateIdeas(channel, []);

    expect(ideas).toEqual([]);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("topVideos가 20개면 상위 8개 영상만 프롬프트에 담는다", async () => {
    parseMock.mockResolvedValue(parsedIdeas());

    const videos = Array.from({ length: 20 }, (_, i) => scoredVideo(i));
    await generateIdeas(channel, videos);

    const prompt = promptText();
    for (let i = 0; i < 8; i += 1) {
      expect(prompt).toContain(`video-${i}`);
    }
    for (let i = 8; i < 20; i += 1) {
      expect(prompt).not.toContain(`video-${i}`);
    }
  });

  it("추천에 무의미한 필드(thumbnailUrl, publishedAt)는 프롬프트에 넣지 않는다", async () => {
    parseMock.mockResolvedValue(parsedIdeas());

    await generateIdeas(channel, [scoredVideo(0)]);

    const prompt = promptText();
    expect(prompt).not.toContain("https://img/0.jpg");
    expect(prompt).not.toContain("2026-07-01T00:00:00Z");
  });

  it("parsed_output이 null이면 RecommendError를 던진다", async () => {
    parseMock.mockResolvedValue({ parsed_output: null });

    await expect(generateIdeas(channel, [scoredVideo(0)])).rejects.toThrow(
      RecommendError,
    );
    await expect(
      generateIdeas(channel, [scoredVideo(0)]),
    ).rejects.toMatchObject({ kind: "unknown" });
  });

  it("401 에러는 kind가 auth다", async () => {
    parseMock.mockRejectedValue(statusError(401));

    await expect(
      generateIdeas(channel, [scoredVideo(0)]),
    ).rejects.toMatchObject({ kind: "auth" });
  });

  it("429 에러는 kind가 rate_limit다", async () => {
    parseMock.mockRejectedValue(statusError(429));

    await expect(
      generateIdeas(channel, [scoredVideo(0)]),
    ).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("그 외 에러는 kind가 unknown이고 원본 메시지를 노출하지 않는다", async () => {
    parseMock.mockRejectedValue(
      Object.assign(new Error("x-api-key=sk-ant-secret"), { status: 500 }),
    );

    const error = await generateIdeas(channel, [scoredVideo(0)]).catch(
      (caught: unknown) => caught as RecommendError,
    );

    expect(error).toBeInstanceOf(RecommendError);
    expect(error.kind).toBe("unknown");
    expect(error.message).not.toContain("sk-ant-secret");
  });

  it("model은 정확히 claude-opus-5다", async () => {
    parseMock.mockResolvedValue(parsedIdeas());

    await generateIdeas(channel, [scoredVideo(0)]);

    expect(callArgs().model).toBe("claude-opus-5");
  });

  it("temperature / top_p / top_k / budget_tokens를 넘기지 않는다", async () => {
    parseMock.mockResolvedValue(parsedIdeas());

    await generateIdeas(channel, [scoredVideo(0)]);

    const args = callArgs();
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("top_p");
    expect(args).not.toHaveProperty("top_k");
    expect(JSON.stringify(args)).not.toContain("budget_tokens");
  });

  it("구조화 출력(output_config.format)과 max_tokens를 지정한다", async () => {
    parseMock.mockResolvedValue(parsedIdeas());

    await generateIdeas(channel, [scoredVideo(0)]);

    const args = callArgs();
    const outputConfig = args.output_config as Record<string, unknown>;
    expect(args.max_tokens).toBe(16000);
    expect(outputConfig.effort).toBe("medium");
    expect(outputConfig.format).toBeDefined();
  });

  it("API 키는 모듈 로드 시점이 아니라 호출 시점에 읽는다", async () => {
    parseMock.mockResolvedValue(parsedIdeas());
    delete process.env.ANTHROPIC_API_KEY;

    // 모듈은 이미 import되어 있다 — 키 검사가 최상단이었다면 여기까지 오지도 못한다.
    await expect(generateIdeas(channel, [scoredVideo(0)])).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
    expect(parseMock).not.toHaveBeenCalled();
  });
});
