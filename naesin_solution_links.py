"""내신 기출 손풀이 링크: 노션 '내신기출 문항별 손풀이' DB(원본) → Supabase naesin_solution_links 표.

시너지 solution_links.py(노션 '문제별 손풀이 영상' → solution_links)와 같은 방식이다.
- 노션은 읽기만 한다(인강 플레이어 board 도 같은 DB 를 읽는다. 칸 이름·구조를 바꾸지 않는다).
- 노션 한 행 → 표 한 행: 노션 (시험ID, 문항번호) = 트윈 (tag, 번호) 로 트윈 원본 문항을 찾는다.
    name = 트윈 '문제 번호'   (대부분 {시험ID}-{문항번호 두 자리}, 예 다산고2_2025_2학기기말-06.
                              6개 시험은 트윈 이름에 꼬리가 있다: 다산고1_2026_1학기기말_공통수학1-09 등 — 표도 이 이름)
    key  = 트윈 원본 문항 키  (예 naesin-dasan/g2/2025-2final/0006, 트윈 시험목록.json 으로 계산)
    url  = naesin_source.youtube_qr_link(손풀이링크)  (https://youtu.be/<ID>?t=<초>)
  트윈 시험목록에 없는 시험ID·문항번호는 넣지 않고 '바꾸기 실패' 로 보고한다.
- 쓰기는 upsert(name 기준)만. 표에만 있는 행은 지우지 않는다(보고만).
- 이미 있는 행의 key·url 이 바뀌면 allow_change=True 일 때만 쓴다(기본은 멈춤).
- 같은 name 이 노션에 여러 행이고 링크가 서로 다르면 그 name 은 쓰지 않는다(보고만).
서버 비밀 키·노션 토큰은 환경변수(로컬은 .env.local)에서만 읽고 출력하지 않는다.
"""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
import re
import time
import urllib.parse

import naesin_source
from solution_links import _notion_query_all, _plain, _supabase, load_local_env  # noqa: F401  (시너지와 같은 노션·Supabase 읽기·토큰 읽기)

NOTION_DATABASE_ID = "dc4f738b-ba3f-4d55-a340-a38449da116a"  # 내신기출 문항별 손풀이 (고1&고2 내신기출영상모음 안)
TABLE = naesin_source.SOLUTION_TABLE
DEFAULT_TWIN_LIST = r"D:\변형문제\data\내신\시험목록.json"
SOURCE_LABEL = "노션 내신기출 문항별 손풀이"
READ_PAGE = 1000  # PostgREST 한 번 읽기 상한(1000행) — 표 전체는 나눠 읽는다
WRITE_CHUNK = 500


# ---------- 트윈 원본 문항 이름 → 키 (scripts/load_naesin_solution_links.py 와 같은 계산) ----------

def twin_prefix(slug: str) -> str:
    """트윈 note_view.prefix_of / export_naesin.prefix_of 와 같은 규칙: donghwa1-2025-2final → naesin-donghwa/g1/2025-2final"""
    m = re.fullmatch(r"([a-z]+)(\d)-(\d{4}-\d(?:mid|final))", slug)
    return f"naesin-{m[1]}/g{m[2]}/{m[3]}" if m else ""


def _twin_originals(list_path: str):
    """트윈 원본 문항마다 (시험 tag, 번호, 이름, 키, 시험 제목). 트윈 시험목록.json + 문항목록.json + 메타데이터, 읽기만.
    이름 = 메타 '문제 번호'(없으면 <tag>-NN), 키 = prefix_of(slug)/NNNN (트윈 화면 qkey 와 같음)."""
    twin_root = Path(list_path).resolve().parents[2]  # D:\변형문제\data\내신\시험목록.json → D:\변형문제
    for ex in json.loads(Path(list_path).read_text(encoding="utf-8")):
        prefix = twin_prefix(ex["slug"])
        base = twin_root / ex["base"]
        if not prefix or not (base / "문항목록.json").is_file():
            continue
        for q in json.loads((base / "문항목록.json").read_text(encoding="utf-8"))["문항"]:
            no = int(q["번호"])
            meta_path = base / "메타데이터" / f"{no:02d}.json"
            meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
            name = str(meta.get("문제 번호") or f"{ex['tag']}-{no:02d}").strip()
            key = f"{prefix}/{no:04d}"
            if naesin_source.is_original_key(key):
                yield str(ex["tag"]), no, name, key, ex.get("title") or ex["tag"]


