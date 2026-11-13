"""노션 손풀이 링크 → Supabase solution_links(시너지) + naesin_solution_links(내신, 새 행만) 동기화 (Vercel Python 함수).

- GET: Vercel Cron(하루 1회). Authorization: Bearer <CRON_SECRET> 일 때만 실행
- POST: 관리자 화면의 '손풀이 링크 동기화' 버튼. Supabase 로그인 토큰 + ADMIN_EMAILS 확인
"""
from http.server import BaseHTTPRequestHandler
import hmac
import json
import os
import urllib.error
import urllib.request

from solution_links import sync_all


def admin_email(token: str) -> str | None:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key:
        return None
    request = urllib.request.Request(f"{url}/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            email = (json.loads(response.read()).get("email") or "").lower()
    except urllib.error.HTTPError:
        return None
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
    return email if email and email in admins else None


def summary(report: dict) -> dict:
    return {
        textbook: {"rows": r["notion_rows"], "removed": len(r["removed"]), "problems": r["problems"][:20]}
        for textbook, r in report.items()
    }


def run_all(dry_run: bool = False) -> dict:
    """시너지(solution_links) 다음에 내신(naesin_solution_links)을 따로 돌린다.
    내신은 새 행만 넣고(바뀌는 기존 행·키 겹침·중복은 목록만), 지우지 않는다.
    내신 쪽이 실패해도 시너지 결과는 그대로 돌려준다(내신 칸에 오류만 표시)."""
    payload: dict = {"ok": True, "result": summary(sync_all(dry_run=dry_run))}
    try:
        from naesin_solution_links import auto_sync  # 지연 import: 내신 쪽 문제로 시너지 동기화까지 막히지 않게

        payload["naesin"] = auto_sync(dry_run=dry_run)
    except Exception as error:
        print("[-] naesin solution link sync failed:", type(error).__name__, error)
        payload["naesin"] = {"error": "내신 손풀이 링크 동기화에 실패했습니다."}
    return payload


class handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def run_sync(self) -> None:
        try:
            self.send_json(200, run_all())
        except Exception as error:
            print("[-] solution link sync failed:", type(error).__name__, error)
            self.send_json(502, {"error": "손풀이 링크 동기화에 실패했습니다."})

    def do_GET(self):
        secret = os.environ.get("CRON_SECRET", "")
        auth = self.headers.get("Authorization", "")
        if not secret or not hmac.compare_digest(auth, f"Bearer {secret}"):
            return self.send_json(401, {"error": "권한이 없습니다."})
        self.run_sync()

    def do_POST(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return self.send_json(401, {"error": "로그인이 필요합니다."})
        if not admin_email(auth[7:]):
            return self.send_json(403, {"error": "관리자 권한이 없습니다."})
        self.run_sync()
