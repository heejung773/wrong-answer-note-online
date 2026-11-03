"""내신 기출(트윈 내보내기) → R2 textbook-problems 버킷의 naesin/ 폴더에만 올린다.

기본은 미리보기(dry-run): R2 의 naesin/ 아래 목록만 읽고, 올라갈 파일 수·용량·시험별 개수·키 예시를 보여 준다.
  python scripts/upload_naesin_to_r2.py                       # 미리보기 (전체 시험)
  python scripts/upload_naesin_to_r2.py --exam naesin-dasan/g1/2025-2final
  python scripts/upload_naesin_to_r2.py --go                  # 실제 업로드 (선생님 허락 뒤)
  python scripts/upload_naesin_to_r2.py --go --overwrite      # 이미 있는 키도 덮어쓰기

규칙
- 키는 naesin_source.r2_key() 로만 만든다: naesin/<prefix>/exam.json, naesin/<prefix>/0001.png, …/0001-v1.png,
  시험 목록 naesin/naesin-exams.json. naesin/ 밖 키는 put 직전에 코드로 막는다. 지우기 기능은 없다.
- 이미 있는 키는 건너뛴다(--overwrite 일 때만 덮어씀). 시험 목록 파일은 R2 에 있던 목록과 이번 시험을 합친 것으로,
  새 시험이 더해질 때만 다시 쓴다(빠지는 시험 없음).
- 원천 폴더의 _ 로 시작하는 폴더(_checks 등)는 보지 않는다. exam.json 에 적힌 그림만 올린다.
- R2 접속 설정은 .env.local / 환경변수(R2_*)에서 storage_backend 가 읽는다. 값은 출력하지 않는다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import naesin_source  # noqa: E402

DEFAULT_SOURCE = r"D:\변형문제\output\naesin_export_site"
CONTENT_TYPES = {".png": "image/png", ".json": "application/json"}


def human(size: int) -> str:
    return f"{size / 1024 / 1024:,.2f} MB" if size >= 1024 * 1024 else f"{size / 1024:,.1f} KB"


def collect(source: Path, only_exam: str | None) -> tuple[list[dict], list[str]]:
    """올릴 파일 목록 [{key, path, size, type, exam}] 과 시험 prefix 목록."""
    files: list[dict] = []
    prefixes: list[str] = []
    for exam_path in sorted(source.glob("*/*/*/exam.json")):
        rel = exam_path.parent.relative_to(source)
        if any(part.startswith("_") for part in rel.parts):
            continue
        prefix = rel.as_posix()
        if not naesin_source.PREFIX_RE.fullmatch(prefix):
            print(f"[건너뜀] prefix 모양이 아님: {prefix}")
            continue
        if only_exam and prefix != only_exam:
            continue
        exam = json.loads(exam_path.read_text(encoding="utf-8-sig"))
        if str(exam.get("prefix", "")).strip("/") != prefix:
            raise SystemExit(f"[중단] exam.json prefix 가 폴더와 다름: {prefix}")
        names: list[str] = []
        for problem in exam.get("problems") or []:
            for entry in [problem, *(problem.get("variants") or [])]:
                key = str(entry.get("key") or "").strip("/")
                if not key.startswith(prefix + "/"):
                    raise SystemExit(f"[중단] 문항 key 가 시험과 다름: {key}")
                image = entry.get("image") or key.rsplit("/", 1)[1] + ".png"
                names.append(image)
        if len(set(names)) != len(names):
            raise SystemExit(f"[중단] 같은 그림 이름이 두 번 나옴: {prefix}")
        unlisted = sorted(p.name for p in exam_path.parent.glob("*.png") if p.name not in set(names))
        if unlisted:
            print(f"[참고] {prefix}: exam.json 에 없는 그림 {len(unlisted)}개는 올리지 않음 (예: {unlisted[:3]})")
        for name in ["exam.json", *names]:
            path = exam_path.parent / name
            if not path.is_file():
                raise SystemExit(f"[중단] 파일 없음: {path}")
            files.append({
                "key": naesin_source.r2_key(prefix, name),
                "path": path,
                "size": path.stat().st_size,
                "type": CONTENT_TYPES[path.suffix.lower()],
                "exam": prefix,
            })
        prefixes.append(prefix)
    if only_exam and not prefixes:
        raise SystemExit(f"[중단] 원천 폴더에 그 시험이 없음: {only_exam}")
    return files, prefixes


def list_remote(client, bucket: str) -> dict[str, int]:
    """R2 의 naesin/ 아래 키 → 크기 (읽기만)."""
    found: dict[str, int] = {}
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": naesin_source.R2_ROOT + "/"}
        if token:
            kwargs["ContinuationToken"] = token
        page = client.list_objects_v2(**kwargs)
        for item in page.get("Contents", []):
            found[item["Key"]] = item["Size"]
        if not page.get("IsTruncated"):
            return found
        token = page["NextContinuationToken"]


def guarded_put(client, bucket: str, key: str, body: bytes, content_type: str) -> None:
    # naesin/ 밖에는 절대 쓰지 않는다 (교재 그림과 섞이지 않게)
    if not key.startswith(naesin_source.R2_ROOT + "/") or ".." in key.split("/"):
        raise SystemExit(f"[중단] naesin/ 밖 키는 쓰지 않음: {key}")
    client.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)


def main() -> None:
    parser = argparse.ArgumentParser(description="내신 기출 → R2 naesin/ 업로드 (기본 미리보기)")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="트윈 내보내기 폴더")
    parser.add_argument("--exam", help="시험 하나만 (prefix, 예 naesin-dasan/g1/2025-2final)")
    parser.add_argument("--go", action="store_true", help="실제로 올린다 (없으면 미리보기)")
    parser.add_argument("--overwrite", action="store_true", help="이미 있는 키도 덮어쓴다")
    args = parser.parse_args()

    source = Path(args.source)
    files, prefixes = collect(source, args.exam.strip("/") if args.exam else None)

    from storage_backend import r2_client

    if "R2_BUCKET" not in os.environ:
        raise SystemExit("[중단] R2 설정(R2_*)이 없습니다 (.env.local 또는 환경변수).")
    bucket = os.environ["R2_BUCKET"]
    client = r2_client()
    remote = list_remote(client, bucket)

    # 시험 목록: R2 에 있던 목록 + 이번 시험 (빠지는 시험 없음)
    index_key = naesin_source.r2_key(None, naesin_source.R2_INDEX_NAME)
    old_exams: list[str] = []
    if index_key in remote:
        old_exams = json.loads(client.get_object(Bucket=bucket, Key=index_key)["Body"].read().decode("utf-8-sig")).get("exams") or []
    merged = sorted(set(old_exams) | set(prefixes))
    index_body = (json.dumps({"exams": merged}, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    index_changed = merged != sorted(old_exams) or index_key not in remote

    to_upload = [f for f in files if args.overwrite or f["key"] not in remote]
    skipped = [f for f in files if f not in to_upload]

    print(f"원천 폴더: {source}")
    print(f"R2 naesin/ 아래 지금 있는 것: {len(remote)}개" + (f", {human(sum(remote.values()))}" if remote else " (비어 있음)"))
    for key in sorted(remote)[:5]:
        print(f"  - {key} ({human(remote[key])})")
    print(f"올릴 시험: {len(prefixes)}개")
    for prefix in prefixes:
        mine = [f for f in files if f["exam"] == prefix]
        pngs = [f for f in mine if f["type"] == "image/png"]
        variants = [f for f in pngs if "-v" in f["key"].rsplit("/", 1)[1]]
        print(f"  - {prefix}: 파일 {len(mine)} (exam.json 1 + 원본 {len(pngs) - len(variants)} + 변형 {len(variants)}), "
              f"{human(sum(f['size'] for f in mine))}")
    total = sum(f["size"] for f in to_upload) + (len(index_body) if index_changed else 0)
    count = len(to_upload) + (1 if index_changed else 0)
    print(f"올라갈 파일: {count}개, {human(total)} (이미 있어 건너뜀 {len(skipped)}개"
          f"{', 덮어쓰기 켜짐' if args.overwrite else ''}; 시험 목록 파일 {'포함' if index_changed else '변경 없음'})")
    examples = [files[0]["key"], next((f["key"] for f in files if f["type"] == "image/png"), ""),
                next((f["key"] for f in files if "-v" in f["key"]), ""), index_key]
    print("키 예시:", *[k for k in examples if k], sep="\n  ")

    if not args.go:
        print("\n미리보기만 했습니다. 실제로 올리려면 --go 를 붙이세요.")
        return

    for done, item in enumerate(to_upload, start=1):
        guarded_put(client, bucket, item["key"], item["path"].read_bytes(), item["type"])
        if done % 50 == 0 or done == len(to_upload):
            print(f"  올림 {done}/{len(to_upload)}")
    if index_changed:
        guarded_put(client, bucket, index_key, index_body, "application/json")
        print(f"  시험 목록 갱신: {len(merged)}개 시험")

    # 다시 읽어 크기·내용 대조 (처음·끝·무작위 몇 개 + 시험 목록)
    sample = to_upload[:1] + to_upload[-1:] + random.sample(to_upload, min(5, len(to_upload)))
    checks = {item["key"]: item["path"].read_bytes() for item in sample}
    if index_changed:
        checks[index_key] = index_body
    bad = 0
    for key, local in checks.items():
        remote_bytes = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        same = len(remote_bytes) == len(local) and hashlib.sha256(remote_bytes).digest() == hashlib.sha256(local).digest()
        bad += not same
        print(f"  대조 {'OK ' if same else '다름'} {key} ({len(local):,} bytes)")
    print("완료" if not bad else f"[주의] 대조가 다른 파일 {bad}개")


if __name__ == "__main__":
    main()
