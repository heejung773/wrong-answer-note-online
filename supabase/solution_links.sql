-- 문항별 손풀이 영상 링크 (노션 DB → 동기화 스크립트 → 이 표 → PDF 생성 시 QR)
-- 대상 교재: synergy-calculus, synergy-common-math-2
-- 서버 비밀 키로만 읽고 쓴다: RLS 를 켜고 정책을 두지 않아 브라우저(공개 키)에서는 접근할 수 없다.
create table if not exists public.solution_links (
  textbook text not null,
  problem_number integer not null check (problem_number > 0),
  link_url text not null,
  start_seconds integer,
  video_url text,
  unit text,
  notion_page_id text not null,
  notion_edited_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (textbook, problem_number)
);

alter table public.solution_links enable row level security;
