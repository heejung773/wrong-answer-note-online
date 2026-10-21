import { NextRequest } from 'next/server';
import {
  buildWrongRecordProblems,
  displayName,
  excludedNameReason,
  kstToday,
  nameKey,
} from '@/lib/wrong-records';

/**
 * 오답 기록 저장 (Supabase wrong_answer_records). 노션은 쓰지도 읽지도 않는다.
 *
 * POST: 개별 학생 PDF 다운로드·인쇄가 성공한 뒤 화면이 부른다(미리보기는 부르지 않음).
 *       같은 날·같은 학생·같은 교재·같은 문항은 고유 색인으로 1줄만 남는다.
 * GET : 예전에 기록한 학생 이름(자동완성용, 최근 순).
 *
 * 서버 비밀 키가 없거나 WRONG_RECORDS_ENABLED=0 이면 { status: 'off' } 로 조용히 건너뛴다.
 * 어떤 경우에도 PDF 생성과는 별개 요청이라 기록 실패가 PDF 를 막지 않는다.
 * 표 구조: supabase/wrong_answer_records.sql
 */

export const dynamic = 'force-dynamic';

const SOURCE = 'fix';
const TIMEOUT_MS = 5000;

type Settings = { url: string; publishableKey: string; secretKey: string };
type AuthUser = { id?: string; email?: string };

function settings(): Settings | null {
  const flag = (process.env.WRONG_RECORDS_ENABLED ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return null;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
  if (!url || !publishableKey || !secretKey) return null;
  return { url, publishableKey, secretKey };
}

function serviceHeaders(secretKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function currentUser(request: NextRequest, cfg: Settings): Promise<AuthUser | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const response = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const user = (await response.json()) as AuthUser;
  return user.id ? user : null;
}

export async function POST(request: NextRequest) {
  const cfg = settings();
  if (!cfg) return Response.json({ status: 'off' });

  let user: AuthUser | null;
  try {
    user = await currentUser(request, cfg);
  } catch {
    return Response.json({ status: 'failed', error: '로그인 확인에 실패했습니다.' }, { status: 502 });
  }
  if (!user?.id) return Response.json({ status: 'failed', error: '로그인이 필요합니다.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ status: 'failed', error: '요청 형식이 잘못되었습니다.' }, { status: 400 });
  }

  const rawName = typeof body.student === 'string' ? body.student.trim().slice(0, 80) : '';
  const nameProblem = excludedNameReason(rawName);
  if (nameProblem) return Response.json({ status: 'skipped', reason: nameProblem });

  let built: ReturnType<typeof buildWrongRecordProblems>;
  try {
    built = buildWrongRecordProblems(body);
  } catch (error) {
    return Response.json({
      status: 'skipped',
      reason: error instanceof Error ? error.message : '문항 번호를 확인할 수 없습니다.',
    });
  }
  if (!built.problems.length) return Response.json({ status: 'skipped', reason: '기록할 문항이 없습니다.' });

  const outputKind = body.outputKind === 'print' ? 'print' : 'download';
  const grade = typeof body.grade === 'string' ? body.grade.slice(0, 20) : null;
  const batchId = crypto.randomUUID();
  const recordedOn = kstToday();
  const studentName = displayName(rawName);
  const studentKey = nameKey(rawName);
  const userId = user.id;
  const teacher = user.email ? user.email.split('@')[0] : null;

  const rows = built.problems.map((p) => ({
    recorded_on: recordedOn,
    user_id: userId,
    teacher,
    source: SOURCE,
    batch_id: batchId,
    output_kind: outputKind,
    student_name: studentName,
    student_name_raw: rawName,
    student_key: studentKey,
    grade,
    textbook: built.textbook,
    problem_key: p.problem_key,
    problem_number: p.problem_number,
    problem_label: p.problem_label,
    unit: p.unit,
  }));

  try {
    const response = await fetch(
      `${cfg.url}/rest/v1/wrong_answer_records?on_conflict=source,student_key,textbook,problem_key,recorded_on&select=problem_key`,
      {
        method: 'POST',
        headers: serviceHeaders(cfg.secretKey, {
          Prefer: 'resolution=ignore-duplicates,return=representation',
        }),
        body: JSON.stringify(rows),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.error('[wrong-records] insert failed', response.status, (await response.text()).slice(0, 200));
      return Response.json({ status: 'failed', error: '오답 기록 저장에 실패했습니다.' }, { status: 502 });
    }
    const inserted = (await response.json().catch(() => [])) as unknown[];
    const saved = Array.isArray(inserted) ? inserted.length : 0;
    return Response.json({
      status: 'saved',
      student: studentName,
      total: rows.length,
      saved,
      duplicates: rows.length - saved,
    });
  } catch (error) {
    console.error('[wrong-records] insert error', error instanceof Error ? error.name : 'unknown');
    return Response.json({ status: 'failed', error: '오답 기록 저장에 실패했습니다.' }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const cfg = settings();
  if (!cfg) return Response.json({ enabled: false, students: [] });

  try {
    const user = await currentUser(request, cfg);
    if (!user?.id) return Response.json({ enabled: true, students: [], error: '로그인이 필요합니다.' }, { status: 401 });
    const response = await fetch(`${cfg.url}/rest/v1/rpc/wrong_record_student_names`, {
      method: 'POST',
      headers: serviceHeaders(cfg.secretKey),
      body: JSON.stringify({ max_rows: 500 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('[wrong-records] suggestions failed', response.status);
      return Response.json({ enabled: true, students: [] });
    }
    const rows = (await response.json()) as { student_name?: unknown }[];
    const students = (Array.isArray(rows) ? rows : [])
      .map((row) => (typeof row.student_name === 'string' ? row.student_name : ''))
      .filter(Boolean);
    return Response.json({ enabled: true, students });
  } catch (error) {
    console.error('[wrong-records] suggestions error', error instanceof Error ? error.name : 'unknown');
    return Response.json({ enabled: true, students: [] });
  }
}
