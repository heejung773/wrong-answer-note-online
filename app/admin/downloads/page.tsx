'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { RefreshCw, Search, Trash2, X } from 'lucide-react';
import { AdminNav } from '../admin-nav';
import { GoToMainLogin } from '../go-to-login';
import {
  kstDate,
  problemGroups,
  TEXTBOOK_NAMES,
  textbookName,
  type Issue,
} from '@/lib/wrong-record-list';

/**
 * 관리자 '다운목록': 개별 학생 오답노트를 다운로드·인쇄할 때 쌓인 오답 기록(wrong_answer_records)을
 * 발급(같은 날 · 같은 학생 · 같은 교재) 단위로 보여 준다. 데이터는 /api/admin/wrong-records 에서만
 * 받는다(메인 화면과 같은 로그인 토큰 확인). 로그인 전이면 메인 로그인 화면(/)으로 보낸다.
 */

type Summary = { monthCount: number; monthStudents: number };
type ListResponse = { summary?: Summary; issues?: Issue[]; truncated?: boolean; error?: string };

const PERIODS = [
  { value: '', label: '기간 전체' },
  { value: 'today', label: '오늘' },
  { value: '7', label: '최근 7일' },
  { value: 'month', label: '이번 달' },
  { value: '30', label: '지난 30일' },
  { value: 'lastmonth', label: '지난 달' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

const KIND_LABEL: Record<string, string> = { download: '다운로드', print: '인쇄' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const PAGE_SIZE = 100;

function periodRange(period: Period): { from?: string; to?: string } {
  const today = kstDate();
  const daysAgo = (n: number) => kstDate(new Date(Date.now() - n * 86400e3));
  if (period === 'today') return { from: today };
  if (period === '7') return { from: daysAgo(6) };
  if (period === '30') return { from: daysAgo(29) };
  if (period === 'month') return { from: `${today.slice(0, 8)}01` };
  if (period === 'lastmonth') {
    const [y, m] = today.split('-').map(Number);
    const first = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1));
    const last = new Date(Date.UTC(y, m - 1, 0));
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  }
  return {};
}

/** '10월 23일 (목)' (올해가 아니면 연도 붙임) */
function dayLabel(isoDay: string) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const year = y !== Number(kstDate().slice(0, 4)) ? `${y}년 ` : '';
  return `${year}${m}월 ${d}일 (${weekday})`;
}

/** 한국 시간 'HH:MM' */
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

