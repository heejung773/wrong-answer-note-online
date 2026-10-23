/**
 * 관리자 '다운목록' 화면용: wrong_answer_records 줄(학생 1명 × 문항 1개 × 하루)을
 * '발급 1건 = 같은 날 · 같은 학생 · 같은 교재' 로 묶는다. 서버(app/api/admin/wrong-records)와
 * 화면(app/admin/downloads) 둘 다 쓰는 순수 함수만 둔다(비밀 값·네트워크 없음).
 */

export const TEXTBOOK_NAMES: Record<string, string> = {
  'synergy-common-math-1': '시너지 공통수학1',
  'ssen-common-math-1': '쎈 공통수학1',
  'synergy-common-math-2': '시너지 공통수학2',
  'gojaengi-common-math-2': '고쟁이 공통수학2',
  'synergy-algebra': '시너지 대수',
  'synergy-calculus': '시너지 미적분',
  'olympus-calculus': '올림포스 미적분Ⅰ',
  'ssen-middle-2-2': '쎈 중2-2',
  'blacklabel-middle-2-2': '블랙라벨 중2-2',
  'concept-middle-2-2': '개념유형파워 중2-2',
  'basic-ssen-middle-2-2': '베이직쎈 중2-2',
  'ssen-middle-3-1': '쎈 중3-1',
  'blacklabel-middle-3-1': '블랙라벨 중3-1',
  'concept-middle-3-1': '개념유형파워 중3-1',
};

export const textbookName = (id: string) => TEXTBOOK_NAMES[id] ?? id;

/** 표에서 읽는 칸 (select 순서와 같게). */
export const RECORD_COLUMNS =
  'id,created_at,recorded_on,teacher,batch_id,output_kind,student_name,student_key,grade,textbook,problem_key,problem_number,problem_label,unit';

export type RecordRow = {
  id: string;
  created_at: string;
  recorded_on: string;
  teacher: string | null;
  batch_id: string;
  output_kind: string | null;
  student_name: string;
  student_key: string;
  grade: string | null;
  textbook: string;
  problem_key: string;
  problem_number: number | null;
  problem_label: string | null;
  unit: string | null;
};

export type IssueProblem = {
  key: string;
  number: number | null;
  /** 같은 묶음(단원·단계) 이름. 번호 교재는 '' */
  group: string;
  /** 묶음 안에서 보여 줄 짧은 번호 '12' */
  short: string;
  label: string;
};

export type Issue = {
  /** recorded_on|student_key|textbook — 삭제 때 그대로 돌려보낸다 */
  id: string;
  recorded_on: string;
  first_at: string;
  last_at: string;
  student_name: string;
  student_key: string;
  textbook: string;
  grade: string | null;
  teachers: string[];
  output_kinds: string[];
  batch_count: number;
  units: string[];
  problems: IssueProblem[];
};

export const issueId = (recordedOn: string, studentKey: string, textbook: string) =>
  `${recordedOn}|${studentKey}|${textbook}`;

/** problem_label 을 '묶음 이름 + 짧은 번호' 로 나눈다(lib/wrong-records.ts 의 label 모양 기준). */
export function splitLabel(row: Pick<RecordRow, 'problem_label' | 'problem_number' | 'problem_key'>): {
  group: string;
  short: string;
} {
  const label = (row.problem_label ?? '').trim();
  // 번호 교재 '123번'
  if (/^\d+번$/.test(label)) return { group: '', short: label.slice(0, -1) };
  // 올림포스 '1단원 · 유형 #0005'
  const olympus = label.match(/^(.*) #0*(\d+)$/);
  if (olympus) return { group: olympus[1], short: olympus[2] };
  // 중등 3단 '대단원 > 소단원 · 단계 12번'
  const hier = label.match(/^(.*) (\S+)번$/);
  if (hier) return { group: hier[1], short: hier[2].replace(/^0+(?=\d)/, '') };
  if (label) return { group: '', short: label };
  return { group: '', short: row.problem_number != null ? String(row.problem_number) : row.problem_key };
}

const collator = new Intl.Collator('ko', { numeric: true });

function compareProblems(textbook: string, a: IssueProblem, b: IssueProblem) {
  // 번호 교재·올림포스(전권 순번)는 problem_number 순, 그 밖은 경로 순(숫자 인식)
  const byNumber = !a.group || textbook === 'olympus-calculus';
  if (byNumber && a.number != null && b.number != null && a.number !== b.number) return a.number - b.number;
  return collator.compare(a.key, b.key);
}

const uniq = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))];

/** 줄 목록 → 발급 목록(최근 발급 먼저). */
export function groupIssues(rows: RecordRow[]): Issue[] {
  const map = new Map<string, { rows: RecordRow[] }>();
  for (const row of rows) {
    const id = issueId(row.recorded_on, row.student_key, row.textbook);
    const hit = map.get(id);
    if (hit) hit.rows.push(row);
    else map.set(id, { rows: [row] });
  }
  const issues: Issue[] = [];
  for (const [id, { rows: group }] of map) {
    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const latest = sorted[sorted.length - 1];
    const seen = new Set<string>();
    const problems: IssueProblem[] = [];
    for (const row of sorted) {
      if (seen.has(row.problem_key)) continue;
      seen.add(row.problem_key);
      problems.push({
        key: row.problem_key,
        number: row.problem_number,
        label: row.problem_label ?? row.problem_key,
        ...splitLabel(row),
      });
    }
    problems.sort((a, b) => compareProblems(latest.textbook, a, b));
    issues.push({
      id,
      recorded_on: latest.recorded_on,
      first_at: sorted[0].created_at,
      last_at: latest.created_at,
      student_name: latest.student_name,
      student_key: latest.student_key,
      textbook: latest.textbook,
      grade: latest.grade,
      teachers: uniq(sorted.map((r) => r.teacher)),
      output_kinds: uniq(sorted.map((r) => r.output_kind)),
      batch_count: uniq(sorted.map((r) => r.batch_id)).length,
      units: uniq(problems.map((p) => sorted.find((r) => r.problem_key === p.key)?.unit)),
      problems,
    });
  }
  return issues.sort(
    (a, b) => b.recorded_on.localeCompare(a.recorded_on) || b.last_at.localeCompare(a.last_at),
  );
}

/** 문항을 묶음별로: [['', ['3','12']], ['1단원 · 유형', ['5','7']]] */
export function problemGroups(problems: IssueProblem[]): [string, IssueProblem[]][] {
  const out = new Map<string, IssueProblem[]>();
  for (const p of problems) {
    const list = out.get(p.group);
    if (list) list.push(p);
    else out.set(p.group, [p]);
  }
  return [...out.entries()];
}

/** 한국 날짜 YYYY-MM-DD (서머타임 없음, +9시간 고정). */
export function kstDate(date: Date = new Date()): string {
  return new Date(date.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
