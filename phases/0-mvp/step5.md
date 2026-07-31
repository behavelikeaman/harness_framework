# Step 5: ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` — **이 step의 사실상 스펙이다. 색상, 컴포넌트 클래스, 안티패턴 표를 전부 읽어라**
- `/docs/PRD.md` — 디자인 섹션
- `/docs/ARCHITECTURE.md` — Server/Client Component 분리 원칙
- `/src/types/youtube.ts`, `/src/types/analysis.ts` (step 1, 3)
- `/src/app/api/analyze/route.ts`, `/src/app/api/recommend/route.ts` (step 4) — 요청/응답 형태를 정확히 확인할 것
- `/src/app/globals.css`, `/src/app/page.tsx` (step 0의 플레이스홀더 — 이 step에서 대체한다)

이전 step에서 만들어진 route handler의 요청/응답 스키마를 꼼꼼히 읽고 그대로 맞춰라.

## 작업

화면을 만든다.

### 1. `src/app/globals.css`

Tailwind v4 import를 유지하고, UI_GUIDE의 색상을 CSS 변수 토큰으로 정의한다:
페이지 배경 `#0a0a0a`, 카드 `#141414`, 행 hover `#1a1a1a`, 상승 `#22c55e`, 하락/에러 `#ef4444`, 중립 `#525252`.

`fade-in` 애니메이션(0.2s)을 정의한다. 그 외 애니메이션은 정의하지 마라.

### 2. `src/app/page.tsx` — Server Component

`max-w-5xl` 컨테이너, 좌측 정렬. 제목("viral-lens")과 한 줄 설명, 그 아래 `<ChannelInput />`. 이 파일에 `"use client"`를 붙이지 마라.

### 3. `src/components/ChannelInput.tsx` — Client Component

`"use client"`. 이 컴포넌트가 화면 전체 상태를 소유한다.

상태는 정확히 아래 4개만 `useState`로 관리한다:
```ts
analysis: ChannelAnalysis | null
ideas: ContentIdea[] | null
loading: "idle" | "analyzing" | "recommending"
error: string | null
```

동작:
- 입력 필드 + 「분석」 버튼 → `POST /api/analyze` with `{ channel: 입력값 }`
- 성공 시 `<VideoTable videos={analysis.videos} />` 렌더링
- 분석 결과가 있을 때만 「기획안 생성」 버튼 노출 → `POST /api/recommend` with `{ channel: analysis.channel, topVideos: analysis.videos.slice(0, 8) }`
  - **`slice(0, 8)`을 반드시 적용하라. 이유: route handler가 `topVideos` 최대 8개를 강제하므로 그대로 보내면 400이다**
- 성공 시 `<IdeaCard />` 5개 렌더링
- 응답이 ok가 아니면 body의 `{ error }` 문자열을 그대로 `error` 상태에 넣어 표시한다

세 가지 상태를 모두 처리한다:
- **로딩** — 버튼 `disabled`, "분석 중…" / "기획안 생성 중…" 텍스트. 스피너 금지
- **에러** — `#ef4444` 텍스트로 메시지 표시, 재시도 가능하게 입력 유지
- **빈 상태** — 아직 분석 전이면 어떤 입력이 가능한지 안내(`@handle`, 채널 URL, `UC...` ID)

### 4. `src/components/VideoTable.tsx`

`ScoredVideo[]`를 받아 테이블로 렌더링. 이미 정렬되어 오므로 다시 정렬하지 마라.

컬럼: 썸네일(`w-24`) / 제목 / 조회수 / performanceRatio / 참여율 / viralScore

- `performanceRatio`는 `3.2×` 형태로 표기. `>= 1`이면 `#22c55e`, `< 1`이면 `text-neutral-500`. **화살표나 아이콘을 붙이지 마라**
- `engagementRate`는 백분율 소수점 1자리
- 조회수는 `toLocaleString()`
- 모든 수치 셀에 `tabular-nums`
- Shorts는 제목 옆에 작은 텍스트 라벨 `SHORTS`(`text-neutral-500`)로 표시. 배지 박스 금지
- 각 행은 `https://youtube.com/watch?v={id}`로 새 탭 링크

### 5. `src/components/IdeaCard.tsx`

`ContentIdea` 하나를 받아 카드로 렌더링. UI_GUIDE의 카드 클래스(`rounded-lg bg-[#141414] border border-neutral-800 p-6`)를 사용한다.

표시: `title`(강조) / `format`(보조 텍스트) / `hook` / `rationale` / 근거 영상.

근거 영상은 `referenceVideoIds`를 `analysis.videos`에서 찾아 **제목으로** 표시한다. ID를 그대로 노출하지 마라. 매칭되는 영상이 없으면 해당 ID는 생략한다.

### 6. 테스트

`src/components/VideoTable.test.tsx`를 만들어 순수 표시 로직을 검증한다. React 렌더링 테스트 환경(jsdom, testing-library)을 새로 설치하는 것이 부담이면, 포맷팅 로직을 `src/lib/format.ts`로 분리하고 그 함수들만 테스트해도 된다:

```ts
export function formatRatio(ratio: number): string;         // 3.24 -> "3.2×"
export function formatViews(count: number): string;
export function formatEngagement(rate: number): string;     // 0.0342 -> "3.4%"
```

이 경우 `VideoTable`은 이 함수들을 사용한다. 어느 쪽을 택하든 **테스트가 있어야 한다.**

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

**실 API 키 없이 통과해야 한다** (빌드와 테스트는 네트워크를 타지 않는다).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md대로 `page.tsx`는 Server Component이고 `ChannelInput`만 Client인가?
   - 컴포넌트에서 `fetch`로 YouTube/Anthropic을 직접 호출하지 않고 `/api/*`만 호출하는가?
   - **UI_GUIDE의 "AI 슬롭 안티패턴" 표를 하나도 위반하지 않았는가?** (backdrop-blur, gradient text, 보라색, blur orb, 글로우 애니메이션, "Powered by AI" 배지)
   - UI_GUIDE의 색상값과 컴포넌트 클래스를 실제로 사용했는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- UI_GUIDE의 안티패턴 표에 있는 것을 하나라도 쓰지 마라. 특히 `backdrop-filter: blur()`, 그라데이션 텍스트, 보라/인디고 계열 색상, 배경 blur orb. 이유: 도구가 아니라 AI 템플릿처럼 보인다.
- 상태 관리 라이브러리(zustand, jotai, redux)나 데이터 페칭 라이브러리(react-query, swr)를 설치하지 마라. 이유: 상태가 4개뿐이라 `useState`로 충분하고, MVP 의존성을 늘리지 않는다.
- UI 컴포넌트 라이브러리(shadcn, MUI 등)를 설치하지 마라. 이유: UI_GUIDE가 이미 구체적 클래스를 지정하고 있다.
- `page.tsx`에 `"use client"`를 붙이지 마라. 이유: 최상단이 Client가 되면 전체 트리가 클라이언트 번들로 들어간다.
- 컴포넌트에서 `process.env`나 API 키를 참조하지 마라. 이유: 클라이언트 번들에 노출된다.
- `analysis.videos`를 통째로 `/api/recommend`에 보내지 마라. 이유: route handler가 최대 8개를 강제해 400이 난다. `slice(0, 8)`을 쓸 것.
- 기존 테스트를 깨뜨리지 마라.
