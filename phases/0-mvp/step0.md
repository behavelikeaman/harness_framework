# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md`
- `/.gitignore`

이 step은 프로젝트 최초 스캐폴딩이다. 아직 소스 코드는 없다.

## 작업

리포지토리 루트(`/`)에 Next.js 15 프로젝트를 스캐폴딩한다. 기존 `docs/`, `scripts/`, `phases/`, `CLAUDE.md`는 그대로 두고 그 옆에 앱을 구성한다.

### 1. 패키지 및 설정

`package.json`을 생성한다.

- 런타임 의존성: `next` (15.x), `react`, `react-dom`, `zod`, `@anthropic-ai/sdk`
- 개발 의존성: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss` (v4), `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `vitest`
- scripts: `dev`, `build`, `start`, `lint`, `test` (`vitest run`)

`tsconfig.json` — `"strict": true` 필수. `paths`에 `"@/*": ["./src/*"]` 별칭을 설정한다.

`next.config.ts`, `postcss.config.mjs`(Tailwind v4용), `eslint.config.mjs`를 생성한다.

`vitest.config.ts` — `environment: "node"`, `@` 별칭이 `src/`로 해석되도록 `resolve.alias`를 설정한다.

### 2. 환경변수 파일 (이 step의 핵심 산출물)

`.env.example` — 커밋 대상. 내용은 정확히 아래 두 줄과 각각의 설명 주석:

```
# YouTube Data API v3 키 (Google Cloud Console에서 발급)
YOUTUBE_API_KEY=

# Anthropic API 키 (console.anthropic.com에서 발급)
ANTHROPIC_API_KEY=
```

`.env.local` — 같은 두 키를 빈 값으로 생성한다. 사용자가 여기에 실제 키를 채운다.

`.gitignore`에 아래 항목을 추가한다 (기존 내용은 지우지 말고 append):

```
.env*.local
```

### 3. 환경변수 접근자

`src/lib/env.ts`를 만든다. 시그니처만 제시하고 구현은 재량에 맡긴다:

```ts
export function getYoutubeApiKey(): string
export function getAnthropicApiKey(): string
```

핵심 규칙:
- 키가 없거나 빈 문자열이면 `Missing YOUTUBE_API_KEY. Copy .env.example to .env.local and fill it in.` 형태의 명확한 에러를 던진다
- 모듈 로드 시점이 아니라 **함수 호출 시점**에 검사한다. 이유: 모듈 최상단에서 검사하면 키 없이 `npm run build`나 `npm test`가 실패한다
- 에러 메시지에 키 값 자체를 절대 포함하지 마라

### 4. 최소 화면

`src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`를 만든다. 이 step에서 page는 제목 한 줄만 있는 플레이스홀더로 충분하다. `globals.css`는 Tailwind v4 import(`@import "tailwindcss";`)와 페이지 배경 `#0a0a0a` 지정까지만 한다.

### 5. 스모크 테스트

`src/lib/env.test.ts`를 만들어 `getYoutubeApiKey()`가 환경변수 미설정 시 throw하고, 설정 시 값을 반환하는지 검증한다.

## Acceptance Criteria

```bash
npm install
npm run build
npm run lint
npm test
```

세 커맨드 모두 에러 없이 통과해야 한다. **`.env.local`이 빈 값인 상태에서 통과해야 한다.**

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조(`src/app`, `src/components`, `src/types`, `src/lib`, `src/services`)를 따르는가?
   - ADR 기술 스택(Next.js 15 / TS strict / Tailwind v4 / Vitest)을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - `.env.example`과 `.env.local`이 둘 다 존재하고 `.gitignore`에 `.env*.local`이 있는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- API 키를 `NEXT_PUBLIC_` 접두사로 노출하지 마라. 이유: 클라이언트 번들에 키가 그대로 박혀 누구나 읽을 수 있다.
- `.env.local`에 실제 키 값을 넣지 마라. 이유: 키는 사용자가 직접 채워야 하며, 커밋되면 유출된다. 빈 값으로 두고 넘어가라 — 이는 blocked 사유가 아니다.
- 이 step에서 YouTube나 Anthropic API를 호출하지 마라. 이유: 서비스 레이어는 step 2, 3의 범위다.
- `googleapis` 패키지를 설치하지 마라. 이유: `fetch`로 충분하고 번들만 비대해진다.
- 기존 `docs/`, `scripts/`, `phases/`, `.git/`을 수정하거나 삭제하지 마라.
