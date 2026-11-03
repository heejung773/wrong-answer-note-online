"""로컬 개발용: 파이썬 PDF API(api/generate.py)를 이 컴퓨터에서 띄운다. 운영(Vercel)에는 쓰이지 않는다.

`next dev` 는 파이썬 함수(/api/generate)를 실행하지 못하므로, 이 서버를 따로 켜고
Next 쪽은 PYTHON_API_DEV_URL 로 /api/generate 요청을 이 서버에 넘긴다(next.config.ts, 개발 모드에서만).

  터미널 1: python scripts/dev_python_api.py            (기본 127.0.0.1:8001)
  터미널 2: PowerShell  $env:PYTHON_API_DEV_URL="http://127.0.0.1:8001"; npm run dev

.env.local 의 Supabase·R2 설정을 이 프로세스 환경으로만 읽는다(값은 출력하지 않음).
로그인 확인·사용량 기록·교재 그림은 운영과 같은 곳을 쓰므로, 로그인해서 PDF 를 받으면 사용량 기록이 남는다.
내신 자료 폴더는 NAESIN_EXPORT_DIR 로 바꾼다(naesin_source.py).
"""
from __future__ import annotations

import argparse
from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_env_local() -> int:
    path = ROOT / ".env.local"
    if not path.is_file():
        return 0
    count = 0
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip("\"'")
            count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="로컬 파이썬 PDF API")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    loaded = load_env_local()
    from api import generate

    server = ThreadingHTTPServer(("127.0.0.1", args.port), generate.handler)
    print(f"python api: http://127.0.0.1:{args.port}/api/generate  (.env.local 항목 {loaded}개 읽음)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
