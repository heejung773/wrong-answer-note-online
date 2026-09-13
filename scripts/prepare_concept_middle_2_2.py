from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


DEFAULT_SOURCE = Path(r"D:\중등부교재작업\중2학년2학기\개념유형파워(유형편)")
TEXTBOOK_ID = "concept-middle-2-2"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="중등부 개념유형파워(중2-2) 온라인 자료를 읽기 전용으로 검사하고 업로드 목록을 만듭니다."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    image_dir = source / "문제모음"
    if not image_dir.is_dir():
        raise SystemExit(f"문제모음 폴더를 찾을 수 없습니다: {image_dir}")

    images: list[Path] = []
    for root, dirs, files in os.walk(image_dir):
        # Exclude non-problem directories like preview_pages
        dirs[:] = [d for d in dirs if not d.startswith(("_", ".")) and d != "preview_pages"]
        for file in files:
            if file.lower().endswith(".png"):
                images.append(Path(root) / file)
    images.sort(key=lambda p: str(p.relative_to(image_dir)))

    if len(images) != 750:
        raise SystemExit(f"예상된 문제 이미지 수(750개)와 다릅니다. 현재: {len(images)}개")

    entries = [
        {
            "source": str(path),
            "object": f"{TEXTBOOK_ID}/{path.relative_to(image_dir).as_posix()}",
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in images
    ]

    manifest = {
        "textbook": TEXTBOOK_ID,
        "source": str(source),
        "source_mode": "read-only",
        "file_count": len(entries),
        "total_bytes": sum(entry["bytes"] for entry in entries),
        "files": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"준비 완료: {len(images)}개 문제")
    print(f"원본은 변경하지 않았습니다: {source}")
    print(f"목록: {args.output.resolve()}")


if __name__ == "__main__":
    main()
