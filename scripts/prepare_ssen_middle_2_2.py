from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DEFAULT_SOURCE = Path(r"D:\중등부교재작업\중2학년2학기\쎈수학")
TEXTBOOK_ID = "ssen-middle-2-2"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="중등부 쎈수학(중2-2) 온라인 자료를 읽기 전용으로 검사하고 업로드 목록을 만듭니다."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    image_dir = source / "문제모음"
    if not image_dir.is_dir():
        raise SystemExit(f"문제모음 폴더를 찾을 수 없습니다: {image_dir}")

    images = sorted(image_dir.glob("*.png"), key=lambda p: int(p.stem) if p.stem.isdigit() else p.stem)
    if len(images) != 882:
        raise SystemExit(f"예상된 문제 이미지 수(882개)와 다릅니다. 현재: {len(images)}개")

    entries = [
        {
            "source": str(path),
            "object": f"{TEXTBOOK_ID}/{path.name}",
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in images
    ]

    answer_pdf = source / "쎈 수학 중2하 빠른정답.pdf"
    if answer_pdf.is_file():
        entries.append(
            {
                "source": str(answer_pdf),
                "object": f"{TEXTBOOK_ID}/quick-answer.pdf",
                "bytes": answer_pdf.stat().st_size,
                "sha256": sha256(answer_pdf),
            }
        )

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
    print(f"준비 완료: {len(images)}개 문제" + (" + 빠른정답 1개" if answer_pdf.is_file() else ""))
    print(f"원본은 변경하지 않았습니다: {source}")
    print(f"목록: {args.output.resolve()}")


if __name__ == "__main__":
    main()
