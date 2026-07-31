# Step 4: api-routes

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` — 데이터 흐름 다이어그램
- `/docs/ADR.md`
- `/src/types/youtube.ts`, `/src/types/analysis.ts` (step 1, 3에서 생성)
- `/src/lib/viral-score.ts` (step 1) — `scoreVideos`
- `/src/services/youtube.ts` (step 2) — `resolveChannel`, `fetchRecentVideos`, `YoutubeError`
- `/src/services/recommend.ts` (step 3) — `generateIdeas`, `RecommendError`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 실제 함수 시그니처와 에러 클래스의 `kind` 값을 확인한 뒤 작업하라.

## 작업

route handler 2개를 만든다. **이 레이어가 API 키를 만지는 유일한 곳이다.**

### 1. `src/app/api/analyze/route.ts`

```
POST /api/analyze
Request:  { "channel": string }
Response: ChannelAnalysis
```

처리 순서:
1. zod로 body 검증 — `z.object({ channel: z.string().min(1).max(200) })`
2. `resolveChannel(channel)`
3. `fetchRecentVideos(summary.uploadsPlaylistId)`
4. `scoreVideos(videos)`
5. `viralScore` **내림차순** 정렬
6. `{ channel, videos, analyzedAt: new Date().toISOString() }` 반환

`export const runtime = "nodejs";`를 선언한다.

### 2. `src/app/api/recommend/route.ts`

```
POST /api/recommend
Request:  { "channel": ChannelSummary, "topVideos": ScoredVideo[] }
Response: { "ideas": ContentIdea[] }
```

처리 순서:
1. zod로 body 검증. `topVideos`는 `.max(8)`로 제한한다 — 초과분은 클라이언트가 잘라서 보낸다
2. `generateIdeas(channel, topVideos)`
3. `{ ideas }` 반환

`export const runtime = "nodejs";`를 선언한다.

### 3. 공통 에러 처리 — `src/lib/api-error.ts`

```ts
export function toErrorResponse(error: unknown): Response;
```

매핑 규칙:

| 조건 | HTTP | body |
|------|------|------|
| zod 검증 실패 | 400 | `{ "error": "요청 형식이 올바르지 않습니다." }` |
| `YoutubeError.kind === "not_found"` | 404 | `{ "error": "채널을 찾을 수 없습니다." }` |
| `YoutubeError.kind === "quota"` | 429 | `{ "error": "YouTube API 일일 할당량을 초과했습니다." }` |
| `RecommendError.kind === "rate_limit"` | 429 | `{ "error": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }` |
| `RecommendError.kind === "auth"` | 500 | `{ "error": "AI 추천 설정에 문제가 있습니다."}` |
| 그 외 | 500 | `{ "error": "요청을 처리하지 못했습니다." }` |

**핵심 규칙:**

- **응답 body에 원본 예외 메시지, 스택 트레이스, 요청 URL을 절대 담지 마라. 이유: YouTube 요청 URL에는 API 키가 쿼리 파라미터로 들어 있어 그대로 유출된다**
- 위 표의 문구는 사용자에게 보여줄 고정 문자열이다. `error.message`를 이어붙이지 마라
- 디버깅용 상세 정보가 필요하면 `console.error`로 **서버 로그에만** 남긴다
- 응답은 모두 `{ error: string }` 단일 형태로 통일한다

### 4. 테스트

`src/app/api/analyze/route.test.ts`, `src/app/api/recommend/route.test.ts`를 만든다. `vi.mock`으로 `@/services/youtube`와 `@/services/recommend`를 스텁하고 `POST` 함수를 직접 호출한다.

커버할 케이스:
- `analyze`: 정상 → 200, `videos`가 `viralScore` 내림차순인지
- `analyze`: body에 `channel` 없음 → 400
- `analyze`: `YoutubeError("not_found")` → 404
- `analyze`: `YoutubeError("quota")` → 429
- `analyze`: 서비스가 API 키가 포함된 문자열(`"...key=SECRET123..."`)로 에러를 던짐 → **응답 body에 `SECRET123`이 포함되지 않는지 검증하는 테스트를 반드시 포함한다**
- `recommend`: 정상 → 200, `ideas` 반환
- `recommend`: `topVideos` 9개 → 400

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

**실 API 키 없이 통과해야 한다.**

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 데이터 흐름대로 route handler → services → lib 순으로 호출되는가?
   - 외부 API 호출이 route handler 밖(컴포넌트, Server Component)에서 일어나지 않는가?
   - 에러 응답에 API 키가 유출될 경로가 없는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 에러 응답에 `error.message`, `error.stack`, 요청 URL을 담지 마라. 이유: API 키가 쿼리 파라미터에 들어 있어 그대로 유출된다.
- route handler 안에서 `fetch`로 YouTube/Anthropic을 직접 호출하지 마라. 이유: 그 로직은 이미 `src/services/`에 있고 중복되면 캐시와 에러 매핑이 깨진다.
- `runtime = "edge"`를 쓰지 마라. 이유: Anthropic SDK와 Node API에 의존한다.
- 테스트에서 실제 네트워크를 호출하지 마라. **실 API 키가 없다는 이유로 blocked 처리하지 마라.**
- 이 step에서 UI 컴포넌트를 만들지 마라. 이유: step 5의 범위다.
- 기존 테스트를 깨뜨리지 마라.
