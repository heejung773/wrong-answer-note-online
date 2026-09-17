import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  if (!url || !publishableKey || !secretKey) {
    return Response.json(
      { error: '사용량 기록 설정이 없습니다.' },
      { status: 503 },
    );
  }
  if (!token)
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!userResponse.ok)
    return Response.json(
      { error: '로그인 세션이 만료되었습니다.' },
      { status: 401 },
    );
  const user = (await userResponse.json()) as { id?: string };
  const body = (await request.json()) as {
    event_type?: string;
    textbook?: string;
    problem_count?: number;
    student_count?: number;
  };
  if (body.event_type !== 'print_started' || !user.id) {
    return Response.json(
      { error: '허용되지 않는 사용량 이벤트입니다.' },
      { status: 400 },
    );
  }

  const insertResponse = await fetch(`${url}/rest/v1/usage_events`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: user.id,
      event_type: body.event_type,
      textbook: body.textbook ?? null,
      problem_count: body.problem_count ?? null,
      student_count: body.student_count ?? 1,
      success: true,
      metadata: { source: 'browser_print' },
    }),
  });
  if (!insertResponse.ok)
    return Response.json(
      { error: '사용량 기록에 실패했습니다.' },
      { status: 502 },
    );
  return Response.json({ ok: true });
}