def twin_original_names(list_path: str = DEFAULT_TWIN_LIST) -> dict[str, tuple[str, int, str]]:
    """트윈 이름 → (원본 키, 시험 안 번호, 시험 제목)."""
    return {name: (key, no, title) for _tag, no, name, key, title in _twin_originals(list_path)}


def twin_exam_index(list_path: str = DEFAULT_TWIN_LIST) -> dict[tuple[str, int], tuple[str, str, str]]:
    """(시험 tag, 번호) → (트윈 이름, 원본 키, 시험 제목). 노션 시험ID 는 트윈 tag 와 같다.
    대부분 이름 = <tag>-NN 이지만 6개 시험은 트윈 메타 '문제 번호' 에 꼬리가 붙어 있다
    (예 다산고1_2026_1학기기말 → 다산고1_2026_1학기기말_공통수학1-09). 표 name 은 트윈 이름을 그대로 쓴다."""
    return {(tag, no): (name, key, title) for tag, no, name, key, title in _twin_originals(list_path)}


# ---------- 노션 → 넣을 행 ----------

def _number(prop: dict | None):
    return (prop or {}).get("number") if (prop or {}).get("type") == "number" else None


def _link_parts(url: str) -> tuple[str, int | None]:
    """https://youtu.be/<ID>?t=<초> → (ID, 초). 모양이 아니면 ('', None)."""
    parts = urllib.parse.urlsplit(url or "")
    seconds = (urllib.parse.parse_qs(parts.query).get("t") or [""])[0]
    return parts.path.strip("/"), (int(seconds) if seconds.isdigit() else None)


def notion_rows(index: dict[tuple[str, int], tuple[str, str, str]]) -> dict:
    """노션 전체를 읽어 표에 넣을 행을 만든다. 실패·중복·주의는 같이 돌려준다(아무것도 쓰지 않음)."""
    exam_tags = {tag for tag, _no in index}
    pages = _notion_query_all(NOTION_DATABASE_ID)
    candidates: dict[str, list[dict]] = {}
    failures: list[dict] = []
    warnings: list[str] = []
    judgements = Counter()
    for page in pages:
        props = page["properties"]
        title = _plain(props.get("문제 번호"))
        exam_id = _plain(props.get("시험ID"))
        number = _number(props.get("문항번호"))
        judgement = _plain(props.get("판정")) or "(빈칸)"
        raw_link = _plain(props.get("손풀이링크"))
        seconds = _number(props.get("시작시간(초)"))
        video_id = _plain(props.get("영상ID"))
        judgements[judgement] += 1
        info = {"title": title, "exam_id": exam_id, "number": number, "judgement": judgement,
                "raw_link": raw_link, "page_id": page["id"], "edited": page["last_edited_time"]}
        if not exam_id or number is None or int(number) != number or number <= 0:
            failures.append({**info, "reason": "시험ID 또는 문항번호 빈칸·형식 오류"})
            continue
        number = int(number)
        info["name"] = f"{exam_id}-{number:02d}"
        if exam_id not in exam_tags:
            failures.append({**info, "reason": "트윈 시험목록에 없는 시험ID"})
            continue
        if (exam_id, number) not in index:
            failures.append({**info, "reason": "트윈 시험목록에 없는 문항번호(원본 문항 아님)"})
            continue
        name, key, heading = index[(exam_id, number)]
        info["name"] = name
        link = naesin_source.youtube_qr_link(raw_link)
        if not link:
            failures.append({**info, "reason": "손풀이링크가 유튜브 https 주소가 아님"})
            continue
        if "?t=" not in link and seconds:
            link = f"{link}?t={int(seconds)}"  # 시너지 qr_link 와 같이 시작시간(초)로 채움
            warnings.append(f"{name}: 링크에 ?t= 없음 → 시작시간(초) {int(seconds)} 로 채움")
        link_id, link_seconds = _link_parts(link)
        if video_id and video_id != link_id:
            warnings.append(f"{name}: 영상ID 칸 {video_id} ≠ 링크 영상 {link_id} (링크 기준)")
        if seconds is not None and link_seconds is not None and int(seconds) != link_seconds:
            warnings.append(f"{name}: 시작시간(초) 칸 {int(seconds)} ≠ 링크 t={link_seconds} (링크 기준)")
        candidates.setdefault(name, []).append({**info, "key": key, "url": link, "heading": heading})

    rows: dict[str, dict] = {}
    duplicates: list[dict] = []
    for name, entries in candidates.items():
        if len(entries) > 1:
            urls = sorted({e["url"] for e in entries})
            duplicates.append({"name": name, "entries": entries, "conflict": len(urls) > 1})
            if len(urls) > 1:
                continue  # 링크가 서로 다른 중복은 쓰지 않는다(노션에서 하나로 정리한 뒤)
        entry = max(entries, key=lambda e: e["edited"])
        rows[name] = entry
    return {"pages": len(pages), "rows": rows, "failures": failures, "duplicates": duplicates,
            "warnings": warnings, "judgements": judgements}


