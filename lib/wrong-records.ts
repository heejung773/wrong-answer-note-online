/**
 * 오답 기록(wrong_answer_records) 만들기 규칙. 서버(app/api/wrong-records)에서만 쓴다.
 *
 * - 노션은 쓰지도 읽지도 않는다(2026-10-21 선생님 결정). Supabase 에만 쌓는다.
 * - 테스트지만들기(test.kangmath.com, sheet_records.py)와 칸·규칙을 맞춘다:
 *   student_name / student_key / textbook(영문 id) / problem_number / problem_key
 *   - student_key: 유니코드 NFKC → 모든 공백 제거 → 소문자. 예) '김 영후 ( 평내 )' → '김영후(평내)'
 *   - problem_key: R2 문항 경로에서 교재 폴더와 '.png' 를 뺀 모양.
 *       번호 교재 '0040', 올림포스 'unit-1/standard/0005',
 *       블랙라벨 중2-2 'ch1/sub01/must/0012', 블랙라벨 중3-1 'ch01/step1/0012',
 *       개념유형파워 중2-2 'ch01/sub01/concept/0012', 개념유형파워 중3-1 'ch01/type/0012',
 *       베이직쎈 'ch1/sub01/basic1/0012'
 *   - problem_number: 번호 교재는 교재 번호, 올림포스는 전권 순번(1~513, 테스트지만들기와 같은 순서),
 *     중등 3단 교재는 그 단계 안의 번호.
 * - 번호 풀이 규칙은 api/generate.py 의 parse_numbers / parse_problem_tokens 와 같다.
 */

export const WRONG_RECORD_TEXTBOOKS = [
  'synergy-calculus',
  'synergy-algebra',
  'synergy-common-math-1',
  'synergy-common-math-2',
  'olympus-calculus',
  'gojaengi-common-math-2',
  'ssen-common-math-1',
  'ssen-middle-2-2',
  'blacklabel-middle-2-2',
  'concept-middle-2-2',
  'basic-ssen-middle-2-2',
  'ssen-middle-3-1',
  'blacklabel-middle-3-1',
  'concept-middle-3-1',
] as const;

export type WrongRecordTextbook = (typeof WRONG_RECORD_TEXTBOOKS)[number];

/** 기록하지 않는 이름: 빈칸 대체값·예시 이름(비교 키 기준). */
const EXCLUDED_NAME_KEYS = new Set(
  ['학생', '홍길동', '김민준', '이서진', '박도윤', '정시우'].map(nameKey),
);

const MAX_PROBLEMS = 100;
const MAX_TEXT = 120;

// ---------------------------------------------------------------------------
// 이름
// ---------------------------------------------------------------------------

/** 보기 좋게: NFC, 앞뒤 공백 제거, 연속 공백은 하나로. */
export function displayName(raw: string): string {
  return (raw ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean).join(' ');
}

