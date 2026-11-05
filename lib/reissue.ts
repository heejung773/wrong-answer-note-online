/**
 * 관리자 다운목록의 [다시 받기]: 저장된 오답 기록(발급 1건)으로 처음과 같은 PDF 생성 요청을 다시 만든다.
 *
 * - PDF 는 따로 보관하지 않는다. 생성 화면(app/page.tsx handleDownloadPdf)이 보내는 것과 같은 모양의 요청을
 *   /api/generate 에 보낸다(같은 PDF 생성 경로). 표시용 플래그 reissue:true 는 사용량 기록 metadata 에만 쓰인다.
 * - 오답 기록(/api/wrong-records)은 절대 부르지 않는다. 새 줄이 생기면 '두 번 틀림 ×2' 가 틀어진다.
 * - 표지·서식은 기록의 pdf_options(처음 받을 때 설정)를 쓰고, 옛 기록(설정 없음)은 생성 화면 기본값,
 *   표지 날짜는 처음 받은 날(recorded_on)로 만든다.
 * - 문항 입력은 기록의 problem_key 로 거꾸로 만든 뒤, lib/wrong-records.ts 의 규칙으로 다시 풀어서
 *   같은 문항 키·같은 순서가 나오는지 확인한다(다르면 만들지 않음).
 * 네트워크는 fetchReissuePdf 한 곳(/api/generate)뿐. 비밀 값 없음.
 */

import type { PdfOptions } from './pdf-options';
import {
  basicSsenHierarchy,
  blacklabel31Hierarchy,
  blacklabelHierarchy,
  concept31Hierarchy,
  conceptHierarchy,
  coverTitleOf,
  formatTestDate,
  olympusUnits,
  PDF_DEFAULTS,
  textbooks,
} from './textbook-catalog';
import { buildWrongRecordProblems, type WrongRecordInput } from './wrong-records';
import type { Issue } from './wrong-record-list';

type HierItem = { chapter: string; subunit: string; stage: string; numbers: string };
type OlympusRequestItem = { unit: string; problemType: string; numbers: string };
type HierField = 'blacklabelItems' | 'conceptItems' | 'basicSsenItems';

/** /api/generate 에 보내는 요청(생성 화면 handleDownloadPdf 와 같은 칸). */
export type ReissuePayload = {
  textbook: string;
  student: string;
  studentNames: string[];
  isBatch: false;
  printBatch: false;
  preview: false;
  grade: string;
  numbers: string;
  olympusUnit: string;
  olympusType: string;
  olympusItems: OlympusRequestItem[];
  blacklabelItems: HierItem[];
  conceptItems: HierItem[];
  basicSsenItems: HierItem[];
  includeCover: boolean;
  coverTitle: string;
  academyName: string;
  coverSubtitle: string;
  testDate: string;
  includeCharacter: boolean;
  customCharacter: null;
  includeSolutionQr: boolean;
  department: 'middle' | 'high';
  /** 사용량 기록에 '다시 받기' 표시만 한다. PDF 모양에는 영향 없음 */
  reissue: true;
};

export type ReissuePlan = {
  payload: ReissuePayload;
  /** 기록에 '다운로드'가 있으면 파일 다운로드, '인쇄'만 있으면 인쇄 창 */
  outputKind: 'download' | 'print';
  filename: string;
  /** 화면에만 보여 줄 안내(PDF 에는 넣지 않음) */
  notes: string[];
};

/** [다시 받기]에 쓰는 발급 정보(목록 API 의 Issue 에서 필요한 칸만). */
export type ReissueSource = Pick<
  Issue,
  | 'recorded_on'
  | 'student_name'
  | 'student_name_raw'
  | 'textbook'
  | 'grade'
  | 'output_kinds'
  | 'batch_count'
  | 'problems'
  | 'order'
  | 'ordered'
  | 'options'
>;

const HIER_TEXTBOOKS: Record<string, { field: HierField; hierarchy: Record<string, Record<string, string[]>> }> = {
  'blacklabel-middle-2-2': { field: 'blacklabelItems', hierarchy: blacklabelHierarchy },
  'blacklabel-middle-3-1': { field: 'blacklabelItems', hierarchy: blacklabel31Hierarchy },
  'concept-middle-2-2': { field: 'conceptItems', hierarchy: conceptHierarchy },
  'concept-middle-3-1': { field: 'conceptItems', hierarchy: concept31Hierarchy },
  'basic-ssen-middle-2-2': { field: 'basicSsenItems', hierarchy: basicSsenHierarchy },
};

const OLYMPUS_TYPE_BY_SLUG: Record<string, string> = {
  standard: '유형완성하기',
  written: '서술형완성하기',
  challenge: '고난도도전',
};

const GRADES = new Set(['1학년', '2학년', '3학년']);

