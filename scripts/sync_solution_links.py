"""노션 '문제별 손풀이 영상' DB → Supabase solution_links 동기화 (로컬 실행용).

    python scripts/sync_solution_links.py            # 동기화
    python scripts/sync_solution_links.py --dry-run  # 노션만 읽고 결과만 보기
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

import solution_links  # noqa: E402

solution_links.load_local_env()
report = solution_links.sync_all(dry_run="--dry-run" in sys.argv)
print(json.dumps(report, ensure_ascii=False, indent=2))
