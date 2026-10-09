"""문항별 손풀이 영상 링크: 노션 DB(작성·관리) → Supabase solution_links 표(PDF 생성 시 조회).

대상 교재는 SOLUTION_SOURCES 에 있는 교재만. 서버 비밀 키·노션 토큰은 환경변수에서만 읽는다.
"""
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

# 교재 id → 노션 '문제별 손풀이 영상' DB id
SOLUTION_SOURCES = {
    "synergy-calculus": "b5b90f91-7e63-42ad-857f-6bc63ac7d619",       # 고2 미적분 시너지 문제별 손풀이 영상
    "synergy-common-math-2": "3eae091f-51e9-8133-b288-e5edffe454f9",  # 고1 공수2 시너지 문제별 손풀이 영상
}
TABLE = "solution_links"
# PDF 에 QR 로 인쇄되는 주소이므로 유튜브 https 주소만 받는다
ALLOWED_LINK = re.compile(r"https://(youtu\.be/[A-Za-z0-9_-]{11}|(www\.|m\.)?youtube\.com/watch\?)\S*")


def load_local_env() -> None:
    """로컬 실행 시 .env.local 의 Supabase·노션 설정을 읽는다 (Vercel 은 서버 환경변수 사용)."""
    if os.environ.get("VERCEL"):
        return
    path = Path(__file__).resolve().parent / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "NOTION_TOKEN"):
            os.environ.setdefault(key, value.strip().strip("\"'"))


def _supabase(method: str, path: str, body=None, prefer: str | None = None):
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


def qr_link(link_url: str, start_seconds: int | None = None) -> str | None:
    """QR 에 넣을 짧은 주소: https://youtu.be/<영상ID>?t=<초> (si 같은 추적값을 빼서 QR 무늬를 단순하게)."""
    if not ALLOWED_LINK.fullmatch(link_url or ""):
        return None
    parts = urllib.parse.urlsplit(link_url)
    query = urllib.parse.parse_qs(parts.query)
    video_id = parts.path.strip("/") if parts.netloc == "youtu.be" else (query.get("v") or [""])[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        return None
    seconds = (query.get("t") or [""])[0].rstrip("s")
    if not seconds.isdigit():
        seconds = str(start_seconds) if start_seconds is not None else ""
    return f"https://youtu.be/{video_id}" + (f"?t={int(seconds)}" if seconds else "")


def fetch_solution_links(textbook: str, numbers: list[int]) -> dict[int, str]:
    """PDF 생성용: 고른 문항 중 손풀이 링크가 있는 번호만 {번호: QR 주소} 로 돌려준다."""
    if textbook not in SOLUTION_SOURCES or not numbers:
        return {}
    wanted = ",".join(str(n) for n in sorted(set(numbers)))
    query = urllib.parse.urlencode({
        "select": "problem_number,link_url,start_seconds",
        "textbook": f"eq.{textbook}",
        "problem_number": f"in.({wanted})",
    })
    links = {}
    for row in _supabase("GET", f"{TABLE}?{query}") or []:
        url = qr_link(row["link_url"], row.get("start_seconds"))
        if url:
            links[int(row["problem_number"])] = url
    return links


def _notion_query_all(database_id: str) -> list[dict]:
    token = os.environ["NOTION_TOKEN"]
    headers = {"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28", "Content-Type": "application/json"}
    pages, cursor = [], None
    while True:
        body = {"page_size": 100, **({"start_cursor": cursor} if cursor else {})}
        request = urllib.request.Request(f"https://api.notion.com/v1/databases/{database_id}/query",
                                         data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    result = json.loads(response.read())
                break
            except urllib.error.HTTPError as error:
                if error.code == 429 and attempt < 3:  # 노션 요청 제한: 잠시 기다렸다 다시
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise
        pages.extend(result["results"])
        if not result.get("has_more"):
            return pages
        cursor = result["next_cursor"]


def _plain(prop: dict | None) -> str:
    if not prop:
        return ""
    kind = prop.get("type")
    if kind in ("title", "rich_text"):
        return "".join(part.get("plain_text", "") for part in prop.get(kind) or []).strip()
    if kind == "url":
        return (prop.get("url") or "").strip()
    if kind == "select":
        return ((prop.get("select") or {}).get("name") or "").strip()
    return ""


def _notion_rows(textbook: str, database_id: str) -> tuple[dict[int, dict], list[str]]:
    rows: dict[int, dict] = {}
    problems: list[str] = []
    for page in _notion_query_all(database_id):
        props = page["properties"]
        title = _plain(props.get("문제 번호"))
        link = _plain(props.get("손풀이링크"))
        if not title.isdigit() or int(title) <= 0:
            problems.append(f"번호 형식 오류: '{title}' ({page['id']})")
            continue
        number = int(title)
        if not ALLOWED_LINK.fullmatch(link):
            problems.append(f"{number}번 링크 없음 또는 유튜브 주소 아님: '{link}'")
            continue
        seconds = (props.get("시작시간(초)") or {}).get("number")
        row = {
            "textbook": textbook,
            "problem_number": number,
            "link_url": link,
            "start_seconds": int(seconds) if seconds is not None else None,
            "video_url": _plain(props.get("원본영상URL")) or None,
            "unit": _plain(props.get("단원")) or None,
            "notion_page_id": page["id"],
            "notion_edited_at": page["last_edited_time"],
        }
        previous = rows.get(number)
        if previous:
            problems.append(f"{number}번 중복 행: 노션에서 더 최근에 고친 행을 사용")
            if previous["notion_edited_at"] >= row["notion_edited_at"]:
                continue
        rows[number] = row
    return rows, problems


def sync_all(dry_run: bool = False) -> dict:
    """노션 전체를 읽어 Supabase 표를 같게 맞춘다 (추가·수정 반영, 노션에서 지운 번호는 표에서도 삭제)."""
    report = {}
    for textbook, database_id in SOLUTION_SOURCES.items():
        rows, problems = _notion_rows(textbook, database_id)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        payload = [{**row, "synced_at": now} for row in rows.values()]
        existing = _supabase("GET", f"{TABLE}?select=problem_number&textbook=eq.{textbook}") or []
        stale = sorted({int(r["problem_number"]) for r in existing} - set(rows))
        if not dry_run:
            for start in range(0, len(payload), 500):
                _supabase("POST", f"{TABLE}?on_conflict=textbook,problem_number", payload[start:start + 500],
                          prefer="resolution=merge-duplicates,return=minimal")
            if stale:
                _supabase("DELETE", f"{TABLE}?textbook=eq.{textbook}&problem_number=in.({','.join(map(str, stale))})",
                          prefer="return=minimal")
        report[textbook] = {"notion_rows": len(rows), "removed": stale, "problems": problems}
    return report
