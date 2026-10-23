import { NextRequest } from 'next/server';
import { requireAdmin, serviceHeaders, type AdminContext } from '@/lib/admin-auth';
import { nameKey, WRONG_RECORD_TEXTBOOKS } from '@/lib/wrong-records';
import {
  groupIssues,
  isIsoDate,
  issueId,
  kstDate,
  RECORD_COLUMNS,
  type RecordRow,
} from '@/lib/wrong-record-list';

/**
 * 관리자 '다운목록' (app/admin/downloads) 전용 API. 메인 화면과 같은 Supabase 로그인 토큰이 있어야 통과한다(lib/admin-auth.ts).
 *
 * GET    ?q=이름일부 | ?student=student_key, &textbook=교재id, &from=YYYY-MM-DD, &to=YYYY-MM-DD
 *        → { summary: {monthCount, monthStudents}, issues: Issue[], truncated }
 *          발급 1건 = 같은 날(한국 날짜) · 같은 학생 · 같은 교재. 오답노트(source='fix') 기록만.
 * DELETE { id: 'YYYY-MM-DD|student_key|textbook' }
 *        → 그 발급 묶음(그날 그 학생 그 교재의 모든 줄)을 지운다. 실수 기록 정리용. { deleted }
 *
 * 표: supabase/wrong_answer_records.sql (구조 변경 없음). 서버 비밀 키로만 읽고 쓴다.
 */

export const dynamic = 'force-dynamic';

const TABLE = 'wrong_answer_records';
const SOURCE = 'fix';
const PAGE = 1000; // Supabase 기본 최대 줄 수
const MAX_ROWS = 20000;
const TIMEOUT_MS = 8000;

const textbooks = new Set<string>(WRONG_RECORD_TEXTBOOKS);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** PostgREST 를 PAGE 줄씩 끝까지(최대 MAX_ROWS) 읽는다. */
async function fetchAll<T>(
  ctx: AdminContext,
  params: URLSearchParams,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const qs = new URLSearchParams(params);
    qs.set('limit', String(PAGE));
    qs.set('offset', String(offset));
    const response = await fetch(`${ctx.url}/rest/v1/${TABLE}?${qs}`, {
      headers: serviceHeaders(ctx.secretKey),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('[admin/wrong-records] read failed', response.status);
      throw new Error('read failed');
    }
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** ilike 안에서 와일드카드로 읽히는 글자는 뺀다. */
const likeSafe = (text: string) => text.replace(/[*%\\]/g, '');

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  const sp = request.nextUrl.searchParams;
  const student = (sp.get('student') ?? '').trim().slice(0, 80);
  const q = likeSafe(nameKey((sp.get('q') ?? '').slice(0, 40)));
  const textbook = (sp.get('textbook') ?? '').trim();
  const from = (sp.get('from') ?? '').trim();
  const to = (sp.get('to') ?? '').trim();
  if (textbook && !textbooks.has(textbook)) return jsonError('알 수 없는 교재입니다.', 400);
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return jsonError('기간 형식이 잘못되었습니다.', 400);

  const params = new URLSearchParams({
    select: RECORD_COLUMNS,
    source: `eq.${SOURCE}`,
    order: 'created_at.desc,id.desc',
  });
  if (student) params.set('student_key', `eq.${student}`);
  else if (q) params.set('student_key', `ilike.*${q}*`);
  if (textbook) params.set('textbook', `eq.${textbook}`);
  if (from) params.append('recorded_on', `gte.${from}`);
  if (to) params.append('recorded_on', `lte.${to}`);

  const monthStart = `${kstDate().slice(0, 8)}01`;
  const monthParams = new URLSearchParams({
    select: 'recorded_on,student_key,textbook',
    source: `eq.${SOURCE}`,
    recorded_on: `gte.${monthStart}`,
    order: 'created_at.desc,id.desc',
  });

  try {
    const [list, month] = await Promise.all([
      fetchAll<RecordRow>(auth, params),
      fetchAll<Pick<RecordRow, 'recorded_on' | 'student_key' | 'textbook'>>(auth, monthParams),
    ]);
    const monthIssues = new Set(month.rows.map((r) => issueId(r.recorded_on, r.student_key, r.textbook)));
    const monthStudents = new Set(month.rows.map((r) => r.student_key));
    return Response.json({
      summary: { monthCount: monthIssues.size, monthStudents: monthStudents.size, monthStart },
      issues: groupIssues(list.rows),
      truncated: list.truncated,
    });
  } catch {
    return jsonError('다운목록을 불러오지 못했습니다. (오답 기록 표가 있는지 확인해 주세요)', 502);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return jsonError('요청 형식이 잘못되었습니다.', 400);
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const parts = id.split('|');
  const recordedOn = parts[0] ?? '';
  const textbook = parts.length >= 3 ? parts[parts.length - 1] : '';
  const studentKey = parts.slice(1, -1).join('|');
  if (!isIsoDate(recordedOn) || !textbooks.has(textbook) || !studentKey) {
    return jsonError('지울 발급을 확인할 수 없습니다.', 400);
  }

  const params = new URLSearchParams({
    source: `eq.${SOURCE}`,
    recorded_on: `eq.${recordedOn}`,
    student_key: `eq.${studentKey}`,
    textbook: `eq.${textbook}`,
    select: 'id',
  });
  try {
    const response = await fetch(`${auth.url}/rest/v1/${TABLE}?${params}`, {
      method: 'DELETE',
      headers: serviceHeaders(auth.secretKey, { Prefer: 'return=representation' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('[admin/wrong-records] delete failed', response.status);
      return jsonError('삭제하지 못했습니다.', 502);
    }
    const deleted = (await response.json().catch(() => [])) as unknown[];
    console.info('[admin/wrong-records] deleted', Array.isArray(deleted) ? deleted.length : 0, 'rows by', auth.email.split('@')[0]);
    return Response.json({ deleted: Array.isArray(deleted) ? deleted.length : 0 });
  } catch {
    return jsonError('삭제하지 못했습니다.', 502);
  }
}
