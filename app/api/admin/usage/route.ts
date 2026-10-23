import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

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
  // 메인 화면과 같은 로그인 토큰이면 통과 (lib/admin-auth.ts, 다운목록과 같은 방식)
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  const { url, secretKey } = auth;

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
