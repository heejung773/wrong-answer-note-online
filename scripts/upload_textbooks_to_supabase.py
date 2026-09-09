from __future__ import annotations

import json
import mimetypes
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tmp" / "all-textbooks-upload-manifest.json"


def main() -> None:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SECRET_KEY", "")
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")
    if not url or not secret:
        raise SystemExit("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY를 로컬 환경에 설정해야 합니다.")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    total = int(manifest["file_count"])
    for index, item in enumerate(manifest["files"], 1):
        source = Path(item["source"])
        object_path = urllib.parse.quote(f"{bucket}/{item['object']}", safe="/")
        request = urllib.request.Request(
            f"{url}/storage/v1/object/{object_path}",
            data=source.read_bytes(),
            method="POST",
            headers={
                "apikey": secret,
                "Content-Type": mimetypes.guess_type(source.name)[0] or "application/octet-stream",
                "x-upsert": "true",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status not in (200, 201):
                    raise RuntimeError(f"HTTP {response.status}: {item['object']}")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"업로드 실패 ({error.code}): {item['object']} {detail}") from error
        if index == total or index % 50 == 0:
            print(f"uploaded={index}/{total}")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
