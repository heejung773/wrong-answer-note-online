import type { Metadata } from 'next';

// 관리자 화면은 검색에 나오지 않게 한다(데이터는 각 API 가 관리자 로그인으로 막는다).
export const metadata: Metadata = {
  title: '관리자 · 다산미래학원 온라인 오답노트',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
