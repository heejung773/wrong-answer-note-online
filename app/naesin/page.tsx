'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { FileDown, Loader2, RefreshCw, Eye } from 'lucide-react';
import { GoToMainLogin } from '../admin/go-to-login';

/**
 * 내신 기출 오답노트 (2026-11-03 시범: 동화고1 2025 2학기 기말).
 * 학교 → 학년 → 시험을 고르고, 시험 안 번호(1~23 등)를 누른 뒤 PDF 를 만든다.
 * '변형 같이 넣기'를 켜면 각 번호 바로 뒤에 그 문항의 변형이 들어간다(칸 번호 '3번 변형1').
 * 시험 목록·PDF 는 모두 /api/generate(파이썬)에서 받는다: 목록 GET ?list=naesin, PDF POST textbook='naesin'.
 * 문항은 정수 번호가 아니라 문항 키(naesin-donghwa/g1/2025-2final/0001)로 서버가 찾는다.
 * 오답노트는 학생 1명씩만 만든다(일괄 없음). 오답 기록(wrong_answer_records)은 아직 남기지 않는다.
 */

type NaesinProblem = {
  no: number;
  position: string;
  score: number | null;
  format: string;
  difficulty: string;
  unit: string;
  type: string;
  variants: number;
};

type NaesinExam = {
  prefix: string;
  school: string;
  grade: string;
  exam: string;
  subject: string;
  year: number | null;
  title: string;
  problems: NaesinProblem[];
};

const GRADE_TO_PAYLOAD: Record<string, string> = {
  고1: '1학년',
  고2: '2학년',
  고3: '3학년',
  중1: '1학년',
  중2: '2학년',
  중3: '3학년',
};

const DIFFICULTY_CLASS: Record<string, string> = {
  하: 'text-slate-400',
  중: 'text-sky-300',
  상: 'text-amber-300',
  최상: 'text-rose-300',
};

function examHeading(exam: NaesinExam) {
  return [exam.school, exam.grade, exam.exam].filter(Boolean).join(' ');
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ko'));
}

