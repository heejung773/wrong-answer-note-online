from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tmp" / "all-textbooks-upload-manifest.json"


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def entry(path: Path, object_name: str) -> dict[str, object]:
    return {
        "source": str(path),
        "object": object_name,
        "bytes": path.stat().st_size,
        "sha256": checksum(path),
    }


def numbered_images(folder: Path, object_prefix: str) -> list[dict[str, object]]:
    return [entry(path, f"{object_prefix}/{path.name}") for path in sorted(folder.glob("*.png"))]


def main() -> None:
    common = Path(r"D:\시너지_공통수학2")
    olympus = Path(r"D:\올림푸스_미적분")
    gojaengi = Path(r"D:\공수2_고쟁이")

    files = numbered_images(common / "문제모음", "synergy-common-math-2")
    files.append(entry(common / "마플시너지-공통수학2-빠른정답.pdf", "synergy-common-math-2/quick-answer.pdf"))

    units = {
        "1. 함수의 극한": "unit-1",
        "2. 함수의 연속": "unit-2",
        "3. 미분계수와 도함수": "unit-3",
        "4. 도함수의 활용": "unit-4",
    }
    types = {
        "유형완성하기": "standard",
        "서술형완성하기": "written",
        "고난도도전": "challenge",
    }
    for unit, unit_slug in units.items():
        for problem_type, type_slug in types.items():
            files.extend(numbered_images(olympus / unit / problem_type, f"olympus-calculus/{unit_slug}/{type_slug}"))
    files.append(entry(olympus / "EBS 올림포스 유형편 미적분Ⅰ (22개정) - 해설.pdf", "olympus-calculus/answers.pdf"))

    files.extend(numbered_images(gojaengi / "문제이미지모음", "gojaengi-common-math-2"))

    expected_counts = {
        "synergy-common-math-2": 991,
        "olympus-calculus": 349,
        "gojaengi-common-math-2": 380,
    }
    actual_counts = {name: sum(str(item["object"]).startswith(name + "/") for item in files) for name in expected_counts}
    if actual_counts != expected_counts:
        raise SystemExit(f"파일 수가 예상과 다릅니다: {actual_counts}")

    manifest = {
        "source_mode": "read-only",
        "file_count": len(files),
        "total_bytes": sum(int(item["bytes"]) for item in files),
        "counts": actual_counts,
        "files": files,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest={OUTPUT}")
    print(f"files={manifest['file_count']} bytes={manifest['total_bytes']}")
    print("source_mode=read-only")


if __name__ == "__main__":
    main()
