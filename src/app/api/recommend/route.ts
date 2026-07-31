/**
 * POST /api/recommend — 기획안 생성.
 *
 * Anthropic API 키를 만지는 지점. 실제 호출은 `services/recommend`에만 있다.
 * 분석 결과를 다시 계산하지 않고 클라이언트가 보낸 상위 영상을 그대로 받는다 —
 * 재분석하면 YouTube quota를 한 번 더 쓰기 때문이다(ADR-003).
 */

import { z } from "zod";

import { toErrorResponse } from "@/lib/api-error";
import { generateIdeas } from "@/services/recommend";

// Anthropic SDK와 Node API에 의존하므로 edge 런타임을 쓰지 않는다.
export const runtime = "nodejs";

const channelSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string().nullable(),
  thumbnailUrl: z.string(),
  subscriberCount: z.number(),
  videoCount: z.number(),
  uploadsPlaylistId: z.string(),
});

const scoredVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  publishedAt: z.string(),
  viewCount: z.number(),
  likeCount: z.number(),
  commentCount: z.number(),
  durationSeconds: z.number(),
  thumbnailUrl: z.string(),
  tags: z.array(z.string()),
  isShort: z.boolean(),
  performanceRatio: z.number(),
  engagementRate: z.number(),
  velocity: z.number(),
  viralScore: z.number(),
});

const requestSchema = z.object({
  channel: channelSchema,
  // 프롬프트에 들어가는 상한과 같다. 초과분은 클라이언트가 잘라서 보낸다.
  topVideos: z.array(scoredVideoSchema).max(8),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { channel, topVideos } = requestSchema.parse(body);

    const ideas = await generateIdeas(channel, topVideos);

    return Response.json({ ideas });
  } catch (error) {
    return toErrorResponse(error);
  }
}
