-- 내신 기출 문항별 손풀이 영상 링크 (오답노트 '내신 기출' 화면 → PDF 의 손풀이 QR)
-- 한 줄 = 내신 원본 문항 1개. 변형 문항은 원본 링크를 쓰지 않으므로 넣지 않는다(key 모양 검사로 막음).
--   name : 트윈 '문제 번호' (예 다산고1_2025_2학기중간-09) — 기본키
--   key  : 오답노트 문항 키 (예 naesin-dasan/g1/2025-2mid/0009) — PDF 생성 때 이 칸으로 찾는다
--   url  : 유튜브 https 주소 (예 https://youtu.be/<영상ID>?t=<초>)
--   source : 어디서 가져왔는지 메모
-- 넣기: python scripts/load_naesin_solution_links.py (미리보기) → --go (upsert, 지우기 없음)
-- 권한: 기존 solution_links 표와 같다. RLS 를 켜고 정책을 두지 않아 브라우저(공개 키)에서는 읽기·쓰기 모두 안 되고,
--       서버 비밀 키(api/generate.py → naesin_source.py)로만 읽는다.
-- 선생님 실행 위치: Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여 넣고 Run. 여러 번 실행해도 안전하다.
create table if not exists public.naesin_solution_links (
  name text primary key check (length(btrim(name)) > 0),
  key text not null unique
    check (key ~ '^naesin-[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9-]+/[a-z0-9-]+/[0-9]{4}$'),
  url text not null
    check (url ~ '^https://(youtu\.be/[A-Za-z0-9_-]{11}|(www\.|m\.)?youtube\.com/watch\?)'),
  source text,
  updated_at timestamptz not null default now()
);

alter table public.naesin_solution_links enable row level security;
