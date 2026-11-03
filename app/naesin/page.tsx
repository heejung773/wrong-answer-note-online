'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  ListChecks,
  Loader2,
  LogOut,
  MoveHorizontal,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { GoToMainLogin } from '../admin/go-to-login';

/**
 * 내신 기출 (2026-11-03 선생님 결정 3차).
 * 맨 위에서 [오답노트 만들기] / [변형문제 만들기] 를 고른다. 학교 → 학년 → 시험은 두 모드가 같이 쓴다.
 *  [오답노트 만들기] 교재 오답노트 생성기(app/page.tsx)와 같은 양식·배치·CSS(generator-*):
 *      왼쪽 입력(틀린 번호, 학생, 표지·손풀이 QR, 미리보기 갱신·다운로드), 오른쪽 PDF 미리보기. 원본만 넣는다.
 *  [변형문제 만들기] 트윈 시험지 만들기 화면처럼 두 칸(각자 스크롤):
 *      왼쪽 이 시험 원본 문항 그림을 번호 순서로 세로 나열, 누르면 '오답'으로 골라지고 다시 누르면 빠짐(고른 변형 수 표시).
 *      오른쪽 지금 보는 문항의 원본(작게, 위에 고정) + 변형(크게, 위아래), 변형마다 '넣기' 체크, 그림 누르면 크게.
 *      위쪽 줄: 학생 이름, 원본도 같이 넣기(기본 켬), 표지, 손풀이 QR, 미리보기(화면 가득 창)·다운로드.
 *      변형 번호는 exam.json variants 배열 순서(변형1·2·3) 고정. 휴대폰 폭은 왼쪽 목록 → 오른쪽 변형 순서로 위아래.
 * 서버(파이썬): 목록 GET /api/naesin_list(가벼운 함수, generate ?list=naesin 과 같은 결과), /api/generate 의 원본 전부 GET ?naesinOriginals=<prefix>,
 *  한 번호 원본+변형 GET ?naesinProblem=<prefix>&no=9, PDF POST textbook='naesin'
 *  (+ 변형 모드 naesinVariantKeys·includeOriginals → 서버가 key 를 exam.json 과 대조, 표지 제목 '… 변형').
 * 손풀이 QR(includeSolutionQr): 원본 문항 중 Supabase naesin_solution_links 에 링크가 있는 것만. 변형은 QR 없음.
 * 오답노트는 학생 1명씩만(일괄 없음). 오답 기록(wrong_answer_records)은 아직 남기지 않는다.
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

// width: 그림 원래 폭(px). 원본(약 900)·변형(880)을 같은 배율로 보이게 할 때 쓴다
type GalleryItem = { key: string; label: string; variant: number; difficulty: string; image: string; width?: number };
type OriginalItem = { no: number; key: string; difficulty: string; variants: number; image: string; width?: number };
type Loaded<T> = { items?: T[]; error?: string };
type Mode = 'note' | 'variants';
type Zoom = { title: string; image: string; key?: string };

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

// 트윈 화면과 같은 '고른 문항' 색
const PICK = '#d63fd0';
const CHECKED = '#818cf8';
// 같은 배율의 기준 폭: 그림 중 가장 넓은 폭(없으면 원본 최대 폭 근처)
const BASE_WIDTH = 914;

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

  const [mode, setMode] = useState<Mode>('note');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [prefix, setPrefix] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [student, setStudent] = useState('');
  const [includeCover, setIncludeCover] = useState(true);
  const [includeSolutionQr, setIncludeSolutionQr] = useState(true);
  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const leftPane = useRef<HTMLDivElement | null>(null);
  const rightPane = useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = useState(0);

  const [originals, setOriginals] = useState<Record<string, Loaded<OriginalItem>>>({});
  const [gallery, setGallery] = useState<Record<string, Loaded<GalleryItem>>>({});
  const inFlight = useRef(new Set<string>());
  const [zoom, setZoom] = useState<Zoom | null>(null);

  const [busy, setBusy] = useState<'' | 'download'>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [previews, setPreviews] = useState<Record<Mode, string>>({ note: '', variants: '' });
  const previewsRef = useRef<Record<Mode, string>>({ note: '', variants: '' });
  const previewAbort = useRef<AbortController | null>(null);
  // 기본은 가로폭 맞춤: A4 한 쪽이 미리보기 칸 너비를 꽉 채운다
  const [previewViewMode, setPreviewViewMode] = useState<'Fit' | 'FitH'>('FitH');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [variantPreviewOpen, setVariantPreviewOpen] = useState(false);

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
      // 가벼운 목록 함수(api/naesin_list.py): PDF 라이브러리 없이 R2 목록 파일 1번 읽기
      const response = await fetch('/api/naesin_list', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const result = (await response.json().catch(() => ({}))) as { exams?: NaesinExam[]; error?: string };
      if (response.status === 401) {
        setLoginRequired(true);
        return;
      }
      if (!response.ok) throw new Error(result.error || '시험 목록을 불러오지 못했습니다.');
      const list = result.exams ?? [];
      setExams(list);
      if (list.length > 0) setSchool((s) => s || list[0].school);
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
      previewAbort.current?.abort();
      for (const url of Object.values(previewsRef.current)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
    },
    [],
  );

  // 큰 그림 → 변형 미리보기 창 → 오답노트 대형 확대 순서로 Esc 가 닫는다
  useEffect(() => {
    if (!zoom && !variantPreviewOpen && !previewExpanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (zoom) setZoom(null);
      else if (variantPreviewOpen) setVariantPreviewOpen(false);
      else setPreviewExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, variantPreviewOpen, previewExpanded]);

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

  // 고른 변형: 지금 고른 번호의 변형만 유효. 순서는 번호 순 → variants 배열 순(서버도 같은 순서)
  const pickedKeys = useMemo(() => {
    const set = new Set(picked);
    return selected.flatMap((no) => variantKeysOf(problemByNo.get(no)).filter((key) => set.has(key)));
  }, [picked, selected, problemByNo]);
  const pickedCountByNo = useMemo(() => {
    const set = new Set(picked);
    return new Map(selected.map((no) => [no, variantKeysOf(problemByNo.get(no)).filter((k) => set.has(k)).length]));
  }, [picked, selected, problemByNo]);

  const focusNo = active !== null && problemByNo.has(active) ? active : null;
  const setCount = Math.max(0, ...(exam?.problems ?? []).map((p) => p.variants));
  const totalItems = mode === 'note' ? selected.length : (includeOriginals ? selected.length : 0) + pickedKeys.length;

  // [변형문제 만들기] 그림: 원본 전부(왼쪽) 한 번, 체크한 번호의 원본+변형(오른쪽) 번호마다 한 번
  useEffect(() => {
    if (mode !== 'variants' || !examPrefix) return;
    const jobs: { id: string; url: string; target: 'originals' | 'gallery' }[] = [];
    if (!originals[examPrefix] && !inFlight.current.has(`o|${examPrefix}`)) {
      jobs.push({ id: `o|${examPrefix}`, url: `/api/generate?naesinOriginals=${encodeURIComponent(examPrefix)}`, target: 'originals' });
    }
    for (const no of selected) {
      const galleryId = `${examPrefix}|${no}`;
      if (!gallery[galleryId] && !inFlight.current.has(`g|${galleryId}`)) {
        jobs.push({
          id: `g|${galleryId}`,
          url: `/api/generate?naesinProblem=${encodeURIComponent(examPrefix)}&no=${no}`,
          target: 'gallery',
        });
      }
    }
    if (!jobs.length) return;
    const timer = window.setTimeout(() => {
      for (const job of jobs) {
        inFlight.current.add(job.id);
        void (async () => {
          let entry: Loaded<GalleryItem & OriginalItem>;
          try {
            const accessToken = await token();
            const response = await fetch(job.url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
            const result = (await response.json().catch(() => ({}))) as Loaded<GalleryItem & OriginalItem>;
            if (response.status === 401) {
              setLoginRequired(true);
              return;
            }
            entry = response.ok && result.items ? { items: result.items } : { error: result.error || '그림을 불러오지 못했어요.' };
          } catch {
            entry = { error: '그림을 불러오지 못했어요.' };
          } finally {
            inFlight.current.delete(job.id);
          }
          const key = job.id.slice(2);
          if (job.target === 'originals') setOriginals((o) => ({ ...o, [key]: entry }));
          else setGallery((g) => ({ ...g, [key]: entry }));
        })();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, examPrefix, selected, originals, gallery, token]);

  // 두 칸 중 좁은 칸 너비 → 원본·변형을 같은 배율 k 로 보이게 한다(칸 너비에 억지로 맞추지 않음)
  useEffect(() => {
    if (mode !== 'variants') return;
    const panes = [leftPane.current, rightPane.current].filter(Boolean) as HTMLDivElement[];
    if (!panes.length) return;
    const measure = () => setPaneWidth(Math.min(...panes.map((el) => el.clientWidth)));
    const observer = new ResizeObserver(measure);
    panes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [mode, exam]);

  function resetSelection() {
    setSelected([]);
    setPicked([]);
    setActive(null);
  }

  // 트윈처럼: 한쪽 칸에서 누르면 다른 칸을 그 문항 위치로 바로 옮긴다
  function scrollPaneTo(pane: HTMLDivElement | null, id: string, pad: number) {
    const el = pane?.querySelector<HTMLElement>(`#${id}`);
    if (!pane || !el) return;
    pane.scrollTo({ top: el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - pad });
  }

  function focusFromLeft(no: number) {
    setActive(no);
    scrollPaneTo(rightPane.current, `naesin-v-${no}`, 12);
  }

  function focusFromRight(no: number) {
    setActive(no);
    scrollPaneTo(leftPane.current, `naesin-o-${no}`, 12);
  }

  // 위쪽 '한 번에 넣기': 체크한 모든 문항에 같은 변형 번호(1·2·3)만, 또는 모두·해제
  function pickSet(which: number | 'all' | 'none') {
    const keys = selected.flatMap((no) => {
      const list = variantKeysOf(problemByNo.get(no));
      if (which === 'none') return [];
      if (which === 'all') return list;
      return list[which - 1] ? [list[which - 1]] : [];
    });
    setPicked(keys);
  }

  function toggleNo(no: number) {
    setSelected((list) => (list.includes(no) ? list.filter((n) => n !== no) : [...list, no].sort((a, b) => a - b)));
  }

  function togglePick(no: number, key: string) {
    const on = !picked.includes(key);
    setPicked((list) => (on ? [...list, key] : list.filter((k) => k !== key)));
    // 오답으로 안 고른 문항의 변형을 체크하면 그 문항도 같이 고른다
    if (on && !selected.includes(no)) setSelected((list) => [...list, no].sort((a, b) => a - b));
  }

  function pickAll(no: number, on: boolean) {
    const keys = variantKeysOf(problemByNo.get(no));
    setPicked((list) => (on ? [...new Set([...list, ...keys])] : list.filter((k) => !keys.includes(k))));
    if (on && keys.length && !selected.includes(no)) setSelected((list) => [...list, no].sort((a, b) => a - b));
  }

  function setPreview(which: Mode, url: string) {
    const old = previewsRef.current[which];
    if (old.startsWith('blob:')) URL.revokeObjectURL(old);
    previewsRef.current = { ...previewsRef.current, [which]: url };
    setPreviews(previewsRef.current);
  }

  function requestBody(which: Mode, preview: boolean): Record<string, unknown> | null {
    if (!exam) return null;
    const body: Record<string, unknown> = {
      textbook: 'naesin',
      naesinExam: exam.prefix,
      naesinNumbers: selected,
      student: student.trim() || '학생',
      grade: GRADE_TO_PAYLOAD[exam.grade] ?? '1학년',
      includeCover,
      includeSolutionQr,
      preview,
    };
    if (which === 'variants') {
      body.naesinVariantKeys = pickedKeys;
      body.includeOriginals = includeOriginals;
    }
    return body;
  }

  async function postPdf(body: Record<string, unknown>, signal?: AbortSignal) {
    const accessToken = await token();
    if (!accessToken) {
      setLoginRequired(true);
      return null;
    }
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
      signal,
    });
    if (response.status === 401) {
      setLoginRequired(true);
      return null;
    }
    const type = response.headers.get('Content-Type') ?? '';
    if (type.includes('application/json')) {
      const result = (await response.json().catch(() => ({}))) as { error?: string; downloadUrl?: string };
      if (!response.ok || !result.downloadUrl) throw new Error(result.error || 'PDF 를 만들지 못했습니다.');
      return { url: result.downloadUrl, isBlob: false };
    }
    if (!response.ok) throw new Error('PDF 를 만들지 못했습니다.');
    return { url: URL.createObjectURL(await response.blob()), isBlob: true };
  }

  function readyMessage(which: Mode) {
    if (!selected.length) return '틀린 번호를 하나 이상 골라 주세요.';
    if (which === 'variants' && !pickedKeys.length) return '넣을 변형을 하나 이상 체크해 주세요.';
    return '';
  }

  async function refreshPreview(which: Mode) {
    const problem = readyMessage(which);
    const body = requestBody(which, true);
    if (problem || !body) {
      if (which === 'variants') setNotice(problem);
      return;
    }
    previewAbort.current?.abort();
    const controller = new AbortController();
    previewAbort.current = controller;
    setPreviewLoading(true);
    setNotice('');
    try {
      const result = await postPdf(body, controller.signal);
      if (!result || controller.signal.aborted) return;
      setPreview(which, result.url);
      if (which === 'variants') setVariantPreviewOpen(true);
    } catch (e) {
      if (controller.signal.aborted) return;
      setNotice(e instanceof Error ? e.message : 'PDF 를 만들지 못했습니다.');
    } finally {
      if (previewAbort.current === controller) {
        previewAbort.current = null;
        setPreviewLoading(false);
      }
    }
  }

  // [오답노트 만들기]: 교재 오답노트처럼 입력이 바뀌면 0.8초 뒤 미리보기를 다시 만든다
  const refreshPreviewRef = useRef(refreshPreview);
  useEffect(() => {
    refreshPreviewRef.current = refreshPreview;
  });
  useEffect(() => {
    if (mode !== 'note' || !examPrefix || !selected.length) return;
    const timer = window.setTimeout(() => void refreshPreviewRef.current('note'), 800);
    return () => window.clearTimeout(timer);
  }, [mode, examPrefix, selected, student, includeCover, includeSolutionQr]);

  async function download(which: Mode) {
    if (!exam) return;
    const problem = readyMessage(which);
    const name = student.trim();
    if (problem || !name) {
      setNotice(problem || '학생 이름을 넣어 주세요.');
      return;
    }
    const body = requestBody(which, false);
    if (!body) return;
    setBusy('download');
    setNotice('');
    try {
      const result = await postPdf(body);
      if (!result) return;
      if (!result.isBlob) {
        window.open(result.url, '_blank', 'noopener');
        return;
      }
      const kind = which === 'variants' ? '변형문제' : '오답노트';
      const link = document.createElement('a');
      link.href = result.url;
      link.download = `${name}_${examHeading(exam).replaceAll(' ', '_')}_${kind}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
      setNotice(`${name} 학생 ${kind}를 내려받았어요 (${totalItems}문항).`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'PDF 를 만들지 못했습니다.');
    } finally {
      setBusy('');
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    window.location.href = '/';
  }

  if (loginRequired) return <GoToMainLogin />;

  const notePreview = previews.note;
  const variantPreview = previews.variants;
  const originalList = originals[examPrefix];
  // 같은 배율 k: 가장 넓은 그림이 칸 안에 들어가게(최대 1배). 원본·변형 모두 '원래 폭 × k' 로 보인다
  const widest = Math.max(BASE_WIDTH, ...(originalList?.items ?? []).map((item) => item.width ?? 0));
  const scale = paneWidth ? Math.min(1, (paneWidth - 56) / widest) : 0;
  const shownWidth = (width?: number) => (scale && width ? `${Math.round(width * scale)}px` : '100%');
  const setState = (() => {
    const set = new Set(pickedKeys);
    const all = selected.flatMap((no) => variantKeysOf(problemByNo.get(no)));
    if (!all.length) return null;
    if (!set.size) return 'none';
    if (all.every((k) => set.has(k))) return 'all';
    for (let i = 1; i <= setCount; i++) {
      const want = selected.flatMap((no) => {
        const list = variantKeysOf(problemByNo.get(no));
        return list[i - 1] ? [list[i - 1]] : [];
      });
      if (want.length === set.size && want.every((k) => set.has(k))) return i;
    }
    return null;
  })();
  const zoomKey = zoom?.key;
  const zoomNo = zoomKey ? exam?.problems.find((p) => variantKeysOf(p).includes(zoomKey))?.no : undefined;

  return (
    <div className="generator-canvas min-h-screen">
      <div className="generator-shell">
        <header className="generator-topbar flex-wrap">
          <div className="generator-topbar-brand">
            <Image src="/dasan-mirae-logo.png" alt="학원 로고" width={40} height={40} priority className="size-10 shrink-0 rounded-full" />
            <h1>내신 기출 오답노트</h1>
          </div>
          <div className="generator-topbar-tools flex-wrap">
            {exam && (
              <span className="generator-topbar-context">
                {mode === 'note' ? '오답노트' : '변형문제'}
                <span />
                {examHeading(exam)}
              </span>
            )}
            <Link href="/" className="generator-topbar-link" title="교재 오답노트로">
              <ArrowLeft className="size-3.5" /> 교재 오답노트
            </Link>
            <Link href="/admin/downloads" className="generator-topbar-link max-sm:hidden" title="다운로드·인쇄한 오답노트 기록">
              <ListChecks className="size-3.5" /> 다운목록
            </Link>
            <button type="button" onClick={() => void logout()} className="generator-logout">
              <LogOut className="size-3.5" /> 로그아웃
            </button>
          </div>
        </header>

        {/* 맨 위: 무엇을 만들지 + 학교 → 학년 → 시험 (두 모드 공통) */}
        <section
          className="mb-5 flex flex-wrap items-end gap-4 rounded-xl border border-[#3a536b] bg-[#172538] p-4"
          aria-label="만들 것과 시험 고르기"
        >
          <fieldset className="m-0 grid w-full grid-cols-2 gap-2 border-0 p-0 sm:w-auto" aria-label="만들 것">
            {(
              [
                ['note', '오답노트 만들기', FileText],
                ['variants', '변형문제 만들기', Sparkles],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => {
                  setMode(id);
                  setNotice('');
                }}
                className={
                  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-[15px] font-bold transition-colors ' +
                  (mode === id
                    ? 'border-[#52d5d4] bg-[#1f4a52] text-[#e6fffd]'
                    : 'border-[#35445a] bg-[#111c2b] text-slate-400 hover:text-slate-200')
                }
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </fieldset>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" /> 시험 목록을 불러오는 중…
            </p>
          ) : error ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-amber-300">{error}</p>
              <button
                type="button"
                onClick={() => void loadExams()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
              >
                <RefreshCw className="size-4" /> 다시 불러오기
              </button>
            </div>
          ) : !exams.length ? (
            <p className="text-sm text-slate-400">아직 올라온 내신 시험이 없어요.</p>
          ) : (
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,140px)_minmax(0,110px)_minmax(0,1fr)]">
              <label className="min-w-0">
                <span className="mb-1 block text-[12px] font-semibold text-[#b8c5d7]">학교</span>
                <select
                  className="w-full"
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
              <label className="min-w-0">
                <span className="mb-1 block text-[12px] font-semibold text-[#b8c5d7]">학년</span>
                <select
                  className="w-full"
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
              <label className="col-span-2 min-w-0 sm:col-span-1">
                <span className="mb-1 block text-[12px] font-semibold text-[#b8c5d7]">시험</span>
                <select
                  className="w-full"
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
        </section>

        {exam && mode === 'note' && (
          <main className="generator-grid naesin-note-grid">
            <section className="generator-settings" aria-label="오답노트 설정">
              <div className="generator-step">
                <div className="generator-step-header flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="generator-step-number">1</span>
                    <h3>틀린 번호 고르기</h3>
                  </div>
                  <span className="generator-count">
                    <strong>{selected.length}</strong> / {exam.problems.length}문항
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <p className="text-[12px] text-[#8fa1b9]">{examHeading(exam)} · 누르면 골라지고 다시 누르면 빠져요.</p>
                  <NumberGrid exam={exam} selected={selected} onToggle={toggleNo} />
                  <button
                    type="button"
                    onClick={resetSelection}
                    className="rounded-lg border border-[#35445a] px-3 py-1.5 text-[12px] text-[#b6c3d5] hover:border-[#52d5d4]"
                  >
                    모두 비우기
                  </button>
                </div>
              </div>

              <div className="generator-step">
                <div className="generator-step-header flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="generator-step-number">2</span>
                    <h3>학생 정보</h3>
                  </div>
                </div>
                <div className="p-4">
                  <label className="block">
                    <span className="mb-2 block">학생 이름 (한 명)</span>
                    <input
                      className="w-full"
                      value={student}
                      onChange={(e) => setStudent(e.target.value)}
                      placeholder="이름만 (학교는 붙이지 않아요)"
                      autoComplete="off"
                    />
                  </label>
                </div>
              </div>

              <div className="generator-step">
                <div className="generator-step-header flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="generator-step-number">3</span>
                    <h3>표지 및 서식</h3>
                  </div>
                </div>
                <div className="space-y-2.5 p-4">
                  <CoverAndQr
                    includeCover={includeCover}
                    setIncludeCover={setIncludeCover}
                    includeSolutionQr={includeSolutionQr}
                    setIncludeSolutionQr={setIncludeSolutionQr}
                  />
                </div>
              </div>

              {notice && <p className="text-[13px] text-amber-200">{notice}</p>}

              <div className="generator-actions">
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 border border-[#334155] bg-[#1e293b] px-3 py-2.5 text-[#b6c3d5] hover:border-[#408d7b] disabled:opacity-50"
                  onClick={() => void refreshPreview('note')}
                  disabled={previewLoading || !!busy || !selected.length}
                >
                  <RefreshCw className={`size-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
                  미리보기 갱신
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 border px-5 py-3 disabled:opacity-50"
                  onClick={() => void download('note')}
                  disabled={!!busy || !selected.length}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                  <span>{busy ? '생성 중…' : 'PDF 생성 및 다운로드'}</span>
                </button>
              </div>
            </section>

            <section className={`generator-preview ${previewExpanded ? 'is-expanded' : ''}`} aria-label="미리보기">
              <div className="generator-preview-header mb-3.5 flex flex-wrap items-center justify-between gap-2.5 border-b pb-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3>미리보기</h3>
                  <span className="rounded-full border px-2.5 py-0.5 text-[13px] font-semibold">
                    {previewLoading ? '생성 중…' : notePreview ? '최신 반영됨' : '입력 대기 중'}
                  </span>
                  {selected.length > 0 && (
                    <span className="rounded-full border px-2.5 py-0.5 text-[13px] font-semibold">
                      총 {selected.length}문항 ({Math.ceil(selected.length / 4)}페이지)
                    </span>
                  )}
                </div>
                {notePreview && (
                  <PreviewTools
                    viewMode={previewViewMode}
                    onViewMode={() => setPreviewViewMode((v) => (v === 'Fit' ? 'FitH' : 'Fit'))}
                    expanded={previewExpanded}
                    onExpanded={() => setPreviewExpanded((v) => !v)}
                    url={notePreview}
                  />
                )}
              </div>
              <div className={`generator-preview-surface ${previewExpanded ? 'is-expanded' : ''}`}>
                {previewLoading && notePreview && (
                  <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-teal-500/40 bg-[#1e293b]/90 px-3.5 py-1.5 text-[13px] font-semibold text-teal-300">
                    <span className="size-3 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                    실시간 갱신 중…
                  </div>
                )}
                {notePreview ? (
                  <iframe
                    key={`${notePreview}-${previewViewMode}-${previewExpanded ? 'big' : 'base'}`}
                    src={`${notePreview}#toolbar=${previewExpanded ? 1 : 0}&navpanes=0&view=${previewViewMode}`}
                    title="내신 오답노트 미리보기"
                    className="h-full w-full rounded-lg border-0 bg-white shadow-md"
                    style={previewExpanded ? undefined : { height: 'calc(100vh - 120px)', minHeight: '800px' }}
                  />
                ) : (
                  <div className="generator-empty">
                    <div className="generator-empty-icon">
                      {previewLoading ? <Loader2 className="size-8 animate-spin" /> : <FileText className="size-8" />}
                    </div>
                    <h4 className="mb-1 text-base font-semibold text-slate-200">{examHeading(exam)} 오답노트</h4>
                    <p className="mb-4 text-[13px] leading-relaxed text-slate-300">
                      틀린 번호를 고르면 완성된 오답노트가 여기에 표시됩니다.
                    </p>
                    <div className="generator-summary">
                      <div className="flex justify-between text-slate-300">
                        <span>학생 성명:</span>
                        <strong className="text-slate-200">
                          {student.trim() || '학생'} ({exam.grade})
                        </strong>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>선택 문항:</span>
                        <strong className="text-teal-300">{selected.length}문제</strong>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>시험 문항:</span>
                        <strong className="text-slate-200">1~{exam.problems.length}번</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>
        )}

        {exam && mode === 'variants' && (
          <main aria-label="변형문제 만들기">
            {/* 위쪽 줄: 학생·옵션·만들기 */}
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[#3a536b] bg-[#172538] px-4 py-3">
              <label className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[13px] font-semibold text-[#b8c5d7]">학생</span>
                <input
                  className="w-40"
                  value={student}
                  onChange={(e) => setStudent(e.target.value)}
                  placeholder="이름만"
                  autoComplete="off"
                />
              </label>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={includeOriginals}
                  onChange={(e) => setIncludeOriginals(e.target.checked)}
                />
                원본도 같이 넣기
              </label>
              <CoverAndQr
                includeCover={includeCover}
                setIncludeCover={setIncludeCover}
                includeSolutionQr={includeSolutionQr}
                setIncludeSolutionQr={setIncludeSolutionQr}
                compact
              />
              <span className="text-[13px] text-[#8fa1b9]">
                오답 <b className="text-slate-100">{selected.length}</b> · 변형 <b className="text-[#f0a6ed]">{pickedKeys.length}</b> →
                모두 <b className="text-teal-300">{totalItems}</b>문항
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={previewLoading || !!busy || !pickedKeys.length}
                  onClick={() => void refreshPreview('variants')}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#475569] bg-[#253349] px-3.5 text-[13px] text-slate-100 hover:border-[#52d5d4] disabled:opacity-50"
                >
                  {previewLoading ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                  미리보기
                </button>
                {variantPreview && !previewLoading && (
                  <button
                    type="button"
                    onClick={() => setVariantPreviewOpen(true)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-[#475569] px-3 text-[13px] text-slate-300 hover:border-[#52d5d4]"
                  >
                    다시 보기
                  </button>
                )}
                <button
                  type="button"
                  disabled={!!busy || !pickedKeys.length}
                  onClick={() => void download('variants')}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#35c3ca] px-4 text-[13px] font-bold text-[#09252c] hover:bg-[#78e1e4] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                  PDF 다운로드
                </button>
              </div>
              {notice && <p className="w-full text-[13px] text-amber-200">{notice}</p>}
            </div>

            {/* 트윈 시험지 만들기(D:\변형문제\site\exam.html)와 같은 두 칸, 칸마다 따로 스크롤.
                왼쪽 원본 시험지: 번호 앞 체크 = 오답, 문항을 누르면 오른쪽이 그 문항 변형으로 이동.
                오른쪽 변형 문제지: 체크한 문항의 변형만 번호 순서로, 변형마다 '넣기'. 원본·변형은 같은 배율로 보인다. */}
            <div className="grid gap-3 lg:h-[calc(100vh-250px)] lg:min-h-[560px] lg:grid-cols-2">
              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#1d2733] bg-[#0a0e13]" aria-label="원본 시험지">
                <h2 className="flex flex-wrap items-baseline gap-2 border-b-2 border-[#1d2733] bg-[#11161d] px-4 py-2.5 text-[15px] font-bold text-slate-100">
                  원본 시험지
                  <small className="text-[12px] font-normal text-[#8d9aa8]">번호 앞 체크 = 틀린 문항 · 문항을 누르면 오른쪽 변형으로 이동</small>
                  <span className="ml-auto text-[12px] font-normal text-[#8d9aa8]">
                    오답 <b style={{ color: CHECKED }}>{selected.length}</b>/{exam.problems.length}
                  </span>
                </h2>
                <div ref={leftPane} className="max-h-[60vh] flex-1 space-y-3 overflow-auto p-3 sm:p-4 lg:max-h-none">
                  {!originalList ? (
                    <p className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="size-4 animate-spin" /> 원본 문항 그림을 불러오는 중…
                    </p>
                  ) : originalList.error ? (
                    <p className="text-sm text-amber-300">{originalList.error}</p>
                  ) : (
                    originalList.items?.map((item) => {
                      const on = selected.includes(item.no);
                      const chosen = pickedCountByNo.get(item.no) ?? 0;
                      const isFocus = focusNo === item.no;
                      return (
                        <article
                          key={item.key}
                          id={`naesin-o-${item.no}`}
                          className="overflow-hidden rounded-md border-2 bg-white"
                          style={{ borderColor: isFocus ? PICK : on ? CHECKED : '#2c3a4a' }}
                        >
                          <div
                            className="flex items-center gap-2 border-b px-3 py-1.5 text-[13px]"
                            style={{ background: on ? '#eef2ff' : '#f8fafc', borderColor: '#e2e8f0' }}
                          >
                            <label className="flex cursor-pointer items-center gap-2 font-bold text-[#111]">
                              <input
                                type="checkbox"
                                className="size-[18px]"
                                checked={on}
                                onChange={() => toggleNo(item.no)}
                                aria-label={`${item.no}번 틀림`}
                              />
                              {item.no}번
                            </label>
                            {item.difficulty && <span className="text-[12px] text-[#667085]">{item.difficulty}</span>}
                            {on && (
                              <span
                                className="rounded px-2 py-0.5 text-[11px] font-bold text-white"
                                style={{ background: chosen ? PICK : CHECKED }}
                              >
                                {chosen ? `변형 ${chosen}개 넣음` : '오답'}
                              </span>
                            )}
                            <span className="ml-auto text-[11px] text-[#98a2b3]">변형 {item.variants}개</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => focusFromLeft(item.no)}
                            className="block w-full p-2 text-left"
                            style={{ background: isFocus ? '#fdf2fd' : '#fff' }}
                            title={on ? '오른쪽에서 이 문항 변형으로 이동' : '틀린 문항이면 번호 앞을 체크하세요'}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.image}
                              alt={`${item.no}번 원본`}
                              className="mx-auto block h-auto max-w-full"
                              style={{ width: shownWidth(item.width) }}
                              loading="lazy"
                              decoding="async"
                            />
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#1d2733] bg-[#0a0e13]" aria-label="변형 문제지">
                <h2 className="flex flex-wrap items-center gap-2 border-b-2 border-[#1d2733] bg-[#11161d] px-4 py-2 text-[15px] font-bold text-slate-100">
                  변형 문제지
                  <small className="text-[12px] font-normal text-[#8d9aa8]">
                    넣은 변형 <b className="text-[#f0a6ed]">{pickedKeys.length}</b>개
                  </small>
                  {selected.length > 0 && setCount > 0 && (
                    <span className="ml-auto inline-flex overflow-hidden rounded-lg border border-[#334155]" title="체크한 모든 문항에 한 번에">
                      {[...Array.from({ length: setCount }, (_, i) => i + 1), 'all' as const, 'none' as const].map((which) => (
                        <button
                          key={String(which)}
                          type="button"
                          aria-pressed={setState === which}
                          onClick={() => pickSet(which)}
                          className={
                            'px-2.5 py-1 text-[12px] font-semibold ' +
                            (setState === which ? 'bg-[#0f6e62] text-white' : 'text-slate-300 hover:bg-[#1d2733]')
                          }
                        >
                          {which === 'all' ? '모두' : which === 'none' ? '해제' : `전체 변형${which}`}
                        </button>
                      ))}
                    </span>
                  )}
                </h2>
                <div ref={rightPane} className="flex-1 space-y-4 overflow-auto p-3 sm:p-4">
                  {!selected.length ? (
                    <p className="rounded-lg border border-dashed border-[#334155] p-8 text-center text-sm text-slate-400">
                      왼쪽에서 틀린 문항을 체크하세요.
                      <br />
                      체크한 문항의 변형이 여기에 번호 순서대로 나와요.
                    </p>
                  ) : (
                    selected.map((no) => {
                      const entry = gallery[`${examPrefix}|${no}`];
                      const variants = entry?.items?.filter((item) => item.variant > 0) ?? [];
                      const keys = variantKeysOf(problemByNo.get(no));
                      const chosen = keys.filter((k) => picked.includes(k)).length;
                      const isFocus = focusNo === no;
                      return (
                        <section
                          key={no}
                          id={`naesin-v-${no}`}
                          aria-label={`${no}번 변형`}
                          className="overflow-hidden rounded-md border-2 bg-white"
                          style={{ borderColor: isFocus ? PICK : '#2c3a4a' }}
                        >
                          <div className="flex items-center gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5">
                            <button
                              type="button"
                              onClick={() => focusFromRight(no)}
                              className="text-[15px] font-bold text-[#111] hover:underline"
                              title="왼쪽 원본으로 이동"
                            >
                              {no}번 변형
                            </button>
                            <span className="text-[12px] text-[#667085]">
                              {keys.length}개 중 <b style={{ color: PICK }}>{chosen}</b>개 넣기
                            </span>
                            {keys.length > 0 && (
                              <span className="ml-auto flex gap-1">
                                <button
                                  type="button"
                                  disabled={chosen === keys.length}
                                  onClick={() => pickAll(no, true)}
                                  className="rounded border border-[#cbd5e1] px-2 py-0.5 text-[12px] text-[#334155] disabled:opacity-40"
                                >
                                  모두
                                </button>
                                <button
                                  type="button"
                                  disabled={!chosen}
                                  onClick={() => pickAll(no, false)}
                                  className="rounded border border-[#cbd5e1] px-2 py-0.5 text-[12px] text-[#334155] disabled:opacity-40"
                                >
                                  해제
                                </button>
                              </span>
                            )}
                          </div>
                          {!entry ? (
                            <p className="flex items-center gap-2 p-3 text-sm text-[#667085]">
                              <Loader2 className="size-4 animate-spin" /> 변형 그림을 불러오는 중…
                            </p>
                          ) : entry.error ? (
                            <p className="p-3 text-sm text-amber-700">{entry.error}</p>
                          ) : !variants.length ? (
                            <p className="p-3 text-sm text-[#667085]">이 문항은 변형이 없어요.</p>
                          ) : (
                            variants.map((item) => {
                              const on = picked.includes(item.key);
                              return (
                                <div
                                  key={item.key}
                                  className="border-t border-[#eef2f6] first:border-t-0"
                                  style={{ background: on ? '#fdf2fd' : '#fff' }}
                                >
                                  <div className="flex items-center gap-2 px-3 pt-2 text-[13px]">
                                    <label className="flex cursor-pointer items-center gap-2 font-semibold text-[#111]">
                                      <input
                                        type="checkbox"
                                        className="size-[18px]"
                                        checked={on}
                                        onChange={() => togglePick(no, item.key)}
                                      />
                                      넣기
                                      <span style={{ color: PICK }}>{item.label}</span>
                                    </label>
                                    {item.difficulty && <span className="text-[12px] text-[#667085]">{item.difficulty}</span>}
                                    <button
                                      type="button"
                                      onClick={() => setZoom({ title: `${no}번 ${item.label}`, image: item.image, key: item.key })}
                                      className="ml-auto rounded border border-[#cbd5e1] px-2 py-0.5 text-[12px] text-[#334155]"
                                    >
                                      크게
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => focusFromRight(no)}
                                    className="block w-full p-2"
                                    title="왼쪽 원본으로 이동"
                                    aria-label={`${no}번 ${item.label} (왼쪽 원본으로 이동)`}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={item.image}
                                      alt={`${no}번 ${item.label}`}
                                      className="mx-auto block h-auto max-w-full"
                                      style={{ width: shownWidth(item.width) }}
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </section>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          </main>
        )}
      </div>

      {/* 변형문제 미리보기: 화면 가득 창 */}
      {variantPreviewOpen && variantPreview && (
        <section className="fixed inset-2 z-50 flex flex-col rounded-xl border border-[#3a536b] bg-[#0d1421] p-2 shadow-2xl sm:inset-4 sm:p-3" aria-label="변형문제 미리보기">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[15px] font-bold text-slate-100">미리보기 · 변형문제 ({totalItems}문항)</span>
            <button
              type="button"
              onClick={() => setPreviewViewMode((v) => (v === 'Fit' ? 'FitH' : 'Fit'))}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#475569] px-2.5 text-[13px] text-slate-200"
            >
              <MoveHorizontal className="size-4" />
              {previewViewMode === 'Fit' ? '가로폭 맞춤' : '쪽 전체'}
            </button>
            <a
              href={variantPreview}
              target="_blank"
              rel={variantPreview.startsWith('blob:') ? undefined : 'noopener noreferrer'}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-teal-600/60 bg-teal-900/30 px-2.5 text-[13px] font-semibold text-teal-200"
            >
              <ExternalLink className="size-4" />새 창에서 크게 보기
            </a>
            <button
              type="button"
              onClick={() => setVariantPreviewOpen(false)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#475569] px-3 text-[13px] text-slate-200"
            >
              <X className="size-4" /> 닫기
            </button>
          </div>
          <iframe
            key={`${variantPreview}-${previewViewMode}`}
            src={`${variantPreview}#view=${previewViewMode}`}
            title="변형문제 미리보기"
            className="min-h-0 w-full flex-1 rounded-lg bg-white"
          />
        </section>
      )}

      {zoom && (
        <section className="fixed inset-0 z-[60] flex flex-col p-2 sm:p-6" aria-label={`${zoom.title} 크게 보기`}>
          <button
            type="button"
            aria-label="크게 보기 닫기"
            className="absolute inset-0 cursor-default bg-black/85"
            onClick={() => setZoom(null)}
          />
          <div className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 pb-2 text-slate-100">
            <span className="mr-auto text-[15px] font-bold">{zoom.title}</span>
            {zoom.key && zoomNo !== undefined && (
              <label className="flex items-center gap-2 rounded-lg border border-slate-500 bg-slate-900 px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={picked.includes(zoom.key)}
                  onChange={() => togglePick(zoomNo, zoom.key as string)}
                />
                이 변형 넣기
              </label>
            )}
            <button
              type="button"
              onClick={() => setZoom(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-500 bg-slate-900 px-3 py-1.5 text-sm"
            >
              <X className="size-4" /> 닫기
            </button>
          </div>
          <div className="relative mx-auto w-full max-w-5xl flex-1 overflow-auto rounded-lg bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.image} alt={zoom.title} className="h-auto w-full" />
          </div>
        </section>
      )}
    </div>
  );
}

function NumberGrid({
  exam,
  selected,
  onToggle,
}: {
  exam: NaesinExam;
  selected: number[];
  onToggle: (no: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-6">
      {exam.problems.map((p) => {
        const on = selected.includes(p.no);
        return (
          <button
            key={p.no}
            type="button"
            aria-pressed={on}
            title={[p.position, p.score ? `${p.score}점` : '', p.format, p.difficulty, p.unit, p.type].filter(Boolean).join(' · ')}
            onClick={() => onToggle(p.no)}
            className={
              'flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors ' +
              (on ? 'border-teal-300 bg-teal-500/25 text-teal-100' : 'border-[#35445a] bg-[#0f1826] text-slate-200 hover:border-slate-400')
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
  );
}

function CoverAndQr({
  includeCover,
  setIncludeCover,
  includeSolutionQr,
  setIncludeSolutionQr,
  compact = false,
}: {
  includeCover: boolean;
  setIncludeCover: (v: boolean) => void;
  includeSolutionQr: boolean;
  setIncludeSolutionQr: (v: boolean) => void;
  compact?: boolean;
}) {
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-200">
        <input type="checkbox" className="size-4" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} />
        <span>표지 넣기</span>
      </label>
      <label
        className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-200"
        title="손풀이 영상이 있는 원본 문항에만 찍혀요. 변형 문항은 QR 없이 나와요."
      >
        <input
          type="checkbox"
          className="size-4"
          checked={includeSolutionQr}
          onChange={(e) => setIncludeSolutionQr(e.target.checked)}
        />
        <span>
          손풀이 QR 포함
          {!compact && <small className="block">손풀이 영상이 있는 원본 문항에만 찍혀요. 변형 문항은 QR 없이 나와요.</small>}
        </span>
      </label>
    </>
  );
}

function PreviewTools({
  viewMode,
  onViewMode,
  expanded,
  onExpanded,
  url,
}: {
  viewMode: 'Fit' | 'FitH';
  onViewMode: () => void;
  expanded: boolean;
  onExpanded: () => void;
  url: string;
}) {
  // 교재 오답노트 미리보기 머리줄과 같은 단추 3개
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onViewMode}
        className="cursor-pointer rounded-lg border px-2.5 py-1 text-[13px] font-semibold"
        title={viewMode === 'Fit' ? '가로폭에 맞추어 확대' : 'A4 전체 페이지 한눈에 맞춤'}
      >
        {viewMode === 'Fit' ? '🔍 가로폭 확대' : '📄 전체 맞춤'}
      </button>
      <button
        type="button"
        onClick={onExpanded}
        className="cursor-pointer rounded-lg border px-2.5 py-1 text-[13px] font-semibold"
        title={expanded ? '원래 자리로 (Esc)' : '미리보기를 화면 가득 크게 (PDF 확대 단추 보임)'}
      >
        {expanded ? '창 기본 크기' : '⤢ 창 대형 확대'}
      </button>
      <a
        href={url}
        target="_blank"
        rel={url.startsWith('blob:') ? undefined : 'noopener noreferrer'}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#315754] bg-[#203b3b] px-2.5 py-1 text-[13px] font-semibold text-[#99e1d6]"
        title="새 창에서 원본 크기로 전체화면 보기"
      >
        <ExternalLink className="size-3.5" />새 창으로 크게 보기
      </a>
    </div>
  );
}