/** problem_key 마지막 칸 → 화면에서 입력한 번호 글자('0012' → '12'). */
function lastToken(key: string): string {
  const seg = key.slice(key.lastIndexOf('/') + 1);
  return /^\d+$/.test(seg) ? String(Number(seg)) : seg;
}

const prefixOf = (key: string) => key.slice(0, key.lastIndexOf('/'));

/** 같은 묶음이 이어지면 번호만 이어 붙여 한 항목으로(입력 순서 유지). */
function pushRun<T extends { numbers: string }>(items: T[], next: T, same: (a: T, b: T) => boolean) {
  const last = items[items.length - 1];
  if (last && same(last, next)) last.numbers = `${last.numbers}, ${next.numbers}`;
  else items.push(next);
}

/** 중등 3단 교재: 경로 앞부분(prefix)별 (대단원, 소단원, 단계) 후보. */
const hierCandidateCache = new Map<string, Map<string, Omit<HierItem, 'numbers'>[]>>();
function hierCandidates(textbook: string) {
  const cached = hierCandidateCache.get(textbook);
  if (cached) return cached;
  const spec = HIER_TEXTBOOKS[textbook];
  const map = new Map<string, Omit<HierItem, 'numbers'>[]>();
  for (const [chapter, subs] of Object.entries(spec.hierarchy)) {
    for (const [subunit, stages] of Object.entries(subs)) {
      for (const stage of stages) {
        const built = buildWrongRecordProblems({
          textbook,
          [spec.field]: [{ chapter, subunit, stage, numbers: '1' }],
        } as WrongRecordInput);
        const prefix = prefixOf(built.problems[0].problem_key);
        const list = map.get(prefix);
        if (list) list.push({ chapter, subunit, stage });
        else map.set(prefix, [{ chapter, subunit, stage }]);
      }
    }
  }
  hierCandidateCache.set(textbook, map);
  return map;
}

/** 기록에 남은 문항 키·이름으로 처음 입력한 (대단원, 소단원, 단계, 번호)를 찾는다. */
function hierItemFor(textbook: string, key: string, label: string): HierItem | null {
  const spec = HIER_TEXTBOOKS[textbook];
  const token = lastToken(key);
  const candidates = hierCandidates(textbook).get(prefixOf(key)) ?? [];
  let fallback: HierItem | null = null;
  for (const cand of candidates) {
    const item = { ...cand, numbers: token };
    const built = buildWrongRecordProblems({ textbook, [spec.field]: [item] } as WrongRecordInput);
    const p = built.problems[0];
    if (!p || p.problem_key !== key) continue;
    if (p.problem_label === label) return item;
    fallback ??= item;
  }
  return fallback;
}

function olympusItemFor(key: string): OlympusRequestItem | null {
  const m = key.match(/^unit-(\d+)\/([a-z]+)\/(\d+)$/);
  if (!m) return null;
  const unit = olympusUnits[Number(m[1]) - 1];
  const problemType = OLYMPUS_TYPE_BY_SLUG[m[2]];
  if (!unit || !problemType) return null;
  return { unit, problemType, numbers: String(Number(m[3])) };
}

const emptyPayloadItems = () => ({
  numbers: '',
  olympusItems: [] as OlympusRequestItem[],
  blacklabelItems: [] as HierItem[],
  conceptItems: [] as HierItem[],
  basicSsenItems: [] as HierItem[],
});

/**
 * 발급 1건 → /api/generate 요청. 문항을 되살릴 수 없으면 Error(화면에 그대로 보여 줌).
 */
