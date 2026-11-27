"""교재 문항 그림 manifest → R2 textbook-problems 버킷 (오답노트·테스트지만들기가 같이 읽음).

  python scripts/upload_textbook_images_to_r2.py --manifest tmp/synergy-probability-statistics-upload-manifest.json
      미리보기(기본): R2 에 접속하지 않고 올릴 목록·개수·바이트만 보여 준다.
  ... --check-remote
      읽기만: R2 에 같은 접두사(교재 폴더)의 객체가 이미 있는지 목록을 센다(쓰기 없음).
  ... --apply
      실제 올리기(선생님 허락 뒤). 올린 뒤 하나씩 다시 받아 SHA256 을 비교한다.

규칙
- manifest 의 모든 객체 키는 하나의 교재 폴더('<교재id>/') 아래 '<번호 4자리>.png' 모양이어야 한다(그 밖은 중단).
- 이미 R2 에 있는 키는 덮어쓰지 않는다(--overwrite 를 줄 때만). 지우기 기능 없음.
- 올리기 전에 원본 파일 SHA256 을 manifest 와 다시 비교한다(그새 바뀌었으면 중단).
- R2 접속 설정은 .env.local / 환경변수(R2_*)에서 storage_backend 가 읽는다. 값은 출력하지 않는다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--check-remote", action="store_true", help="R2 에 이미 있는 객체 수만 읽어 본다(쓰기 없음)")
    parser.add_argument("--apply", action="store_true", help="실제로 R2 에 올린다(기본은 미리보기)")
    parser.add_argument("--overwrite", action="store_true", help="이미 있는 키도 덮어쓴다")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    files = manifest["files"]
    prefixes = {item["object"].split("/", 1)[0] for item in files}
    if len(prefixes) != 1:
        raise SystemExit(f"[중단] 교재 폴더가 하나가 아님: {sorted(prefixes)}")
    prefix = prefixes.pop()
    bad = [item["object"] for item in files if not re.fullmatch(re.escape(prefix) + r"/\d{4}\.png", item["object"])]
    if bad:
        raise SystemExit(f"[중단] 허용되지 않는 키: {bad[:5]}")
    keys = [item["object"] for item in files]
    if len(set(keys)) != len(keys):
        raise SystemExit("[중단] 같은 키가 두 번 있음")
    total = sum(int(item["bytes"]) for item in files)
    print(f"교재 폴더: {prefix}/  객체 {len(files)}개, {total:,} 바이트")
    print(f"  처음 {keys[0]}  마지막 {keys[-1]}")

    if not (args.check_remote or args.apply):
        print("\n[미리보기] R2 에 접속하지 않았고 아무것도 올리지 않았습니다. 확인: --check-remote, 올리기: --apply")
        return

    from storage_backend import r2_client  # .env.local 의 R2_* 를 읽는다(값은 출력하지 않음)

    client = r2_client()
    bucket = os.environ["R2_BUCKET"]
    existing: set[str] = set()
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix + "/"}
        if token:
            kwargs["ContinuationToken"] = token
        page = client.list_objects_v2(**kwargs)
        existing.update(obj["Key"] for obj in page.get("Contents", []))
        if not page.get("IsTruncated"):
            break
        token = page.get("NextContinuationToken")
    clash = sorted(set(keys) & existing)
    print(f"R2 '{prefix}/' 에 지금 있는 객체 {len(existing)}개, 그중 이번 목록과 같은 키 {len(clash)}개")
    if not args.apply:
        print("[읽기만] 쓰기 없음.")
        return
    if clash and not args.overwrite:
        raise SystemExit(f"[중단] 이미 있는 키 {len(clash)}개(예: {clash[:3]}). 덮어쓰려면 --overwrite")

    def upload(item: dict) -> str:
        data = Path(item["source"]).read_bytes()
        if sha256_bytes(data) != item["sha256"]:
            raise RuntimeError(f"원본이 manifest 와 다름: {item['source']}")
        client.put_object(Bucket=bucket, Key=item["object"], Body=data, ContentType="image/png")
        response = client.get_object(Bucket=bucket, Key=item["object"])
        with response["Body"] as body:
            again = body.read()
        if sha256_bytes(again) != item["sha256"]:
            raise RuntimeError(f"다시 받은 바이트가 다름: {item['object']}")
        return item["object"]

    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for _ in pool.map(upload, files):
            done += 1
            if done % 100 == 0 or done == len(files):
                print(f"올림·확인 {done}/{len(files)}")
    print(f"\n끝. {len(files)}개 올리고 다시 받아 SHA256 일치.")


if __name__ == "__main__":
    main()
