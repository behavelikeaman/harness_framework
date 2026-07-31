import { formatEngagement, formatRatio, formatViews } from "@/lib/format";
import type { ScoredVideo } from "@/types/analysis";

/**
 * viralScore 내림차순으로 이미 정렬되어 오는 목록을 그대로 그린다.
 * 여기서 다시 정렬하지 않는다 — 정렬은 /api/analyze의 응답 계약이다.
 */
export default function VideoTable({ videos }: { videos: ScoredVideo[] }) {
  if (videos.length === 0) {
    return <p className="text-sm text-neutral-500">표시할 영상이 없습니다.</p>;
  }

  return (
    <div className="animate-fade-in overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-400">
            <th className="w-24 px-3 py-2 text-left font-medium">
              <span className="sr-only">썸네일</span>
            </th>
            <th className="px-3 py-2 text-left font-medium">제목</th>
            <th className="px-3 py-2 text-right font-medium">조회수</th>
            <th className="px-3 py-2 text-right font-medium">성과</th>
            <th className="px-3 py-2 text-right font-medium">참여율</th>
            <th className="px-3 py-2 text-right font-medium">점수</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => {
            const url = `https://youtube.com/watch?v=${video.id}`;

            return (
              <tr
                key={video.id}
                className="border-b border-neutral-800/60 transition-colors duration-150 hover:bg-[#1a1a1a]"
              >
                <td className="px-3 py-2 align-top">
                  <a href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 썸네일 호스트가 채널마다 달라 next/image remotePatterns 대신 원본 URL을 그대로 쓴다 */}
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      className="w-24 rounded border border-neutral-800"
                    />
                  </a>
                </td>
                <td className="px-3 py-2 align-top">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-neutral-200 transition-colors duration-150 hover:text-white"
                  >
                    {video.title}
                  </a>
                  {video.isShort ? (
                    <span className="ml-2 text-xs text-neutral-500">SHORTS</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums text-neutral-300">
                  {formatViews(video.viewCount)}
                </td>
                <td
                  className={`px-3 py-2 text-right align-top tabular-nums ${
                    video.performanceRatio >= 1
                      ? "text-[#22c55e]"
                      : "text-neutral-500"
                  }`}
                >
                  {formatRatio(video.performanceRatio)}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums text-neutral-300">
                  {formatEngagement(video.engagementRate)}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums text-neutral-300">
                  {video.viralScore.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
