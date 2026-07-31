/**
 * route handler 공통 에러 → HTTP 응답 변환.
 *
 * 응답 body에는 아래 고정 문구만 담는다. 원본 예외 메시지·스택·요청 URL은 어떤 경로로도
 * 넣지 않는다 — YouTube 요청 URL의 쿼리에 API 키가 들어 있어 그대로 유출된다.
 * 디버깅에 필요한 상세 정보는 서버 로그(`console.error`)에만 남긴다.
 */

import { ZodError } from "zod";

/**
 * 서비스 에러를 `kind`만으로 분기한다.
 * `YoutubeError`(not_found/quota/unknown)와 `RecommendError`(auth/rate_limit/unknown)의
 * kind는 "unknown"을 빼고 서로 겹치지 않으며, "unknown"은 양쪽 다 500 + 일반 문구다.
 * 덕분에 `lib/`가 `services/`를 import하지 않고도(레이어 역전 방지) 정확히 매핑된다.
 */
function kindOf(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("kind" in error)) return undefined;
  const kind = (error as { kind: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

function json(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export function toErrorResponse(error: unknown): Response {
  console.error("[api] request failed", error);

  if (error instanceof ZodError) {
    return json(400, "요청 형식이 올바르지 않습니다.");
  }

  switch (kindOf(error)) {
    case "not_found":
      return json(404, "채널을 찾을 수 없습니다.");
    case "quota":
      return json(429, "YouTube API 일일 할당량을 초과했습니다.");
    case "rate_limit":
      return json(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
    case "auth":
      return json(500, "AI 추천 설정에 문제가 있습니다.");
    default:
      return json(500, "요청을 처리하지 못했습니다.");
  }
}
