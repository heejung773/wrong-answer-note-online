'use client';

import { SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BookOpen, CheckCircle2, FileDown, LockKeyhole, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const loginDomain = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? 'academy.local';

export default function Home() {
  const configured = Boolean(supabaseUrl && supabaseKey);
  const supabase = useMemo(() => (configured ? createClient(supabaseUrl, supabaseKey) : null), [configured]);
  const [sessionToken, setSessionToken] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [student, setStudent] = useState('');
  const [grade, setGrade] = useState('1학년');
  const [numbers, setNumbers] = useState('1, 2, 3, 4');
  const [status, setStatus] = useState(configured ? '로그인이 필요합니다.' : 'Supabase 연결 설정 전입니다.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'prepare_wrong_answer_note',
      title: '오답노트 입력 준비',
      description: '학생 이름, 학년, 문제번호를 화면에 입력하지만 PDF는 생성하지 않습니다.',
      inputSchema: {
        type: 'object',
        properties: {
          student: { type: 'string' },
          grade: { type: 'string', enum: ['1학년', '2학년', '3학년'] },
          numbers: { type: 'string' },
        },
        required: ['student', 'grade', 'numbers'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { student?: unknown; grade?: unknown; numbers?: unknown };
        if (typeof value.student !== 'string' || typeof value.numbers !== 'string' || !['1학년', '2학년', '3학년'].includes(String(value.grade))) {
          throw new Error('학생 이름, 학년, 문제번호를 확인해 주세요.');
        }
        setStudent(value.student);
        setGrade(String(value.grade));
        setNumbers(value.numbers);
        setStatus('입력값을 준비했습니다. 로그인 후 PDF 만들기를 누르세요.');
        return { prepared: true, textbook: 'synergy-calculus' };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  async function login(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (!loginId.trim() || !password) {
      setStatus('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setBusy(true);
    setStatus('로그인 확인 중…');
    try {
      const normalizedId = loginId.trim();
      const email = normalizedId.includes('@') ? normalizedId : `${normalizedId}@${loginDomain}`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        setStatus('아이디 또는 비밀번호가 틀렸습니다.');
      } else {
        setSessionToken(data.session.access_token);
        setPassword('');
        setStatus('로그인되었습니다.');
      }
    } catch {
      setStatus('로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    setSessionToken('');
    setStatus('로그아웃되었습니다.');
  }

  async function generate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken) return;
    setBusy(true);
    setStatus('오답노트를 만드는 중…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ textbook: 'synergy-calculus', student, grade, numbers }),
      });
      if (!response.ok) {
        const message = await response.json().catch(() => ({ error: 'PDF 생성에 실패했습니다.' }));
        throw new Error(message.error);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${student || '학생'}_${grade}_미적분_오답노트.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('PDF 다운로드가 시작되었습니다.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PDF 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 sm:py-7">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between rounded-2xl border bg-white/90 px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><BookOpen /></span>
            <div><p className="text-sm font-semibold text-primary">강석수학</p><h1 className="text-xl font-bold tracking-tight">온라인 오답노트</h1></div>
          </div>
          <Badge variant={configured ? 'secondary' : 'outline'}>{configured ? '시험 운영' : '연결 준비'}</Badge>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Card className="self-start border-0 shadow-lg">
            <CardHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-blue-50 text-primary"><LockKeyhole /></div>
              <CardTitle className="text-xl">사용자 로그인</CardTitle>
              <CardDescription>관리자에게 받은 아이디와 비밀번호를 입력하세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={login}>
                <label htmlFor="login-id" className="block space-y-2"><span className="font-medium">아이디</span><Input id="login-id" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" disabled={!configured || Boolean(sessionToken)} /></label>
                <label htmlFor="login-password" className="block space-y-2"><span className="font-medium">비밀번호</span><Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={!configured || Boolean(sessionToken)} /></label>
                {sessionToken ? <Button type="button" variant="outline" className="h-11 w-full" onClick={logout}><LogOut /> 로그아웃</Button> : <Button type="submit" className="h-11 w-full" disabled={!configured || busy}>{busy ? '확인 중…' : '로그인'}</Button>}
                <p aria-live="polite" className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{status}</p>
              </form>
              {!configured && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">현재는 안전하게 연결값을 비워 둔 로컬 준비 상태입니다. 배포 전에 Supabase 환경 설정을 연결합니다.</p>}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">오답노트 만들기</CardTitle>
              <CardDescription>현재 시험 교재는 시너지 미적분이며, 서버에 올린 문제만 선택할 수 있습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5 sm:grid-cols-2" onSubmit={generate}>
                <label htmlFor="textbook" className="space-y-2"><span className="font-medium">교재</span><NativeSelect id="textbook" className="w-full" disabled><NativeSelectOption>시너지 미적분</NativeSelectOption></NativeSelect></label>
                <label htmlFor="grade" className="space-y-2"><span className="font-medium">학년</span><NativeSelect id="grade" className="w-full" value={grade} onChange={(e) => setGrade(e.target.value)} disabled={!sessionToken}><NativeSelectOption>1학년</NativeSelectOption><NativeSelectOption>2학년</NativeSelectOption><NativeSelectOption>3학년</NativeSelectOption></NativeSelect></label>
                <label htmlFor="student" className="space-y-2 sm:col-span-2"><span className="font-medium">학생 이름</span><Input id="student" value={student} onChange={(e) => setStudent(e.target.value)} placeholder="홍길동" required disabled={!sessionToken} /></label>
                <label htmlFor="numbers" className="space-y-2 sm:col-span-2"><span className="font-medium">문제번호</span><Textarea id="numbers" value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="1, 5, 10 또는 1-10" required disabled={!sessionToken} /><span className="block text-sm text-muted-foreground">쉼표·띄어쓰기·연속 범위를 사용할 수 있습니다. 시험판은 한 번에 최대 20문제입니다.</span></label>
                <div className="sm:col-span-2 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p aria-live="polite" className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="size-4 text-primary" />{status}</p>
                  <Button type="submit" className="h-11 px-5" disabled={!sessionToken || busy}><FileDown /> {busy ? '만드는 중…' : 'PDF 만들기'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
