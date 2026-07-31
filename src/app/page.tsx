import ChannelInput from "@/components/ChannelInput";

/**
 * Server Component 셸. 사용자 입력과 요청 상태는 전부 ChannelInput이 갖는다 —
 * 여기에 "use client"를 붙이면 트리 전체가 클라이언트 번들로 들어간다.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">viral-lens</h1>
        <p className="text-sm leading-relaxed text-neutral-300">
          채널의 최근 업로드 50개를 채널 자체 중앙값과 비교해 유독 튄 영상을 찾고, 그
          패턴을 근거로 다음 컨텐츠 기획안을 제안합니다.
        </p>
      </header>

      <ChannelInput />
    </main>
  );
}
