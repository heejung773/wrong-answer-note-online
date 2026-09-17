'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CalendarDays, Search } from 'lucide-react';

type EventRow = {
  id: string;
  user_id: string;
  user_email: string;
  event_type: string;
  textbook: string | null;
  problem_count: number | null;
  student_count: number | null;
  success: boolean;
  created_at: string;
};

const labels: Record<string, string> = {
  pdf_generated: 'PDF 생성',
  print_started: '바로 인쇄',
  pdf_downloaded: '다운로드',
  preview_generated: '미리보기',
  generation_failed: '생성 실패',
};

export default function AdminUsagePage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [draftFromDate, setDraftFromDate] = useState('');
  const [draftToDate, setDraftToDate] = useState('');
  const [detailPage, setDetailPage] = useState(1);
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setError('Supabase 설정이 없습니다.');
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError('로그인이 필요합니다.');
        setLoading(false);
        return;
      }
      const response = await fetch('/api/admin/usage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as {
        events?: EventRow[];
        error?: string;
      };
      if (!response.ok) setError(result.error ?? '조회에 실패했습니다.');
      else setEvents(result.events ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const date = event.created_at.slice(0, 10);
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });
  }, [events, fromDate, toDate]);

  const summary = useMemo(() => {
    const byUser = new Map<
      string,
      {
        email: string;
        total: number;
        generated: number;
        printed: number;
        last: string;
      }
    >();
    for (const event of filteredEvents) {
      const current = byUser.get(event.user_id) ?? {
        email: event.user_email,
        total: 0,
        generated: 0,
        printed: 0,
        last: event.created_at,
      };
      current.email = event.user_email;
      current.total += 1;
      if (event.event_type === 'pdf_generated') current.generated += 1;
      if (event.event_type === 'print_started') current.printed += 1;
      if (event.created_at > current.last) current.last = event.created_at;
      byUser.set(event.user_id, current);
    }
    return [...byUser.entries()];
  }, [filteredEvents]);

  const visibleEvents = selectedUserId
    ? filteredEvents.filter((event) => event.user_id === selectedUserId)
    : filteredEvents;
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visibleEvents.length / pageSize));
  const pagedEvents = visibleEvents.slice(
    (detailPage - 1) * pageSize,
    detailPage * pageSize,
  );
  const selectedEmail = summary.find(
    ([userId]) => userId === selectedUserId,
  )?.[1].email;

  return (
    <main className="min-h-screen bg-[#0b0c10] px-5 py-10 text-[#f6efe5] sm:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.25em] text-[#d69a63]">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold">사용량 관리</h1>
        <p className="mt-2 text-sm text-[#b9b0a6]">
          PDF 생성과 바로 인쇄 실행 기록입니다.
        </p>
        {loading && <p className="mt-8 text-sm text-[#b9b0a6]">불러오는 중…</p>}
        {error && (
          <p className="mt-8 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </p>
        )}
        {!loading && !error && (
          <>
            <section className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <label className="text-sm text-[#b9b0a6]">
                시작일
                <span className="relative mt-1 block">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#f0b77d]" />
                  <input
                    className="block rounded-md border border-white/15 bg-black/20 py-2 pl-9 pr-3 text-[#f6efe5] [color-scheme:dark]"
                    type="date"
                    value={draftFromDate}
                    onChange={(event) => {
                      setDraftFromDate(event.target.value);
                    }}
                  />
                </span>
              </label>
              <label className="text-sm text-[#b9b0a6]">
                종료일
                <span className="relative mt-1 block">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#f0b77d]" />
                  <input
                    className="block rounded-md border border-white/15 bg-black/20 py-2 pl-9 pr-3 text-[#f6efe5] [color-scheme:dark]"
                    type="date"
                    value={draftToDate}
                    onChange={(event) => {
                      setDraftToDate(event.target.value);
                    }}
                  />
                </span>
              </label>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-[#d69a63] px-4 py-2 text-sm font-medium text-[#171317] hover:bg-[#efb47b]"
                onClick={() => {
                  setFromDate(draftFromDate);
                  setToDate(draftToDate);
                  setDetailPage(1);
                }}
                type="button"
              >
                <Search className="size-4" /> 검색
              </button>
              <button
                className="rounded-md border border-white/15 px-3 py-2 text-sm text-[#f0b77d] hover:bg-white/10"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setDraftFromDate('');
                  setDraftToDate('');
                  setDetailPage(1);
                }}
                type="button"
              >
                전체 기간
              </button>
              <span className="pb-2 text-sm text-[#b9b0a6]">
                {filteredEvents.length}건 조회
              </span>
            </section>
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-[#b9b0a6]">사용자 수</div>
                <div className="mt-2 text-3xl">{summary.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-[#b9b0a6]">PDF 생성</div>
                <div className="mt-2 text-3xl">
                  {
                    filteredEvents.filter(
                      (e) => e.event_type === 'pdf_generated',
                    ).length
                  }
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-[#b9b0a6]">바로 인쇄</div>
                <div className="mt-2 text-3xl">
                  {
                    filteredEvents.filter(
                      (e) => e.event_type === 'print_started',
                    ).length
                  }
                </div>
              </div>
            </section>
            <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-white/5">
              <h2 className="border-b border-white/10 p-4 text-lg font-medium">
                사용자별 총 실행 횟수
              </h2>
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-white/10 text-[#b9b0a6]">
                  <tr>
                    <th className="p-4">사용자 이메일</th>
                    <th className="p-4">총 실행</th>
                    <th className="p-4">PDF 생성</th>
                    <th className="p-4">바로 인쇄</th>
                    <th className="p-4">마지막 실행</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(([userId, item]) => (
                    <tr key={userId} className="border-b border-white/5">
                      <td className="p-4">
                        <button
                          className="text-left text-[#f0b77d] underline-offset-4 hover:underline"
                          onClick={() => {
                            setSelectedUserId(userId);
                            setDetailPage(1);
                          }}
                          type="button"
                        >
                          {item.email}
                        </button>
                      </td>
                      <td className="p-4 font-semibold">{item.total}회</td>
                      <td className="p-4">{item.generated}회</td>
                      <td className="p-4">{item.printed}회</td>
                      <td className="p-4 text-[#b9b0a6]">
                        {new Date(item.last).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!summary.length && (
                <p className="p-8 text-center text-sm text-[#b9b0a6]">
                  아직 기록이 없습니다.
                </p>
              )}
            </div>
            <div className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-white/5">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <h2 className="text-lg font-medium">
                  {selectedEmail
                    ? `${selectedEmail} 상세 실행 내역`
                    : '전체 상세 실행 내역'}
                </h2>
                {selectedUserId && (
                  <button
                    className="text-sm text-[#f0b77d] hover:underline"
                    onClick={() => {
                      setSelectedUserId(null);
                      setDetailPage(1);
                    }}
                    type="button"
                  >
                    전체 내역 보기
                  </button>
                )}
              </div>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-white/10 text-[#b9b0a6]">
                  <tr>
                    <th className="p-4">사용자 이메일</th>
                    <th className="p-4">실행</th>
                    <th className="p-4">교재</th>
                    <th className="p-4">문제 수</th>
                    <th className="p-4">실행 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEvents.map((event) => (
                    <tr key={event.id} className="border-b border-white/5">
                      <td className="p-4">{event.user_email}</td>
                      <td className="p-4">
                        {labels[event.event_type] ?? event.event_type}
                      </td>
                      <td className="p-4">{event.textbook ?? '-'}</td>
                      <td className="p-4">{event.problem_count ?? '-'}</td>
                      <td className="p-4 text-[#b9b0a6]">
                        {new Date(event.created_at).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleEvents.length && (
                <p className="p-8 text-center text-sm text-[#b9b0a6]">
                  아직 기록이 없습니다.
                </p>
              )}
              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-4 p-4 text-sm">
                  <button
                    className="rounded-md border border-white/15 px-3 py-2 disabled:opacity-40"
                    disabled={detailPage === 1}
                    onClick={() => setDetailPage((page) => page - 1)}
                    type="button"
                  >
                    이전
                  </button>
                  <span>
                    {detailPage} / {pageCount} 페이지
                  </span>
                  <button
                    className="rounded-md border border-white/15 px-3 py-2 disabled:opacity-40"
                    disabled={detailPage === pageCount}
                    onClick={() => setDetailPage((page) => page + 1)}
                    type="button"
                  >
                    다음
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