export function buildReissuePlan(issue: ReissueSource): ReissuePlan {
  const textbook = issue.textbook;
  const tb = textbooks.find((t) => t.id === textbook);
  if (!tb) throw new Error('지원하지 않는 교재라 다시 만들 수 없어요.');

  const byKey = new Map(issue.problems.map((p) => [p.key, p]));
  const keys = (issue.order?.length ? issue.order : issue.problems.map((p) => p.key)).filter((k) => byKey.has(k));
  if (!keys.length) throw new Error('이 기록에는 문항이 없어 다시 만들 수 없어요.');
  if (keys.length > 100) throw new Error('문항이 100개가 넘어 한 번에 다시 만들 수 없어요.');

  const items = emptyPayloadItems();
  const failed: string[] = [];
  const hier = HIER_TEXTBOOKS[textbook];
  if (textbook === 'olympus-calculus') {
    for (const key of keys) {
      const item = olympusItemFor(key);
      if (!item) failed.push(key);
      else pushRun(items.olympusItems, item, (a, b) => a.unit === b.unit && a.problemType === b.problemType);
    }
  } else if (hier) {
    const list = items[hier.field];
    for (const key of keys) {
      const item = hierItemFor(textbook, key, byKey.get(key)?.label ?? '');
      if (!item) failed.push(key);
      else
        pushRun(list, item, (a, b) => a.chapter === b.chapter && a.subunit === b.subunit && a.stage === b.stage);
    }
  } else {
    const nums: string[] = [];
    for (const key of keys) {
      const number = byKey.get(key)?.number ?? (/^\d+$/.test(key) ? Number(key) : null);
      if (number == null || !Number.isInteger(number) || number < 1) failed.push(key);
      else nums.push(String(number));
    }
    items.numbers = nums.join(', ');
  }
  if (failed.length) {
    const shown = failed.slice(0, 3).map((k) => byKey.get(k)?.label ?? k).join(', ');
    throw new Error(`기록의 문항(${shown}${failed.length > 3 ? ' 등' : ''})을 찾지 못해 다시 만들 수 없어요.`);
  }

  // 되살린 입력을 기록 규칙으로 다시 풀어 같은 문항·같은 순서인지 확인
  const check = buildWrongRecordProblems({ textbook, ...items });
  const same = check.problems.length === keys.length && check.problems.every((p, i) => p.problem_key === keys[i]);
  if (!same) throw new Error('기록과 같은 문항으로 되살리지 못해 다시 만들지 않았어요.');

  const notes: string[] = [];
  const o: PdfOptions | null = issue.options ?? null;
  if (!o) notes.push('옛 기록이라 표지·서식은 기본 설정으로 다시 만들어요.');
  if (o?.customCharacter) notes.push('직접 올린 표지 그림은 저장하지 않아 기본 그림으로 만들어요.');
  if (!issue.ordered && keys.length > 1) notes.push('옛 기록이라 문항은 번호 순으로 넣어요.');
  if (issue.batch_count > 1) notes.push(`이날 ${issue.batch_count}번 나눠 받은 문항을 한 PDF 로 합쳐요.`);

  let grade = issue.grade ?? '';
  if (!GRADES.has(grade)) {
    grade = '1학년';
    notes.push('학년 기록이 없어 1학년으로 만들어요.');
  }

  const [y, m, d] = issue.recorded_on.split('-').map(Number);
  const student = (issue.student_name_raw || issue.student_name).trim();
  const first = items.olympusItems[0];
  const payload: ReissuePayload = {
    textbook,
    student,
    studentNames: [student],
    isBatch: false,
    printBatch: false,
    preview: false,
    grade,
    ...items,
    olympusUnit: first?.unit ?? olympusUnits[0],
    olympusType: first?.problemType ?? '유형완성하기',
    includeCover: o ? o.includeCover : PDF_DEFAULTS.includeCover,
    // 설정이 남은 기록은 빈 글자까지 그대로 보낸다(서버가 처음과 같은 기본값을 고름).
    coverTitle: o ? o.coverTitle : coverTitleOf(textbook),
    academyName: o ? o.academyName : PDF_DEFAULTS.academyName,
    coverSubtitle: o ? o.coverSubtitle : PDF_DEFAULTS.coverSubtitle,
    // 처음 받을 때 표지에 찍힌 날짜 그대로. 옛 기록은 처음 받은 날(한국 날짜).
    // 날짜 칸을 비워 받았으면 서버가 그날 날짜를 'YYYY년 M월 D일'로 찍었으므로 같은 모양으로.
    testDate: o ? o.testDate || `${y}년 ${m}월 ${d}일` : formatTestDate(y, m, d),
    includeCharacter: o ? o.includeCharacter : PDF_DEFAULTS.includeCharacter,
    customCharacter: null,
    includeSolutionQr: o ? o.includeSolutionQr : PDF_DEFAULTS.includeSolutionQr,
    department: tb.department,
    reissue: true,
  };

  return {
    payload,
    outputKind: issue.output_kinds.includes('download') || !issue.output_kinds.includes('print') ? 'download' : 'print',
    filename: `${student}_${grade}_${tb.title}_오답노트.pdf`,
    notes,
  };
}

/** 서버가 준 임시 주소에 받을 파일 이름 붙이기(생성 화면 privateDownloadHref 와 같음: 서명된 R2 주소는 그대로). */
export function downloadHref(url: string, filename: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has('X-Amz-Signature')) return url;
  parsed.searchParams.set('download', filename);
  return parsed.toString();
}

export class ReissueError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * PDF 만들기 요청. /api/generate 만 부른다(오답 기록 API 는 부르지 않음).
 * 작은 PDF 는 blob, 큰 PDF 는 서버가 준 임시 주소(30분)를 돌려준다.
 */
export async function fetchReissuePdf(
  payload: ReissuePayload,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ blob: Blob } | { url: string }> {
  const response = await fetchImpl('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new ReissueError(
      typeof result.error === 'string' && result.error ? result.error : 'PDF 를 다시 만들지 못했어요.',
      response.status,
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const result = (await response.json()) as { downloadUrl?: unknown };
    if (typeof result.downloadUrl !== 'string' || !result.downloadUrl)
      throw new ReissueError('다운로드 주소를 받지 못했어요.', 502);
    return { url: result.downloadUrl };
  }
  return { blob: await response.blob() };
}
