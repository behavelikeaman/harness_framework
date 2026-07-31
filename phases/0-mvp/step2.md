# Step 2: youtube-service

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` — 특히 `search.list` 금지 규칙
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 **ADR-003 (quota 절약형 3-call 파이프라인)**
- `/src/types/youtube.ts` (step 1에서 생성) — `ChannelSummary`, `VideoStats`
- `/src/lib/viral-score.ts` (step 1에서 생성) — `parseISO8601Duration`을 재사용한다
- `/src/lib/env.ts` (step 0에서 생성) — `getYoutubeApiKey()`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 특히 `VideoStats` 필드 이름과 `parseISO8601Duration` 시그니처를 그대로 따를 것.

## 작업

YouTube Data API v3 래퍼와 메모리 캐시를 만든다. **TDD: 테스트를 먼저 작성하라.**

### 1. `src/lib/cache.ts`

```ts
export async function getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
export function clearCache(): void;   // 테스트용
```

- 모듈 스코프 `Map<string, { value: unknown; expiresAt: number }>`로 구현한다
- 만료된 항목은 조회 시점에 제거하고 `fn()`을 다시 호출한다
- `fn()`이 reject하면 캐시에 저장하지 말고 그대로 throw한다. 이유: 에러를 캐싱하면 일시적 장애가 10분간 고정된다

### 2. `src/services/youtube.ts`

```ts
export class YoutubeError extends Error {
  constructor(message: string, public readonly kind: "not_found" | "quota" | "unknown") { ... }
}

export async function resolveChannel(input: string): Promise<ChannelSummary>;
export async function fetchRecentVideos(uploadsPlaylistId: string): Promise<VideoStats[]>;
```

**`resolveChannel(input)` — 정확히 1 unit**

`input`은 아래 세 형태를 모두 받는다:
- `@handle` 또는 `handle` → `channels.list?part=snippet,statistics,contentDetails&forHandle=@handle`
- `UC`로 시작하는 24자 ID → `channels.list?...&id=UC...`
- 채널 URL (`https://www.youtube.com/@handle`, `https://youtube.com/channel/UC...`) → URL에서 handle 또는 ID를 추출한 뒤 위 분기로

응답의 `items[0]`에서 `ChannelSummary`를 구성한다. `uploadsPlaylistId`는 `contentDetails.relatedPlaylists.uploads`에 있다. `items`가 비어 있으면 `YoutubeError(..., "not_found")`를 던진다.

**`fetchRecentVideos(uploadsPlaylistId)` — 정확히 2 units**

1. `playlistItems.list?part=contentDetails&playlistId=<uploads>&maxResults=50` → videoId 배열 (1 unit)
2. `videos.list?part=snippet,statistics,contentDetails&id=<쉼표로 join한 최대 50개 ID>` → `VideoStats[]` (1 unit)

- `statistics.viewCount` 등은 **문자열**로 온다. `Number()`로 변환하고, 필드 자체가 없으면(좋아요 숨김 채널) `0`으로 처리한다
- `durationSeconds`는 `contentDetails.duration`을 step 1의 `parseISO8601Duration`으로 변환한다
- `thumbnailUrl`은 `snippet.thumbnails.medium?.url ?? snippet.thumbnails.default?.url ?? ""`
- `tags`는 `snippet.tags ?? []`
- videoId가 0개면 빈 배열을 반환한다 (`videos.list`를 호출하지 마라 — 낭비다)

**공통 규칙**

- 모든 호출은 전역 `fetch`를 사용한다. API 키는 `getYoutubeApiKey()`로만 얻고 쿼리 파라미터 `key=`로 전달한다
- HTTP 403 → `YoutubeError(..., "quota")`, 404 또는 빈 `items` → `"not_found"`, 그 외 비정상 → `"unknown"`
- **에러 메시지에 요청 URL을 포함하지 마라. 이유: URL에 API 키가 들어 있어 로그와 응답으로 유출된다**
- `resolveChannel`은 `getOrSet`으로 감싼다. 캐시 키는 `channel:${정규화한 input}`, TTL 10분
- `fetchRecentVideos`도 `getOrSet`으로 감싼다. 캐시 키는 `videos:${uploadsPlaylistId}`, TTL 10분

### 3. `src/services/youtube.test.ts`

`vi.stubGlobal("fetch", vi.fn())` 또는 `vi.spyOn(globalThis, "fetch")`로 `fetch`를 스텁한 테스트를 작성한다. 각 테스트 전에 `clearCache()`를 호출하고 `process.env.YOUTUBE_API_KEY`를 더미 값으로 설정한다.

커버할 케이스:
- `@handle` 입력 → `forHandle` 파라미터가 포함된 URL로 호출되는지
- `UC...` 입력 → `id` 파라미터로 호출되는지
- 채널 URL 입력 → 올바르게 파싱되는지
- 빈 `items` 응답 → `YoutubeError` with `kind === "not_found"`
- HTTP 403 → `kind === "quota"`
- `fetchRecentVideos`: playlistItems → videos 순으로 정확히 2회 호출되는지
- videoId 0개 → `videos.list`를 호출하지 않고 빈 배열 반환
- `likeCount` 필드 누락 응답 → `0`으로 채워지는지
- 같은 입력 2회 호출 → `fetch`가 캐시 덕분에 추가로 호출되지 않는지
- **모든 호출 URL에 `search` 문자열이 포함되지 않는지 검증하는 테스트를 반드시 포함한다**

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

**`.env.local`에 실제 YouTube API 키가 없는 상태에서 통과해야 한다.**

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (외부 API 래퍼는 `src/services/`, 캐시는 `src/lib/`)
   - ADR-003대로 채널 1회 분석이 정확히 3 units(channels 1 + playlistItems 1 + videos 1)인가?
   - `search.list`를 어디서도 호출하지 않는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `search.list`를 호출하지 마라. 이유: 호출당 100 units로 일일 한도 10,000을 하루 100회 분석 만에 소진한다. 채널 핸들 해석은 `forHandle`로 충분하다.
- `googleapis` 패키지를 설치하지 마라. 이유: `fetch`로 충분하고 번들만 비대해진다.
- 테스트에서 실제 네트워크를 호출하지 마라. 이유: API 키 없이 통과해야 하고, 네트워크 의존 테스트는 CI에서 불안정하다. **실 API 키가 없다는 이유로 blocked 처리하지 마라 — mock으로 전부 검증 가능하다.**
- 에러 메시지나 throw하는 객체에 요청 URL을 담지 마라. 이유: API 키가 그대로 유출된다.
- `maxResults`를 50보다 크게 설정하지 마라. 이유: API 상한이 50이며 초과 시 400 에러다.
- 이 step에서 route handler나 UI를 만들지 마라. 이유: step 4, 5의 범위다.
- 기존 테스트를 깨뜨리지 마라.
