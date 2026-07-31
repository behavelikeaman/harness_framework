# 아키텍처

## 디렉토리 구조
```
src/
├── app/
│   ├── page.tsx              # 메인 화면 (Server Component 셸)
│   ├── globals.css           # Tailwind + 색상 토큰
│   └── api/
│       ├── analyze/route.ts  # POST: 채널 분석
│       └── recommend/route.ts # POST: 기획안 생성
├── components/
│   ├── ChannelInput.tsx      # Client — 채널 입력 + 분석 트리거
│   ├── VideoTable.tsx        # viralScore 내림차순 영상 목록
│   └── IdeaCard.tsx          # AI 기획안 카드
├── types/
│   ├── youtube.ts            # ChannelSummary, VideoStats
│   └── analysis.ts           # ScoredVideo, ChannelAnalysis, ContentIdea
├── lib/
│   ├── env.ts                # 환경변수 접근자 (process.env 참조는 여기서만)
│   ├── cache.ts              # 메모리 TTL 캐시
│   └── viral-score.ts        # 순수 스코어링 함수
└── services/
    ├── youtube.ts            # YouTube Data API v3 래퍼
    └── recommend.ts          # Anthropic SDK 래퍼
```

## 패턴
- Server Components 기본. 사용자 입력과 요청 상태가 필요한 `ChannelInput`만 Client Component
- 외부 API 호출은 route handler에서만. `services/`는 route handler에서만 import된다
- `lib/viral-score.ts`는 순수 함수 — I/O 없음, `Date`는 파라미터로 주입받아 테스트 가능하게 유지
- 상태 관리 라이브러리 없음. 클라이언트 상태는 `useState`만 사용

## 데이터 흐름
```
[채널 분석]
사용자 입력(@handle / URL / UC...)
  → ChannelInput (Client)
  → POST /api/analyze
      → services/youtube.resolveChannel()      # channels.list      (1 unit)
      → services/youtube.fetchRecentVideos()   # playlistItems.list (1 unit)
                                               # videos.list        (1 unit)
      → lib/viral-score.scoreVideos()          # 순수 계산
  → ChannelAnalysis 응답 → VideoTable 렌더링

[기획안 추천]
「기획안 생성」 클릭 (상위 영상 + 채널 요약을 그대로 전달)
  → POST /api/recommend
      → services/recommend.generateIdeas()     # Anthropic messages.parse (구조화 출력)
  → ContentIdea[] 응답 → IdeaCard 렌더링
```

## 상태 관리
- 서버 상태: 없음(무저장). 동일 채널 재조회 시 `lib/cache.ts`의 10분 TTL 메모리 캐시가 YouTube 호출을 흡수한다 — 프로세스 재시작 시 소멸하며 그것이 의도된 동작이다
- 클라이언트 상태: `useState`로 `analysis`, `ideas`, `loading`, `error` 4개만 관리
