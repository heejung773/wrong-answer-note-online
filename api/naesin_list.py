"""GET /api/naesin_list : 내신 기출 메뉴(학교 → 학년 → 시험) 시험 목록. 로그인한 사용자만.

api/generate.py 의 GET ?list=naesin 과 같은 결과를 주는 가벼운 함수다.
PDF 라이브러리(reportlab·pypdf·Pillow)를 import 하지 않아 함수가 처음 깰 때 덜 기다린다.
목록은 naesin_source.list_exams() 가 R2 목록 파일 1번 읽기 + 1분 기억으로 만든다.
"""
from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.error
import urllib.request

import naesin_source


def logged_in(token: str) -> bool:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    request = urllib.request.Request(f"{url}/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return bool(json.loads(response.read()).get("id"))
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            return False
        raise


class handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer ") or not logged_in(auth[7:]):
                return self.send_json(401, {"error": "로그인이 필요합니다."})
            self.send_json(200, {"exams": naesin_source.list_exams()})
        except KeyError:
            self.send_json(503, {"error": "서버 연결 설정이 아직 완료되지 않았습니다."})
        except urllib.error.HTTPError:
            self.send_json(502, {"error": "로그인 또는 저장소 접근을 확인해 주세요."})
        except Exception as error:
            self.send_json(500, {"error": f"내신 시험 목록을 읽지 못했습니다: {type(error).__name__}"})
