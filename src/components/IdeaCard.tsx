import type { ContentIdea, ScoredVideo } from "@/types/analysis";

/**
 * 기획안은 실제로 검증된 영상이 아니라 생성된 가설이다(ADR-004).
 * 그래서 근거 영상을 반드시 함께 보여준다 — 단, 사용자에게 의미 없는 영상 ID 대신
 * 분석 결과에서 찾은 **제목**으로 표시하고, 못 찾은 ID는 조용히 생략한다.
 */
export default function IdeaCard({
  idea,
  videos,
}: {
  idea: ContentIdea;
  videos: ScoredVideo[];
}) {
  const references = idea.referenceVideoIds
    .map((id) => videos.find((video) => video.id === id))
    .filter((video): video is ScoredVideo => video !== undefined);

  return (
    <article className="rounded-lg bg-[#141414] border border-neutral-800 p-6 space-y-3">
      <div className="space-y-1">
        <h3 className="text-base font-medium text-white">{idea.title}</h3>
        <p className="text-xs text-neutral-400">{idea.format}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-400">훅</p>
        <p className="text-sm leading-relaxed text-neutral-300">{idea.hook}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-400">근거</p>
        <p className="text-sm leading-relaxed text-neutral-300">{idea.rationale}</p>
      </div>

      {references.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-neutral-400">근거 영상</p>
          <ul className="space-y-1">
            {references.map((video) => (
              <li key={video.id}>
                <a
                  href={`https://youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-neutral-300 transition-colors duration-150 hover:text-white"
                >
                  {video.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
