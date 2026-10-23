import Link from 'next/link';

const TABS = [
  { href: '/admin/usage', label: '사용량' },
  { href: '/admin/downloads', label: '다운목록' },
] as const;

/** 관리자 화면 위쪽 탭(사용량 · 다운목록). current 는 지금 화면의 href. */
export function AdminNav({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav
      aria-label="관리자 메뉴"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-700 pb-3"
    >
      <span className="text-xs uppercase tracking-[0.25em] text-teal-300">Admin</span>
      <div className="flex gap-1">
        {TABS.map((tab) => {
          const on = tab.href === current;
          return (
            <Link
              key={tab.href}
              aria-current={on ? 'page' : undefined}
              className={
                'rounded-md px-3 py-1.5 text-[15px] font-semibold transition-colors ' +
                (on
                  ? 'bg-slate-800 text-slate-50 shadow-[inset_0_-2px_0_#2dd4bf]'
                  : 'text-slate-400 hover:text-slate-100')
              }
              href={tab.href}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <Link className="ml-auto text-sm text-slate-400 hover:text-teal-300" href="/">
        오답노트 만들기로 →
      </Link>
    </nav>
  );
}
