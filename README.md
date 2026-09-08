# 온라인 오답노트 시험판

기존 로컬 프로그램과 분리된 GitHub/Vercel용 웹 프로젝트입니다.

- 관리자 발급 계정으로 Supabase 로그인
- 시너지 미적분 한 권
- `textbook-problems/synergy-calculus` 문제 이미지 사용
- Python ReportLab 함수로 A4 2x2 PDF 생성

`.env.example`을 참고해 `.env.local`을 만들되 실제 연결값은 GitHub에 올리지 않습니다. 서버 전용 키는 `NEXT_PUBLIC_` 이름으로 만들거나 브라우저 코드에 넣으면 안 됩니다.
