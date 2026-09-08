import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '강석수학 오답노트',
  description: '허가된 사용자를 위한 교재별 오답노트 생성 시험판',
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
