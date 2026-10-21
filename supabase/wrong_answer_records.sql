-- 오답노트(fix.kangmath.com) 오답 기록
-- 실행: 선생님이 Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 한 번 실행한다. 여러 번 실행해도 안전(if not exists / or replace).
-- 접근: RLS 를 켜고 정책을 두지 않는다(solution_links·test_sheets 와 같은 방식) → 서버 비밀 키(service_role)로만 읽고 쓴다.
--       브라우저 공개 키(anon/authenticated)로는 표·함수 모두 접근할 수 없다. 화면은 반드시 /api/wrong-records 를 거친다.
-- 노션은 쓰지도 읽지도 않는다(2026-10-21 선생님 결정). 나중에 노션을 붙이면 아래처럼 칸만 더하면 된다:
--   alter table public.wrong_answer_records add column if not exists notion_page_id text, ...;
--
-- 한 줄 = 학생 1명 × 문항 1개 × 하루. 개별 학생 오답노트를 다운로드·인쇄했을 때만 쌓인다(미리보기·여러 학생 모드 제외).
-- 같은 날 같은 학생·교재·문항을 다시 다운로드·인쇄해도 1줄(고유 색인). 다른 날 또 틀리면 새 줄(반복 오답).
--
-- 테스트지만들기(test_sheets / test_papers / test_sheet_items)와 이어 붙일 칸:
--   student_name, student_key, textbook, problem_key, problem_number
--   student_key 규칙: 유니코드 NFKC → 모든 공백 제거 → 소문자. 예) '김 영후 ( 평내 )' → '김영후(평내)'
--   problem_key 규칙(R2 경로에서 교재 폴더와 .png 를 뺀 모양):
--     번호 교재 '0040', 올림포스 'unit-1/standard/0005',
--     블랙라벨 중2-2 'ch1/sub01/must/0012', 블랙라벨 중3-1 'ch01/step1/0012',
--     개념유형파워 중2-2 'ch01/sub01/concept/0012', 개념유형파워 중3-1 'ch01/type/0012', 베이직쎈 'ch1/sub01/basic1/0012'
--   problem_number: 번호 교재는 교재 번호, 올림포스는 전권 순번(1~513), 중등 3단 교재는 그 단계 안의 번호.

create table if not exists public.wrong_answer_records (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  recorded_on      date not null default ((now() at time zone 'Asia/Seoul')::date),  -- 한국 날짜
  user_id          uuid,                                   -- 만든 선생님 Supabase 계정
  teacher          text,                                   -- 'teacher01' 등(로그인 이메일 앞부분)
  source           text not null default 'fix' check (source in ('fix', 'test')),
  batch_id         uuid not null,                          -- 버튼 한 번 = 1개
  output_kind      text check (output_kind in ('download', 'print')),
  student_name     text not null,                          -- 보기 좋게 정리한 이름(앞뒤·연속 공백 정리)
  student_name_raw text not null,                          -- 선생님이 입력한 글자 그대로(앞뒤 공백만 뺌)
  student_key      text not null,                          -- 비교용 키(위 규칙)
  grade            text,                                   -- 화면의 학년 구분 '1학년' 등
  textbook         text not null,                          -- 'synergy-calculus' 등 (영문 교재 id)
  problem_key      text not null,
  problem_number   integer,
  problem_label    text,                                   -- 사람이 읽는 이름 '123번', '1단원 · 유형 #0005'
  unit             text                                    -- 단원(지금은 올림포스·중등 3단·시너지 공통수학1만, 나머지 null)
);

-- 같은 날 같은 학생·교재·문항은 한 줄만
create unique index if not exists wrong_answer_records_dedup
  on public.wrong_answer_records (source, student_key, textbook, problem_key, recorded_on);
create index if not exists wrong_answer_records_student_idx
  on public.wrong_answer_records (student_key, textbook, created_at desc);
create index if not exists wrong_answer_records_problem_idx
  on public.wrong_answer_records (textbook, problem_key);
create index if not exists wrong_answer_records_recent_idx
  on public.wrong_answer_records (created_at desc);

alter table public.wrong_answer_records enable row level security;
revoke all on public.wrong_answer_records from anon, authenticated;

-- 화면 자동완성용: 예전에 기록한 학생 이름(같은 키는 가장 최근 표기 하나, 최근 순).
create or replace function public.wrong_record_student_names(max_rows integer default 500)
returns table (student_name text, student_key text, last_recorded_at timestamptz)
language sql
stable
set search_path = public
as $$
  select s.student_name, s.student_key, s.last_recorded_at
  from (
    select distinct on (r.student_key) r.student_name, r.student_key, r.created_at as last_recorded_at
    from wrong_answer_records r
    order by r.student_key, r.created_at desc
  ) s
  order by s.last_recorded_at desc
  limit greatest(1, least(coalesce(max_rows, 500), 2000));
$$;
revoke all on function public.wrong_record_student_names(integer) from public, anon, authenticated;
grant execute on function public.wrong_record_student_names(integer) to service_role;
