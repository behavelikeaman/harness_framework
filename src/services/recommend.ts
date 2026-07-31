/**
 * Anthropic SDK 래퍼. route handler에서만 import한다.
 *
 * 기획안은 프리텍스트를 정규식/JSON.parse로 뜯지 않고 zod 스키마로 강제된
 * 구조화 출력(`messages.parse` + `zodOutputFormat`)으로 받는다(ADR-004).
 * 파싱 실패가 런타임 버그가 되는 경로를 아예 만들지 않는다.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { getAnthropicApiKey } from "@/lib/env";
import type { ContentIdea, ScoredVideo } from "@/types/analysis";
import type { ChannelSummary } from "@/types/youtube";

/** 날짜 접미사를 붙이지 않는다 — 존재하지 않는 모델 ID가 되어 404다. */
const MODEL = "claude-opus-5";

const MAX_TOKENS = 16_000;

/** 프롬프트에 넣을 상위 영상 수. 더 넣어도 패턴 파악에 보태는 것 없이 토큰만 쓴다. */
const MAX_PROMPT_VIDEOS = 8;

/** 생성할 기획안 수(PRD 핵심 기능 3). */
const IDEA_COUNT = 5;

export class RecommendError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "unknown",
  ) {
    super(message);
    this.name = "RecommendError";
  }
}

const ideaSchema = z.object({
  title: z.string(),
  hook: z.string(),
  format: z.string(),
  rationale: z.string(),
  referenceVideoIds: z.array(z.string()).min(1),
});

const ideasSchema = z.object({
  ideas: z.array(ideaSchema).length(IDEA_COUNT),
});

const SYSTEM_PROMPT = [
  "너는 유튜브 채널의 성과 데이터를 읽고 다음에 만들 컨텐츠를 기획하는 전략가다.",
  `제공된 상위 성과 영상의 패턴을 근거로 새 기획안 ${IDEA_COUNT}개를 만든다.`,
  "",
  "규칙:",
  "- 모든 출력은 한국어로 작성한다.",
  "- referenceVideoIds에는 제공된 영상 ID 목록 안에 있는 값만 넣는다. 새 ID를 지어내지 않는다.",
  "- rationale에는 근거 영상의 실제 지표(중앙값 대비 배수 performanceRatio, 참여율 engagementRate)를 인용한다.",
  "- 기존 영상 제목을 그대로 복사하지 않는다. 패턴만 빌려 새 기획을 낸다.",
  "- title은 실제로 업로드 가능한 수준의 완성된 제목으로 쓴다.",
  "- hook은 첫 15초에 말할 한 문장이다.",
  "- format은 길이와 형식을 함께 적는다(예: \"10분 튜토리얼\", \"60초 Shorts\", \"인터뷰\").",
  `- ${IDEA_COUNT}개 기획안은 서로 다른 각도를 잡는다. 같은 주제를 표현만 바꿔 반복하지 않는다.`,
].join("\n");

/** 프롬프트에 담는 영상 필드. ScoredVideo 전체를 넣으면 무의미한 필드가 토큰을 먹는다. */
interface PromptVideo {
  id: string;
  title: string;
  viewCount: number;
  performanceRatio: number;
  engagementRate: number;
  isShort: boolean;
  tags: string[];
}

function toPromptVideo(video: ScoredVideo): PromptVideo {
  return {
    id: video.id,
    title: video.title,
    viewCount: video.viewCount,
    // 소수점을 흘려보내면 토큰만 늘고 근거로서의 정밀도는 늘지 않는다.
    performanceRatio: Number(video.performanceRatio.toFixed(2)),
    engagementRate: Number(video.engagementRate.toFixed(4)),
    isShort: video.isShort,
    tags: video.tags,
  };
}

function buildUserPrompt(
  channel: ChannelSummary,
  videos: PromptVideo[],
): string {
  return [
    "채널:",
    JSON.stringify(
      { title: channel.title, subscriberCount: channel.subscriberCount },
      null,
      2,
    ),
    "",
    "상위 성과 영상(viralScore 내림차순):",
    JSON.stringify(videos, null, 2),
    "",
    `위 영상들이 왜 잘 됐는지 패턴을 찾고, 그 근거로 새 컨텐츠 기획안 ${IDEA_COUNT}개를 제안하라.`,
  ].join("\n");
}

/** SDK 예외의 상태 코드. 원본 예외 본문은 절대 밖으로 흘리지 않는다. */
function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function toRecommendError(error: unknown): RecommendError {
  const status = statusOf(error);
  if (status === 401) {
    return new RecommendError("Anthropic API key is invalid.", "auth");
  }
  if (status === 429) {
    return new RecommendError("Anthropic API rate limit exceeded.", "rate_limit");
  }
  return new RecommendError("Idea generation failed.", "unknown");
}

/**
 * 상위 성과 영상의 패턴을 근거로 컨텐츠 기획안 5개를 생성한다.
 *
 * `topVideos`는 호출부에서 이미 viralScore 내림차순으로 정렬되어 들어온다.
 */
export async function generateIdeas(
  channel: ChannelSummary,
  topVideos: ScoredVideo[],
): Promise<ContentIdea[]> {
  // 근거가 없으면 기획안도 없다. quota와 비용을 쓸 이유가 없다.
  if (topVideos.length === 0) return [];

  // 모듈 최상단이 아니라 여기서 만든다 — 키 없이도 빌드와 테스트가 통과해야 한다.
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });

  const videos = topVideos.slice(0, MAX_PROMPT_VIDEOS).map(toPromptVideo);

  let parsed: z.infer<typeof ideasSchema> | null;
  try {
    // temperature / top_p / top_k / thinking.budget_tokens는 넘기지 않는다 —
    // claude-opus-5에서 400이다. 출력 다양성은 시스템 프롬프트로 지시한다.
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(channel, videos) }],
      output_config: {
        format: zodOutputFormat(ideasSchema),
        effort: "medium",
      },
    });
    parsed = message.parsed_output;
  } catch (error) {
    throw toRecommendError(error);
  }

  if (!parsed) {
    throw new RecommendError("Model returned no structured output.", "unknown");
  }

  return parsed.ideas.map((item) => ({
    title: item.title,
    hook: item.hook,
    format: item.format,
    rationale: item.rationale,
    referenceVideoIds: [...item.referenceVideoIds],
  }));
}
