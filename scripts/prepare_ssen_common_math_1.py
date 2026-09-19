from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DEFAULT_SOURCE = Path(r"D:\공통수학1_쎈")
TEXTBOOK_ID = "ssen-common-math-1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="고등부 쎈 공통수학1 문제 이미지를 검사하고 업로드 매니페스트를 생성합니다."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    image_dir = source / "문제모음"
    if not image_dir.is_dir():
        raise SystemExit(f"문제모음 폴더를 찾을 수 없습니다: {image_dir}")

    # 10개 단원 폴더 순회 및 모든 PNG 수집 (927문항)
    images = []
    for png in sorted(image_dir.rglob("*.png"), key=lambda p: int(p.stem) if p.stem.isdigit() else 9999):
        if png.name.startswith("_"):
            continue
        images.append(png)

    print(f"발견된 문제 이미지 수: {len(images)}개")
    if len(images) != 927:
        print(f"[주의] 예상 문항 수(927개)와 현재 수집 수({len(images)}개)가 다릅니다.")

    entries = [
        {
            "source": str(path),
            "object": f"{TEXTBOOK_ID}/{path.name}",
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in images
    ]

    manifest = {
        "textbook": TEXTBOOK_ID,
        "total_files": len(entries),
        "total_bytes": sum(e["bytes"] for e in entries),
        "files": entries,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"매니페스트 저장 완료: {args.output} (총 {len(entries)}개 문제 이미지)")


if __name__ == "__main__":
    main()
