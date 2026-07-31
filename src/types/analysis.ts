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

export interface ContentIdea {
  title: string; // 실제 업로드 가능한 수준의 영상 제목
  hook: string; // 첫 15초 훅 한 문장
  format: string; // 예: "10분 튜토리얼", "60초 Shorts", "인터뷰"
  rationale: string; // 왜 이 채널에서 통할 것인지 (근거 영상 지표를 언급)
  referenceVideoIds: string[]; // 근거가 된 기존 영상 ID (1개 이상)
}
