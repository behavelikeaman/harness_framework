"use client";

import { useState } from "react";

import IdeaCard from "@/components/IdeaCard";
import VideoTable from "@/components/VideoTable";
import type { ChannelAnalysis, ContentIdea } from "@/types/analysis";

/**
 * 화면 전체 상태를 소유하는 유일한 Client Component.
 * 상태 관리 라이브러리를 두지 않는다 — 관리할 상태가 아래 4개뿐이다.
 *
 * 외부 API는 절대 여기서 부르지 않는다. YouTube/Anthropic 호출은 `/api/*` route handler
 * 안쪽에만 있고, 이 컴포넌트는 자기 오리진의 두 엔드포인트만 안다.
 */

type LoadingState = "idle" | "analyzing" | "recommending";

/** route handler는 실패 시 `{ error }` 고정 문구만 준다. 그 문자열을 그대로 보여준다. */
async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return "요청을 처리하지 못했습니다.";
}

export default function ChannelInput() {
  const [analysis, setAnalysis] = useState<ChannelAnalysis | null>(null);
  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);
  const [loading, setLoading] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = loading !== "idle";

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    // 입력값은 비제어 필드에서 읽는다 — 상태를 4개로 유지하고, 실패해도 입력이 남는다.
    const channel = String(new FormData(event.currentTarget).get("channel") ?? "").trim();
    if (channel === "") {
      setError("채널 핸들, URL 또는 채널 ID를 입력해 주세요.");
      return;
    }

    setLoading("analyzing");
    setError(null);
    setAnalysis(null);
    setIdeas(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      setAnalysis((await response.json()) as ChannelAnalysis);
    } catch {
      setError("네트워크 오류로 분석에 실패했습니다.");
    } finally {
      setLoading("idle");
    }
  }

  async function handleRecommend() {
    if (busy || analysis === null) return;

    setLoading("recommending");
    setError(null);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: analysis.channel,
          // 8개 상한은 route handler가 강제한다. 통째로 보내면 400이다.
          topVideos: analysis.videos.slice(0, 8),
        }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const body = (await response.json()) as { ideas: ContentIdea[] };
      setIdeas(body.ideas);
    } catch {
      setError("네트워크 오류로 기획안 생성에 실패했습니다.");
    } finally {
      setLoading("idle");
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleAnalyze} className="flex gap-3">
        <input
          name="channel"
          type="text"
          maxLength={200}
          autoComplete="off"
          placeholder="@handle, 채널 URL, 또는 UC로 시작하는 채널 ID"
          disabled={busy}
          className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-white text-black px-4 py-2 text-sm hover:bg-neutral-200 disabled:opacity-40"
        >
          {loading === "analyzing" ? "분석 중…" : "분석"}
        </button>
      </form>

      {error !== null ? (
        <p className="text-sm text-[#ef4444]">{error}</p>
      ) : null}

      {analysis === null && loading === "idle" ? (
        <div className="space-y-2 text-sm leading-relaxed text-neutral-500">
          <p>분석할 채널을 아래 세 가지 중 아무 형태로나 입력하세요.</p>
          <ul className="space-y-1">
            <li>핸들 — @mkbhd</li>
            <li>채널 URL — https://youtube.com/@mkbhd</li>
            <li>채널 ID — UCBJycsmduvYEL83R_U4JriQ</li>
          </ul>
        </div>
      ) : null}

      {analysis !== null ? (
        <section className="animate-fade-in space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide">
                핫 컨텐츠 랭킹
              </h2>
              <p className="text-sm text-neutral-300">
                {analysis.channel.title}
                {analysis.channel.handle !== null ? (
                  <span className="text-neutral-500"> {analysis.channel.handle}</span>
                ) : null}
                <span className="text-neutral-500 tabular-nums">
                  {" · "}
                  구독자 {analysis.channel.subscriberCount.toLocaleString("en-US")}
                  {" · "}
                  영상 {analysis.videos.length}개
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleRecommend}
              disabled={busy}
              className="shrink-0 rounded-lg bg-white text-black px-4 py-2 text-sm hover:bg-neutral-200 disabled:opacity-40"
            >
              {loading === "recommending" ? "기획안 생성 중…" : "기획안 생성"}
            </button>
          </div>

          <VideoTable videos={analysis.videos} />
        </section>
      ) : null}

      {analysis !== null && ideas !== null ? (
        <section className="animate-fade-in space-y-4">
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide">
            다음 컨텐츠 기획안
          </h2>
          <div className="space-y-3">
            {ideas.map((idea, index) => (
              <IdeaCard key={`${index}-${idea.title}`} idea={idea} videos={analysis.videos} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