# ---------- Supabase 표 읽기·비교·쓰기 ----------

def read_table() -> list[dict]:
    rows: list[dict] = []
    while True:
        page = _supabase("GET", f"{TABLE}?select=name,key,url,source,updated_at&order=name.asc"
                                f"&limit={READ_PAGE}&offset={len(rows)}") or []
        if not page:
            return rows
        rows.extend(page)


def _start_link(url: str) -> str:
    """비교용: youtube_qr_link 로 정리하고 ?t=0 은 '처음부터'(t 없음)와 같게 본다."""
    link = naesin_source.youtube_qr_link(url) or str(url or "")
    return link[:-len("?t=0")] if link.endswith("?t=0") else link


def compare(rows: dict[str, dict], existing: list[dict]) -> dict:
    """노션 행 vs 표. 링크 비교는 양쪽 모두 youtube_qr_link 로 정리한 값으로 한다(?t=0 = t 없음)."""
    by_name = {r["name"]: r for r in existing}
    by_key = {r["key"]: r["name"] for r in existing}
    same, url_changed, key_changed, new, clashes = [], [], [], [], []
    for name, row in sorted(rows.items()):
        cur = by_name.get(name)
        if cur is None:
            new.append(row)
            if row["key"] in by_key:
                clashes.append({**row, "table_name": by_key[row["key"]]})
            continue
        if cur["key"] != row["key"]:
            key_changed.append({**row, "table_key": cur["key"], "table_url": cur["url"]})
        elif _start_link(cur["url"]) != _start_link(row["url"]):
            url_changed.append({**row, "table_url": cur["url"], "table_source": cur.get("source") or ""})
        else:
            same.append({**row, "table_source": cur.get("source") or ""})
    only_table = [r for r in existing if r["name"] not in rows]
    return {"same": same, "url_changed": url_changed, "key_changed": key_changed, "new": new,
            "clashes": clashes, "only_table": only_table}


def _payload(row: dict, now: str) -> dict:
    return {"name": row["name"], "key": row["key"], "url": row["url"],
            "source": f"{SOURCE_LABEL} · {row['judgement']}", "updated_at": now}


def sync(list_path: str = DEFAULT_TWIN_LIST, go: bool = False, allow_change: bool = False) -> dict:
    """기본은 미리보기(쓰기 없음). go=True 일 때만 새 행 + (allow_change 면) 바뀐 행을 upsert 한다.
    같은 행(링크·키 같음)은 source 칸 차이만 있어도 다시 쓰지 않는다. 표에만 있는 행은 지우지 않는다."""
    index = twin_exam_index(list_path)
    notion = notion_rows(index)
    existing = read_table()
    diff = compare(notion["rows"], existing)
    result = {"twin_names": len(index),"notion": notion, "table_rows": len(existing), "diff": diff,
              "written": 0, "stopped": None}
    if not go:
        return result
    changed = diff["url_changed"] + diff["key_changed"]
    if diff["clashes"]:
        result["stopped"] = f"키 겹침 {len(diff['clashes'])}개(같은 키가 표에 다른 이름으로 있음)"
        return result
    if changed and not allow_change:
        result["stopped"] = f"이미 있는 행의 링크·키가 바뀜 {len(changed)}개 — allow_change 없이는 쓰지 않음"
        return result
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    payload = [_payload(r, now) for r in diff["new"] + changed]
    for start in range(0, len(payload), WRITE_CHUNK):
        _supabase("POST", f"{TABLE}?on_conflict=name", payload[start:start + WRITE_CHUNK],
                  prefer="resolution=merge-duplicates,return=minimal")
    result["written"] = len(payload)
    back = {r["name"]: r for r in read_table()}
    result["verify_mismatch"] = [p["name"] for p in payload
                                 if (back.get(p["name"]) or {}).get("url") != p["url"]
                                 or (back.get(p["name"]) or {}).get("key") != p["key"]]
    return result


