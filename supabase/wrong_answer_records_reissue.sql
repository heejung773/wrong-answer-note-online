-- 오답노트 다운목록 [다시 받기]용 칸 추가 (2026-11-05)
-- 실행: 선생님이 Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 한 번 실행한다. 여러 번 실행해도 안전(if not exists).
-- 실행 전에도 사이트는 그대로 동작한다: 기록은 이 두 칸 없이 남고, [다시 받기]는 '기본 설정 · 번호 순'으로 만든다.
-- 실행 뒤 새로 받는 오답노트부터 두 칸이 채워진다(옛 줄은 비어 있음 → 기본 설정으로 다시 만듦).
--
-- problem_order : 그 PDF 안에서의 문항 순서(0부터). 같은 버튼 한 번(batch_id) 안에서만 뜻이 있다.
-- pdf_options   : 그 PDF 의 '04 표지·서식' 설정(lib/pdf-options.ts 모양)
--                 {includeCover, includeCharacter, includeSolutionQr, coverTitle, academyName, coverSubtitle,
--                  testDate, customCharacter(직접 올린 그림을 썼는지 true/false, 그림 자체는 저장 안 함)}
-- 같은 버튼 한 번의 줄들은 pdf_options 가 모두 같다(줄마다 복사).
-- 테스트지만들기는 이 표를 쓰지 않는다(자기 test_sheets 표) → 영향 없음.

alter table public.wrong_answer_records add column if not exists problem_order smallint;
alter table public.wrong_answer_records add column if not exists pdf_options jsonb;

-- PostgREST 가 새 칸을 바로 알도록 스키마 캐시 새로 읽기
notify pgrst, 'reload schema';
