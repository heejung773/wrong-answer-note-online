/**
 * 관리자 API 공통 확인 (서버 전용). /api/admin/usage, /api/admin/wrong-records 가 쓴다.
 * 오답노트 사이트는 선생님 혼자 쓰는 창이라(2026-10-23 선생님 말씀) 메인 화면 로그인 한 번이면 된다:
 * 브라우저가 보낸 Supabase 로그인 토큰(Authorization: Bearer)을 Supabase /auth/v1/user 로 확인해
 * 유효한 로그인이면 통과한다. ADMIN_EMAILS 는 더 이상 막는 데 쓰지 않는다(비어 있거나 계정이 빠져도
 * 선생님이 막히지 않게). 통과하면 서버 비밀 키(SUPABASE_SECRET_KEY)로 표를 읽고 쓴다.
 * 키 값은 코드·로그에 남기지 않는다.
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

/** 로그인했으면 AdminContext, 아니면 바로 돌려줄 오류 Response(401·502·503). 403 은 더 이상 없음. */
export async function requireAdmin(request: Request): Promise<AdminContext | Response> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!url || !publishableKey || !secretKey) {
    return jsonError('관리자 기능 환경 설정이 필요합니다.', 503);
  }
  if (!token) return jsonError('로그인이 필요합니다.', 401);

  type AuthUser = { id?: string; email?: string; is_anonymous?: boolean };
  let user: AuthUser;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return jsonError('로그인 세션이 만료되었습니다.', 401);
    user = (await response.json()) as AuthUser;
  } catch {
    return jsonError('로그인 확인에 실패했습니다.', 502);
  }
  // 메인 화면처럼 이메일·비밀번호로 로그인한 계정만 (익명 로그인 토큰은 통과시키지 않음)
  const email = (user.email ?? '').toLowerCase();
  if (!user.id || !email || user.is_anonymous) {
    return jsonError('로그인이 필요합니다.', 401);
  }
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
