import type { ChannelSummary, VideoStats } from "./youtube";

export interface ScoredVideo extends VideoStats {
  isShort: boolean;
  performanceRatio: number; // 조회수 ÷ 같은 유형 영상의 조회수 중앙값
  engagementRate: number; // (좋아요 + 댓글) ÷ 조회수
  velocity: number; // 조회수 ÷ 경과일수
  viralScore: number; // 0~100
}

export interface ChannelAnalysis {
  channel: ChannelSummary;
  videos: ScoredVideo[]; // viralScore 내림차순
  analyzedAt: string; // ISO 8601
}
