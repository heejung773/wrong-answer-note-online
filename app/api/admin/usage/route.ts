import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type UsageEvent = {
  id: string;
  user_id: string;
  event_type: string;
  textbook: string | null;
  problem_count: number | null;
  student_count: number | null;
  success: boolean;
  created_at: string;
};

type AuthUser = { id: string; email?: string };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');

  if (!url || !publishableKey || !secretKey) {
    return jsonError('관리자 기능 환경 설정이 필요합니다.', 503);
  }
  if (!token) return jsonError('로그인이 필요합니다.', 401);
  if (!admins.length)
    return jsonError('관리자 이메일이 아직 설정되지 않았습니다.', 403);

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!userResponse.ok) return jsonError('로그인 세션이 만료되었습니다.', 401);
  const user = (await userResponse.json()) as { id?: string; email?: string };
  if (!user.email || !admins.includes(user.email.toLowerCase())) {
    return jsonError('관리자 권한이 없습니다.', 403);
  }

  const eventsResponse = await fetch(
    `${url}/rest/v1/usage_events?select=id,user_id,event_type,textbook,problem_count,student_count,success,created_at&order=created_at.desc&limit=500`,
    {
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
      cache: 'no-store',
    },
  );
  if (!eventsResponse.ok)
    return jsonError('사용량 기록을 불러오지 못했습니다.', 502);
  const events = (await eventsResponse.json()) as UsageEvent[];
  const usersResponse = await fetch(
    `${url}/auth/v1/admin/users?per_page=1000`,
    {
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
      cache: 'no-store',
    },
  );
  const users = usersResponse.ok
    ? (((await usersResponse.json()) as { users?: AuthUser[] }).users ?? [])
    : [];
  const emailById = new Map(
    users.map((authUser) => [authUser.id, authUser.email ?? '이메일 없음']),
  );
  return Response.json({
    events: events.map((event) => ({
      ...event,
      user_email: emailById.get(event.user_id) ?? '이메일 없음',
    })),
  });
}
