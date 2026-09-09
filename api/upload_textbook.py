from http.server import BaseHTTPRequestHandler
from io import BytesIO
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image


ALLOWED_OBJECT = re.compile(
    r"^(?:"
    r"synergy-common-math-2/(?:\d{4}\.png|quick-answer\.pdf)|"
    r"gojaengi-common-math-2/\d{4}\.png|"
    r"olympus-calculus/(?:answers\.pdf|unit-[1-4]/(?:standard|written|challenge)/\d{4}\.png)"
    r")$"
)


def request_bytes(url: str, headers: dict[str, str]) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def verify_user(supabase_url: str, publishable_key: str, token: str) -> None:
    request_bytes(
        f"{supabase_url}/auth/v1/user",
        {"apikey": publishable_key, "Authorization": f"Bearer {token}"},
    )


class handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
            publishable_key = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
            secret_key = os.environ["SUPABASE_SECRET_KEY"]
            bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return self.send_json(401, {"error": "로그인이 필요합니다."})
            verify_user(supabase_url, publishable_key, auth[7:])

            object_name = urllib.parse.unquote(self.headers.get("X-Object-Path", ""))
            if not ALLOWED_OBJECT.fullmatch(object_name):
                return self.send_json(400, {"error": "허용되지 않은 교재 파일 경로입니다."})
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 4_000_000:
                return self.send_json(400, {"error": "파일 크기를 확인해 주세요."})
            data = self.rfile.read(length)
            if object_name.endswith(".png"):
                Image.open(BytesIO(data)).verify()
                content_type = "image/png"
            else:
                if not data.startswith(b"%PDF"):
                    return self.send_json(400, {"error": "PDF 파일을 확인해 주세요."})
                content_type = "application/pdf"

            storage_path = urllib.parse.quote(f"{bucket}/{object_name}", safe="/")
            request = urllib.request.Request(
                f"{supabase_url}/storage/v1/object/{storage_path}",
                data=data,
                method="POST",
                headers={"apikey": secret_key, "Content-Type": content_type, "x-upsert": "true"},
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status not in (200, 201):
                    raise RuntimeError(f"storage HTTP {response.status}")
            self.send_json(200, {"uploaded": object_name})
        except KeyError:
            self.send_json(503, {"error": "서버 연결 설정을 확인해 주세요."})
        except urllib.error.HTTPError as error:
            self.send_json(401 if error.code in (401, 403) else 502, {"error": "로그인 또는 저장소 접근을 확인해 주세요."})
        except Exception:
            self.send_json(500, {"error": "파일 업로드 중 오류가 발생했습니다."})

    def do_DELETE(self):
        try:
            cleanup_token = os.environ["CLEANUP_TOKEN"]
            if self.headers.get("X-Cleanup-Token", "") != cleanup_token:
                return self.send_json(401, {"error": "삭제 권한이 없습니다."})
            supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
            secret_key = os.environ["SUPABASE_SECRET_KEY"]
            bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")
            targets = (
                "synergy-common-math-2",
                "olympus-calculus",
                "gojaengi-common-math-2",
            )
            headers = {"apikey": secret_key, "Content-Type": "application/json"}

            def list_files(prefix: str) -> list[str]:
                files: list[str] = []
                offset = 0
                while True:
                    body = json.dumps({"prefix": prefix, "limit": 1000, "offset": offset}).encode("utf-8")
                    request = urllib.request.Request(
                        f"{supabase_url}/storage/v1/object/list/{bucket}",
                        data=body,
                        method="POST",
                        headers=headers,
                    )
                    with urllib.request.urlopen(request, timeout=30) as response:
                        items = json.loads(response.read())
                    for item in items:
                        path = f"{prefix}/{item['name']}" if prefix else item["name"]
                        if item.get("id") is None:
                            files.extend(list_files(path))
                        else:
                            files.append(path)
                    if len(items) < 1000:
                        break
                    offset += len(items)
                return files

            deleted = 0
            for target in targets:
                paths = list_files(target)
                for start in range(0, len(paths), 100):
                    body = json.dumps({"prefixes": paths[start:start + 100]}).encode("utf-8")
                    request = urllib.request.Request(
                        f"{supabase_url}/storage/v1/object/{bucket}",
                        data=body,
                        method="DELETE",
                        headers=headers,
                    )
                    with urllib.request.urlopen(request, timeout=30):
                        pass
                deleted += len(paths)
            remaining = {target: len(list_files(target)) for target in targets}
            self.send_json(200, {"deleted": deleted, "remaining": remaining})
        except KeyError:
            self.send_json(503, {"error": "삭제용 서버 설정이 없습니다."})
        except Exception:
            self.send_json(500, {"error": "임시 교재 자료 삭제 중 오류가 발생했습니다."})
