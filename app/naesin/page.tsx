'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  FileDown,
  Loader2,
  RefreshCw,
  Eye,
  ExternalLink,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  X,
} from 'lucide-react';
import { GoToMainLogin } from '../admin/go-to-login';

/**
 * 내신 기출 오답노트 (2026-11-03).
 * 위쪽 공통: 학교 → 학년 → 시험 → 틀린 번호 → 학생 이름. 그 아래 탭 두 개.
 *  [오답노트] 고른 틀린 번호의 원본 문항만으로 PDF.
 *  [변형문제] 같은 번호를 이어받아, 번호마다 왼쪽 원본 · 오른쪽 변형 그림을 나란히 보고 변형을 체크해서 PDF.
 *            '원본도 같이 넣기'(기본 켬)면 원본 바로 뒤에 고른 변형, 끄면 고른 변형만. 표지 제목에 '변형' 표시.
 *            변형 번호는 exam.json variants 배열 순서(변형1·2·3)로 고정 — 하나만 골라도 '10번 변형2'.
 * 시험 목록·그림·PDF 는 모두 /api/generate(파이썬): 목록 GET ?list=naesin, 그림 GET ?naesinProblem=<prefix>&no=9,
 * PDF POST textbook='naesin'(+ [변형문제] naesinVariantKeys·includeOriginals, 서버가 key 를 exam.json 과 대조).
 * 손풀이 QR(includeSolutionQr): 원본 문항 중 Supabase naesin_solution_links 에 링크가 있는 것만. 변형은 QR 없음.
 * 미리보기: 가로폭 맞춤 · 화면 가득 · 새 창에서 크게 보기(태블릿에서 iframe 안 PDF 확대가 안 되는 경우 대비).
 * 오답노트는 학생 1명씩만 만든다(일괄 없음). 오답 기록(wrong_answer_records)은 아직 남기지 않는다.
 */

type NaesinVariantRef = { key: string; difficulty: string };