/** 비교용 키: NFKC(전각 괄호 등 → 반각) → 모든 공백 제거 → 소문자. */
export function nameKey(raw: string): string {
  return (raw ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** 기록할 수 없는 이름이면 이유를, 기록해도 되면 null 을 돌려준다. */
export function excludedNameReason(raw: string): string | null {
  const key = nameKey(raw);
  if (!key) return '학생 이름이 비어 있습니다.';
  if (EXCLUDED_NAME_KEYS.has(key)) return '예시 이름은 기록하지 않습니다.';
  if (/[,\n;]/.test(raw)) return '한 칸에 여러 이름이 있어 기록하지 않습니다.';
  if (key.length > 40) return '학생 이름이 너무 깁니다.';
  return null;
}

// ---------------------------------------------------------------------------
// 번호 풀이 (api/generate.py 와 같은 규칙)
// ---------------------------------------------------------------------------

function splitTokens(raw: string): string[] {
  return String(raw ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
}

function expandRange(start: number, end: number): number[] {
  const step = end >= start ? 1 : -1;
  const out: number[] = [];
  for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
    out.push(n);
    if (out.length > MAX_PROBLEMS) break;
  }
  return out;
}

/** parse_numbers: '3, 10-15' → [3, 10, 11, ...]. 잘못된 글자는 오류. */
export function parseNumbers(raw: string): number[] {
  const result: number[] = [];
  for (const token of splitTokens(raw)) {
    if (/^\d+$/.test(token)) {
      result.push(Number(token));
      continue;
    }
    const match = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (!match) throw new Error(`알 수 없는 문제번호 입력: ${token}`);
    result.push(...expandRange(Number(match[1]), Number(match[2])));
    if (result.length > MAX_PROBLEMS) break;
  }
  return result;
}

/** parse_problem_tokens: 범위는 펼치고, 숫자가 아닌 글자는 그대로 둔다. */
export function parseProblemTokens(raw: string): string[] {
  const result: string[] = [];
  for (const token of splitTokens(raw)) {
    const match = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (match) {
      result.push(...expandRange(Number(match[1]), Number(match[2])).map(String));
    } else {
      result.push(token);
    }
    if (result.length > MAX_PROBLEMS) break;
  }
  return result;
}

const pad4 = (n: number) => String(n).padStart(4, '0');
const tokenKey = (token: string) => (/^\d+$/.test(token) ? pad4(Number(token)) : token);
const tokenNumber = (token: string) => (/^\d+$/.test(token) ? Number(token) : null);
const clean = (text: string) => text.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// 교재별 경로 슬러그 (api/generate.py 와 같은 값)
// ---------------------------------------------------------------------------

const OLYMPUS_UNITS: Record<string, string> = {
  '1. 함수의 극한': 'unit-1',
  '2. 함수의 연속': 'unit-2',
  '3. 미분계수와 도함수': 'unit-3',
  '4. 도함수의 활용': 'unit-4',
  '5. 부정적분과 정적분': 'unit-5',
  '6. 정적분의 활용': 'unit-6',
};
const OLYMPUS_TYPES: Record<string, { slug: string; short: string }> = {
  유형완성하기: { slug: 'standard', short: '유형' },
  서술형완성하기: { slug: 'written', short: '서술' },
  고난도도전: { slug: 'challenge', short: '고난도' },
};
/** 단원별 [유형, 서술형, 고난도] 문항 수. 전권 순번(1~513) 계산용(테스트지만들기 OLYMPUS_SEQ_MAP 과 같은 순서). */
const OLYMPUS_COUNTS: Record<string, [number, number, number]> = {
  'unit-1': [56, 6, 3],
  'unit-2': [46, 6, 6],
  'unit-3': [72, 6, 4],
  'unit-4': [129, 6, 8],
  'unit-5': [88, 6, 3],
  'unit-6': [56, 6, 6],
};
const OLYMPUS_TYPE_ORDER = ['standard', 'written', 'challenge'];

function olympusSequence(unitSlug: string, typeSlug: string, num: number): number | null {
  let seq = 0;
  for (const [unit, counts] of Object.entries(OLYMPUS_COUNTS)) {
    for (let i = 0; i < OLYMPUS_TYPE_ORDER.length; i++) {
      if (unit === unitSlug && OLYMPUS_TYPE_ORDER[i] === typeSlug) {
        return num >= 1 && num <= counts[i] ? seq + num : null;
      }
      seq += counts[i];
    }
  }
  return null;
}

const BLACKLABEL_CHAPTER_SLUGS: Record<string, string> = {
  'I. 삼각형의 성질': 'ch1',
  'II. 사각형의 성질': 'ch2',
  'III. 도형의 닮음': 'ch3',
  'IV. 피타고라스 정리': 'ch4',
  'V. 확률': 'ch5',
};
const BLACKLABEL_STAGE_SLUGS: Record<string, string> = {
  '시험에 꼭 나오는 문제': 'must',
  'A등급을 위한 문제': 'grade-a',
  '종합 사고력 도전 문제': 'challenge',
  '미리보는 학력평가': 'mock',
  대단원평가: 'review',
};
const CONCEPT_STAGE_SLUGS: Record<string, string> = {
  '01_개념익히기': 'concept',
  '01_개념익히기_1': 'concept1',
  '01_개념익히기_2': 'concept2',
  '02_핵심유형': 'type',
  '02_핵심유형_1': 'type1',
  '02_핵심유형_2': 'type2',
  '03_실력UP문제': 'power',
  '04_실전테스트': 'test',
};
const BASIC_SSEN_CHAPTER_SLUGS: Record<string, string> = {
  'I. 도형의 성질': 'ch1',
  'II. 도형의 닮음': 'ch2',
  'III. 피타고라스 정리': 'ch3',
  'IV. 확률': 'ch4',
};
function basicSsenStageSlug(stage: string): string {
  if (stage.includes('기본&핵심유형 1')) return 'basic1';
  if (stage.includes('기본&핵심유형 2')) return 'basic2';
  if (stage.includes('기본&핵심유형 3')) return 'basic3';
  if (stage.includes('학교시험기출')) return 'school';
  return stage;
}

/** 시너지 공통수학1 단원 범위 (data/synergy_common_math_1_answers.json 의 units 와 같음). */
const SYNERGY_CM1_UNITS: [number, number, string][] = [
  [1, 120, '01 다항식의 연산'],
  [121, 293, '02 항등식과 나머지정리'],
  [294, 381, '03 인수분해'],
  [382, 526, '04 복소수'],
  [527, 723, '05 이차방정식'],
  [724, 940, '06 이차방정식과 이차함수'],
  [941, 1128, '07 여러 가지 방정식'],
  [1129, 1213, '08 일차부등식'],
  [1214, 1441, '09 이차부등식'],
  [1442, 1525, '10 경우의 수'],
  [1526, 1616, '11 순열'],
  [1617, 1733, '12 조합'],
  [1734, 1883, '13 행렬과 그 연산'],
];

/** 번호 교재의 단원. 지금은 시너지 공통수학1 만 범위표가 있다(나머지는 null, 나중에 채움). */
function numberedUnit(textbook: string, num: number): string | null {
  if (textbook === 'synergy-common-math-1') {
    const hit = SYNERGY_CM1_UNITS.find(([s, e]) => num >= s && num <= e);
    return hit ? hit[2] : null;
  }
  return null;
}

/** 중등 3단 교재의 단원 이름: 대단원과 소단원이 같으면 하나만. */
function middleUnit(chapter: string, subunit: string): string {
  const c = clean(chapter);
  const s = clean(subunit);
  return !s || c === s ? c : `${c} > ${s}`;
}

// ---------------------------------------------------------------------------
// 요청 → 기록 줄
// ---------------------------------------------------------------------------

export type WrongRecordProblem = {
  problem_key: string;
  problem_number: number | null;
  problem_label: string;
  unit: string | null;
};

type HierItem = { chapter?: unknown; subunit?: unknown; stage?: unknown; numbers?: unknown };
type OlympusItem = { unit?: unknown; problemType?: unknown; numbers?: unknown };

export type WrongRecordInput = {
  textbook?: unknown;
  numbers?: unknown;
  olympusItems?: unknown;
  blacklabelItems?: unknown;
  conceptItems?: unknown;
  basicSsenItems?: unknown;
};

const str = (v: unknown) =>
  (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, MAX_TEXT);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function hierarchyProblems(textbook: string, items: HierItem[]): WrongRecordProblem[] {
  const out: WrongRecordProblem[] = [];
  for (const item of items) {
    const chapter = str(item.chapter).trim();
    const subunit = str(item.subunit).trim();
    const stage = str(item.stage).trim();
    if (!chapter || !stage) throw new Error('단원·단계 정보가 없습니다.');
    let prefix: string;
    if (textbook === 'blacklabel-middle-2-2') {
      prefix = `${BLACKLABEL_CHAPTER_SLUGS[chapter] ?? 'ch1'}/sub${subunit.split(/\s+/)[0]}/${BLACKLABEL_STAGE_SLUGS[stage] ?? 'must'}`;
    } else if (textbook === 'blacklabel-middle-3-1') {
      prefix = `ch${chapter.slice(0, 2)}/${stage.toLowerCase()}`;
    } else if (textbook === 'concept-middle-2-2') {
      prefix = `ch${chapter.slice(0, 2)}/sub${subunit.slice(0, 2)}/${CONCEPT_STAGE_SLUGS[stage] ?? stage}`;
    } else if (textbook === 'concept-middle-3-1') {
      prefix = `ch${chapter.slice(0, 2)}/${stage.includes('마무리') ? 'finish' : 'type'}`;
    } else {
      prefix = `${BASIC_SSEN_CHAPTER_SLUGS[chapter] ?? 'ch1'}/sub${subunit.split(/\s+/)[0]}/${basicSsenStageSlug(stage)}`;
    }
    const unit = middleUnit(chapter, subunit);
    for (const token of parseProblemTokens(str(item.numbers))) {
      out.push({
        problem_key: `${prefix}/${tokenKey(token)}`,
        problem_number: tokenNumber(token),
        problem_label: `${unit} · ${clean(stage)} ${token}번`,
        unit,
      });
    }
  }
  return out;
}

/**
 * 화면이 PDF 를 만들 때 보낸 것과 같은 입력으로 기록할 문항 목록을 만든다.
 * 같은 문항이 두 번 들어 있으면 한 번만 남긴다. 잘못된 입력이면 Error.
 */
export function buildWrongRecordProblems(input: WrongRecordInput): {
  textbook: WrongRecordTextbook;
  problems: WrongRecordProblem[];
} {
  const textbook = str(input.textbook) as WrongRecordTextbook;
  if (!WRONG_RECORD_TEXTBOOKS.includes(textbook)) throw new Error('지원하지 않는 교재입니다.');

  let problems: WrongRecordProblem[] = [];
  if (textbook === 'olympus-calculus') {
    for (const item of list<OlympusItem>(input.olympusItems)) {
      const unitName = str(item.unit);
      const unitSlug = OLYMPUS_UNITS[unitName];
      const type = OLYMPUS_TYPES[str(item.problemType)];
      if (!unitSlug || !type) throw new Error('올림포스 단원과 문제유형을 확인해 주세요.');
      const unitNo = unitSlug.replace('unit-', '');
      for (const num of parseNumbers(str(item.numbers))) {
        problems.push({
          problem_key: `${unitSlug}/${type.slug}/${pad4(num)}`,
          problem_number: olympusSequence(unitSlug, type.slug, num),
          problem_label: `${unitNo}단원 · ${type.short} #${pad4(num)}`,
          unit: unitName,
        });
      }
    }
  } else if (
    textbook === 'blacklabel-middle-2-2' ||
    textbook === 'blacklabel-middle-3-1'
  ) {
    problems = hierarchyProblems(textbook, list<HierItem>(input.blacklabelItems));
  } else if (textbook === 'concept-middle-2-2' || textbook === 'concept-middle-3-1') {
    problems = hierarchyProblems(textbook, list<HierItem>(input.conceptItems));
  } else if (textbook === 'basic-ssen-middle-2-2') {
    problems = hierarchyProblems(textbook, list<HierItem>(input.basicSsenItems));
  } else {
    problems = parseNumbers(str(input.numbers)).map((num) => ({
      problem_key: pad4(num),
      problem_number: num,
      problem_label: `${num}번`,
      unit: numberedUnit(textbook, num),
    }));
  }

  if (problems.length > MAX_PROBLEMS) throw new Error('한 번에 최대 100문제까지 기록합니다.');
  const seen = new Set<string>();
  problems = problems.filter((p) => {
    if (seen.has(p.problem_key)) return false;
    seen.add(p.problem_key);
    return true;
  });
  return { textbook, problems };
}

/** 한국 날짜(YYYY-MM-DD). 한국은 서머타임이 없어 +9시간 고정. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
