# 프로젝트: viral-lens

특정 유튜브 채널을 분석해 성과가 튀는(바이럴) 영상을 찾아내고, 그 패턴을 근거로 다음에 만들 컨텐츠 기획안을 추천하는 웹앱.

## 기술 스택
- Next.js 15 (App Router)
- TypeScript strict mode
- Tailwind CSS v4
- Vitest (테스트)
- YouTube Data API v3 (fetch 직접 호출)
- Anthropic SDK (`@anthropic-ai/sdk`) — 모델 `claude-opus-5`

## 아키텍처 규칙
- CRITICAL: 모든 외부 API 호출(YouTube, Anthropic)은 `src/app/api/` route handler에서만 수행할 것. 클라이언트 컴포넌트나 Server Component에서 직접 호출하지 말 것
- CRITICAL: API 키를 클라이언트에 노출하지 말 것. `NEXT_PUBLIC_` 접두사 사용 금지. `process.env` 직접 참조는 `src/lib/env.ts`에서만 허용
- CRITICAL: YouTube `search.list` 엔드포인트를 호출하지 말 것. 호출당 100 units로 일일 한도(10,000)를 즉시 소진한다. 채널 조회는 `channels.list` → `playlistItems.list` → `videos.list` 3-call 파이프라인(총 3 units)으로만 처리할 것
- 컴포넌트는 `src/components/`, 타입은 `src/types/`, 외부 API 래퍼는 `src/services/`, 순수 유틸은 `src/lib/`에 분리
- API 에러 응답에 원본 예외 메시지나 스택을 담지 말 것 (API 키가 포함된 URL이 노출될 수 있음)

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- CRITICAL: 테스트는 실제 네트워크를 호출하지 말 것. `fetch`와 Anthropic SDK는 항상 mock으로 대체해 실 API 키 없이 통과해야 한다
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
