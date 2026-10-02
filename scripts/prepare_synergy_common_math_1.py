from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DEFAULT_SOURCE = Path(r"D:\공퉁수학1_시너지")
TEXTBOOK_ID = "synergy-common-math-1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="마플 시너지 공통수학1 온라인 자료를 검사하고 업로드 매니페스트를 생성합니다."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=Path("tmp/synergy-common-math-1-manifest.json"))
    args = parser.parse_args()

    source = args.source.resolve()
    image_dir = source / "문제모음"
    answer_pdf = source / "마플시너지-공통수학1-빠른정답.pdf"
    answer_json = source / "synergy_common_math_1_answers.json"
    answer_simple_json = source / "synergy_common_math_1_answers_simple.json"

    if not image_dir.is_dir():
        raise SystemExit(f"문제모음 폴더를 찾을 수 없습니다: {image_dir}")

    # 13개 단원 폴더 순회하여 1,883개 PNG 이미지 수집 (0001.png ~ 1883.png)
    images = []
    for png in sorted(image_dir.rglob("*.png"), key=lambda p: int(p.stem) if p.stem.isdigit() else 9999):
        if png.name.startswith("_"):
            continue
        images.append(png)

    print(f"발견된 문제 이미지 수: {len(images)}개")
    if len(images) != 1883:
        print(f"[주의] 예상 문항 수(1883개)와 현재 수집 수({len(images)}개)가 다릅니다.")

    entries = [
        {
            "source": str(path),
            "object": f"{TEXTBOOK_ID}/{path.name}",
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in images
    ]

    # 빠른정답 PDF 추가
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
        "problem_count": len(images),
        "total_bytes": sum(entry["bytes"] for entry in entries),
        "files": entries,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"매니페스트 준비 완료: {len(images)}개 문제 + 빠른정답 1개")
    print(f"목록: {args.output.resolve()}")


if __name__ == "__main__":
    main()
