/**
 * 관리자 API 공통 확인 (서버 전용).
 * app/api/admin/usage 와 같은 방식: 브라우저가 보낸 Supabase 로그인 토큰(Authorization: Bearer)을
 * Supabase /auth/v1/user 로 확인하고, 그 이메일이 ADMIN_EMAILS(쉼표 구분) 안에 있어야 통과한다.
 * 통과하면 서버 비밀 키(SUPABASE_SECRET_KEY)로 표를 읽고 쓴다. 키 값은 코드·로그에 남기지 않는다.
 */

export type AdminContext = {
  url: string;
  secretKey: string;
  email: string;
};

const TIMEOUT_MS = 5000;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** 관리자면 AdminContext, 아니면 바로 돌려줄 오류 Response(401·403·503). */
export async function requireAdmin(request: Request): Promise<AdminContext | Response> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!url || !publishableKey || !secretKey) {
    return jsonError('관리자 기능 환경 설정이 필요합니다.', 503);
  }
  if (!token) return jsonError('로그인이 필요합니다.', 401);
  if (!admins.length) return jsonError('관리자 이메일이 아직 설정되지 않았습니다.', 403);

  let user: { email?: string };
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return jsonError('로그인 세션이 만료되었습니다.', 401);
    user = (await response.json()) as { email?: string };
  } catch {
    return jsonError('로그인 확인에 실패했습니다.', 502);
  }
  const email = (user.email ?? '').toLowerCase();
  if (!email || !admins.includes(email)) return jsonError('관리자 권한이 없습니다.', 403);
  return { url, secretKey, email };
}

export function serviceHeaders(secretKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
