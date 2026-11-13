"""트윈 시험목록 → data/naesin_twin_index.json (운영 내신 손풀이 동기화가 D:\\변형문제 대신 읽는 이름·키 목록).

    python scripts/build_naesin_twin_index.py                # 만들기(바뀐 내용 요약 출력)
    python scripts/build_naesin_twin_index.py --check        # 쓰지 않고 지금 파일과 같은지만 확인

- 트윈 시험목록.json·문항목록.json·메타데이터는 읽기만 한다(naesin_solution_links._twin_originals 와 같은 계산).
- 모양: {"version": 1, "source": ..., "exams": {tag: {"title": 시험 제목, "items": {"번호": [트윈 이름, 원본 키]}}}}
- 트윈에 시험이 추가·이름이 바뀌면 다시 만들어 커밋·배포해야 운영 동기화가 새 시험을 알아본다.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding="utf-8")

import naesin_solution_links as nsl  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="트윈 시험목록 → data/naesin_twin_index.json")
    parser.add_argument("--twin-list", default=nsl.DEFAULT_TWIN_LIST)
    parser.add_argument("--out", default=str(nsl.DEFAULT_INDEX))
    parser.add_argument("--check", action="store_true", help="쓰지 않고 지금 파일과 비교만")
    args = parser.parse_args()

    data = nsl.build_twin_index_data(args.twin_list)
    text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    out = Path(args.out)
    old = nsl.load_twin_index(out) if out.is_file() else {}
    new = nsl.index_from_data(data)
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed = sorted(k for k in set(new) & set(old) if new[k][:2] != old[k][:2])
    items = sum(len(e["items"]) for e in data["exams"].values())
    print(f"트윈 시험 {len(data['exams'])}개, 원본 문항 {items}개 ({args.twin_list})")
    print(f"지금 파일 대비: 추가 {len(added)}, 빠짐 {len(removed)}, 이름·키 바뀜 {len(changed)}")
    for label, keys in (("추가", added), ("빠짐", removed), ("바뀜", changed)):
        for tag, no in keys[:20]:
            print(f"  {label}: {tag} {no}번 {old.get((tag, no), ('',))[0]} → {new.get((tag, no), ('',))[0]}")
    if args.check:
        sys.exit(0 if not (added or removed or changed) else 1)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8", newline="\n")
    print(f"썼음: {out}")


if __name__ == "__main__":
    main()