function Problems({ issue, repeats }: { issue: Issue; repeats?: Map<string, number> }) {
  return (
    <div className="space-y-1">
      {problemGroups(issue.problems).map(([group, items]) => (
        <div key={group} className="leading-relaxed">
          {group && <span className="mr-1.5 text-xs text-slate-400">{group}</span>}
          <span className="break-words text-slate-100">
            {items.map((p, i) => {
              const times = repeats?.get(`${issue.textbook}|${p.key}`) ?? 0;
              return (
                <Fragment key={p.key}>
                  {i > 0 && ', '}
                  {times > 1 ? (
                    <span
                      className="rounded bg-amber-400/15 px-1 font-semibold text-amber-300"
                      title={`${times}번 틀림`}
                    >
                      {p.short}
                      <sup className="ml-0.5 text-[10px]">×{times}</sup>
                    </span>
                  ) : (
                    p.short
                  )}
                </Fragment>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function Tags({ issue }: { issue: Issue }) {
  return (
    <span className="flex flex-wrap gap-1">
      {issue.output_kinds.map((kind) => (
        <span
          key={kind}
          className={
            'rounded-full border px-2 text-xs ' +
            (kind === 'print'
              ? 'border-violet-500/60 text-violet-300'
              : 'border-slate-600 text-slate-300')
          }
        >
          {KIND_LABEL[kind] ?? kind}
        </span>
      ))}
      {issue.grade && (
        <span className="rounded-full border border-slate-600 px-2 text-xs text-slate-400">
          {issue.grade}
        </span>
      )}
    </span>
  );
}

export default function AdminDownloadsPage() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  const [ready, setReady] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [textbook, setTextbook] = useState('');
  const [period, setPeriod] = useState<Period>('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [deleting, setDeleting] = useState('');
  const [notice, setNotice] = useState('');

  const [openIssue, setOpenIssue] = useState('');
  const [history, setHistory] = useState<Record<string, Issue[] | 'loading' | 'error'>>({});
  const seq = useRef(0);

  const token = useCallback(async () => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return data.session?.access_token ?? '';
  }, [supabase]);

  /** 관리자 API 호출. 로그인 안 됨(401)이면 메인 로그인 화면으로. */
  const callApi = useCallback(
    async (
      input: string,
      init: { method?: string; body?: string; headers?: Record<string, string> } = {},
    ) => {
      const accessToken = await token();
      if (!accessToken) {
        setLoginRequired(true);
        return null;
      }
      const response = await fetch(input, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.status === 401) {
        setLoginRequired(true);
        return null;
      }
      if (!response.ok)
        throw new Error(typeof result.error === 'string' ? result.error : '불러오지 못했습니다.');
      return result;
    },
    [token],
  );

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams();
    if (debouncedQuery) qs.set('q', debouncedQuery);
    if (textbook) qs.set('textbook', textbook);
    const range = periodRange(period);
    if (range.from) qs.set('from', range.from);
    if (range.to) qs.set('to', range.to);
    try {
      const result = (await callApi(`/api/admin/wrong-records?${qs}`)) as ListResponse | null;
      if (my !== seq.current || !result) return;
      setIssues(result.issues ?? []);
      setSummary(result.summary ?? null);
      setTruncated(Boolean(result.truncated));
      setShown(PAGE_SIZE);
    } catch (e) {
      if (my !== seq.current) return;
      setError(e instanceof Error ? e.message : '다운목록을 불러오지 못했습니다.');
      setIssues([]);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [callApi, debouncedQuery, textbook, period]);

  // 처음: 세션 확인
  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setError('Supabase 설정이 없습니다.');
        setLoading(false);
        setReady(true);
        return;
      }
      if (!(await token())) setLoginRequired(true);
      setReady(true);
    })();
  }, [supabase, token]);

  // 이름 검색은 잠깐 멈춘 뒤 조회
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!ready || loginRequired || !supabase) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [ready, loginRequired, supabase, load]);

  async function toggleHistory(issue: Issue) {
    if (openIssue === issue.id) {
      setOpenIssue('');
      return;
    }
    setOpenIssue(issue.id);
    if (Array.isArray(history[issue.student_key])) return;
    setHistory((h) => ({ ...h, [issue.student_key]: 'loading' }));
    try {
      const qs = new URLSearchParams({ student: issue.student_key });
      const result = (await callApi(`/api/admin/wrong-records?${qs}`)) as ListResponse | null;
      setHistory((h) => ({ ...h, [issue.student_key]: result?.issues ?? 'error' }));
    } catch {
      setHistory((h) => ({ ...h, [issue.student_key]: 'error' }));
    }
  }

  async function handleDelete(issue: Issue) {
    const message =
      `${dayLabel(issue.recorded_on)} · ${issue.student_name} · ${textbookName(issue.textbook)}\n` +
      `틀린 문항 ${issue.problems.length}개 기록을 지울까요?\n\n` +
      '잘못 남은 기록을 정리할 때만 지워 주세요. 지운 기록은 되돌릴 수 없어요. (PDF 파일과는 상관없어요)';
    if (!window.confirm(message)) return;
    setDeleting(issue.id);
    setNotice('');
    try {
      const result = (await callApi('/api/admin/wrong-records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: issue.id }),
      })) as { deleted?: number } | null;
      if (result) {
        setNotice(`${issue.student_name} · ${textbookName(issue.textbook)} 기록 ${result.deleted ?? 0}줄을 지웠어요.`);
        setHistory((h) => {
          const next = { ...h };
          delete next[issue.student_key];
          return next;
        });
        if (openIssue === issue.id) setOpenIssue('');
        await load();
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    } finally {
      setDeleting('');
    }
  }

  if (loginRequired) return <GoToMainLogin />;

  const filtered = Boolean(debouncedQuery || textbook || period);
  const visible = issues.slice(0, shown);
  const selectClass =
    'h-9 rounded-lg border border-slate-600 bg-slate-900 px-2.5 text-sm text-slate-100 [color-scheme:dark] focus:border-teal-400 focus:outline-none';

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <AdminNav current="/admin/downloads" />

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-800/80 p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">다운목록</h1>
              <p className="mt-1 text-sm text-slate-400">
                학생 한 명씩 오답노트를 다운로드·인쇄하면 여기에 남아요. 같은 날 · 같은 학생 · 같은 교재는 한 줄로 묶어요.
              </p>
            </div>
            <p className="text-sm text-slate-300" aria-live="polite">
              {summary ? (
                <>
                  이번 달 <b className="text-teal-300">{summary.monthCount}</b>건 · 학생{' '}
                  <b className="text-teal-300">{summary.monthStudents}</b>명
                </>
              ) : (
                loading && '불러오는 중…'
              )}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">학생 이름 검색</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                autoComplete="off"
                className="h-9 w-48 rounded-lg border border-slate-600 bg-slate-900 pl-8 pr-8 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                placeholder="학생 이름 검색"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  aria-label="검색어 지우기"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-100"
                  onClick={() => setQuery('')}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <select
              aria-label="교재"
              className={selectClass}
              value={textbook}
              onChange={(event) => setTextbook(event.target.value)}
            >
              <option value="">교재 전체</option>
              {Object.entries(TEXTBOOK_NAMES).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="기간"
              className={selectClass}
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 hover:border-teal-400 disabled:opacity-50"
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw className={'size-4 ' + (loading ? 'animate-spin' : '')} /> 새로고침
            </button>
            {!loading && !error && (
              <span className="text-sm text-slate-400">{issues.length}건</span>
            )}
          </div>

          {notice && (
            <p className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-200">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          {truncated && (
            <p className="mt-3 text-sm text-amber-300">
              기록이 많아 최근 것만 보여요. 기간이나 교재를 골라 좁혀 주세요.
            </p>
          )}

          <div className="mt-4 border-t border-slate-700" aria-busy={loading}>
            <div className="hidden grid-cols-[150px_110px_150px_minmax(0,1fr)_110px_44px] gap-3 border-b border-slate-700 px-1 py-2 text-xs text-slate-400 md:grid">
              <span>발급 날짜</span>
              <span>학생</span>
              <span>교재</span>
              <span>틀린 문항</span>
              <span>방식</span>
              <span />
            </div>

            {!loading && !error && !issues.length && (
              <p className="px-2 py-10 text-center text-sm text-slate-400">
                {filtered
                  ? '조건에 맞는 다운목록이 없어요.'
                  : '아직 다운목록이 비어 있어요. 오답노트 화면에서 학생 이름을 넣고 개별 다운로드나 인쇄를 하면 여기에 남아요.'}
              </p>
            )}

            {visible.map((issue) => {
              const open = openIssue === issue.id;
              const hist = history[issue.student_key];
              return (
                <div key={issue.id} className="border-b border-slate-700/80">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-1 py-3 md:grid-cols-[150px_110px_150px_minmax(0,1fr)_110px_44px] md:items-start">
                    <div className="text-sm text-slate-300 md:pt-0.5">
                      {dayLabel(issue.recorded_on)}
                      <span className="ml-1.5 text-xs text-slate-500">{timeLabel(issue.last_at)}</span>
                    </div>
                    <div className="row-span-1 md:row-auto">
                      <button
                        aria-expanded={open}
                        className="text-left font-semibold text-teal-300 underline decoration-teal-300/40 underline-offset-4 hover:decoration-teal-300"
                        onClick={() => void toggleHistory(issue)}
                        title="이 학생 전체 이력 보기"
                        type="button"
                      >
                        {issue.student_name}
                      </button>
                    </div>
                    <div className="col-start-1 text-sm text-slate-200 md:col-auto md:pt-0.5">
                      {textbookName(issue.textbook)}
                    </div>
                    <div className="col-start-1 text-sm md:col-auto md:pt-0.5">
                      <Problems issue={issue} />
                      <div className="mt-1 text-xs text-slate-500">
                        {issue.problems.length}문항
                        {issue.units.length > 0 && ` · ${issue.units.join(', ')}`}
                      </div>
                    </div>
                    <div className="col-start-1 md:col-auto md:pt-0.5">
                      <Tags issue={issue} />
                    </div>
                    <div className="col-start-2 row-start-1 md:col-auto md:row-auto">
                      <button
                        aria-label={`${issue.student_name} ${textbookName(issue.textbook)} 기록 삭제`}
                        className="rounded-md border border-red-900/60 p-1.5 text-red-300 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-40"
                        disabled={deleting === issue.id}
                        onClick={() => void handleDelete(issue)}
                        title="잘못된 기록 삭제"
                        type="button"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mb-3 rounded-lg border border-teal-500/25 bg-slate-900/70 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100">
                          {issue.student_name} 전체 이력
                          {Array.isArray(hist) && (
                            <span className="ml-2 font-normal text-slate-400">
                              발급 {hist.length}건 · 문항 {hist.reduce((n, h) => n + h.problems.length, 0)}개
                            </span>
                          )}
                        </p>
                        <button
                          className="text-xs text-slate-400 hover:text-slate-100"
                          onClick={() => setOpenIssue('')}
                          type="button"
                        >
                          접기
                        </button>
                      </div>
                      {hist === 'loading' && <p className="mt-2 text-sm text-slate-400">불러오는 중…</p>}
                      {hist === 'error' && <p className="mt-2 text-sm text-red-300">이력을 불러오지 못했어요.</p>}
                      {Array.isArray(hist) && (
                        <HistoryList items={hist} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {issues.length > shown && (
            <div className="mt-4 text-center">
              <button
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-teal-400"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                type="button"
              >
                더 보기 ({issues.length - shown}건 남음)
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/** 학생 한 명의 날짜별 이력. 두 번 이상 틀린 문항은 노란색 ×n. */
function HistoryList({ items }: { items: Issue[] }) {
  const repeats = useMemo(() => {
    const count = new Map<string, number>();
    for (const issue of items)
      for (const p of issue.problems) {
        const key = `${issue.textbook}|${p.key}`;
        count.set(key, (count.get(key) ?? 0) + 1);
      }
    return count;
  }, [items]);
  const repeated = [...repeats.values()].filter((n) => n > 1).length;
  if (!items.length) return <p className="mt-2 text-sm text-slate-400">기록이 없어요.</p>;
  return (
    <>
      {repeated > 0 && (
        <p className="mt-1 text-xs text-amber-300">두 번 이상 틀린 문항 {repeated}개 (노란색)</p>
      )}
      <ul className="mt-2 divide-y divide-slate-800">
        {items.map((h) => (
          <li
            key={h.id}
            className="grid gap-x-3 gap-y-0.5 py-2 text-sm sm:grid-cols-[130px_150px_minmax(0,1fr)]"
          >
            <span className="text-slate-300">{dayLabel(h.recorded_on)}</span>
            <span className="text-slate-200">
              {textbookName(h.textbook)}
              <span className="ml-1 text-xs text-slate-500">{h.problems.length}문항</span>
            </span>
            <Problems issue={h} repeats={repeats} />
          </li>
        ))}
      </ul>
    </>
  );
}
