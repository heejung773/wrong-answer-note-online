"""내신 기출 오답노트 PDF 를 이 컴퓨터에서 바로 만든다 (로그인·Supabase·R2 연결 없이 로컬 폴더만 읽음).

예)
  python scripts/make_naesin_note.py --list
  python scripts/make_naesin_note.py --exam naesin-donghwa/g1/2025-2final --numbers 3,7,12,19 --student 테스트학생
  python scripts/make_naesin_note.py --exam naesin-donghwa/g1/2025-2final --numbers 3,7,12,19 --variants --student 테스트학생

읽는 폴더는 NAESIN_EXPORT_DIR(없으면 naesin_source.DEFAULT_EXPORT_DIR) 또는 --export-dir.
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

    exam, items, options = generate.prepare_naesin(
        args.exam, args.numbers, args.variants,
        {"include_cover": not args.no_cover, "date_str": args.date},
    )
    grade = generate.NAESIN_GRADES.get(str(exam.get("grade", "")), "1학년")
    pdf = generate.create_naesin_pdf(args.student, grade, items, options)
    heading = naesin_source.exam_heading(exam).replace(" ", "_")
    suffix = "_변형포함" if args.variants else ""
    out = Path(args.out) if args.out else ROOT / "output" / "naesin" / f"{args.student}_{heading}{suffix}.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(pdf)
    print(f"{out}  ({len(items)}문항: {', '.join(item.label for item in items)}, {len(pdf):,} bytes)")


if __name__ == "__main__":
    main()
