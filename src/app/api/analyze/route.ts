/**
 * POST /api/analyze — 채널 분석.
 *
 * YouTube API 키를 만지는 두 지점 중 하나다. 외부 호출은 `services/youtube`에만 있고
 * 여기서는 순서만 엮는다(ARCHITECTURE.md 데이터 흐름).
 */

import { z } from "zod";

import { toErrorResponse } from "@/lib/api-error";
import { scoreVideos } from "@/lib/viral-score";
import { fetchRecentVideos, resolveChannel } from "@/services/youtube";
import type { ChannelAnalysis } from "@/types/analysis";

// Anthropic SDK와 Node API에 의존하므로 edge 런타임을 쓰지 않는다.
export const runtime = "nodejs";

const requestSchema = z.object({
  channel: z.string().min(1).max(200),
});

export async function POST(request: Request): Promise<Response> {
  try {
    // 깨진 JSON은 null로 떨어뜨려 zod 검증 실패(400)로 합류시킨다.
    const body: unknown = await request.json().catch(() => null);
    const { channel: input } = requestSchema.parse(body);

    const channel = await resolveChannel(input);
    const videos = await fetchRecentVideos(channel.uploadsPlaylistId);

    // scoreVideos도 내림차순으로 돌려주지만, 정렬은 응답 계약이라 여기서 다시 보장한다.
    const scored = scoreVideos(videos).sort((a, b) => b.viralScore - a.viralScore);

    const analysis: ChannelAnalysis = {
      channel,
      videos: scored,
      analyzedAt: new Date().toISOString(),
    };

    return Response.json(analysis);
  } catch (error) {
    return toErrorResponse(error);
  }
}
