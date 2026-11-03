import type { Metadata } from 'next';

// 선생님 전용 화면: 검색에 나오지 않게 한다(목록·PDF 는 /api/generate 가 로그인으로 막는다).
export const metadata: Metadata = {
  title: '내신 기출 · 다산미래학원 온라인 오답노트',
  robots: { index: false, follow: false },
};

export default function NaesinLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
