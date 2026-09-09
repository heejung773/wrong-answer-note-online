'use client';

import { SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  BookOpen,
  CheckCircle2,
  FileDown,
  LockKeyhole,
  LogOut,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

type TextbookId =
  | 'synergy-calculus'
  | 'synergy-common-math-2'
  | 'olympus-calculus'
  | 'gojaengi-common-math-2';

type OlympusItem = {
  id: number;
  unit: string;
  problemType: string;
  numbers: string;
  count: number;
};

const textbooks: Array<{
  id: TextbookId;
  title: string;
  subject: string;
  available: boolean;
}> = [
  {
    id: 'synergy-calculus',
    title: '시너지 미적분',
    subject: '미적분Ⅰ',
    available: true,
  },
  {
    id: 'synergy-common-math-2',
    title: '시너지 공통수학2',
    subject: '공통수학2',
    available: true,
  },
  {
    id: 'olympus-calculus',
    title: '올림푸스',
    subject: '미적분Ⅰ',
    available: true,
  },
  {
    id: 'gojaengi-common-math-2',
    title: '고쟁이',
    subject: '공통수학2',
    available: true,
  },
];

const olympusUnits = [
  '1. 함수의 극한',
  '2. 함수의 연속',
  '3. 미분계수와 도함수',
  '4. 도함수의 활용',
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const loginDomain =
  process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? 'academy.local';

function countProblemNumbers(raw: string) {
  let count = 0;
  for (const token of raw.trim().split(/[\s,]+/)) {
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      count += 1;
      continue;
    }
    const range = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (!range) throw new Error(`알 수 없는 문제번호 입력: ${token}`);
    count += Math.abs(Number(range[2]) - Number(range[1])) + 1;
  }
  if (!count) throw new Error('문제번호를 입력하세요.');
  return count;
}

export default function Home() {
  const configured = Boolean(supabaseUrl && supabaseKey);
  const supabase = useMemo(
    () => (configured ? createClient(supabaseUrl, supabaseKey) : null),
    [configured],
  );
  const [sessionToken, setSessionToken] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [student, setStudent] = useState('');
  const [grade, setGrade] = useState('1학년');
  const [numbers, setNumbers] = useState('1, 2, 3, 4');
  const [textbook, setTextbook] = useState<TextbookId | null>(null);
  const [olympusUnit, setOlympusUnit] = useState(olympusUnits[0]);
  const [olympusType, setOlympusType] = useState('유형완성하기');
  const [olympusItems, setOlympusItems] = useState<OlympusItem[]>([]);
  const [status, setStatus] = useState(
    configured ? '로그인이 필요합니다.' : 'Supabase 연결 설정 전입니다.',
  );
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(configured);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionToken(data.session?.access_token ?? '');
      if (data.session) setStatus('오답노트를 만들 준비가 되었습니다.');
      setCheckingSession(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        setSessionToken(session?.access_token ?? '');
        setCheckingSession(false);
      },
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'prepare_wrong_answer_note',
          title: '오답노트 입력 준비',
          description:
            '학생 이름, 학년, 문제번호를 화면에 입력하지만 PDF는 생성하지 않습니다.',
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
            const value = input as {
              student?: unknown;
              grade?: unknown;
              numbers?: unknown;
            };
            if (
              typeof value.student !== 'string' ||
              typeof value.numbers !== 'string' ||
              !['1학년', '2학년', '3학년'].includes(String(value.grade))
            ) {
              throw new Error('학생 이름, 학년, 문제번호를 확인해 주세요.');
            }
            setStudent(value.student);
            setGrade(String(value.grade));
            setNumbers(value.numbers);
            setStatus(
              '입력값을 준비했습니다. 로그인 후 PDF 만들기를 누르세요.',
            );
            return { prepared: true, textbook: 'synergy-calculus' };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
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
      const email = normalizedId.includes('@')
        ? normalizedId
        : `${normalizedId}@${loginDomain}`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session) {
        setStatus('아이디 또는 비밀번호가 틀렸습니다.');
      } else {
        setSessionToken(data.session.access_token);
        setPassword('');
        setStatus('로그인되었습니다.');
      }
    } catch {
      setStatus(
        '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
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
    if (!sessionToken || !textbook) return;
    const selectedTextbook = textbooks.find((item) => item.id === textbook);
    if (!selectedTextbook?.available) {
      setStatus(
        `${selectedTextbook?.title ?? '선택한 교재'}는 온라인 문제 자료를 연결한 뒤 사용할 수 있습니다.`,
      );
      return;
    }
    if (textbook === 'olympus-calculus' && olympusItems.length === 0) {
      setStatus('문제번호를 입력한 뒤 목록에 추가해 주세요.');
      return;
    }
    setBusy(true);
    setStatus('오답노트를 만드는 중…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          textbook,
          student,
          grade,
          numbers,
          olympusUnit,
          olympusType,
          olympusItems: olympusItems.map(({ unit, problemType, numbers }) => ({
            unit,
            problemType,
            numbers,
          })),
        }),
      });
      if (!response.ok) {
        const message = await response
          .json()
          .catch(() => ({ error: 'PDF 생성에 실패했습니다.' }));
        throw new Error(message.error);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${student || '학생'}_${grade}_${selectedTextbook.title}_오답노트.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('PDF 다운로드가 시작되었습니다.');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'PDF 생성에 실패했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  function addOlympusItem() {
    try {
      const count = countProblemNumbers(numbers);
      const currentCount = olympusItems.reduce(
        (total, item) => total + item.count,
        0,
      );
      if (currentCount + count > 20) {
        throw new Error('시험판은 전체 목록에서 최대 20문제까지 추가할 수 있습니다.');
      }
      setOlympusItems((items) => [
        ...items,
        {
          id: Date.now(),
          unit: olympusUnit,
          problemType: olympusType,
          numbers: numbers.trim(),
          count,
        },
      ]);
      setNumbers('');
      setStatus(`${count}문제를 목록에 추가했습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '문제번호를 확인해 주세요.');
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 sm:py-7">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between rounded-2xl border bg-white/90 px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <BookOpen />
            </span>
            <div>
              <p className="text-sm font-semibold text-primary">강석수학</p>
              <h1 className="text-xl font-bold tracking-tight">
                온라인 오답노트
              </h1>
            </div>
          </div>
          {sessionToken ? (
            <Button
              type="button"
              variant="outline"
              onClick={logout}
              disabled={busy}
            >
              <LogOut /> 로그아웃
            </Button>
          ) : (
            <Badge variant={configured ? 'secondary' : 'outline'}>
              {configured ? '시험 운영' : '연결 준비'}
            </Badge>
          )}
        </header>

        {checkingSession ? (
          <Card className="mx-auto max-w-md border-0 shadow-lg">
            <CardContent
              className="py-12 text-center text-slate-600"
              aria-live="polite"
            >
              로그인 상태를 확인하고 있습니다…
            </CardContent>
          </Card>
        ) : !sessionToken ? (
          <section className="mx-auto max-w-md">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="mb-2 grid size-11 place-items-center rounded-xl bg-blue-50 text-primary">
                  <LockKeyhole />
                </div>
                <CardTitle className="text-xl">사용자 로그인</CardTitle>
                <CardDescription>
                  관리자에게 받은 아이디와 비밀번호를 입력하세요.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={login}>
                  <label htmlFor="login-id" className="block space-y-2">
                    <span className="font-medium">아이디</span>
                    <Input
                      id="login-id"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      autoComplete="username"
                      disabled={!configured || Boolean(sessionToken)}
                    />
                  </label>
                  <label htmlFor="login-password" className="block space-y-2">
                    <span className="font-medium">비밀번호</span>
                    <Input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={!configured || Boolean(sessionToken)}
                    />
                  </label>
                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={!configured || busy}
                  >
                    {busy ? '확인 중…' : '로그인'}
                  </Button>
                  <p
                    aria-live="polite"
                    className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700"
                  >
                    {status}
                  </p>
                </form>
                {!configured && (
                  <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    현재는 안전하게 연결값을 비워 둔 로컬 준비 상태입니다. 배포
                    전에 Supabase 환경 설정을 연결합니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        ) : !textbook ? (
          <section className="mx-auto max-w-4xl">
            <div className="mb-5">
              <h2 className="text-2xl font-bold tracking-tight">
                교재를 선택하세요
              </h2>
              <p className="mt-1 text-slate-600">
                오답노트를 만들 교재를 선택하면 전용 입력 화면이 열립니다.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {textbooks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTextbook(item.id);
                    setStatus(
                      item.available
                        ? '학생 정보와 문제번호를 입력하세요.'
                        : `${item.title} 전용 입력 화면입니다. 온라인 문제 자료 연결이 필요합니다.`,
                    );
                  }}
                  className="group rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-primary">
                      <BookOpen />
                    </span>
                    <Badge variant={item.available ? 'secondary' : 'outline'}>
                      {item.available ? '사용 가능' : '연결 준비'}
                    </Badge>
                  </div>
                  <h3 className="mt-5 text-lg font-bold group-hover:text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{item.subject}</p>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="mx-auto max-w-3xl">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {textbooks.find((item) => item.id === textbook)?.title}{' '}
                      오답노트
                    </CardTitle>
                    <CardDescription className="mt-1">
                      학생 정보와 틀린 문제를 입력하세요.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTextbook(null)}
                  >
                    교재 다시 선택
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form className="grid gap-5 sm:grid-cols-2" onSubmit={generate}>
                  <label htmlFor="grade" className="space-y-2 sm:col-span-2">
                    <span className="font-medium">학년</span>
                    <NativeSelect
                      id="grade"
                      className="w-full"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      disabled={!sessionToken}
                    >
                      <NativeSelectOption>1학년</NativeSelectOption>
                      <NativeSelectOption>2학년</NativeSelectOption>
                      <NativeSelectOption>3학년</NativeSelectOption>
                    </NativeSelect>
                  </label>
                  {textbook === 'olympus-calculus' && (
                    <>
                      <label htmlFor="olympus-unit" className="space-y-2">
                        <span className="font-medium">단원</span>
                        <NativeSelect
                          id="olympus-unit"
                          className="w-full"
                          value={olympusUnit}
                          onChange={(e) => setOlympusUnit(e.target.value)}
                        >
                          {olympusUnits.map((unit) => (
                            <NativeSelectOption key={unit}>
                              {unit}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label htmlFor="olympus-type" className="space-y-2">
                        <span className="font-medium">문제유형</span>
                        <NativeSelect
                          id="olympus-type"
                          className="w-full"
                          value={olympusType}
                          onChange={(e) => setOlympusType(e.target.value)}
                        >
                          <NativeSelectOption>유형완성하기</NativeSelectOption>
                          <NativeSelectOption>
                            서술형완성하기
                          </NativeSelectOption>
                          <NativeSelectOption>고난도도전</NativeSelectOption>
                        </NativeSelect>
                      </label>
                    </>
                  )}
                  <label htmlFor="student" className="space-y-2 sm:col-span-2">
                    <span className="font-medium">학생 이름</span>
                    <Input
                      id="student"
                      value={student}
                      onChange={(e) => setStudent(e.target.value)}
                      placeholder="홍길동"
                      required
                      disabled={!sessionToken}
                    />
                  </label>
                  <label htmlFor="numbers" className="space-y-2 sm:col-span-2">
                    <span className="font-medium">문제번호</span>
                    <Textarea
                      id="numbers"
                      value={numbers}
                      onChange={(e) => setNumbers(e.target.value)}
                      placeholder="1, 5, 10 또는 1-10"
                      required={textbook !== 'olympus-calculus'}
                      disabled={!sessionToken}
                    />
                    <span className="block text-sm text-muted-foreground">
                      {textbook === 'olympus-calculus'
                        ? '선택한 단원과 문제유형 안에서 표시된 번호를 입력하세요.'
                        : '쉼표·띄어쓰기·연속 범위를 사용할 수 있습니다. 시험판은 한 번에 최대 20문제입니다.'}
                    </span>
                  </label>
                  {textbook === 'olympus-calculus' && (
                    <div className="space-y-3 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={addOlympusItem}
                        disabled={busy}
                      >
                        목록에 추가
                      </Button>
                      <div className="rounded-xl border bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">입력한 문제 목록</p>
                            <p className="text-sm text-slate-500">
                              총 {olympusItems.reduce((total, item) => total + item.count, 0)} / 20문제
                            </p>
                          </div>
                          {olympusItems.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setOlympusItems([]);
                                setStatus('입력 목록을 모두 비웠습니다.');
                              }}
                            >
                              전체 비우기
                            </Button>
                          )}
                        </div>
                        {olympusItems.length === 0 ? (
                          <p className="rounded-lg bg-white p-3 text-sm text-slate-500">
                            단원과 문제유형을 선택하고 번호를 목록에 추가하세요.
                          </p>
                        ) : (
                          <ol className="space-y-2">
                            {olympusItems.map((item, index) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm"
                              >
                                <span>
                                  {index + 1}. {item.unit} · {item.problemType} · {item.numbers}번
                                  <span className="ml-2 text-slate-500">({item.count}문제)</span>
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setOlympusItems((items) =>
                                      items.filter((entry) => entry.id !== item.id),
                                    )
                                  }
                                >
                                  삭제
                                </Button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                  {!textbooks.find((item) => item.id === textbook)
                    ?.available && (
                    <p className="sm:col-span-2 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      전용 입력 화면은 준비되었습니다. 실제 PDF 생성은 이 교재의
                      문제 이미지와 빠른정답을 온라인 저장소에 연결한 뒤 사용할
                      수 있습니다.
                    </p>
                  )}
                  <div className="sm:col-span-2 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      aria-live="polite"
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <CheckCircle2 className="size-4 text-primary" />
                      {status}
                    </p>
                    <Button
                      type="submit"
                      className="h-11 px-5"
                      disabled={
                        !sessionToken ||
                        busy ||
                        !textbooks.find((item) => item.id === textbook)
                          ?.available
                      }
                    >
                      <FileDown /> {busy ? '만드는 중…' : 'PDF 만들기'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}
