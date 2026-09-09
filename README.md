# 온라인 오답노트 시험판

기존 로컬 프로그램과 분리된 GitHub/Vercel용 웹 프로젝트입니다.

- 관리자 발급 계정으로 Supabase 로그인
- 시너지 미적분, 시너지 공통수학2, 올림포스 미적분Ⅰ, 고쟁이 공통수학2
- 교재별 자료는 Supabase Storage의 `textbook-problems/<textbook-id>` 경로 사용
- Python ReportLab 함수로 A4 2x2 PDF 생성

로컬 원본 교재 폴더는 수정하지 않습니다. `scripts/prepare_all_textbooks.py`가 읽기 전용으로 파일 수와 체크섬을 확인해 `tmp/all-textbooks-upload-manifest.json`을 만들고, 서버 전용 환경 설정이 준비된 관리자 환경에서만 `scripts/upload_textbooks_to_supabase.py`로 업로드합니다.

`.env.example`을 참고해 `.env.local`을 만들되 실제 연결값은 GitHub에 올리지 않습니다. 서버 전용 키는 `NEXT_PUBLIC_` 이름으로 만들거나 브라우저 코드에 넣으면 안 됩니다.
