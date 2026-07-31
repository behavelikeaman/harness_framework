import { afterEach, describe, expect, it } from "vitest";

import { getAnthropicApiKey, getYoutubeApiKey } from "@/lib/env";

const original = process.env.YOUTUBE_API_KEY;

afterEach(() => {
  if (original === undefined) {
    delete process.env.YOUTUBE_API_KEY;
  } else {
    process.env.YOUTUBE_API_KEY = original;
  }
});

describe("getYoutubeApiKey", () => {
  it("환경변수가 없으면 안내 메시지와 함께 throw한다", () => {
    delete process.env.YOUTUBE_API_KEY;
    expect(() => getYoutubeApiKey()).toThrow(
      "Missing YOUTUBE_API_KEY. Copy .env.example to .env.local and fill it in.",
    );
  });

  it("환경변수가 빈 문자열이어도 throw한다", () => {
    process.env.YOUTUBE_API_KEY = "";
    expect(() => getYoutubeApiKey()).toThrow(/Missing YOUTUBE_API_KEY/);
  });

  it("환경변수가 설정되어 있으면 값을 반환한다", () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    expect(getYoutubeApiKey()).toBe("test-key");
  });
});

describe("getAnthropicApiKey", () => {
  it("에러 메시지에 키 값을 포함하지 않는다", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => getAnthropicApiKey()).toThrow(/Missing ANTHROPIC_API_KEY/);
    } finally {
      if (previous !== undefined) {
        process.env.ANTHROPIC_API_KEY = previous;
      }
    }
  });
});
