from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tmp" / "all-textbooks-upload-manifest.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("textbooks", nargs="+")
    args = parser.parse_args()
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    secret = os.environ["SUPABASE_SECRET_KEY"]
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")
    expected_all = json.loads(MANIFEST.read_text(encoding="utf-8"))["files"]
    headers = {"apikey": secret, "Content-Type": "application/json"}

    def list_files(prefix: str) -> dict[str, int]:
        result: dict[str, int] = {}
        body = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode()
        request = urllib.request.Request(
            f"{url}/storage/v1/object/list/{bucket}", data=body, method="POST", headers=headers
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            items = json.loads(response.read())
        for item in items:
            path = f"{prefix}/{item['name']}"
            if item.get("id") is None:
                result.update(list_files(path))
            else:
                result[path] = int((item.get("metadata") or {}).get("size", -1))
        return result

    failed = False
    for textbook in args.textbooks:
        expected = {
            str(item["object"]): int(item["bytes"])
            for item in expected_all
            if str(item["object"]).startswith(textbook + "/")
        }
        actual = list_files(textbook)
        missing = sorted(set(expected) - set(actual))
        unexpected = sorted(set(actual) - set(expected))
        size_mismatch = sorted(path for path in set(expected) & set(actual) if expected[path] != actual[path])
        print(
            f"{textbook}: expected={len(expected)} actual={len(actual)} "
            f"missing={len(missing)} unexpected={len(unexpected)} size_mismatch={len(size_mismatch)}"
        )
        for label, paths in (("missing", missing), ("unexpected", unexpected), ("size_mismatch", size_mismatch)):
            for path in paths[:10]:
                print(f"  {label}: {path}")
        failed = failed or bool(missing or unexpected or size_mismatch)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
