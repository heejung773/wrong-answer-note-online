'use client';

import {
  ChangeEvent,
  SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const loginDomain =
  process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? 'academy.local';

type Book = 'common' | 'olympus' | 'gojaengi';

const unitMap: Record<string, string> = {
  '1. 함수의 극한': 'unit-1',
  '2. 함수의 연속': 'unit-2',
  '3. 미분계수와 도함수': 'unit-3',
  '4. 도함수의 활용': 'unit-4',
};
const typeMap: Record<string, string> = {
  유형완성하기: 'standard',
  서술형완성하기: 'written',
  고난도도전: 'challenge',
};

function objectPath(book: Book, file: File): string | null {
  const parts = file.webkitRelativePath.split('/');
  if (book === 'common') {
    if (parts.at(-2) === '문제모음' && /^\d{4}\.png$/.test(file.name))
      return `synergy-common-math-2/${file.name}`;
    if (file.name === '마플시너지-공통수학2-빠른정답.pdf')
      return 'synergy-common-math-2/quick-answer.pdf';
  }
  if (
    book === 'gojaengi' &&
    parts.at(-2) === '문제이미지모음' &&
    /^\d{4}\.png$/.test(file.name)
  ) {
    return `gojaengi-common-math-2/${file.name}`;
  }
  if (book === 'olympus') {
    if (file.name === 'EBS 올림포스 유형편 미적분Ⅰ (22개정) - 해설.pdf')
      return 'olympus-calculus/answers.pdf';
    const unit = parts.find((part) => unitMap[part]);
    const problemType = parts.find((part) => typeMap[part]);
    if (unit && problemType && /^\d{4}\.png$/.test(file.name)) {
      return `olympus-calculus/${unitMap[unit]}/${typeMap[problemType]}/${file.name}`;
    }
  }
  return null;
}

export default function AdminUpload() {
  const supabase = useMemo(
    () =>
      supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey)
        : null,
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [book, setBook] = useState<Book>('common');
  const [status, setStatus] = useState('교재 폴더를 선택하세요.');
  const [busy, setBusy] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '');
    inputRef.current?.setAttribute('directory', '');
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => setSessionToken(data.session?.access_token ?? ''));
  }, [supabase]);

  async function login(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !loginId.trim() || !password) return;
    setBusy(true);
    setStatus('로그인 확인 중…');
    const normalized = loginId.trim();
    const email = normalized.includes('@')
      ? normalized
      : `${normalized}@${loginDomain}`;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      setStatus('아이디 또는 비밀번호가 틀렸습니다.');
    } else {
      setSessionToken(data.session.access_token);
      setPassword('');
      setStatus('로그인되었습니다. 교재 폴더를 선택하세요.');
    }
    setBusy(false);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    if (!supabase) {
      setStatus('서버 연결 설정을 확인해 주세요.');
      return;
    }
    if (!sessionToken) {
      setStatus('먼저 온라인 오답노트에 로그인해 주세요.');
      return;
    }
    const selected = Array.from(event.target.files ?? [])
      .map((file) => ({ file, path: objectPath(book, file) }))
      .filter((item): item is { file: File; path: string } =>
        Boolean(item.path),
      );
    const expected = book === 'common' ? 991 : book === 'olympus' ? 349 : 380;
    if (selected.length !== expected) {
      setStatus(
        `필요한 파일은 ${expected}개인데 ${selected.length}개를 찾았습니다. 올바른 교재 폴더를 선택해 주세요.`,
      );
      event.target.value = '';
      return;
    }
    setBusy(true);
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const item = selected[index];
        const response = await fetch('/api/upload_textbook', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'X-Object-Path': encodeURIComponent(item.path),
          },
          body: item.file,
        });
        if (!response.ok)
          throw new Error(`${item.path} 업로드에 실패했습니다.`);
        if ((index + 1) % 10 === 0 || index + 1 === selected.length)
          setStatus(`${index + 1} / ${selected.length} 업로드 중…`);
      }
      setStatus(`${selected.length}개 파일 업로드가 완료되었습니다.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '업로드에 실패했습니다.',
      );
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <Card className="mx-auto max-w-xl border-0 shadow-lg">
        <CardHeader>
          <CardTitle>교재 자료 연결</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!sessionToken && (
            <form
              className="space-y-3 rounded-xl bg-slate-50 p-4"
              onSubmit={login}
            >
              <Input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="아이디"
                autoComplete="username"
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                autoComplete="current-password"
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? '확인 중…' : '로그인'}
              </Button>
            </form>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              type="button"
              variant={book === 'common' ? 'default' : 'outline'}
              onClick={() => setBook('common')}
              disabled={busy}
            >
              시너지 공수2
            </Button>
            <Button
              type="button"
              variant={book === 'olympus' ? 'default' : 'outline'}
              onClick={() => setBook('olympus')}
              disabled={busy}
            >
              올림푸스
            </Button>
            <Button
              type="button"
              variant={book === 'gojaengi' ? 'default' : 'outline'}
              onClick={() => setBook('gojaengi')}
              disabled={busy}
            >
              고쟁이
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="block w-full rounded-xl border p-3"
            onChange={upload}
            disabled={busy || !sessionToken}
          />
          <p
            className="rounded-xl bg-slate-50 p-4 text-sm leading-6"
            aria-live="polite"
          >
            {status}
          </p>
          <p className="text-sm text-slate-500">
            선택한 원본 폴더는 읽기만 하며 수정하지 않습니다. 업로드가 끝날
            때까지 이 화면을 닫지 마세요.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
