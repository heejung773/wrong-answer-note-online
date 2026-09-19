from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


DEFAULT_SOURCE = Path(r"D:\중등부교재작업\중2학년2학기\베이직쎈")
TEXTBOOK_ID = "basic-ssen-middle-2-2"
ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


BASIC_SSEN_CHAPTER_SLUGS = {
    "I. 도형의 성질": "ch1",
    "II. 도형의 닮음": "ch2",
    "III. 피타고라스 정리": "ch3",
    "IV. 확률": "ch4",
}


def basic_ssen_stage_slug(stage: str) -> str:
    if "기본&핵심유형 1" in stage:
        return "basic1"
    if "기본&핵심유형 2" in stage:
        return "basic2"
    if "기본&핵심유형 3" in stage:
        return "basic3"
    if "학교시험기출" in stage:
        return "school"
    raise ValueError(f"알 수 없는 단계명: {stage}")


def basic_ssen_object_path(rel_path: Path) -> str:
    parts = rel_path.parts
    c_slug = BASIC_SSEN_CHAPTER_SLUGS.get(parts[0], "ch1")
    sub_slug = "sub" + parts[1].split()[0]
    s_slug = basic_ssen_stage_slug(parts[2])
    return f"{TEXTBOOK_ID}/{c_slug}/{sub_slug}/{s_slug}/{parts[3]}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="중등부 베이직쎈(중2-2) 온라인 자료를 읽기 전용으로 검사하고 업로드 목록을 만듭니다."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=ROOT / "tmp" / f"{TEXTBOOK_ID}-upload-manifest.json")
    args = parser.parse_args()

    source = args.source.resolve()
    # Note: As per user instructions, we use 문제모음_인쇄용
    image_dir = source / "문제모음_인쇄용"
    if not image_dir.is_dir():
        raise SystemExit(f"문제모음_인쇄용 폴더를 찾을 수 없습니다: {image_dir}")

    images: list[Path] = []
    for root, _, files in os.walk(image_dir):
        for file in files:
            if file.lower().endswith(".png"):
                images.append(Path(root) / file)
    images.sort(key=lambda p: str(p.relative_to(image_dir)))

    if len(images) != 609:
        raise SystemExit(f"예상된 문제 이미지 수(609개)와 다릅니다. 현재: {len(images)}개")

    entries = [
        {
            "source": str(path),
            "object": basic_ssen_object_path(path.relative_to(image_dir)),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in images
    ]

    manifest = {
        "textbook": TEXTBOOK_ID,
        "source": str(source),
        "source_subfolder": "문제모음_인쇄용",
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
