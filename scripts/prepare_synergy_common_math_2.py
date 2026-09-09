from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DEFAULT_SOURCE = Path(r"D:\시너지_공통수학2")
TEXTBOOK_ID = "synergy-common-math-2"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="시너지 공통수학2 온라인 자료를 읽기 전용으로 검사하고 업로드 목록을 만듭니다."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    image_dir = source / "문제모음"
    answer_pdf = source / "마플시너지-공통수학2-빠른정답.pdf"
    images = sorted(image_dir.glob("*.png"))

    expected = [f"{number:04d}.png" for number in range(1, 991)]
    actual = [path.name for path in images]
    missing = sorted(set(expected) - set(actual))
    unexpected = sorted(set(actual) - set(expected))
    if missing or unexpected or not answer_pdf.is_file():
        raise SystemExit(
            f"자료 구성을 확인해 주세요. missing={missing[:10]}, "
            f"unexpected={unexpected[:10]}, quick_answer={answer_pdf.is_file()}"
        )

    entries = [
        {
            "source": str(path),
            "object": f"{TEXTBOOK_ID}/{path.name}",
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in images
    ]
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
    print(f"준비 완료: {len(images)}개 문제 + 빠른정답 1개")
    print(f"원본은 변경하지 않았습니다: {source}")
    print(f"목록: {args.output.resolve()}")


if __name__ == "__main__":
    main()
