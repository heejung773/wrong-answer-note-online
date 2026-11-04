'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * 미리보기 머리줄의 쪽 넘기기 `‹ 1/5 ›`.
 * 교재 오답노트(app/page.tsx)에 있던 단추를 그대로 옮겨 내신 기출(app/naesin/page.tsx)과 같이 쓴다.
 * 쪽 번호는 부르는 쪽이 iframe 주소의 #page= 로 넘긴다.
 */
export function PreviewPager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (next: (page: number) => number) => void;
}) {
  const last = Math.max(1, total);
  return (
    <div className="inline-flex items-center rounded-full bg-[#253349] border border-[#475569] overflow-hidden">
      <button type="button" onClick={() => onPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-2.5 text-slate-300 hover:bg-[#334155] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" aria-label="이전 페이지">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-14 text-center text-[13px] font-semibold text-slate-200">{page}/{last}</span>
      <button type="button" onClick={() => onPage((p) => Math.min(last, p + 1))} disabled={page >= last} className="p-2.5 text-slate-300 hover:bg-[#334155] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" aria-label="다음 페이지">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
