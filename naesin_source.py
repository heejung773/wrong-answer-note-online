"""내신 기출 문항 읽기 (2026-11-03 시범: 동화고1 2025 2학기 기말).

내신 문항은 교재처럼 정수 번호가 아니라 '문항 이름 키'로 다룬다.
  원본: naesin-donghwa/g1/2025-2final/0001
  변형: naesin-donghwa/g1/2025-2final/0001-v1
시험 하나 = 키 앞부분(prefix) 폴더 하나 = exam.json 하나 + 문항 그림(<키 끝>.png).
키 ↔ 트윈 이름(exam.json name, 예 동화고1_2025_2학기기말-01)은 NaesinItem 에 함께 담는다(나중 Supabase 표의 name 칸).
그림은 트윈이 뽑은 사본이므로 여기서는 읽기만 하고 고치거나 다시 저장하지 않는다.

저장 위치를 바꾸기 쉽도록 내신 자료는 모두 이 파일 한 곳에서만 읽는다.
  NAESIN_SOURCE      = local | r2 (없으면 Vercel 위=r2, 로컬=local)
  NAESIN_EXPORT_DIR  = local 일 때 읽을 폴더 (기본 D:\\변형문제\\output\\naesin_export)
  r2 일 때는 기존 textbook-problems 버킷 안 맨 위 R2_ROOT(naesin/) 폴더에서만 읽는다(교재 그림과 섞지 않음):
    naesin/<prefix>/exam.json, naesin/<prefix>/0001.png, naesin/<prefix>/0001-v1.png
    시험 목록 naesin/naesin-exams.json ({"exams": ["<prefix>", ...]})
  exam.json 의 prefix·문항 key 에는 naesin/ 을 붙이지 않는다(R2 읽을 때만 r2_key() 가 붙인다).
손풀이 링크는 Supabase 표 naesin_solution_links(name 기본키 = 트윈 문제 번호, key = 원본 문항 키, url)에서
solution_links_for() 가 서버 비밀 키로 읽는다. 원본 문항만 링크가 있고 변형은 QR 을 넣지 않는다.
표가 아직 없거나 서버 설정이 없거나 읽기에 실패하면 빈 값 → PDF 는 QR 없이 그대로 만든다.
테스트지만들기에서도 그대로 옮겨 쓸 수 있게 오답노트 코드(api/generate.py)에 기대지 않는다.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request

DEFAULT_EXPORT_DIR = r"D:\변형문제\output\naesin_export"
R2_ROOT = "naesin"  # R2 버킷 안 내신 전용 맨 앞 폴더 (이 상수 한 곳에서만 정한다)
R2_INDEX_NAME = "naesin-exams.json"

PREFIX_RE = re.compile(r"naesin-[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9-]+/[a-z0-9-]+")
IMAGE_RE = re.compile(r"[A-Za-z0-9_-]+\.png")
# 원본 문항 키(…/0009). 변형 키(…/0009-v1)는 여기 맞지 않아 손풀이 링크를 묻지 않는다.
ORIGINAL_KEY_RE = re.compile(PREFIX_RE.pattern + r"/\d{4}")
SOLUTION_TABLE = "naesin_solution_links"
_YOUTUBE_ID_RE = re.compile(r"[A-Za-z0-9_-]{11}")
MAX_ITEMS = 100


def source_kind() -> str:
    # NAESIN_SOURCE 를 적으면 그 값이 이긴다. 없으면 Vercel 위(VERCEL 환경변수)는 r2, 로컬은 local.
    default = "r2" if os.environ.get("VERCEL") else "local"
    kind = (os.environ.get("NAESIN_SOURCE") or default).strip().lower()
    if kind not in {"local", "r2"}:
        raise ValueError("NAESIN_SOURCE must be local or r2")
    return kind


def export_dir() -> Path:
    return Path(os.environ.get("NAESIN_EXPORT_DIR") or DEFAULT_EXPORT_DIR)


def _check_prefix(prefix: str) -> str:
    prefix = str(prefix or "").strip().strip("/")
    if not PREFIX_RE.fullmatch(prefix):
        raise ValueError("내신 시험 이름을 확인해 주세요.")
    return prefix


def r2_key(prefix: str | None, name: str) -> str:
    """R2 객체 키: naesin/<prefix>/<name> (prefix 가 None 이면 naesin/<name>, 시험 목록용).
    업로드 스크립트도 이 함수만 써서 키를 만든다."""
    if prefix is None:
        if name != R2_INDEX_NAME:
            raise ValueError("R2 내신 맨 위에는 시험 목록 파일만 둔다.")
        return f"{R2_ROOT}/{name}"
    prefix = _check_prefix(prefix)
    if name != "exam.json" and not IMAGE_RE.fullmatch(name):
        raise ValueError("내신 문항 그림 이름을 확인해 주세요.")
    return f"{R2_ROOT}/{prefix}/{name}"


def _read_object(prefix: str, name: str) -> bytes:
    """<prefix>/<name> 한 개를 읽는다. 저장 위치(local/r2) 분기는 여기 한 곳뿐이다."""
    prefix = _check_prefix(prefix)
    if name != "exam.json" and not IMAGE_RE.fullmatch(name):
        raise ValueError("내신 문항 그림 이름을 확인해 주세요.")
    if source_kind() == "r2":
        from storage_backend import fetch_r2_object  # 지연 import: 로컬 모드는 boto3 없이도 동작

        return fetch_r2_object(r2_key(prefix, name))
    base = export_dir().resolve()
    path = (base / prefix / name).resolve()
    if base not in path.parents:
        raise ValueError("내신 자료 경로를 확인해 주세요.")
    if not path.is_file():
        raise FileNotFoundError(f"{prefix}/{name}")
    return path.read_bytes()


def _list_prefixes() -> list[str]:
    if source_kind() == "r2":
        from storage_backend import fetch_r2_object

        index = json.loads(fetch_r2_object(r2_key(None, R2_INDEX_NAME)).decode("utf-8-sig"))
        return [p for p in (index.get("exams") or []) if PREFIX_RE.fullmatch(str(p))]
    base = export_dir()
    if not base.is_dir():
        return []
    found = []
    # <export>/<school>/<grade>/<exam>/exam.json 만 시험으로 본다
    for path in sorted(base.glob("*/*/*/exam.json")):
        prefix = path.parent.relative_to(base).as_posix()
        if PREFIX_RE.fullmatch(prefix):
            found.append(prefix)
    return found


def load_exam(prefix: str) -> dict:
    prefix = _check_prefix(prefix)
    try:
        exam = json.loads(_read_object(prefix, "exam.json").decode("utf-8-sig"))
    except FileNotFoundError as error:
        raise ValueError("내신 시험 자료가 없습니다.") from error
    if str(exam.get("prefix", "")).strip("/") != prefix:
        raise ValueError(f"exam.json 의 prefix 가 폴더 위치와 다릅니다: {prefix}")
    problems = exam.get("problems")
    if not isinstance(problems, list) or not problems:
        raise ValueError(f"exam.json 에 문항이 없습니다: {prefix}")
    return exam


def exam_summary(exam: dict) -> dict:
    """화면 메뉴(학교 → 학년 → 시험)와 번호 고르기에 필요한 것만."""
    problems = []
    for item in exam["problems"]:
        problems.append({
            "key": str(item.get("key") or ""),
            "name": str(item.get("name") or ""),
            "no": int(item["no"]),
            "position": item.get("position") or f"{int(item['no'])}번",
            "score": item.get("score"),
            "format": item.get("format") or "",
            "difficulty": item.get("difficulty") or "",
            "unit": item.get("unit") or "",
            "type": item.get("type") or "",
            "variants": len(item.get("variants") or []),
            # 변형 고르기 화면용: variants 배열 순서 그대로(화면·PDF 의 '변형1·2·3' 번호가 이 순서로 고정)
            "variantList": [
                {"key": str(v.get("key") or ""), "difficulty": v.get("difficulty") or ""}
                for v in (item.get("variants") or [])
            ],
        })
    problems.sort(key=lambda p: p["no"])
    return {
        "prefix": exam["prefix"].strip("/"),
        "school": exam.get("school") or "",
        "grade": exam.get("grade") or "",
        "exam": exam.get("exam") or "",
        "subject": exam.get("subject") or "",
        "year": exam.get("year"),
        "title": exam.get("title") or "",
        "problems": problems,
    }


def list_exams() -> list[dict]:
    """시험 목록. 폴더(또는 r2 목록)에 exam.json 을 하나 더 넣으면 메뉴에 바로 나온다."""
    result = []
    for prefix in _list_prefixes():
        try:
            result.append(exam_summary(load_exam(prefix)))
        except Exception as error:  # 한 시험 자료가 깨져도 나머지 메뉴는 보여 준다
            print("[-] naesin exam skipped:", prefix, type(error).__name__, error)
    result.sort(key=lambda e: (e["school"], e["grade"], -(e["year"] or 0), e["exam"]))
    return result


def exam_heading(exam: dict) -> str:
    """머리말·표지용 이름: '동화고 고1 2025 2학기 기말고사'."""
    parts = [exam.get("school"), exam.get("grade"), exam.get("exam")]
    return " ".join(str(p).strip() for p in parts if p and str(p).strip()) or str(exam.get("title") or "내신 기출")


@dataclass
class NaesinItem:
    key: str          # naesin-donghwa/g1/2025-2final/0001 또는 .../0001-v1
    name: str         # 트윈 원본 '문제 번호'(동화고1_2025_2학기기말-01)·변형 이름. key 와 함께 들고 다닌다
    no: int           # 시험 안 번호(변형도 원본 번호)
    variant: int      # 0 = 원본, 1.. = 변형 순서
    label: str        # '3번' / '3번 변형1'
    answer: str
    image: bytes
    format: str = ""  # 객관식 / 서답형 … (변형에 없으면 원본 값)


def parse_selection(raw) -> list[int]:
    """화면에서 고른 시험 안 번호: [3, 7] 또는 '3, 7, 12-14'."""
    if isinstance(raw, list):
        tokens = [str(v) for v in raw]
    else:
        tokens = re.split(r"[\s,]+", str(raw or "").strip())
    numbers: list[int] = []
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        match = re.fullmatch(r"(\d+)\s*[-~]\s*(\d+)", token)
        if match:
            start, end = map(int, match.groups())
            step = 1 if end >= start else -1
            numbers.extend(range(start, end + step, step))
        elif token.isdigit():
            numbers.append(int(token))
        else:
            raise ValueError(f"알 수 없는 문항 번호: {token}")
    seen: set[int] = set()
    unique = [n for n in numbers if not (n in seen or seen.add(n))]
    if not unique:
        raise ValueError("문항 번호를 골라 주세요.")
    return unique


def check_variant_keys(exam: dict, numbers: list[int], raw_keys) -> set[str]:
    """화면에서 고른 변형 key 목록 검사: 이 시험 exam.json 의 변형이고, 고른 번호의 변형이어야 한다."""
    if not isinstance(raw_keys, list):
        raise ValueError("고른 변형 목록을 확인해 주세요.")
    owner = {}
    for problem in exam["problems"]:
        for variant in problem.get("variants") or []:
            owner[str(variant.get("key") or "").strip("/")] = int(problem["no"])
    chosen = set(numbers)
    keys: set[str] = set()
    for raw in raw_keys:
        key = str(raw or "").strip().strip("/")
        if key not in owner:
            raise ValueError(f"이 시험에 없는 변형입니다: {key}")
        if owner[key] not in chosen:
            raise ValueError(f"{owner[key]}번을 고르지 않았는데 그 변형이 들어 있습니다.")
        keys.add(key)
    return keys


def build_items(exam: dict, numbers: list[int], include_variants: bool, variant_keys: set[str] | None = None,
                include_originals: bool = True) -> list[NaesinItem]:
    """고른 번호 순서대로 원본, 그 뒤에 그 문항의 변형을 둔다.
    variant_keys 가 있으면 그 변형만([변형문제] 탭), 없으면 include_variants 로 전부/없음.
    include_originals=False 면 원본은 빼고 고른 변형만 넣는다([변형문제] 탭 '원본도 같이 넣기' 끔)."""
    prefix = exam["prefix"].strip("/")
    by_no = {int(p["no"]): p for p in exam["problems"]}
    missing = [n for n in numbers if n not in by_no]
    if missing:
        raise ValueError("이 시험에 없는 번호입니다: " + ", ".join(map(str, missing)))
    plan: list[tuple[dict, int, int, str]] = []
    for no in numbers:
        problem = by_no[no]
        if include_originals:
            plan.append((problem, no, 0, f"{no}번"))
        # 키의 v 번호는 비어 있을 수 있다(v1, v3 만). 표시는 variants 배열 순서로 '변형1, 변형2' 고정:
        # 변형2만 골라도 '10번 변형2' 로 찍어 같은 학생에게 다시 만들 때 헷갈리지 않게 한다.
        for index, variant in enumerate(problem.get("variants") or [], start=1):
            key = str(variant.get("key") or "").strip("/")
            wanted = (key in variant_keys) if variant_keys is not None else include_variants
            if wanted:
                plan.append((variant, no, index, f"{no}번 변형{index}"))
    if not plan:
        raise ValueError("넣을 문항이 없습니다. 변형을 하나 이상 골라 주세요.")
    if len(plan) > MAX_ITEMS:
        raise ValueError(f"한 번에 최대 {MAX_ITEMS}문항(변형 포함)까지 만들 수 있습니다.")
    items = []
    for entry, no, variant, label in plan:
        key = str(entry.get("key") or "").strip("/")
        if not key.startswith(prefix + "/"):
            raise ValueError(f"문항 키가 시험과 다릅니다: {key}")
        image_name = entry.get("image") or (key.rsplit("/", 1)[1] + ".png")
        try:
            image = _read_object(prefix, image_name)
        except FileNotFoundError as error:
            raise ValueError(f"{label} 그림이 없습니다 ({image_name}).") from error
        problem_format = str(entry.get("format") or by_no[no].get("format") or "")
        name = str(entry.get("name") or "")
        items.append(NaesinItem(key, name, no, variant, label, str(entry.get("answer") or ""), image, problem_format))
    return items


def problem_gallery(exam: dict, no: int) -> list[dict]:
    """변형 고르기 화면용: 한 번호의 원본 + 변형(variants 배열 순서) 그림. 그림은 PNG bytes."""
    prefix = exam["prefix"].strip("/")
    problem = next((p for p in exam["problems"] if int(p["no"]) == int(no)), None)
    if problem is None:
        raise ValueError(f"이 시험에 없는 번호입니다: {no}")
    entries = [(problem, "원본", 0)]
    entries += [(v, f"변형{i}", i) for i, v in enumerate(problem.get("variants") or [], start=1)]
    gallery = []
    for entry, label, variant in entries:
        key = str(entry.get("key") or "").strip("/")
        if not key.startswith(prefix + "/"):
            raise ValueError(f"문항 키가 시험과 다릅니다: {key}")
        image_name = entry.get("image") or (key.rsplit("/", 1)[1] + ".png")
        gallery.append({
            "key": key,
            "label": label,
            "variant": variant,
            "difficulty": entry.get("difficulty") or "",
            "image": _read_object(prefix, image_name),
        })
    return gallery


def exam_originals(exam: dict) -> list[dict]:
    """[변형문제 만들기] 왼쪽 목록용: 이 시험 원본 문항 그림 전부(번호 순). 그림은 PNG bytes."""
    from concurrent.futures import ThreadPoolExecutor

    prefix = exam["prefix"].strip("/")
    problems = sorted(exam["problems"], key=lambda p: int(p["no"]))

    def one(problem: dict) -> dict:
        key = str(problem.get("key") or "").strip("/")
        if not key.startswith(prefix + "/"):
            raise ValueError(f"문항 키가 시험과 다릅니다: {key}")
        image_name = problem.get("image") or (key.rsplit("/", 1)[1] + ".png")
        return {"no": int(problem["no"]), "key": key, "difficulty": problem.get("difficulty") or "",
                "variants": len(problem.get("variants") or []), "image": _read_object(prefix, image_name)}

    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(one, problems))


def is_original_key(key: str) -> bool:
    return bool(ORIGINAL_KEY_RE.fullmatch(str(key or "").strip("/")))


def youtube_qr_link(link: str) -> str | None:
    """QR 에 넣을 짧은 주소 https://youtu.be/<영상ID>?t=<초>. 유튜브 https 주소가 아니면 None.
    youtu.be/ID?t=83, youtube.com/watch?v=ID&t=83s 모두 받는다(si 같은 추적값은 버린다)."""
    text = str(link or "").strip()
    try:
        parts = urllib.parse.urlsplit(text)
    except ValueError:
        return None
    if parts.scheme != "https":
        return None
    query = urllib.parse.parse_qs(parts.query)
    host = parts.netloc.lower()
    if host == "youtu.be":
        video_id = parts.path.strip("/")
    elif host in ("youtube.com", "www.youtube.com", "m.youtube.com") and parts.path == "/watch":
        video_id = (query.get("v") or [""])[0]
    else:
        return None
    if not _YOUTUBE_ID_RE.fullmatch(video_id):
        return None
    seconds = (query.get("t") or [""])[0].rstrip("s")
    return f"https://youtu.be/{video_id}" + (f"?t={int(seconds)}" if seconds.isdigit() else "")


def solution_links_for(keys: list[str]) -> dict[str, str]:
    """원본 문항 키 → 손풀이 QR 주소 (Supabase naesin_solution_links 표, 서버 비밀 키로 읽기만).
    변형 키는 묻지 않는다. 표가 없거나(아직 안 만듦) 서버 설정이 없거나 실패하면 {} → QR 없이 만든다."""
    wanted = sorted({str(k).strip("/") for k in keys if is_original_key(k)})
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    secret = os.environ.get("SUPABASE_SECRET_KEY") or ""
    if not wanted or not url or not secret:
        return {}
    quoted = ",".join('"' + k + '"' for k in wanted)
    query = urllib.parse.urlencode({"select": "key,url", "key": f"in.({quoted})"})
    request = urllib.request.Request(
        f"{url}/rest/v1/{SOLUTION_TABLE}?{query}",
        headers={"apikey": secret, "Authorization": f"Bearer {secret}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            rows = json.loads(response.read() or b"[]")
    except Exception as error:  # 표가 아직 없으면 404(PGRST205). 값은 남기지 않고 종류만
        print("[-] naesin solution links skipped:", type(error).__name__, getattr(error, "code", ""))
        return {}
    links: dict[str, str] = {}
    for row in rows if isinstance(rows, list) else []:
        key = str((row or {}).get("key") or "").strip("/")
        link = youtube_qr_link((row or {}).get("url"))
        if key in wanted and link:
            links[key] = link
    return links


_CIRCLED = {str(n): ch for n, ch in zip(range(1, 6), "①②③④⑤")}


def plain_answer(raw: str, problem_format: str = "") -> str:
    r"""정답 페이지용 글자: '$\frac{8}{3}$' → '8/3', 객관식 '5' → '⑤'. 모르는 모양은 그대로 둔다."""
    text = str(raw or "").strip()
    if not text:
        return ""
    if "객관" in str(problem_format) and text in _CIRCLED:
        return _CIRCLED[text]
    text = text.replace("$", "")
    for _ in range(3):  # 겹친 분수까지
        text = re.sub(r"\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}", r"\1/\2", text)
    text = re.sub(r"\\sqrt\{([^{}]*)\}", r"√\1", text)
    text = re.sub(r"\\(?:text|mathrm|operatorname)\{([^{}]*)\}", r"\1", text)
    symbols = {
        "cup": "∪", "cap": "∩", "le": "≤", "ge": "≥", "leq": "≤", "geq": "≥", "ne": "≠", "neq": "≠",
        "times": "×", "cdot": "·", "pi": "π", "infty": "∞", "pm": "±", "mid": "|", "to": "→",
        "in": "∈", "notin": "∉", "subset": "⊂", "subseteq": "⊆", "emptyset": "∅", "varnothing": "∅",
        "alpha": "α", "beta": "β", "theta": "θ", "cdots": "⋯", "ldots": "…", "circ": "∘",
        "left": "", "right": "", "quad": " ", "qquad": " ",
    }
    text = text.replace(r"\{", "\x00").replace(r"\}", "\x01")  # 집합 괄호는 남긴다
    text = re.sub(r"\\([A-Za-z]+)", lambda m: symbols.get(m.group(1), m.group(1)), text)
    text = re.sub(r"\\[,;:! ]", " ", text)
    text = re.sub(r"\^\{([^{}]*)\}", r"^\1", text)
    text = text.replace("{", "").replace("}", "").replace("\x00", "{").replace("\x01", "}")
    return re.sub(r"\s+", " ", text).strip()
