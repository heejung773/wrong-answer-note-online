"""시너지 공통수학1·2 확인된 정답표 → R2 textbook-problems 버킷의 {교재}/answers.json.

오답노트(fix)와 테스트지만들기(test)가 같은 R2 파일을 읽는다(2026-11-05 선생님 결정).
읽는 쪽 순서: ① R2 {교재}/answers.json → ② 각 저장소 data json(비상용 사본) → 빠른정답 PDF 파싱.

  python scripts/upload_answers_to_r2.py                      # 미리보기(dry-run): R2 에 접속하지 않음
  python scripts/upload_answers_to_r2.py --apply              # 실제 올리기 + 다시 받아 바이트 비교 (선생님 허락 뒤)
  python scripts/upload_answers_to_r2.py --only synergy-common-math-2 --common-math-2 path\\to\\answers.json

규칙
- 키는 synergy-common-math-1/answers.json, synergy-common-math-2/answers.json 두 개뿐(그 밖의 키는 막는다). 지우기 기능 없음.
- 파일 모양: 평평한 {"1": "...", ...}, 키는 앞에 0 없는 숫자 문자열, 값은 빈칸 아닌 문자열, UTF-8(BOM 없음).
  문항 수가 교재 최소 문항 수보다 적으면 중단. 파일 바이트를 그대로 올린다.
- R2 접속 설정은 .env.local / 환경변수(R2_*)에서 storage_backend 가 읽는다. 값은 출력하지 않는다.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TARGETS = {
    # 교재: (기본 파일, 최소 문항 수 = api/generate.py TEXTBOOKS minimum_answers)
    "synergy-common-math-1": (ROOT / "data" / "synergy_common_math_1_answers_simple.json", 1883),
    "synergy-common-math-2": (ROOT / "data" / "synergy_common_math_2_answers_simple.json", 1895),
}
ALLOWED_KEYS = {f"{textbook}/answers.json" for textbook in TARGETS}
SAMPLE_NUMBERS = ("1422", "113", "286")
CONTENT_TYPE = "application/json; charset=utf-8"


def check_file(textbook: str, path: Path) -> tuple[bytes, dict[str, str]]:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise SystemExit(f"[중단] {path}: UTF-8 BOM 이 있음(BOM 없는 UTF-8 로 저장해 주세요)")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"[중단] {path}: UTF-8 JSON 으로 읽히지 않음 ({type(error).__name__})")
    if not isinstance(data, dict):
        raise SystemExit(f"[중단] {path}: 평평한 딕셔너리가 아님")
    bad_keys = [key for key in data if not re.fullmatch(r"[1-9][0-9]*", str(key))]
    if bad_keys:
        raise SystemExit(f"[중단] {path}: 앞에 0 없는 숫자 키가 아님 {bad_keys[:5]}")
    bad_values = [key for key, value in data.items() if not isinstance(value, str) or not value.strip()]
    if bad_values:
        raise SystemExit(f"[중단] {path}: 값이 빈칸이거나 문자열이 아님 {bad_values[:5]}")
    minimum = TARGETS[textbook][1]
    if len(data) < minimum:
        raise SystemExit(f"[중단] {path}: 문항 {len(data)}개 < 최소 {minimum}개")
    return raw, data


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--common-math-1", type=Path, default=TARGETS["synergy-common-math-1"][0], help="공수1 정답 json")
    parser.add_argument("--common-math-2", type=Path, default=TARGETS["synergy-common-math-2"][0], help="공수2 정답 json")
    parser.add_argument("--only", choices=sorted(TARGETS), help="이 교재 하나만")
    parser.add_argument("--apply", action="store_true", help="실제로 R2 에 올린다(기본은 미리보기)")
    args = parser.parse_args()

    files = {"synergy-common-math-1": args.common_math_1, "synergy-common-math-2": args.common_math_2}
    plan: list[tuple[str, Path, bytes]] = []
    for textbook in sorted(TARGETS):
        if args.only and textbook != args.only:
            continue
        path = files[textbook].resolve()
        raw, data = check_file(textbook, path)
        key = f"{textbook}/answers.json"
        if key not in ALLOWED_KEYS:
            raise SystemExit(f"[중단] 허용되지 않은 키: {key}")
        numbers = sorted(int(k) for k in data)
        samples = ", ".join(f"{n.zfill(4)}={data.get(n, '(없음)')}" for n in SAMPLE_NUMBERS)
        print(f"{key}  <=  {path}")
        print(f"  문항 {len(data)}개 ({numbers[0]}~{numbers[-1]}), {len(raw):,} 바이트, {samples}")
        plan.append((key, path, raw))

    if not args.apply:
        print("\n[미리보기] R2 에 접속하지 않았고 아무것도 올리지 않았습니다. 실제로 올리려면 --apply")
        return

    from storage_backend import r2_client  # .env.local 의 R2_* 를 읽는다(값은 출력하지 않음)

    client = r2_client()
    bucket = os.environ["R2_BUCKET"]
    for key, path, raw in plan:
        if key not in ALLOWED_KEYS:
            raise SystemExit(f"[중단] 허용되지 않은 키: {key}")
        client.put_object(Bucket=bucket, Key=key, Body=raw, ContentType=CONTENT_TYPE)
        response = client.get_object(Bucket=bucket, Key=key)
        with response["Body"] as body:
            again = body.read()
        if again != raw:
            raise SystemExit(f"[실패] {key}: 다시 받은 바이트가 다름 ({len(again):,} vs {len(raw):,})")
        print(f"[올림] {key}: {len(raw):,} 바이트, 다시 받아 바이트 일치")
    print("\n끝. 사이트는 새 인스턴스(또는 새 배포)부터 R2 answers.json 을 읽습니다(메모리 캐시).")


if __name__ == "__main__":
    main()
