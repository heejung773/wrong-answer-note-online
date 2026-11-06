"""내신 손풀이 링크 CSV → Supabase naesin_solution_links 표 (기본은 미리보기, --go 때만 넣는다).

  미리보기: python scripts/load_naesin_solution_links.py
  넣기:     python scripts/load_naesin_solution_links.py --go

- CSV(UTF-8 BOM)에서 '상태' 가 정확히 '있음' 인 행만 쓴다. '후보(검증 필요)' 는 화면 확인 전이라 넣지 않는다.
- 트윈 '문제 번호'(name) → 오답노트 문항 키(key)는 내신 자료 폴더의 exam.json 으로 찾는다(원본 문항만).
- 링크는 유튜브 https 주소만, QR 과 같은 짧은 모양(https://youtu.be/<ID>?t=<초>)으로 정리해서 넣는다.
- upsert(name 기준)만 한다. 표의 다른 행을 지우지 않는다.
- Supabase 주소·비밀 키는 .env.local(로컬) 에서만 읽고 출력하지 않는다.
표 만들기: supabase/naesin_solution_links.sql (Supabase SQL Editor 에서 먼저 실행).
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import naesin_source  # noqa: E402

DEFAULT_CSV = r"D:\비서\메타정리\제미니_손풀이링크\손풀이링크_짝.csv"
DEFAULT_EXPORT_DIR = r"D:\변형문제\output\naesin_export_site"
TABLE = naesin_source.SOLUTION_TABLE
STATUS_OK = "있음"


def load_env() -> None:
    """로컬 .env.local 에서 Supabase 주소·비밀 키만 읽는다(값은 출력하지 않음)."""
    path = ROOT / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"):
            os.environ.setdefault(key, value.strip().strip("\"'"))


def supabase(method: str, path: str, body=None, prefer: str | None = None):
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SECRET_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(f"{url}/rest/v1/{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
    return json.loads(raw) if raw else None


def original_names(export_dir: str) -> dict[str, tuple[str, int, str]]:
    """트윈 이름 → (원본 키, 시험 안 번호, 시험 머리말). 변형 이름은 넣지 않는다."""
    os.environ["NAESIN_SOURCE"] = "local"
    os.environ["NAESIN_EXPORT_DIR"] = export_dir
    names: dict[str, tuple[str, int, str]] = {}
    for prefix in naesin_source._list_prefixes():
        exam = naesin_source.load_exam(prefix)
        heading = naesin_source.exam_heading(exam)
        for problem in exam["problems"]:
            name = str(problem.get("name") or "").strip()
            key = str(problem.get("key") or "").strip("/")
            if name and naesin_source.is_original_key(key):
                names[name] = (key, int(problem["no"]), heading)
    return names


def build_rows(csv_path: str, names: dict[str, tuple[str, int, str]]) -> tuple[list[dict], list[str], list[str], Counter]:
    """CSV → 넣을 행, 문제(넣지 않음), 주의(넣지만 확인 권함), 상태 개수."""
    with open(csv_path, encoding="utf-8-sig", newline="") as handle:
        records = list(csv.DictReader(handle))
    statuses = Counter(r.get("상태", "") for r in records)
    rows: list[dict] = []
    errors: list[str] = []
    warnings: list[str] = []
    seen_names: set[str] = set()
    seen_keys: dict[str, str] = {}
    by_link: dict[str, list[str]] = {}
    for line_no, record in enumerate(records, start=2):  # 1행은 머리글
        status = record.get("상태", "")
        if status != STATUS_OK:
            if status.strip() == STATUS_OK:
                errors.append(f"{line_no}행 {record.get('문제 번호')}: 상태 '{status}' 앞뒤 공백 — 정확히 '있음' 이 아니라 뺌")
            continue
        name = str(record.get("문제 번호") or "").strip()
        raw_link = str(record.get("링크") or "").strip()
        label = f"{line_no}행 {name}"
        if name not in names:
            errors.append(f"{label}: 내신 자료(exam.json)에 없는 원본 문항 이름")
            continue
        key, no, heading = names[name]
        if str(record.get("문항번호") or "").strip() != str(no):
            errors.append(f"{label}: CSV 문항번호 {record.get('문항번호')} ≠ 자료 번호 {no}")
            continue
        link = naesin_source.youtube_qr_link(raw_link)
        if not link:
            errors.append(f"{label}: 유튜브 https 주소가 아님 '{raw_link}'")
            continue
        if name in seen_names:
            errors.append(f"{label}: 같은 문제 번호가 두 번 나옴(앞 행 사용)")
            continue
        if key in seen_keys:
            errors.append(f"{label}: 같은 문항 키({key})가 {seen_keys[key]} 와 겹침")
            continue
        if "?t=" not in link:
            warnings.append(f"{label}: ?t=초 없음 → 영상 처음부터 ({link})")
        if link != raw_link:
            warnings.append(f"{label}: 주소 모양 정리 '{raw_link}' → '{link}'")
        seen_names.add(name)
        seen_keys[key] = name
        by_link.setdefault(link, []).append(name)
        source_parts = [p for p in (record.get("출처"), record.get("메모")) if p and p.strip()]
        rows.append({
            "name": name,
            "key": key,
            "url": link,
            "source": Path(csv_path).name + (" · " + " · ".join(p.strip() for p in source_parts) if source_parts else ""),
            "_heading": heading,
            "_no": no,
        })
    for link, owners in by_link.items():
        if len(owners) > 1:
            warnings.append(f"같은 링크를 여러 문항이 씀: {link} ← {', '.join(owners)}")
    return rows, errors, warnings, statuses


def main() -> None:
    parser = argparse.ArgumentParser(description="내신 손풀이 링크 → Supabase (기본 미리보기)")
    parser.add_argument("--csv", default=DEFAULT_CSV)
    parser.add_argument("--export-dir", default=DEFAULT_EXPORT_DIR, help="exam.json 들이 있는 내신 자료 폴더")
    parser.add_argument("--go", action="store_true", help="실제로 Supabase 표에 넣기(upsert)")
    parser.add_argument("--offline", action="store_true", help="미리보기에서 Supabase 표 읽기도 하지 않음")
    args = parser.parse_args()

    names = original_names(args.export_dir)
    rows, errors, warnings, statuses = build_rows(args.csv, names)

    print(f"CSV: {args.csv}")
    print("상태별 행 수: " + ", ".join(f"{k or '(빈칸)'} {v}" for k, v in statuses.most_common()))
    print(f"내신 자료 원본 문항 이름 {len(names)}개 ({args.export_dir})")
    print(f"\n넣을 행: {len(rows)}개 (상태 '{STATUS_OK}' {statuses.get(STATUS_OK, 0)}행 중)")
    by_exam = Counter(r["_heading"] for r in rows)
    for heading, count in sorted(by_exam.items()):
        print(f"  {heading}: {count}개")
    for row in rows:
        print(f"  {row['name']:<28} {row['key']:<36} {row['url']}")
    print(f"\n넣지 않는 행(문제): {len(errors)}개")
    for line in errors:
        print("  - " + line)
    print(f"주의(넣지만 확인 권함): {len(warnings)}개")
    for line in warnings:
        print("  - " + line)

    payload = [{k: v for k, v in row.items() if not k.startswith("_")} for row in rows]
    if not args.go:
        if not args.offline:
            load_env()
            if os.environ.get("NEXT_PUBLIC_SUPABASE_URL") and os.environ.get("SUPABASE_SECRET_KEY"):
                try:
                    existing = supabase("GET", f"{TABLE}?select=name,key,url") or []
                    current = {r["name"]: r for r in existing}
                    new = sum(1 for r in payload if r["name"] not in current)
                    changed = sum(1 for r in payload if r["name"] in current
                                  and (current[r["name"]]["key"], current[r["name"]]["url"]) != (r["key"], r["url"]))
                    print(f"\nSupabase 표 '{TABLE}': 지금 {len(existing)}행 → 새로 {new}, 바뀜 {changed}, 그대로 {len(payload) - new - changed}")
                except urllib.error.HTTPError as error:
                    print(f"\nSupabase 표 '{TABLE}' 읽기 실패 (HTTP {error.code}) — 표가 아직 없으면 SQL 먼저 실행")
                except Exception as error:
                    print(f"\nSupabase 표 '{TABLE}' 읽기 실패 ({type(error).__name__})")
            else:
                print("\n.env.local 에 Supabase 설정이 없어 표 상태는 확인하지 않음")
        print("\n미리보기만 했습니다. 실제로 넣으려면 --go")
        return

    if not payload:
        print("넣을 행이 없습니다.")
        return
    load_env()
    if not (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") and os.environ.get("SUPABASE_SECRET_KEY")):
        sys.exit(".env.local 에 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SECRET_KEY 가 필요합니다.")
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for row in payload:
        row["updated_at"] = now
    try:
        supabase("POST", f"{TABLE}?on_conflict=name", payload, prefer="resolution=merge-duplicates,return=minimal")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        sys.exit(f"넣기 실패 (HTTP {error.code}): {detail}")
    # 다시 읽어 대조
    wanted = ",".join('"' + r["name"] + '"' for r in payload)
    back = supabase("GET", f"{TABLE}?" + urllib.parse.urlencode({"select": "name,key,url", "name": f"in.({wanted})"})) or []
    stored = {r["name"]: (r["key"], r["url"]) for r in back}
    mismatch = [r["name"] for r in payload if stored.get(r["name"]) != (r["key"], r["url"])]
    print(f"\n넣음: {len(payload)}행 (upsert). 다시 읽어 대조: 일치 {len(payload) - len(mismatch)}, 다름 {len(mismatch)}")
    for name in mismatch:
        print("  - 다름: " + name)


if __name__ == "__main__":
    main()
