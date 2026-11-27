"""마플 시너지 확률과 통계: 원본 문항 그림 → 올릴 사본(여백 정리) + R2 업로드 목록(manifest).

원본(읽기만, 고치지 않음): D:\\시너지_확률과통계\\문제모음\\0001.png ~ 1531.png
  (선생님이 선정문제 PDF 5~286쪽 스캔 원본에서 형광펜 층 없이 300 DPI 로 자른 것, 2026-11-27)

  python scripts/prepare_synergy_probability_statistics.py
  → tmp/synergy-probability-statistics/images/0001.png ~ 1531.png   (올릴 사본)
  → tmp/synergy-probability-statistics-upload-manifest.json           (upload_textbook_images_to_r2.py 가 읽음)

사본 만들기(내용 화소는 지우지 않고 바깥 여백만 줄인다):
  1) 꼬리말: 4문항(0125·0226·0572·0575)은 원본 자르기에서 쪽 꼬리말('30 I. 경우의 수',
     'STEP1 내신정복 기출유형 109' 등)이 딸려 들어와 아래 줄을 흰색으로 덮는다(2026-11-27 그림으로 확인한 y).
  2) 여백: 잉크(밝기 <235) 덩어리 중 큰 것(면적 >40)에서 시작해 40px 안에 닿는 작은 덩어리(점선·말줄임표 등)를
     사슬처럼 포함한 상자 + 18px 로 자른다. 어디에도 닿지 않는 먼지 점 때문에 남던 큰 빈칸이 없어진다.
  바뀌지 않는 그림은 원본 바이트 그대로 복사한다.
검사: 번호 1~1531 빠짐·남음 없음, PNG, RGB, 300 DPI.
R2 키: synergy-probability-statistics/<번호 4자리>.png (api/generate.py 가 읽는 경로, 공통수학1 시너지와 같은 형식).
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r"D:\시너지_확률과통계")
TEXTBOOK_ID = "synergy-probability-statistics"
TOTAL = 1531
PAD = 18
# 원본 그림 안 꼬리말 시작 y(px). 이 줄부터 아래를 흰색으로.
FOOTER_CUT_Y = {125: 963, 226: 1039, 572: 886, 575: 882}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def content_box(gray: np.ndarray) -> tuple[int, int, int, int]:
    import cv2

    ink = (gray < 235).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        keep[i] = not (a <= 40 and w <= 12 and h <= 12)
    small = [i for i in range(1, n) if not keep[i]]
    kernel = np.ones((81, 81), np.uint8)
    while True:
        near = cv2.dilate(np.isin(lab, np.nonzero(keep)[0]).astype(np.uint8), kernel)
        added = [i for i in small if not keep[i] and near[st[i][1]:st[i][1] + st[i][3], st[i][0]:st[i][0] + st[i][2]].any()]
        if not added:
            break
        keep[added] = True
    idx = np.nonzero(keep)[0]
    return (int(st[idx, 0].min()), int(st[idx, 1].min()),
            int((st[idx, 0] + st[idx, 2]).max()), int((st[idx, 1] + st[idx, 3]).max()))


def make_copy(src: Path, dst: Path, num: int) -> dict:
    import cv2

    raw = src.read_bytes()
    with Image.open(src) as im:
        dpi = im.info.get("dpi")
        rgb = np.array(im.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    changes = []
    if num in FOOTER_CUT_Y:
        y = FOOTER_CUT_Y[num]
        rgb[y:] = 255
        gray[y:] = 255
        changes.append(f"footer>= {y}")
    H, W = gray.shape
    bx0, by0, bx1, by1 = content_box(gray)
    x0, y0, x1, y1 = max(0, bx0 - PAD), max(0, by0 - PAD), min(W, bx1 + PAD), min(H, by1 + PAD)
    if (H - (y1 - y0)) > 4 or (W - (x1 - x0)) > 4:
        changes.append(f"trim {W}x{H}->{x1 - x0}x{y1 - y0}")
    else:
        x0, y0, x1, y1 = 0, 0, W, H
    if changes:
        Image.fromarray(rgb[y0:y1, x0:x1]).save(dst, format="PNG", dpi=dpi or (300, 300))
    else:
        dst.write_bytes(raw)
    return {"changes": changes, "source_sha256": sha256(raw)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "tmp" / TEXTBOOK_ID / "images")
    parser.add_argument("--output", type=Path, default=ROOT / "tmp" / f"{TEXTBOOK_ID}-upload-manifest.json")
    args = parser.parse_args()

    image_dir = args.source.resolve() / "문제모음"
    files = {p.name: p for p in image_dir.glob("*.png")}
    expected = {f"{n:04d}.png" for n in range(1, TOTAL + 1)}
    missing, extra = sorted(expected - set(files)), sorted(set(files) - expected)
    if missing or extra:
        raise SystemExit(f"[중단] 번호가 맞지 않음: 빠짐 {missing[:20]} 남음 {extra[:20]}")
    args.out_dir.mkdir(parents=True, exist_ok=True)

    entries, problems, changed = [], [], 0
    widths, heights = [], []
    for n in range(1, TOTAL + 1):
        name = f"{n:04d}.png"
        out = args.out_dir / name
        info = make_copy(files[name], out, n)
        changed += bool(info["changes"])
        with Image.open(out) as im:
            im.verify()
        with Image.open(out) as im:
            mode, (w, h), dpi = im.mode, im.size, im.info.get("dpi")
        if mode != "RGB":
            problems.append(f"{name}: mode {mode}")
        if not dpi or round(dpi[0]) != 300:
            problems.append(f"{name}: dpi {dpi}")
        widths.append(w)
        heights.append(h)
        data = out.read_bytes()
        entries.append({
            "source": str(out),
            "original": str(files[name]),
            "original_sha256": info["source_sha256"],
            "changes": info["changes"],
            "object": f"{TEXTBOOK_ID}/{name}",
            "bytes": len(data),
            "sha256": sha256(data),
            "width": w,
            "height": h,
        })
    if problems:
        raise SystemExit("[중단] 형식 이상:\n" + "\n".join(problems[:50]))

    manifest = {
        "textbook": TEXTBOOK_ID,
        "source": str(args.source.resolve()),
        "source_mode": "read-only",
        "file_count": len(entries),
        "problem_count": len(entries),
        "changed_from_original": changed,
        "total_bytes": sum(e["bytes"] for e in entries),
        "width_range": [min(widths), max(widths)],
        "height_range": [min(heights), max(heights)],
        "files": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"문항 그림 {len(entries)}개 (원본에서 여백·꼬리말 정리 {changed}개), {manifest['total_bytes']:,} 바이트")
    print(f"폭 {manifest['width_range']}, 높이 {manifest['height_range']}")
    print(f"R2 키: {TEXTBOOK_ID}/0001.png ~ {TEXTBOOK_ID}/{TOTAL:04d}.png")
    print(f"사본: {args.out_dir}")
    print(f"목록: {args.output}")


if __name__ == "__main__":
    main()
