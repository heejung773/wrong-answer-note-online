'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * 관리자 화면(사용량 · 다운목록)에서 로그인이 안 되어 있을 때.
 * 로그인은 메인 화면에서 한 번만 한다(2026-10-23 선생님 말씀): 따로 관리자 로그인 창을 띄우지 않고
 * 메인 로그인 화면(/)으로 보낸다. 메인과 관리자 화면은 같은 Supabase 세션(브라우저 저장소)을 쓴다.
 */
export function GoToMainLogin() {
  useEffect(() => {
    window.location.replace('/');
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <p className="text-sm text-slate-300">
        메인 화면에서 로그인해 주세요. 이동 중…{' '}
        <Link className="text-teal-300 underline" href="/">
          오답노트 만들기로
        </Link>
      </p>
    </main>
  );
}
