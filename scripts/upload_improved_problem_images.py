from __future__ import annotations

import mimetypes
import os
from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
BOOKS = {
    "synergy-calculus": Path(r"D:\시너지_미적분\문제모음_개선본"),
    "synergy-common-math-2": Path(r"D:\시너지_공통수학2\문제모음_개선본"),
    "gojaengi-common-math-2": Path(r"D:\공수2_고쟁이\문제모음_개선본"),
}
OLYMPUS = Path(r"D:\올림푸스_미적분")
UNIT_SLUGS = {
    "unit-1": "1. 함수의 극한",
    "unit-2": "2. 함수의 연속",
    "unit-3": "3. 미분계수와 도함수",
    "unit-4": "4. 도함수의 활용",
}
TYPE_SLUGS = {"standard": "유형완성하기", "written": "서술형완성하기", "challenge": "고난도도전"}


def upload(url: str, secret: str, bucket: str, source: Path, obj: str) -> None:
    path = urllib.parse.quote(f"{bucket}/{obj}", safe="/")
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{path}", data=source.read_bytes(), method="POST",
        headers={"apikey": secret, "Content-Type": mimetypes.guess_type(source.name)[0] or "application/octet-stream", "x-upsert": "true"},
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"HTTP {response.status}: {obj}")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"업로드 실패 ({error.code}): {obj} {error.read().decode('utf-8', errors='replace')}") from error


def main() -> None:
    env = ROOT / ".env.local"
    for line in env.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    secret = os.environ["SUPABASE_SECRET_KEY"]
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")
    items: list[tuple[Path, str]] = []
    for book, folder in BOOKS.items():
        items.extend((p, f"{book}/{p.name}") for p in sorted(folder.glob("*.png")))
    for unit_slug, unit in UNIT_SLUGS.items():
        for type_slug, problem_type in TYPE_SLUGS.items():
            folder = OLYMPUS / unit / problem_type / "문제모음_인쇄개선본"
            items.extend((p, f"olympus-calculus/{unit_slug}/{type_slug}/{p.name}") for p in sorted(folder.glob("*.png")))
    expected = {"synergy-calculus": 904, "synergy-common-math-2": 990, "olympus-calculus": 348, "gojaengi-common-math-2": 380}
    actual = {book: sum(obj.startswith(book + "/") for _, obj in items) for book in expected}
    if actual != expected:
        raise SystemExit(f"개선본 개수가 예상과 다릅니다: {actual}")
    print(f"verified={len(items)}")
    def one(item: tuple[Path, str]) -> None:
        upload(url, secret, bucket, item[0], item[1])

    with ThreadPoolExecutor(max_workers=16) as pool:
        for index, _ in enumerate(pool.map(one, items), 1):
            if index % 50 == 0 or index == len(items):
                print(f"uploaded={index}/{len(items)}")
                sys.stdout.flush()


if __name__ == "__main__":
    main()
