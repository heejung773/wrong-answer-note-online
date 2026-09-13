from __future__ import annotations

import argparse
import json
import mimetypes
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tmp" / "all-textbooks-upload-manifest.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--textbook",
        choices=(
            "synergy-common-math-2",
            "olympus-calculus",
            "gojaengi-common-math-2",
            "ssen-middle-2-2",
            "blacklabel-middle-2-2",
            "concept-middle-2-2",
        ),
    )
    parser.add_argument("--manifest", type=Path, help="사용할 매니페스트 파일 경로")
    args = parser.parse_args()
    def load_env_local() -> None:
        env_file = ROOT / ".env.local"
        if not env_file.is_file():
            return
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key, val = key.strip(), val.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = val

    load_env_local()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SECRET_KEY", "")
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")
    if not url or not secret:
        raise SystemExit("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY를 로컬 환경에 설정해야 합니다.")
    manifest_path = args.manifest or (
        ROOT / "tmp" / f"{args.textbook}-upload-manifest.json"
        if args.textbook and (ROOT / "tmp" / f"{args.textbook}-upload-manifest.json").is_file()
        else MANIFEST
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest["files"]
    if args.textbook:
        files = [item for item in files if str(item["object"]).startswith(args.textbook + "/")]
    total = len(files)
    for index, item in enumerate(files, 1):
        source = Path(item["source"])
        object_path = urllib.parse.quote(f"{bucket}/{item['object']}", safe="/")
        request = urllib.request.Request(
            f"{url}/storage/v1/object/{object_path}",
            data=source.read_bytes(),
            method="POST",
            headers={
                "apikey": secret,
                "Content-Type": mimetypes.guess_type(source.name)[0] or "application/octet-stream",
                "x-upsert": "true",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status not in (200, 201):
                    raise RuntimeError(f"HTTP {response.status}: {item['object']}")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"업로드 실패 ({error.code}): {item['object']} {detail}") from error
        if index == total or index % 50 == 0:
            print(f"uploaded={index}/{total}")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
