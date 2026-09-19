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
            "basic-ssen-middle-2-2",
            "ssen-middle-3-1",
            "blacklabel-middle-3-1",
            "concept-middle-3-1",
            "ssen-common-math-1",
        ),
    )
    parser.add_argument("--manifest", type=Path, help="사용할 매니페스트 파일 경로")
    parser.add_argument("--source-dir", type=Path, help="번호형 PNG가 있는 별도 폴더")
    parser.add_argument("--object-prefix", help="별도 폴더 파일의 Storage 경로 접두사")
    parser.add_argument("--start", type=int, help="별도 폴더 업로드 시작 번호")
    parser.add_argument("--end", type=int, help="별도 폴더 업로드 끝 번호")
    parser.add_argument("--olympus-units", nargs="+", type=int, help="올림푸스 단원 번호들")
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
    if args.olympus_units:
        type_map = {"유형완성하기": "standard", "서술형완성하기": "written", "고난도도전": "challenge"}
        files = []
        source_root = Path(r"D:\올림푸스_미적분")
        for unit in args.olympus_units:
            unit_dirs = list(source_root.glob(f"{unit}. *"))
            if len(unit_dirs) != 1:
                raise SystemExit(f"올림푸스 단원 폴더를 하나로 확인할 수 없습니다: {unit}")
            for korean_type, slug in type_map.items():
                folder = unit_dirs[0] / korean_type
                for source in sorted(folder.glob("*.png")):
                    files.append({"source": str(source), "object": f"olympus-calculus/unit-{unit}/{slug}/{source.name}"})
    elif args.source_dir:
        if not args.object_prefix or args.start is None or args.end is None:
            raise SystemExit("--source-dir 사용 시 --object-prefix, --start, --end가 모두 필요합니다.")
        if args.start > args.end:
            raise SystemExit("--start는 --end보다 클 수 없습니다.")
        files = []
        for number in range(args.start, args.end + 1):
            source = args.source_dir / f"{number:04d}.png"
            if not source.is_file():
                raise SystemExit(f"누락된 파일: {source}")
            files.append({"source": str(source), "object": f"{args.object_prefix}/{number:04d}.png"})
    else:
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
