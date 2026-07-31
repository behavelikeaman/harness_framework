/**
 * 표시용 숫자 포맷터. I/O가 없는 순수 함수만 둔다.
 *
 * 로케일을 "en-US"로 고정하는 이유: 같은 컴포넌트가 서버에서 한 번, 브라우저에서 한 번
 * 렌더되는데 런타임 기본 로케일이 서로 다르면 하이드레이션 불일치가 난다.
 * 비정상 값(NaN/Infinity/음수)은 throw하지 않고 0으로 떨어뜨린다 — 영상 한 편의 지표 때문에
 * 표 전체가 깨지면 안 된다.
 */

const LOCALE = "en-US";

function safe(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 3.24 → "3.2×". 아이콘·화살표 없이 숫자만(UI_GUIDE 지표 배지). */
export function formatRatio(ratio: number): string {
  return `${safe(ratio).toFixed(1)}×`;
}

/** 1234567 → "1,234,567" */
export function formatViews(count: number): string {
  return Math.round(safe(count)).toLocaleString(LOCALE);
}

/** 0.0342 → "3.4%" */
export function formatEngagement(rate: number): string {
  return `${(safe(rate) * 100).toFixed(1)}%`;
}
