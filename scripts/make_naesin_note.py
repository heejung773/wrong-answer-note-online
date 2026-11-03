"""내신 기출 오답노트 PDF 를 이 컴퓨터에서 바로 만든다 (로그인·Supabase·R2 연결 없이 로컬 폴더만 읽음).

예)
  python scripts/make_naesin_note.py --list
  python scripts/make_naesin_note.py --exam naesin-donghwa/g1/2025-2final --numbers 3,7,12,19 --student 테스트학생
  python scripts/make_naesin_note.py --exam naesin-donghwa/g1/2025-2final --numbers 3,7,12,19 --variants --student 테스트학생

읽는 폴더는 NAESIN_EXPORT_DIR(없으면 naesin_source.DEFAULT_EXPORT_DIR) 또는 --export-dir.
손풀이 QR 은 Supabase 를 부르지 않는다. 시험해 보려면 --links-json 으로 가짜 링크 파일을 준다:
  {"<원본 문항 키 또는 트윈 이름>": "https://youtu.be/<영상ID>?t=<초>", ...}
  (변형 칸에는 원본 링크가 있어도 QR 을 찍지 않는다 — 운영과 같은 create_naesin_pdf 규칙)
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> None:
    parser = argparse.ArgumentParser(description="내신 기출 오답노트 PDF (로컬)")
    parser.add_argument("--export-dir", help="exam.json 들이 있는 폴더 (NAESIN_EXPORT_DIR 대신)")
    parser.add_argument("--list", action="store_true", help="시험 목록만 보기")
    parser.add_argument("--exam", help="시험 prefix 예: naesin-donghwa/g1/2025-2final")
    parser.add_argument("--numbers", help="시험 안 번호 예: 3,7,12,19 또는 1-5")
    parser.add_argument("--variants", action="store_true", help="변형 같이 넣기")
    parser.add_argument("--student", default="테스트학생")
    parser.add_argument("--no-cover", action="store_true", help="표지 빼기")
    parser.add_argument("--date", help="표지 응시일자 글자 (기본 오늘)")
    parser.add_argument("--out", help="저장할 PDF 경로 (기본 output/naesin/<학생>_<시험>.pdf)")
    parser.add_argument("--pick", action="append", default=[],
                        help="[변형문제] 탭처럼 변형 골라 넣기 '번호:변형순서' 예 --pick 9:1 --pick 10:2,3 (variants 배열 순서)")
    parser.add_argument("--no-originals", action="store_true", help="--pick 때 원본은 빼고 고른 변형만")
    parser.add_argument("--links-json", help="시험용 가짜 손풀이 링크 JSON (키 또는 트윈 이름 → 유튜브 주소)")
    args = parser.parse_args()

    if args.export_dir:
        os.environ["NAESIN_EXPORT_DIR"] = args.export_dir
    os.environ["NAESIN_SOURCE"] = "local"
    import naesin_source
    from api import generate

    if args.list or not args.exam:
        for exam in naesin_source.list_exams():
            variants = sum(p["variants"] for p in exam["problems"])
            print(f"{exam['prefix']}  {exam['school']} {exam['grade']} {exam['exam']}  "
                  f"문항 {len(exam['problems'])} · 변형 {variants}")
        return
    if not args.numbers:
        parser.error("--numbers 가 필요합니다")

    variant_keys = None
    if args.pick:
        # 화면 [변형문제] 탭과 같은 길: 고른 변형 key 목록을 서버 검사(check_variant_keys)에 넘긴다
        by_no = {int(p["no"]): p for p in naesin_source.load_exam(args.exam)["problems"]}
        variant_keys = []
        for pick in args.pick:
            no_text, _, orders = pick.partition(":")
            variants = by_no[int(no_text)].get("variants") or []
            variant_keys += [variants[int(o) - 1]["key"] for o in orders.split(",") if o.strip()]
    exam, items, options = generate.prepare_naesin(
        args.exam, args.numbers, args.variants,
        {"include_cover": not args.no_cover, "date_str": args.date},
        variant_keys, not args.no_originals,
    )
    grade = generate.NAESIN_GRADES.get(str(exam.get("grade", "")), "1학년")
    links: dict[str, str] = {}
    if args.links_json:
        import json

        raw = json.loads(Path(args.links_json).read_text(encoding="utf-8-sig"))
        by_name = {item.name: item.key for item in items if not item.variant}
        for ref, url in raw.items():
            key = by_name.get(ref, ref)
            link = naesin_source.youtube_qr_link(url)
            if naesin_source.is_original_key(key) and link:
                links[key] = link
        print(f"가짜 손풀이 링크 {len(links)}개 (원본 키만): " + ", ".join(sorted(links)))
    pdf = generate.create_naesin_pdf(args.student, grade, items, options, links)
    heading = naesin_source.exam_heading(exam).replace(" ", "_")
    suffix = "_변형" if args.pick else ("_변형포함" if args.variants else "")
    out = Path(args.out) if args.out else ROOT / "output" / "naesin" / f"{args.student}_{heading}{suffix}.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(pdf)
    print(f"{out}  ({len(items)}문항: {', '.join(item.label for item in items)}, {len(pdf):,} bytes)")


if __name__ == "__main__":
    main()
