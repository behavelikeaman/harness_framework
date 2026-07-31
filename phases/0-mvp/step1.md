# Step 1: core-domain

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 **ADR-005 (성과 기준선은 평균이 아닌 중앙값)**
- `/docs/PRD.md`
- `/tsconfig.json`, `/vitest.config.ts` (step 0에서 생성)
- `/src/lib/env.ts` (step 0에서 생성 — 이 step에서는 사용하지 않지만 코드 스타일 참고)

## 작업

도메인 타입과 순수 스코어링 로직을 만든다. 이 레이어는 외부 의존성이 0이다. **TDD: 테스트를 먼저 작성하고 통과하는 구현을 작성하라.**

### 1. `src/types/youtube.ts`

```ts
export interface ChannelSummary {
  id: string;                    // UC...
  title: string;
  handle: string | null;         // @handle
  thumbnailUrl: string;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string;     // UU... (channels.list contentDetails에서 얻음)
}

export interface VideoStats {
  id: string;
  title: string;
  publishedAt: string;           // ISO 8601
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
  thumbnailUrl: string;
  tags: string[];
}
```

### 2. `src/types/analysis.ts`

```ts
import type { ChannelSummary, VideoStats } from "./youtube";

export interface ScoredVideo extends VideoStats {
  isShort: boolean;
  performanceRatio: number;   // 조회수 ÷ 같은 유형 영상의 조회수 중앙값
  engagementRate: number;     // (좋아요 + 댓글) ÷ 조회수
  velocity: number;           // 조회수 ÷ 경과일수
  viralScore: number;         // 0~100
}

export interface ChannelAnalysis {
  channel: ChannelSummary;
  videos: ScoredVideo[];      // viralScore 내림차순
  analyzedAt: string;         // ISO 8601
}
```

### 3. `src/lib/viral-score.ts`

시그니처만 제시한다. 내부 구현은 재량에 맡긴다:

```ts
export function parseISO8601Duration(iso: string): number;
export function median(values: number[]): number;
export function scoreVideos(videos: VideoStats[], now?: Date): ScoredVideo[];
```

**핵심 규칙 — 설계 의도에서 벗어나면 안 된다:**

- `parseISO8601Duration`은 YouTube `contentDetails.duration` 형식(`PT1H2M3S`, `PT45S`, `P1DT2H` 등)을 초 단위로 변환한다. 파싱 불가 입력은 `0`을 반환한다 (throw 금지 — 영상 한 편 때문에 분석 전체가 죽으면 안 된다).
- `median`은 빈 배열에 `0`을 반환한다. 짝수 길이는 가운데 두 값의 평균.
- `isShort` = `durationSeconds > 0 && durationSeconds <= 60`.
- `performanceRatio` = 해당 영상 조회수 ÷ **같은 유형(Shorts/롱폼) 영상들의 조회수 중앙값**.
  - 평균이 아니라 **중앙값**이다. 이유: 바이럴 영상 한 편이 평균을 끌어올려 나머지 전부가 저성과로 보이는 왜곡이 생긴다.
  - Shorts와 롱폼의 중앙값을 **따로** 계산한다. 이유: 조회수 스케일이 근본적으로 달라 한 기준선에 섞으면 롱폼이 전부 저성과로 찍힌다.
  - 중앙값이 0이면 `performanceRatio`는 `0`으로 둔다 (0으로 나누지 마라).
- `engagementRate` = `(likeCount + commentCount) / viewCount`. `viewCount`가 0이면 `0`.
- `velocity` = `viewCount / Math.max(경과일수, 1)`. 경과일수는 `now - publishedAt`. 미래 날짜면 경과일수를 1로 취급한다.
- `viralScore`는 0~100 범위의 유한한 수. 세 지표를 각각 0~1로 정규화한 뒤 가중합하고 100을 곱한다. 가중치는 `performanceRatio`가 가장 크게(예: 0.5 / 0.3 / 0.2). 정규화 방식은 재량이나, 결과가 반드시 `[0, 100]` 안에 들어오고 `NaN`/`Infinity`가 나오지 않아야 한다.
- **순수 함수로 유지하라. 함수 안에서 `Date.now()`나 `new Date()`를 인자 없이 호출하지 마라.** `now` 파라미터를 주입받고 기본값으로만 현재 시각을 쓴다. 이유: 시간에 의존하면 테스트가 언젠가 깨진다.

### 4. `src/lib/viral-score.test.ts`

Vitest 테스트. 최소한 아래 케이스를 커버한다:

- `parseISO8601Duration`: `PT45S` → 45, `PT1H2M3S` → 3723, `PT10M` → 600, 잘못된 문자열 → 0
- `median`: 빈 배열 → 0, 홀수 길이, 짝수 길이
- `scoreVideos`: 빈 배열 → `[]`
- `scoreVideos`: 영상 1건 → `performanceRatio === 1`, `viralScore`가 유한값
- `scoreVideos`: `viewCount === 0`인 영상 → `engagementRate === 0`, `NaN` 없음
- `scoreVideos`: Shorts와 롱폼이 섞인 목록 → 롱폼 영상의 `performanceRatio`가 Shorts 조회수에 영향받지 않음 (Shorts 조회수를 10배로 바꿔도 롱폼의 ratio가 그대로인지 검증)
- `scoreVideos`: 모든 영상의 `viralScore`가 0 이상 100 이하

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (타입은 `src/types/`, 순수 유틸은 `src/lib/`)
   - ADR-005(중앙값 기준선, Shorts/롱폼 분리)를 구현이 실제로 지키는가?
   - CLAUDE.md CRITICAL 규칙(TDD)을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `src/lib/viral-score.ts`에서 `fetch`, `process.env`, 파일 I/O를 사용하지 마라. 이유: 이 파일은 순수 함수 레이어이며, 오염되면 테스트가 느려지고 불안정해진다.
- 평균(mean)을 `performanceRatio`의 분모로 쓰지 마라. 이유: ADR-005의 결정을 정면으로 뒤집는다.
- Shorts와 롱폼의 중앙값을 하나로 합치지 마라. 이유: 롱폼 영상이 전부 저성과로 잘못 표시된다.
- 이 step에서 API 호출 코드나 UI 컴포넌트를 만들지 마라. 이유: step 2~5의 범위다.
- 기존 테스트를 깨뜨리지 마라.
