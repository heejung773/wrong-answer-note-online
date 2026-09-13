from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


DEFAULT_SOURCE = Path(r"D:\중등부교재작업\중2학년2학기\블랙라벨")
TEXTBOOK_ID = "blacklabel-middle-2-2"
ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


BLACKLABEL_CHAPTER_SLUGS = {
    "I. 삼각형의 성질": "ch1",
    "II. 사각형의 성질": "ch2",
    "III. 도형의 닮음": "ch3",
    "IV. 피타고라스 정리": "ch4",
    "V. 확률": "ch5",
}

BLACKLABEL_STAGE_SLUGS = {
    "시험에 꼭 나오는 문제": "must",
    "A등급을 위한 문제": "grade-a",
    "종합 사고력 도전 문제": "challenge",
    "미리보는 학력평가": "mock",
    "대단원평가": "review",
}


def blacklabel_object_path(rel_path: Path) -> str:
    parts = rel_path.parts
    c_slug = BLACKLABEL_CHAPTER_SLUGS.get(parts[0], "ch1")
    sub_slug = "sub" + parts[1].split()[0]
    s_slug = BLACKLABEL_STAGE_SLUGS.get(parts[2], "must")
    return f"{TEXTBOOK_ID}/{c_slug}/{sub_slug}/{s_slug}/{parts[3]}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="중등부 블랙라벨(중2-2) 온라인 자료를 읽기 전용으로 검사하고 업로드 목록을 만듭니다."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=ROOT / "tmp" / f"{TEXTBOOK_ID}-upload-manifest.json")
    args = parser.parse_args()

    source = args.source.resolve()
    image_dir = source / "문제모음"
    if not image_dir.is_dir():
        raise SystemExit(f"문제모음 폴더를 찾을 수 없습니다: {image_dir}")

    images: list[Path] = []
    for root, _, files in os.walk(image_dir):
        for file in files:
            if file.lower().endswith(".png"):
                images.append(Path(root) / file)
    images.sort(key=lambda p: str(p.relative_to(image_dir)))

    if len(images) != 511:
        raise SystemExit(f"예상된 문제 이미지 수(511개)와 다릅니다. 현재: {len(images)}개")

    entries = [
        {
            "source": str(path),
            "object": blacklabel_object_path(path.relative_to(image_dir)),
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
