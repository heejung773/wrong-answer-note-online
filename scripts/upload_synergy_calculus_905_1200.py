from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"D:\시너지_미적분\905번부터이미지")


def main() -> None:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    secret = os.environ["SUPABASE_SECRET_KEY"]
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")
    files = sorted(SOURCE.glob("*.png"))
    expected = {f"{n:04d}.png" for n in range(905, 1201)}
    actual = {p.name for p in files}
    if actual != expected:
        raise SystemExit(f"파일 목록이 0905~1200과 일치하지 않습니다: count={len(files)}")

    def upload(source: Path) -> None:
        obj = f"synergy-calculus/{source.name}"
        path = urllib.parse.quote(f"{bucket}/{obj}", safe="/")
        request = urllib.request.Request(
            f"{url}/storage/v1/object/{path}", data=source.read_bytes(), method="POST",
            headers={"apikey": secret, "Content-Type": mimetypes.guess_type(source.name)[0] or "image/png", "x-upsert": "true"},
        )
        with urllib.request.urlopen(request, timeout=90) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"HTTP {response.status}: {obj}")

    print(f"verified={len(files)} range=0905-1200")
    with ThreadPoolExecutor(max_workers=16) as pool:
        for index, _ in enumerate(pool.map(upload, files), 1):
            if index % 50 == 0 or index == len(files):
                print(f"uploaded={index}/{len(files)}")


if __name__ == "__main__":
    main()