type NaesinProblem = {
  no: number;
  position: string;
  score: number | null;
  format: string;
  difficulty: string;
  unit: string;
  type: string;
  variants: number;
  variantList?: NaesinVariantRef[];
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

type GalleryItem = { key: string; label: string; variant: number; difficulty: string; image: string };
type GalleryEntry = { items?: GalleryItem[]; error?: string };
type Tab = 'note' | 'variants';
type Zoom = { no: number; item: GalleryItem };

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

function variantKeysOf(problem: NaesinProblem | undefined) {
  return (problem?.variantList ?? []).map((v) => v.key);
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
  const [student, setStudent] = useState('');
  const [includeCover, setIncludeCover] = useState(true);
  const [includeSolutionQr, setIncludeSolutionQr] = useState(true);

  const [tab, setTab] = useState<Tab>('note');
  const [picked, setPicked] = useState<string[]>([]);
  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [gallery, setGallery] = useState<Record<string, GalleryEntry>>({});
  const galleryLoading = useRef(new Set<string>());
  const [zoom, setZoom] = useState<Zoom | null>(null);

  const [busy, setBusy] = useState<'' | 'preview' | 'download'>('');
  const [notice, setNotice] = useState('');
  const [previews, setPreviews] = useState<Record<Tab, string>>({ note: '', variants: '' });
  const previewsRef = useRef<Record<Tab, string>>({ note: '', variants: '' });
  const [previewFull, setPreviewFull] = useState(false);
  const [previewFitWidth, setPreviewFitWidth] = useState(false);

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
      for (const url of Object.values(previewsRef.current)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
    },
    [],
  );

  // 화면 가득 미리보기·큰 그림은 Esc 로 닫는다
  useEffect(() => {
    if (!previewFull && !zoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (zoom) setZoom(null);
      else setPreviewFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewFull, zoom]);

  const schools = useMemo(() => uniqueSorted(exams.map((e) => e.school)), [exams]);
  const grades = useMemo(
    () => uniqueSorted(exams.filter((e) => e.school === school).map((e) => e.grade)),
    [exams, school],
  );
  const activeGrade = grades.includes(grade) ? grade : (grades[0] ?? '');
  const examOptions = useMemo(
    () => exams.filter((e) => e.school === school && e.grade === activeGrade),
    [exams, school, activeGrade],
  );
  const exam = examOptions.find((e) => e.prefix === prefix) ?? examOptions[0] ?? null;
  const examPrefix = exam?.prefix ?? '';

  const problemByNo = useMemo(() => new Map((exam?.problems ?? []).map((p) => [p.no, p])), [exam]);

  // 고른 변형: 지금 고른 번호의 변형만 유효. 순서는 번호 순 → variants 배열 순(서버도 같은 순서로 넣음)
  const pickedKeys = useMemo(() => {
    const set = new Set(picked);
    return selected.flatMap((no) => variantKeysOf(problemByNo.get(no)).filter((key) => set.has(key)));
  }, [picked, selected, problemByNo]);

  const noteItems = selected.length;
  const variantItems = (includeOriginals ? selected.length : 0) + pickedKeys.length;
  const totalItems = tab === 'note' ? noteItems : variantItems;

  // [변형문제] 탭: 고른 번호의 원본·변형 그림을 한 번만 받아 둔다
  useEffect(() => {
    if (tab !== 'variants' || !examPrefix || !selected.length) return;
    const wanted = selected.filter((no) => {
      const id = `${examPrefix}|${no}`;
      return !gallery[id] && !galleryLoading.current.has(id);
    });
    if (!wanted.length) return;
    const timer = window.setTimeout(() => {
      for (const no of wanted) {
        const id = `${examPrefix}|${no}`;
        galleryLoading.current.add(id);
        void (async () => {
          let entry: GalleryEntry;
          try {
            const accessToken = await token();
            const response = await fetch(
              `/api/generate?naesinProblem=${encodeURIComponent(examPrefix)}&no=${no}`,
              { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
            );
            const result = (await response.json().catch(() => ({}))) as { items?: GalleryItem[]; error?: string };
            if (response.status === 401) {
              setLoginRequired(true);
              return;
            }
            entry = response.ok && result.items ? { items: result.items } : { error: result.error || '그림을 불러오지 못했어요.' };
          } catch {
            entry = { error: '그림을 불러오지 못했어요.' };
          } finally {
            galleryLoading.current.delete(id);
          }
          setGallery((g) => ({ ...g, [id]: entry }));
        })();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tab, examPrefix, selected, gallery, token]);

  function toggle(no: number) {
    setSelected((list) => (list.includes(no) ? list.filter((n) => n !== no) : [...list, no].sort((a, b) => a - b)));
  }

  function resetSelection() {
    setSelected([]);
    setPicked([]);
  }

  function togglePick(key: string) {
    setPicked((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  function pickAll(no: number, on: boolean) {
    const keys = variantKeysOf(problemByNo.get(no));
    setPicked((list) => (on ? [...new Set([...list, ...keys])] : list.filter((k) => !keys.includes(k))));
  }

  function setPreview(which: Tab, url: string) {
    const old = previewsRef.current[which];
    if (old.startsWith('blob:')) URL.revokeObjectURL(old);
    previewsRef.current = { ...previewsRef.current, [which]: url };
    setPreviews(previewsRef.current);
  }

  async function makePdf(mode: 'preview' | 'download') {
    if (!exam) return;
    const which = tab;
    if (!selected.length) {
      setNotice('틀린 번호를 하나 이상 골라 주세요.');
      return;
    }
    if (which === 'variants' && !pickedKeys.length) {
      setNotice('넣을 변형을 하나 이상 체크해 주세요.');
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
      const body: Record<string, unknown> = {
        textbook: 'naesin',
        naesinExam: exam.prefix,
        naesinNumbers: selected,
        student: name || '학생',
        grade: GRADE_TO_PAYLOAD[exam.grade] ?? '1학년',
        includeCover,
        includeSolutionQr,
        preview: mode === 'preview',
      };
      if (which === 'variants') {
        body.naesinVariantKeys = pickedKeys;
        body.includeOriginals = includeOriginals;
      }
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
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
        if (mode === 'preview') setPreview(which, result.downloadUrl);
        else window.open(result.downloadUrl, '_blank', 'noopener');
        return;
      }
      if (!response.ok) throw new Error('PDF 를 만들지 못했습니다.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (mode === 'preview') {
        setPreview(which, url);
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      const kind = which === 'variants' ? '변형문제' : '오답노트';
      link.download = `${name}_${examHeading(exam).replaceAll(' ', '_')}_${kind}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(`${name} 학생 ${kind}를 내려받았어요 (${totalItems}문항).`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'PDF 를 만들지 못했습니다.');
    } finally {
      setBusy('');
    }
  }

  if (loginRequired) return <GoToMainLogin />;

  const selectClass =
    'h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 [color-scheme:dark] focus:border-teal-400 focus:outline-none disabled:opacity-50';
  const cardClass = 'rounded-xl border border-slate-700 bg-slate-800/80 p-4 sm:p-5';
  const smallButton =
    'rounded-lg border border-slate-600 px-2.5 py-1 text-[13px] text-slate-300 hover:border-slate-400 disabled:opacity-40';
  const previewUrl = previews[tab];
  const zoomPicked = zoom ? picked.includes(zoom.item.key) : false;

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
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

        {/* 위쪽 공통: 시험 → 틀린 번호 → 학생 */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
          <div className={cardClass}>
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
                      resetSelection();
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
                      resetSelection();
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
                      resetSelection();
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
            <div className={cardClass}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-bold text-slate-50">
                  <span className="mr-2 text-sky-300">02</span>틀린 번호 고르기
                </h2>
                <span className="text-[13px] text-slate-400">
                  {selected.length}/{exam.problems.length}개
                </span>
              </div>
              <p className="mt-1 text-[13px] text-slate-400">{examHeading(exam)} · 누르면 골라지고 다시 누르면 빠져요.</p>
              <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-9 lg:grid-cols-7 xl:grid-cols-9">
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
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={resetSelection} className={smallButton}>
                  모두 비우기
                </button>
              </div>
            </div>
          )}

          {exam && (
            <div className={cardClass}>
              <h2 className="text-[17px] font-bold text-slate-50">
                <span className="mr-2 text-sky-300">03</span>학생
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
              <label className="mt-2 flex items-start gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-teal-400"
                  checked={includeSolutionQr}
                  onChange={(e) => setIncludeSolutionQr(e.target.checked)}
                />
                <span>
                  손풀이 QR 포함
                  <span className="block text-[12px] text-slate-400">
                    손풀이 영상이 있는 원본 문항에만 찍혀요. 변형 문항은 QR 없이 나와요.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>

        {exam && (
          <>
            <div className="mt-6 flex gap-1 border-b border-slate-700" role="tablist" aria-label="만들 것">
              {(
                [
                  ['note', '오답노트', `${selected.length}문항`],
                  ['variants', '변형문제', `변형 ${pickedKeys.length}개 고름`],
                ] as const
              ).map(([id, label, sub]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    setNotice('');
                  }}
                  className={
                    '-mb-px rounded-t-lg border px-4 py-2.5 text-sm font-bold transition-colors ' +
                    (tab === id
                      ? 'border-slate-600 border-b-[#0b1220] bg-[#0b1220] text-teal-200'
                      : 'border-transparent text-slate-400 hover:text-slate-200')
                  }
                >
                  {label}
                  <span className="ml-2 text-[12px] font-medium text-slate-400">{sub}</span>
                </button>
              ))}
            </div>

            {tab === 'variants' && (
              <section className="mt-4 space-y-4" aria-label="변형 고르기">
                {!selected.length ? (
                  <p className="rounded-xl border border-dashed border-slate-600 p-6 text-center text-sm text-slate-400">
                    위 02 에서 틀린 번호를 먼저 골라 주세요. 고른 번호의 원본과 변형이 여기에 나란히 나와요.
                  </p>
                ) : (
                  selected.map((no) => {
                    const problem = problemByNo.get(no);
                    const keys = variantKeysOf(problem);
                    const chosen = keys.filter((k) => picked.includes(k)).length;
                    const entry = gallery[`${examPrefix}|${no}`];
                    const original = entry?.items?.find((item) => item.variant === 0);
                    const variants = entry?.items?.filter((item) => item.variant > 0) ?? [];
                    return (
                      <article key={no} className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 sm:p-4">
                        <header className="mb-3 flex flex-wrap items-center gap-2">
                          <h3 className="text-[16px] font-bold text-slate-50">{no}번</h3>
                          <span className="text-[13px] text-slate-400">
                            변형 {keys.length}개 중 <b className="text-teal-300">{chosen}</b>개 골랐어요
                          </span>
                          <span className="ml-auto flex gap-1.5">
                            <button
                              type="button"
                              disabled={!keys.length || chosen === keys.length}
                              onClick={() => pickAll(no, true)}
                              className={smallButton}
                            >
                              모두 선택
                            </button>
                            <button type="button" disabled={!chosen} onClick={() => pickAll(no, false)} className={smallButton}>
                              해제
                            </button>
                          </span>
                        </header>
                        {!entry ? (
                          <p className="flex items-center gap-2 text-sm text-slate-400">
                            <Loader2 className="size-4 animate-spin" /> 그림을 불러오는 중…
                          </p>
                        ) : entry.error ? (
                          <p className="text-sm text-amber-300">{entry.error}</p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
                            <div className="md:border-r md:border-slate-700 md:pr-3">
                              {original && (
                                <ProblemFigure item={original} caption="원본" onZoom={() => setZoom({ no, item: original })} />
                              )}
                            </div>
                            {variants.length ? (
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {variants.map((item) => (
                                  <ProblemFigure
                                    key={item.key}
                                    item={item}
                                    caption={`${item.label}${item.difficulty ? ` · ${item.difficulty}` : ''}`}
                                    picked={picked.includes(item.key)}
                                    onPick={() => togglePick(item.key)}
                                    onZoom={() => setZoom({ no, item })}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="self-center text-sm text-slate-400">이 문항은 변형이 없어요.</p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </section>
            )}

            <div className="mt-4 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
              <section className={cardClass + ' self-start'} aria-label="만들기">
                <h2 className="text-[17px] font-bold text-slate-50">
                  {tab === 'note' ? '오답노트 만들기' : '변형문제 만들기'}
                </h2>
                {tab === 'note' ? (
                  <p className="mt-2 text-[13px] text-slate-400">고른 틀린 번호의 원본 문항만 들어가요.</p>
                ) : (
                  <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-teal-400"
                      checked={includeOriginals}
                      onChange={(e) => setIncludeOriginals(e.target.checked)}
                    />
                    <span>
                      원본도 같이 넣기
                      <span className="block text-[12px] text-slate-400">
                        켜면 원본 바로 뒤에 고른 변형, 끄면 고른 변형만 들어가요.
                      </span>
                    </span>
                  </label>
                )}
                <p className="mt-3 text-[13px] text-slate-400">
                  모두 <b className="text-teal-300">{totalItems}</b>문항
                  {tab === 'variants' && includeOriginals && pickedKeys.length
                    ? ` (원본 ${selected.length} + 변형 ${pickedKeys.length})`
                    : ''}{' '}
                  · {Math.ceil(totalItems / 4) || 0}쪽 + 정답 1쪽
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!!busy || !totalItems || (tab === 'variants' && !pickedKeys.length)}
                    onClick={() => void makePdf('preview')}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-500 text-sm font-semibold text-slate-100 hover:border-teal-300 disabled:opacity-50"
                  >
                    {busy === 'preview' ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                    미리보기
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !totalItems || (tab === 'variants' && !pickedKeys.length)}
                    onClick={() => void makePdf('download')}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#35c3ca] text-sm font-bold text-slate-950 hover:bg-[#5fd6dc] disabled:opacity-50"
                  >
                    {busy === 'download' ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                    PDF 다운로드
                  </button>
                </div>
                {tab === 'variants' && selected.length > 0 && !pickedKeys.length && (
                  <p className="mt-3 text-[13px] text-slate-400">위에서 넣을 변형을 체크해 주세요.</p>
                )}
                {notice && (
                  <p className="mt-3 text-sm text-amber-200" aria-live="polite">
                    {notice}
                  </p>
                )}
              </section>

              <section
                className={
                  previewFull
                    ? 'fixed inset-2 z-50 flex flex-col rounded-xl border border-slate-600 bg-[#0b1220] p-2 shadow-2xl sm:inset-4 sm:p-3'
                    : 'flex min-h-[60vh] min-w-0 flex-col rounded-xl border border-slate-700 bg-[#0b1220] p-3 lg:sticky lg:top-4 lg:self-start'
                }
                aria-label="미리보기"
              >
                {previewUrl && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="mr-auto text-sm font-semibold text-slate-200">
                      미리보기 · {tab === 'note' ? '오답노트' : '변형문제'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewFitWidth((v) => !v)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-600 px-2.5 text-[13px] font-semibold text-slate-200 hover:border-teal-300"
                      title={previewFitWidth ? '한 쪽 전체가 보이게' : '종이 가로폭에 맞춰 크게'}
                    >
                      <MoveHorizontal className="size-4" />
                      {previewFitWidth ? '쪽 전체' : '가로폭 맞춤'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFull((v) => !v)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-600 px-2.5 text-[13px] font-semibold text-slate-200 hover:border-teal-300"
                      title={previewFull ? '원래 자리로 (Esc)' : '화면 가득 크게 보기'}
                    >
                      {previewFull ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                      {previewFull ? '원래 크기' : '화면 가득'}
                    </button>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel={previewUrl.startsWith('blob:') ? undefined : 'noopener noreferrer'}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-teal-600/60 bg-teal-900/30 px-2.5 text-[13px] font-semibold text-teal-200 hover:bg-teal-800/40"
                      title="새 창(탭)에서 열어 손가락·Ctrl+휠로 확대"
                    >
                      <ExternalLink className="size-4" />새 창에서 크게 보기
                    </a>
                  </div>
                )}
                {previewUrl ? (
                  <iframe
                    key={`${previewUrl}-${previewFitWidth ? 'FitH' : 'Fit'}`}
                    title="내신 오답노트 미리보기"
                    src={`${previewUrl}#view=${previewFitWidth ? 'FitH' : 'Fit'}`}
                    className={
                      'w-full rounded-lg bg-white ' +
                      (previewFull ? 'min-h-0 flex-1' : 'h-[calc(100vh-7.5rem)] min-h-[520px]')
                    }
                  />
                ) : (
                  <div className="flex h-full min-h-[60vh] items-center justify-center p-6 text-center text-sm leading-6 text-slate-400">
                    {tab === 'note' ? '틀린 번호를 고른 뒤' : '넣을 변형을 체크한 뒤'}
                    <br />
                    미리보기를 누르면 여기에 {tab === 'note' ? '오답노트' : '변형문제'}가 보여요.
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      {zoom && (
        <section
          className="fixed inset-0 z-[60] flex flex-col p-2 sm:p-6"
          aria-label={`${zoom.no}번 ${zoom.item.label} 크게 보기`}
        >
          {/* 바깥(어두운 곳)을 누르면 닫힘 */}
          <button
            type="button"
            aria-label="크게 보기 닫기"
            className="absolute inset-0 cursor-default bg-black/85"
            onClick={() => setZoom(null)}
          />
          <div className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 pb-2 text-slate-100">
            <span className="mr-auto text-[15px] font-bold">
              {zoom.no}번 {zoom.item.label}
              {zoom.item.difficulty ? ` · ${zoom.item.difficulty}` : ''}
            </span>
            {zoom.item.variant > 0 && (
              <label className="flex items-center gap-2 rounded-lg border border-slate-500 bg-slate-900 px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-teal-400"
                  checked={zoomPicked}
                  onChange={() => togglePick(zoom.item.key)}
                />
                이 변형 넣기
              </label>
            )}
            <button
              type="button"
              onClick={() => setZoom(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-500 bg-slate-900 px-3 py-1.5 text-sm hover:border-slate-300"
            >
              <X className="size-4" /> 닫기
            </button>
          </div>
          <div className="relative mx-auto w-full max-w-5xl flex-1 overflow-auto rounded-lg bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.item.image} alt={`${zoom.no}번 ${zoom.item.label}`} className="h-auto w-full" />
          </div>
        </section>
      )}
    </main>
  );
}

function ProblemFigure({
  item,
  caption,
  picked,
  onPick,
  onZoom,
}: {
  item: GalleryItem;
  caption: string;
  picked?: boolean;
  onPick?: () => void;
  onZoom: () => void;
}) {
  const pickable = Boolean(onPick);
  return (
    <figure
      className={
        'flex min-w-0 flex-col overflow-hidden rounded-lg border ' +
        (picked ? 'border-teal-300 ring-2 ring-teal-400/50' : 'border-slate-600')
      }
    >
      <button
        type="button"
        onClick={onZoom}
        className="block bg-white p-1.5 hover:opacity-90"
        title="눌러서 크게 보기"
        aria-label={`${caption} 크게 보기`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image} alt={caption} className="mx-auto max-h-56 w-full object-contain object-top" />
      </button>
      <figcaption className="flex items-center gap-2 bg-slate-900 px-2.5 py-2 text-[13px]">
        {pickable ? (
          <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-100">
            <input type="checkbox" className="size-4 accent-teal-400" checked={!!picked} onChange={onPick} />
            <span className="text-amber-300">{caption}</span>
          </label>
        ) : (
          <span className="font-semibold text-sky-200">{caption}</span>
        )}
      </figcaption>
    </figure>
  );
}
