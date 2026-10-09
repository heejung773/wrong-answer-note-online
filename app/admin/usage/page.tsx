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
  const [loginRequired, setLoginRequired] = useState(false);
  const [loginEmail, setLoginEmail] = useState('teacher01@academy.local');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
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
        setLoginRequired(true);
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
      if (!response.ok) {
        if (response.status === 403) {
          setLoginRequired(true);
          setError(
            '현재 계정은 관리자가 아닙니다. 관리자 계정으로 로그인해 주세요.',
          );
        } else {
          setError(result.error ?? '조회에 실패했습니다.');
        }
      } else setEvents(result.events ?? []);
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

  // 노션에서 손풀이 링크를 고친 뒤 바로 오답노트에 반영하고 싶을 때 (평소에는 매일 새벽 자동 동기화)
  async function handleSolutionSync() {
    if (!supabase) return;
    setSyncBusy(true);
    setSyncMessage('');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch('/api/sync_solution_links', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const result = (await response.json().catch(() => ({}))) as {
      result?: Record<string, { rows: number; removed: number; problems: string[] }>;
      error?: string;
    };
    if (response.ok && result.result) {
      const names: Record<string, string> = {
        'synergy-calculus': '시너지 미적분',
        'synergy-common-math-2': '시너지 공통수학2',
      };
      setSyncMessage(
        Object.entries(result.result)
          .map(
            ([textbook, r]) =>
              `${names[textbook] ?? textbook} ${r.rows}개` +
              (r.removed ? ` (삭제 ${r.removed})` : '') +
              (r.problems.length ? ` · 확인 필요 ${r.problems.length}건` : ''),
          )
          .join(' / ') + ' 동기화 완료',
      );
    } else {
      setSyncMessage(result.error ?? '동기화에 실패했습니다.');
    }
    setSyncBusy(false);
  }

  async function handleAdminLogin(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!supabase) return;
    setLoginBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    if (signInError) {
      setError('이메일 또는 비밀번호를 확인해 주세요.');
      setLoginBusy(false);
      return;
    }
    window.location.reload();
  }

  if (loginRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <form
          className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-7"
          onSubmit={handleAdminLogin}
        >
          <p className="text-xs uppercase tracking-[0.25em] text-primary">
            Admin
          </p>
          <h1 className="mt-3 text-2xl font-semibold">관리자 로그인</h1>
          <p className="mt-2 text-sm text-slate-300">
            관리자 Supabase 계정으로 로그인해 주세요.
          </p>
          <label className="mt-6 block text-sm text-slate-300">
            이메일
            <input
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-foreground"
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              required
            />
          </label>
          <label className="mt-4 block text-sm text-slate-300">
            비밀번호
            <input
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-foreground"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          <button
            className="mt-6 w-full rounded-md bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-50"
            disabled={loginBusy}
            type="submit"
          >
            {loginBusy ? '로그인 중…' : '관리자 로그인'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.25em] text-primary">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold">사용량 관리</h1>
        <p className="mt-2 text-sm text-slate-300">
          PDF 생성과 바로 인쇄 실행 기록입니다.
        </p>
        {!loading && !error && (
          <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4">
            <div className="mr-auto">
              <p className="text-sm font-semibold">손풀이 QR 링크</p>
              <p className="mt-1 text-xs text-slate-300">
                노션 손풀이 영상 DB(시너지 미적분·공통수학2)를 오답노트에
                반영합니다. 매일 새벽에도 자동으로 동기화됩니다.
              </p>
              {syncMessage && (
                <p className="mt-2 text-xs text-primary">{syncMessage}</p>
              )}
            </div>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[#115e59] disabled:opacity-50"
              disabled={syncBusy}
              onClick={() => void handleSolutionSync()}
              type="button"
            >
              {syncBusy ? '동기화 중…' : '손풀이 링크 지금 동기화'}
            </button>
          </section>
        )}
        {loading && <p className="mt-8 text-sm text-slate-300">불러오는 중…</p>}
        {error && (
          <p className="mt-8 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
            {error}
          </p>
        )}
        {!loading && !error && (
          <>
            <section className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4">
              <label className="text-sm text-slate-300">
                시작일
                <span className="relative mt-1 block">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
                  <input
                    className="block rounded-md border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-foreground [color-scheme:dark]"
                    type="date"
                    value={draftFromDate}
                    onChange={(event) => {
                      setDraftFromDate(event.target.value);
                    }}
                  />
                </span>
              </label>
              <label className="text-sm text-slate-300">
                종료일
                <span className="relative mt-1 block">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
                  <input
                    className="block rounded-md border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-foreground [color-scheme:dark]"
                    type="date"
                    value={draftToDate}
                    onChange={(event) => {
                      setDraftToDate(event.target.value);
                    }}
                  />
                </span>
              </label>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[#115e59]"
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
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-primary hover:bg-slate-800"
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
              <span className="pb-2 text-sm text-slate-300">
                {filteredEvents.length}건 조회
              </span>
            </section>
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
                <div className="text-sm text-slate-300">사용자 수</div>
                <div className="mt-2 text-3xl">{summary.length}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
                <div className="text-sm text-slate-300">PDF 생성</div>
                <div className="mt-2 text-3xl">
                  {
                    filteredEvents.filter(
                      (e) => e.event_type === 'pdf_generated',
                    ).length
                  }
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
                <div className="text-sm text-slate-300">바로 인쇄</div>
                <div className="mt-2 text-3xl">
                  {
                    filteredEvents.filter(
                      (e) => e.event_type === 'print_started',
                    ).length
                  }
                </div>
              </div>
            </section>
            <div className="mt-8 overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
              <h2 className="border-b border-slate-700 p-4 text-lg font-medium">
                사용자별 총 실행 횟수
              </h2>
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-slate-700 text-slate-300">
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
                    <tr key={userId} className="border-b border-slate-700">
                      <td className="p-4">
                        <button
                          className="text-left text-primary underline-offset-4 hover:underline"
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
                      <td className="p-4 text-slate-300">
                        {new Date(item.last).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!summary.length && (
                <p className="p-8 text-center text-sm text-slate-300">
                  아직 기록이 없습니다.
                </p>
              )}
            </div>
            <div className="mt-8 overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
              <div className="flex items-center justify-between border-b border-slate-700 p-4">
                <h2 className="text-lg font-medium">
                  {selectedEmail
                    ? `${selectedEmail} 상세 실행 내역`
                    : '전체 상세 실행 내역'}
                </h2>
                {selectedUserId && (
                  <button
                    className="text-sm text-primary hover:underline"
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
                <thead className="border-b border-slate-700 text-slate-300">
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
                    <tr key={event.id} className="border-b border-slate-700">
                      <td className="p-4">{event.user_email}</td>
                      <td className="p-4">
                        {labels[event.event_type] ?? event.event_type}
                      </td>
                      <td className="p-4">{event.textbook ?? '-'}</td>
                      <td className="p-4">{event.problem_count ?? '-'}</td>
                      <td className="p-4 text-slate-300">
                        {new Date(event.created_at).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleEvents.length && (
                <p className="p-8 text-center text-sm text-slate-300">
                  아직 기록이 없습니다.
                </p>
              )}
              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-4 p-4 text-sm">
                  <button
                    className="rounded-md border border-slate-700 px-3 py-2 disabled:opacity-40"
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
                    className="rounded-md border border-slate-700 px-3 py-2 disabled:opacity-40"
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
