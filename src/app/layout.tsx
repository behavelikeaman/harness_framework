import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "viral-lens",
  description: "유튜브 채널의 바이럴 영상을 찾고 다음 컨텐츠를 기획한다",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="text-neutral-300 antialiased">{children}</body>
    </html>
  );
}
