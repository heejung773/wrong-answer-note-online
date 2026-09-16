import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '다산미래학원 온라인 오답노트',
  description: '다산미래학원 맞춤형 온라인 오답노트 생성 시스템',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
