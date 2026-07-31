# Step 3: claude-service

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 **ADR-004 (추천은 Claude 구조화 출력으로 생성)**
- `/docs/PRD.md` — 핵심 기능 3번
- `/src/types/youtube.ts`, `/src/types/analysis.ts` (step 1에서 생성)
- `/src/lib/viral-score.ts` (step 1에서 생성) — `ScoredVideo` 필드 확인
- `/src/lib/env.ts` (step 0에서 생성) — `getAnthropicApiKey()`
- `/src/services/youtube.ts` (step 2에서 생성) — 에러 클래스 및 코드 스타일 참고

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

상위 성과 영상의 패턴을 근거로 새 컨텐츠 기획안을 생성하는 서비스를 만든다. **TDD: 테스트를 먼저 작성하라.**

### 1. `src/types/analysis.ts`에 타입 추가

기존 내용은 유지하고 아래를 추가한다:

```ts
export interface ContentIdea {
  title: string;               // 실제 업로드 가능한 수준의 영상 제목
  hook: string;                // 첫 15초 훅 한 문장
  format: string;              // 예: "10분 튜토리얼", "60초 Shorts", "인터뷰"
  rationale: string;           // 왜 이 채널에서 통할 것인지 (근거 영상 지표를 언급)
  referenceVideoIds: string[]; // 근거가 된 기존 영상 ID (1개 이상)
}
```

### 2. `src/services/recommend.ts`

```ts
export class RecommendError extends Error {
  constructor(message: string, public readonly kind: "auth" | "rate_limit" | "unknown") { ... }
}

export async function generateIdeas(
  channel: ChannelSummary,
  topVideos: ScoredVideo[],
): Promise<ContentIdea[]>;
```

**Anthropic SDK 사용 규칙 — 반드시 지킬 것:**

- `@anthropic-ai/sdk`를 사용한다. 클라이언트는 `new Anthropic({ apiKey: getAnthropicApiKey() })`로 **함수 호출 시점에** 생성한다 (모듈 최상단 생성 금지 — 키 없이 테스트/빌드가 실패한다)
- 모델은 **정확히 `"claude-opus-5"`** 문자열을 쓴다. 날짜 접미사를 붙이지 마라
- 출력은 **반드시 구조화 출력**으로 받는다:
  - `client.messages.parse()` + `zodOutputFormat()` (`@anthropic-ai/sdk/helpers/zod`)
  - 스키마: `z.object({ ideas: z.array(ideaSchema).length(5) })`
  - `output_config: { format: zodOutputFormat(schema, "content_ideas"), effort: "medium" }`
  - `max_tokens: 16000`
- **`temperature`, `top_p`, `top_k`, `thinking.budget_tokens`를 넘기지 마라. 이유: `claude-opus-5`에서 400 에러가 난다.** 출력 다양성이 필요하면 프롬프트로 지시한다
- 응답의 `parsed_output`이 `null`이면 `RecommendError(..., "unknown")`을 던진다
- 401 → `"auth"`, 429 → `"rate_limit"`, 그 외 → `"unknown"`으로 매핑한다
- **에러 메시지에 API 키나 원본 SDK 예외 전문을 담지 마라**

**프롬프트 구성 규칙:**

- `topVideos`는 호출부에서 이미 정렬되어 넘어온다. 이 함수 안에서 **최대 8개까지만** 사용한다
- 각 영상에서 프롬프트에 넣을 필드: `id`, `title`, `viewCount`, `performanceRatio`, `engagementRate`, `isShort`, `tags`
- 채널에서 넣을 필드: `title`, `subscriberCount`
- **`ScoredVideo` 객체를 통째로 JSON.stringify 해서 넣지 마라. 이유: `thumbnailUrl`, `publishedAt` 등 추천에 무의미한 필드가 토큰을 낭비한다**
- 시스템 프롬프트에 아래를 명시한다:
  - 각 기획안의 `referenceVideoIds`는 **제공된 영상 ID 목록 안에 있는 값만** 사용할 것
  - `rationale`에는 근거 영상의 실제 지표(배수, 참여율)를 인용할 것
  - 기존 영상 제목을 그대로 복사하지 말고 새 기획안을 낼 것
  - 한국어로 작성할 것
- `topVideos`가 빈 배열이면 API를 호출하지 말고 즉시 빈 배열 `[]`을 반환한다

### 3. `src/services/recommend.test.ts`

`vi.mock("@anthropic-ai/sdk", ...)`로 SDK를 스텁한 테스트를 작성한다. `process.env.ANTHROPIC_API_KEY`는 더미 값으로 설정한다.

커버할 케이스:
- 정상 응답 → `ContentIdea[]` 5개 반환
- `topVideos`가 빈 배열 → SDK를 **호출하지 않고** `[]` 반환
- `topVideos`가 20개 → SDK에 전달된 프롬프트에 상위 8개 영상 ID만 포함되고 9번째 이후 ID는 포함되지 않는지
- `parsed_output`이 `null` → `RecommendError` throw
- SDK가 401 상태 에러를 던짐 → `kind === "auth"`
- SDK 호출 인자에 `temperature`, `top_p`, `budget_tokens` 키가 **없는지** 검증
- SDK 호출 인자의 `model`이 정확히 `"claude-opus-5"`인지 검증

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

**`.env.local`에 실제 Anthropic API 키가 없는 상태에서 통과해야 한다.**

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (외부 API 래퍼는 `src/services/`)
   - ADR-004대로 프리텍스트 JSON 파싱이 아닌 구조화 출력을 쓰는가?
   - 각 기획안이 `referenceVideoIds`를 갖도록 스키마가 강제하는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `temperature` / `top_p` / `top_k` / `thinking.budget_tokens`를 API 호출에 넘기지 마라. 이유: `claude-opus-5`에서 400 에러다.
- 모델 ID에 날짜 접미사(`claude-opus-5-2026...`)를 붙이지 마라. 이유: 존재하지 않는 모델이라 404다.
- 모델 응답 텍스트를 `JSON.parse()`나 정규식으로 파싱하지 마라. 이유: 파싱 실패가 런타임 버그가 된다. 구조화 출력을 써라.
- 모듈 최상단에서 `new Anthropic(...)`을 호출하지 마라. 이유: 키 없이 `npm run build`와 `npm test`가 실패한다.
- 테스트에서 실제 Anthropic API를 호출하지 마라. **실 API 키가 없다는 이유로 blocked 처리하지 마라 — mock으로 전부 검증 가능하다.**
- 이 step에서 route handler나 UI를 만들지 마라. 이유: step 4, 5의 범위다.
- 기존 테스트를 깨뜨리지 마라.