export default function NaesinPage() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  const [loginRequired, setLoginRequired] = useState(false);
  const [exams, setExams] = useState<NaesinExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [prefix, setPrefix] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [includeVariants, setIncludeVariants] = useState(false);
  const [student, setStudent] = useState('');
  const [includeCover, setIncludeCover] = useState(true);

  const [busy, setBusy] = useState<'' | 'preview' | 'download'>('');
  const [notice, setNotice] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const previewRef = useRef('');

  const token = useCallback(async () => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return data.session?.access_token ?? '';
  }, [supabase]);

  const loadExams = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accessToken = await token();
      if (!accessToken) {
        setLoginRequired(true);
        return;
      }
      const response = await fetch('/api/generate?list=naesin', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const result = (await response.json().catch(() => ({}))) as {
        exams?: NaesinExam[];
        error?: string;
      };
      if (response.status === 401) {
        setLoginRequired(true);
        return;
      }
      if (!response.ok) throw new Error(result.error || '시험 목록을 불러오지 못했습니다.');
      const list = result.exams ?? [];
      setExams(list);
      // 시험이 하나뿐인 학교·학년은 바로 골라 둔다
      if (list.length > 0) {
        setSchool((s) => s || list[0].school);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '시험 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadExams(), 0);
    return () => window.clearTimeout(timer);
  }, [loadExams]);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const schools = useMemo(() => uniqueSorted(exams.map((e) => e.school)), [exams]);
  const grades = useMemo(
    () => uniqueSorted(exams.filter((e) => e.school === school).map((e) => e.grade)),
    [exams, school],
  );
  // 학교·학년을 바꾸면 그 아래 첫 항목이 골라진 것으로 본다(고른 번호는 바꿀 때 비운다)
  const activeGrade = grades.includes(grade) ? grade : (grades[0] ?? '');
  const examOptions = useMemo(
    () => exams.filter((e) => e.school === school && e.grade === activeGrade),
    [exams, school, activeGrade],
  );
  const exam = examOptions.find((e) => e.prefix === prefix) ?? examOptions[0] ?? null;

  const variantCount = useMemo(() => {
    if (!exam) return 0;
    const set = new Set(selected);
    return exam.problems.filter((p) => set.has(p.no)).reduce((sum, p) => sum + p.variants, 0);
  }, [exam, selected]);
  const totalItems = selected.length + (includeVariants ? variantCount : 0);

  function toggle(no: number) {
    setSelected((list) => (list.includes(no) ? list.filter((n) => n !== no) : [...list, no].sort((a, b) => a - b)));
  }

  function setPreview(url: string) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  }

  async function makePdf(mode: 'preview' | 'download') {
    if (!exam) return;
    if (!selected.length) {
      setNotice('문항 번호를 하나 이상 골라 주세요.');
      return;
    }
    const name = student.trim();
    if (mode === 'download' && !name) {
      setNotice('학생 이름을 넣어 주세요.');
      return;
    }
    setBusy(mode);
    setNotice('');
    try {
      const accessToken = await token();
      if (!accessToken) {
        setLoginRequired(true);
        return;
      }
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          textbook: 'naesin',
          naesinExam: exam.prefix,
          naesinNumbers: selected,
          includeVariants,
          student: name || '학생',
          grade: GRADE_TO_PAYLOAD[exam.grade] ?? '1학년',
          includeCover,
          preview: mode === 'preview',
        }),
      });
      if (response.status === 401) {
        setLoginRequired(true);
        return;
      }
      const type = response.headers.get('Content-Type') ?? '';
      if (type.includes('application/json')) {
        const result = (await response.json().catch(() => ({}))) as { error?: string; downloadUrl?: string };
        if (!response.ok || !result.downloadUrl) throw new Error(result.error || 'PDF 를 만들지 못했습니다.');
        // 큰 파일은 서버가 임시 주소로 준다
        if (mode === 'preview') setPreview(result.downloadUrl);
        else window.open(result.downloadUrl, '_blank', 'noopener');
        return;
      }
      if (!response.ok) throw new Error('PDF 를 만들지 못했습니다.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (mode === 'preview') {
        setPreview(url);
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}_${examHeading(exam).replaceAll(' ', '_')}${includeVariants ? '_변형포함' : ''}_오답노트.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(`${name} 학생 오답노트를 내려받았어요 (${totalItems}문항).`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'PDF 를 만들지 못했습니다.');
    } finally {
      setBusy('');
    }
  }

  if (loginRequired) return <GoToMainLogin />;

  const selectClass =
    'h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 [color-scheme:dark] focus:border-teal-400 focus:outline-none disabled:opacity-50';

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-700 pb-3" aria-label="내신 기출 메뉴">
          <span className="text-xs uppercase tracking-[0.25em] text-sky-300">School Exams</span>
          <h1 className="text-lg font-semibold text-slate-50">내신 기출 오답노트</h1>
          <Link
            className="ml-auto inline-flex items-center rounded-full border border-teal-700/70 bg-teal-950/40 px-3 py-1.5 text-sm font-semibold text-teal-300 hover:bg-teal-900/50 hover:text-teal-100"
            href="/"
          >
            ← 교재 오답노트로
          </Link>
        </nav>

        <div className="mt-6 grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <section className="space-y-5">
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 sm:p-5">
              <h2 className="text-[17px] font-bold text-slate-50">
                <span className="mr-2 text-sky-300">01</span>시험 고르기
              </h2>
              {loading ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="size-4 animate-spin" /> 시험 목록을 불러오는 중…
                </p>
              ) : error ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-amber-300">{error}</p>
                  <button
                    type="button"
                    onClick={() => void loadExams()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-teal-400"
                  >
                    <RefreshCw className="size-4" /> 다시 불러오기
                  </button>
                </div>
              ) : !exams.length ? (
                <p className="mt-4 text-sm text-slate-400">아직 올라온 내신 시험이 없어요.</p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-[13px] font-semibold text-slate-300">학교</span>
                    <select
                      className={selectClass}
                      value={school}
                      onChange={(e) => {
                        setSchool(e.target.value);
                        setSelected([]);
                      }}
                    >
                      {schools.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[13px] font-semibold text-slate-300">학년</span>
                    <select
                      className={selectClass}
                      value={activeGrade}
                      onChange={(e) => {
                        setGrade(e.target.value);
                        setSelected([]);
                      }}
                    >
                      {grades.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 space-y-1.5">
                    <span className="text-[13px] font-semibold text-slate-300">시험</span>
                    <select
                      className={selectClass}
                      value={exam?.prefix ?? ''}
                      onChange={(e) => {
                        setPrefix(e.target.value);
                        setSelected([]);
                      }}
                    >
                      {examOptions.map((e) => (
                        <option key={e.prefix} value={e.prefix}>
                          {e.exam}
                          {e.subject ? ` · ${e.subject}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {exam && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-bold text-slate-50">
                    <span className="mr-2 text-sky-300">02</span>틀린 번호 고르기
                  </h2>
                  <span className="text-[13px] text-slate-400">
                    {selected.length}/{exam.problems.length}개
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-slate-400">{examHeading(exam)} · 누르면 골라지고 다시 누르면 빠져요.</p>
                <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-6">
                  {exam.problems.map((p) => {
                    const on = selected.includes(p.no);
                    return (
                      <button
                        key={p.no}
                        type="button"
                        aria-pressed={on}
                        title={[p.position, p.score ? `${p.score}점` : '', p.format, p.difficulty, p.unit, p.type]
                          .filter(Boolean)
                          .join(' · ')}
                        onClick={() => toggle(p.no)}
                        className={
                          'flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors ' +
                          (on
                            ? 'border-teal-300 bg-teal-500/25 text-teal-100'
                            : 'border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-400')
                        }
                      >
                        <span>{p.no}</span>
                        <span className={'text-[10px] font-medium ' + (DIFFICULTY_CLASS[p.difficulty] ?? 'text-slate-500')}>
                          {p.difficulty || ' '}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="rounded-lg border border-slate-600 px-2.5 py-1 text-slate-300 hover:border-slate-400"
                  >
                    모두 비우기
                  </button>
                </div>
                <label
                  aria-label="변형 같이 넣기"
                  className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-100">변형 같이 넣기</span>
                    <span className="block text-[12px] text-slate-400">
                      고른 번호마다 변형을 바로 뒤에 넣어요{selected.length ? ` (변형 ${variantCount}개)` : ''}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="변형 같이 넣기"
                    className="size-5 accent-teal-400"
                    checked={includeVariants}
                    onChange={(e) => setIncludeVariants(e.target.checked)}
                  />
                </label>
              </div>
            )}

            {exam && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 sm:p-5">
                <h2 className="text-[17px] font-bold text-slate-50">
                  <span className="mr-2 text-sky-300">03</span>학생·출력
                </h2>
                <label className="mt-4 block space-y-1.5">
                  <span className="text-[13px] font-semibold text-slate-300">학생 이름 (한 명)</span>
                  <input
                    className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
                    value={student}
                    onChange={(e) => setStudent(e.target.value)}
                    placeholder="이름만 (학교는 붙이지 않아요)"
                    autoComplete="off"
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    className="size-4 accent-teal-400"
                    checked={includeCover}
                    onChange={(e) => setIncludeCover(e.target.checked)}
                  />
                  표지 넣기
                </label>
                <p className="mt-3 text-[13px] text-slate-400">
                  모두 <b className="text-teal-300">{totalItems}</b>문항
                  {includeVariants && variantCount ? ` (원본 ${selected.length} + 변형 ${variantCount})` : ''} ·{' '}
                  {Math.ceil(totalItems / 4) || 0}쪽 + 정답 1쪽
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!!busy || !selected.length}
                    onClick={() => void makePdf('preview')}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-500 text-sm font-semibold text-slate-100 hover:border-teal-300 disabled:opacity-50"
                  >
                    {busy === 'preview' ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                    미리보기
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !selected.length}
                    onClick={() => void makePdf('download')}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#35c3ca] text-sm font-bold text-slate-950 hover:bg-[#5fd6dc] disabled:opacity-50"
                  >
                    {busy === 'download' ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                    PDF 다운로드
                  </button>
                </div>
                {notice && (
                  <p className="mt-3 text-sm text-amber-200" aria-live="polite">
                    {notice}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="min-h-[60vh] rounded-xl border border-slate-700 bg-[#0b1220] p-3">
            {previewUrl ? (
              <iframe title="내신 오답노트 미리보기" src={previewUrl} className="h-[78vh] w-full rounded-lg bg-white" />
            ) : (
              <div className="flex h-full min-h-[60vh] items-center justify-center p-6 text-center text-sm leading-6 text-slate-400">
                학교 · 학년 · 시험을 고르고 틀린 번호를 누른 뒤
                <br />
                미리보기를 누르면 여기에 오답노트가 보여요.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
