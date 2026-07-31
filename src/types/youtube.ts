/**
 * YouTube Data API v3 응답을 앱 내부에서 쓰는 형태로 정규화한 타입.
 * API 원본 스키마(문자열 숫자, 중첩 snippet/statistics)는 services/youtube에서 흡수한다.
 */

export interface ChannelSummary {
  id: string; // UC...
  title: string;
  handle: string | null; // @handle
  thumbnailUrl: string;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string; // UU... (channels.list contentDetails에서 얻음)
}

export interface VideoStats {
  id: string;
  title: string;
  publishedAt: string; // ISO 8601
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
  thumbnailUrl: string;
  tags: string[];
}
