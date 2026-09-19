import base64
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from typing import Any

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


TEXTBOOKS = {
    "synergy-calculus": {
        "title": "시너지 미적분",
        "answer_pages": (1, 7),
        "minimum_answers": 1568,
        "answer_source": "출처: [2022개정] 마플 시너지 미적분1 빠른정답",
    },
    "synergy-algebra": {
        "title": "시너지 대수",
        "answer_source": "출처: [2022개정] 마플 시너지 대수 빠른정답",
    },
    "synergy-common-math-2": {
        "title": "시너지 공통수학2",
        "answer_pages": (1, 8),
        "minimum_answers": 1895,
        "answer_source": "출처: 마플시너지 공통수학2 빠른정답",
    },
    "olympus-calculus": {
        "title": "올림포스 미적분Ⅰ",
        "answer_source": "출처: EBS 올림포스 유형편 미적분Ⅰ (22개정) - 해설",
    },
    "gojaengi-common-math-2": {
        "title": "고쟁이 공통수학2",
    },
    "ssen-middle-2-2": {
        "title": "쎈 수학 중2-2",
    },
    "blacklabel-middle-2-2": {
        "title": "블랙라벨 중2-2",
        "answer_source": "출처: [2022개정] 블랙라벨 중2-2 빠른정답",
    },
    "concept-middle-2-2": {
        "title": "개념유형파워 중2-2",
    },
    "basic-ssen-middle-2-2": {
        "title": "베이직쎈 중2-2",
    },
    "ssen-middle-3-1": {
        "title": "쎈 수학 중3-1",
    },
    "blacklabel-middle-3-1": {
        "title": "블랙라벨 중3-1",
    },
    "concept-middle-3-1": {
        "title": "개념유형파워 중3-1",
    },
}

OLYMPUS_UNITS = {
    "1. 함수의 극한": "unit-1",
    "2. 함수의 연속": "unit-2",
    "3. 미분계수와 도함수": "unit-3",
    "4. 도함수의 활용": "unit-4",
    "5. 부정적분과 정적분": "unit-5",
    "6. 정적분의 활용": "unit-6",
}
OLYMPUS_TYPES = {
    "유형완성하기": "standard",
    "서술형완성하기": "written",
    "고난도도전": "challenge",
}


def parse_numbers(raw: str) -> list[int]:
    result: list[int] = []
    for token in re.split(r"[\s,]+", raw.strip()):
        if not token:
            continue
        if token.isdigit():
            result.append(int(token))
            continue
        match = re.fullmatch(r"(\d+)\s*[-~]\s*(\d+)", token)
        if not match:
            raise ValueError(f"알 수 없는 문제번호 입력: {token}")
        start, end = map(int, match.groups())
        step = 1 if end >= start else -1
        result.extend(range(start, end + step, step))
    if not result:
        raise ValueError("문제번호를 입력하세요.")
    if len(result) > 100:
        raise ValueError("한 번에 최대 100문제까지 만들 수 있습니다.")
    return result


def parse_problem_tokens(raw: str) -> list[str]:
    result: list[str] = []
    for token in re.split(r"[\s,]+", raw.strip()):
        if not token:
            continue
        match = re.fullmatch(r"(\d+)\s*[-~]\s*(\d+)", token)
        if match:
            start, end = map(int, match.groups())
            step = 1 if end >= start else -1
            result.extend(str(n) for n in range(start, end + step, step))
        else:
            result.append(token)
    if not result:
        raise ValueError("문제번호를 입력하세요.")
    if len(result) > 100:
        raise ValueError("한 번에 최대 100문제까지 만들 수 있습니다.")
    return result


def request_bytes(
    url: str,
    headers: dict[str, str],
    data: bytes | None = None,
    method: str | None = None,
) -> bytes:
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def upload_temporary_file(
    supabase_url: str,
    secret_key: str,
    bucket: str,
    file_bytes: bytes,
    content_type: str = "application/pdf",
    ext: str = "pdf",
) -> str:
    """Upload a large PDF or ZIP and return a short-lived private download URL."""
    object_name = f"temporary-files/{uuid.uuid4().hex}.{ext}"
    object_path = urllib.parse.quote(f"{bucket}/{object_name}", safe="/")
    upload_request = urllib.request.Request(
        f"{supabase_url}/storage/v1/object/{object_path}",
        data=file_bytes,
        headers={
            "apikey": secret_key,
            "Content-Type": content_type,
            "x-upsert": "false",
        },
        method="POST",
    )
    with urllib.request.urlopen(upload_request, timeout=30):
        pass

    sign_request = urllib.request.Request(
        f"{supabase_url}/storage/v1/object/sign/{object_path}",
        data=json.dumps({"expiresIn": 1800}).encode("utf-8"),
        headers={
            "apikey": secret_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(sign_request, timeout=20) as response:
            signed = json.loads(response.read())
    except Exception:
        delete_request = urllib.request.Request(
            f"{supabase_url}/storage/v1/object/{object_path}",
            headers={"apikey": secret_key},
            method="DELETE",
        )
        with urllib.request.urlopen(delete_request, timeout=20):
            pass
        raise
    return f"{supabase_url}/storage/v1{signed['signedURL']}"


def upload_temporary_pdf(
    supabase_url: str,
    secret_key: str,
    bucket: str,
    pdf: bytes,
) -> str:
    return upload_temporary_file(supabase_url, secret_key, bucket, pdf, "application/pdf", "pdf")


def pdf_image_reader(data: bytes, max_width: int, max_height: int) -> ImageReader:
    """Resize only the PDF-embedded copy and encode it compactly for downloads."""
    with Image.open(BytesIO(data)) as source:
        image = source.convert("RGB")
        image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
        compact = BytesIO()
        image.save(compact, format="JPEG", quality=82, optimize=True, progressive=True)
    compact.seek(0)
    return ImageReader(compact)


def verify_user(supabase_url: str, publishable_key: str, token: str) -> dict:
    raw = request_bytes(
        f"{supabase_url}/auth/v1/user",
        {"apikey": publishable_key, "Authorization": f"Bearer {token}"},
    )
    return json.loads(raw.decode("utf-8"))


def log_usage_event(
    supabase_url: str,
    secret_key: str,
    user_id: str,
    event_type: str,
    textbook: str,
    problem_count: int,
    student_count: int,
    metadata: dict | None = None,
) -> None:
    payload = json.dumps(
        {
            "user_id": user_id,
            "event_type": event_type,
            "textbook": textbook,
            "problem_count": problem_count,
            "student_count": student_count,
            "success": event_type != "generation_failed",
            "metadata": metadata or {},
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request_bytes(
        f"{supabase_url}/rest/v1/usage_events",
        {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        payload,
        method="POST",
    )


def load_images(supabase_url: str, secret_key: str, bucket: str, textbook: str, numbers: list[int]) -> list[tuple[int, bytes]]:
    images = []
    # Modern sb_secret_ keys are API keys, not JWTs. Send them only as apikey.
    headers = {"apikey": secret_key}
    for number in numbers:
        if textbook == "synergy-algebra":
            local_cand = Path(r"D:\시너지_대수\문제모음") / f"{number:04d}.png"
            if local_cand.is_file():
                try:
                    data = local_cand.read_bytes()
                    Image.open(BytesIO(data)).verify()
                    images.append((number, data))
                    continue
                except Exception:
                    pass
        object_path = urllib.parse.quote(f"{bucket}/{textbook}/{number:04d}.png", safe="/")
        url = f"{supabase_url}/storage/v1/object/authenticated/{object_path}"
        try:
            data = request_bytes(url, headers)
            Image.open(BytesIO(data)).verify()
            images.append((number, data))
        except urllib.error.HTTPError as error:
            if error.code in (400, 404):
                raise ValueError(f"{number:04d}번 문제가 서버에 없습니다.") from error
            raise
    return images


def load_olympus_images(supabase_url: str, secret_key: str, bucket: str, unit: str, problem_type: str, numbers: list[int]) -> list[tuple[int, bytes]]:
    unit_slug = OLYMPUS_UNITS[unit]
    type_slug = OLYMPUS_TYPES[problem_type]
    images = []
    headers = {"apikey": secret_key}
    for number in numbers:
        object_path = urllib.parse.quote(
            f"{bucket}/olympus-calculus/{unit_slug}/{type_slug}/{number:04d}.png",
            safe="/",
        )
        try:
            data = request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
            Image.open(BytesIO(data)).verify()
            images.append((number, data))
        except urllib.error.HTTPError as error:
            if error.code in (400, 404):
                raise ValueError(f"{unit} / {problem_type}에 {number}번 문제가 없습니다.") from error
            raise
    return images


def load_quick_answers(supabase_url: str, secret_key: str, bucket: str, textbook: str) -> dict[int, str]:
    config = TEXTBOOKS[textbook]
    headers = {"apikey": secret_key}
    object_path = urllib.parse.quote(f"{bucket}/{textbook}/quick-answer.pdf", safe="/")
    pdf_data = request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
    reader = PdfReader(BytesIO(pdf_data))
    first_page, last_page = config["answer_pages"]
    if len(reader.pages) < last_page:
        raise ValueError("빠른정답 PDF의 페이지 구성을 확인해 주세요.")
    text = "\n".join((page.extract_text() or "") for page in reader.pages[first_page:last_page])
    pattern = re.compile(
        r"(?<!\d)(\d{4})[\s\x00-\x1f]*"
        r"(해설참조|[①②③④⑤]|(?:\(\d+\)\s*[-+]?\d+\w*\s*)+|[-+]?\d+(?:\s*\(원\)|m)?)"
    )
    answers = {int(number): answer for number, answer in pattern.findall(text)}
    if len(answers) < config["minimum_answers"]:
        raise ValueError("빠른정답 PDF에서 정답을 완전히 읽지 못했습니다.")
    return answers


def crop_synergy_algebra_answer(img_bytes: bytes) -> bytes:
    """Crops the right-side answer symbol from a synergy-algebra quick answer image, removing near-white background."""
    with Image.open(BytesIO(img_bytes)).convert("RGBA") as img:
        w, h = img.size
        start_x = int(w * 0.30)
        min_x, min_y, max_x, max_y = w, h, 0, 0
        found = False
        for x in range(start_x, w):
            for y in range(h):
                r, g, b, _ = img.getpixel((x, y))
                if r < 160 and g < 160 and b < 160:
                    found = True
                    if x < min_x: min_x = x
                    if x > max_x: max_x = x
                    if y < min_y: min_y = y
                    if y > max_y: max_y = y
        if found:
            cropped = img.crop((max(0, min_x - 3), max(0, min_y - 3), min(w, max_x + 4), min(h, max_y + 4)))
        else:
            cropped = img.crop((int(w * 0.35), 0, w, h))

        cw, ch = cropped.size
        out = Image.new("RGBA", (cw, ch))
        for x in range(cw):
            for y in range(ch):
                r, g, b, a = cropped.getpixel((x, y))
                if r > 225 and g > 225 and b > 225:
                    out.putpixel((x, y), (255, 255, 255, 0))
                else:
                    out.putpixel((x, y), (r, g, b, a))

        buf = BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()


def load_synergy_algebra_answers(supabase_url: str, secret_key: str, bucket: str, numbers: list[int]) -> dict[int, bytes]:
    """Loads and returns cropped answer image bytes for synergy-algebra."""
    answers: dict[int, bytes] = {}
    headers = {"apikey": secret_key}
    for number in numbers:
        img_bytes = None
        local_cand = Path(r"D:\시너지_대수\빠른정답모음") / f"{number:04d}.png"
        if local_cand.is_file():
            try:
                img_bytes = local_cand.read_bytes()
            except Exception:
                pass
        if not img_bytes:
            object_path = urllib.parse.quote(f"{bucket}/synergy-algebra/answers/{number:04d}.png", safe="/")
            url = f"{supabase_url}/storage/v1/object/authenticated/{object_path}"
            try:
                img_bytes = request_bytes(url, headers)
            except Exception as e:
                print(f"[-] Supabase answer fetch error (synergy-algebra/{number:04d}):", e)
        if img_bytes:
            try:
                answers[number] = crop_synergy_algebra_answer(img_bytes)
            except Exception as e:
                print(f"[-] Error cropping answer for {number}:", e)
                answers[number] = img_bytes
    return answers


def append_ssen_selected_answers(pdf_data: bytes, numbers: list[int]) -> bytes:
    """Append only the selected Ssen answers using the verified local answer index."""
    index_path = Path(__file__).resolve().parent / "ssen_answer_index.json"
    cache_dir = Path(__file__).resolve().parent / "ssen_answer_cache"
    if not index_path.exists() or not cache_dir.exists():
        return pdf_data
    try:
        index = {int(k): v for k, v in json.loads(index_path.read_text(encoding="utf-8")).items()}
    except Exception:
        return pdf_data
    writer = PdfWriter()
    for page in PdfReader(BytesIO(pdf_data)).pages:
        writer.add_page(page)
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=A4)
    left, top = 16 * mm, A4[1] - 18 * mm
    c.setFillColorRGB(0.12, 0.27, 0.48)
    pdfmetrics.registerFont(UnicodeCIDFont("HYGothic-Medium"))
    c.setFont("HYGothic-Medium", 22)
    c.drawString(left, top, "빠른 정답")
    c.setFont("HYGothic-Medium", 9)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.drawRightString(A4[0] - left, top + mm, f"오답 {len(numbers)}문제")
    c.setStrokeColorRGB(0.12, 0.27, 0.48)
    c.line(left, top - 4 * mm, A4[0] - left, top - 4 * mm)
    cols, rows = (2 if len(numbers) <= 24 else 3), math.ceil(len(numbers) / (2 if len(numbers) <= 24 else 3))
    cell_w = (A4[0] - 2 * left - 5 * mm * (cols - 1)) / cols
    cell_h = min(11 * mm, (top - 32 * mm) / max(rows, 1))
    for i, number in enumerate(numbers):
        col, row = i // rows, i % rows
        x, y = left + col * (cell_w + 5 * mm), top - 14 * mm - (row + 1) * cell_h
        c.setFillColorRGB(0.96, 0.97, 0.99 if row % 2 == 0 else 1)
        c.rect(x, y, cell_w, cell_h, stroke=0, fill=1)
        c.setFillColorRGB(0.12, 0.12, 0.12)
        c.setFont("HYGothic-Medium", 10)
        c.drawString(x + 3 * mm, y + 3.5 * mm, f"No. {number:04d}")
        item = index.get(number)
        if item:
            image = Image.open(cache_dir / f"page_{int(item['page'])}.png")
            x0, y0 = float(item['x']), float(item['y'])
            same_row = [v for n, v in index.items() if n != number and int(v['page']) == int(item['page']) and abs(float(v['y']) - y0) < max(12, float(item['h']) * .75) and float(v['x']) > x0]
            x1 = min(image.width - 5, max(x0 + 70, min((float(v['x']) for v in same_row), default=x0 + 120) - 5))
            snippet = image.crop((max(0, x0 + 35), max(0, y0 - 4), x1, min(image.height, y0 + float(item['h']) + 5)))
            iw, ih = snippet.size
            scale = min((cell_w - 24 * mm) / iw, (cell_h - 2 * mm) / ih)
            c.drawImage(ImageReader(snippet), x + cell_w - iw * scale - 2.5 * mm, y + (cell_h - ih * scale) / 2, iw * scale, ih * scale, mask="auto")
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.setFont("HYGothic-Medium", 7.5)
    c.drawString(left, 13.5 * mm, "출처: 쎈 수학 중2하 빠른정답")
    c.showPage(); c.save(); packet.seek(0)
    for page in PdfReader(packet).pages:
        writer.add_page(page)
    output = BytesIO(); writer.write(output)
    return output.getvalue()


def draw_test_cover(
    c: canvas.Canvas,
    student_name: str = "홍길동",
    title: str = "시너지_미적분",
    academy_name: str = "다산미래학원",
    subtitle: str = "학생 맞춤형 클리닉 & 실전 평가",
    date_str: str | None = None,
    total_problems: int = 0,
    include_character: bool = True,
    custom_character_bytes: bytes | None = None,
    textbook: str = "synergy-calculus",
    department: str | None = None,
) -> None:
    page_width, page_height = A4
    pdfmetrics.registerFont(UnicodeCIDFont("HYGothic-Medium"))
    font_name = "HYGothic-Medium"

    if not date_str:
        now = datetime.now()
        date_str = f"{now.year}년 {now.month}월 {now.day}일"

    # Color Palette: Deep Midnight Navy & Vivid Royal Cobalt
    C_MIDNIGHT = (0.07, 0.11, 0.22)   # #121C38
    C_COBALT = (0.13, 0.42, 0.90)     # #216BE6
    C_COBALT_ICE = (0.93, 0.96, 1.0)  # #EDF5FF
    C_SLATE_TXT = (0.38, 0.45, 0.55)  # #61738C
    C_BORDER = (0.80, 0.85, 0.92)     # #CCD9EB
    C_BG_PAGE = (0.988, 0.990, 0.996)

    # 1. Double Border & Canvas Tone
    c.setFillColorRGB(*C_BG_PAGE)
    c.rect(30, 30, page_width - 60, page_height - 60, stroke=0, fill=1)

    c.setStrokeColorRGB(*C_MIDNIGHT)
    c.setLineWidth(1.6)
    c.rect(30, 30, page_width - 60, page_height - 60, stroke=1, fill=0)

    c.setStrokeColorRGB(*C_COBALT)
    c.setLineWidth(0.6)
    c.rect(36, 36, page_width - 72, page_height - 72, stroke=1, fill=0)

    # Architectural Corner Markers
    c.setStrokeColorRGB(*C_COBALT)
    c.setFillColorRGB(*C_COBALT)
    c.setLineWidth(1.5)
    corners = [
        (36, 36, 1, 1),
        (page_width - 36, 36, -1, 1),
        (36, page_height - 36, 1, -1),
        (page_width - 36, page_height - 36, -1, -1),
    ]
    for cx, cy, dx, dy in corners:
        c.line(cx, cy, cx + dx * 16, cy)
        c.line(cx, cy, cx, cy + dy * 16)
        c.rect(cx + dx * 4 - 1.5, cy + dy * 4 - 1.5, 3, 3, stroke=0, fill=1)

    # Top Subject Badge
    if "대수" in title or "algebra" in textbook:
        badge_text = "고등 수학 영역  |  대수"
        eng_sub = "SYNERGY ALGEBRA CUSTOM TEST" if "시너지" in title else "ALGEBRA CUSTOM TEST"
    elif "미적분" in title or "calculus" in textbook:
        badge_text = "고등 수학 영역  |  미적분"
        eng_sub = "SYNERGY CALCULUS CUSTOM TEST" if "시너지" in title else "CALCULUS CUSTOM TEST"
    elif "공통수학" in title:
        badge_text = "고등 수학 영역  |  공통수학2"
        eng_sub = "COMMON MATHEMATICS II CUSTOM TEST"
    elif "3-1" in textbook or "middle-3" in textbook or "3-1" in title:
        badge_text = "중등 수학 영역  |  중3-1"
        eng_sub = "MIDDLE SCHOOL MATHEMATICS TEST"
    elif "중2" in textbook or "middle" in textbook:
        badge_text = "중등 수학 영역  |  중2-2"
        eng_sub = "MIDDLE SCHOOL MATHEMATICS TEST"
    else:
        badge_text = "고등 수학 영역  |  맞춤 클리닉"
        eng_sub = "MATHEMATICS CLINIC TEST"

    badge_w = 175
    badge_h = 26
    badge_x = 50
    badge_y = page_height - 56 - badge_h
    c.setFillColorRGB(*C_COBALT_ICE)
    c.setStrokeColorRGB(*C_BORDER)
    c.setLineWidth(0.8)
    c.rect(badge_x, badge_y, badge_w, badge_h, stroke=1, fill=1)

    # Left indicator
    c.setFillColorRGB(*C_COBALT)
    c.rect(badge_x, badge_y, 6, badge_h, stroke=0, fill=1)

    c.setFillColorRGB(*C_MIDNIGHT)
    c.setFont(font_name, 9.5)
    c.drawString(badge_x + 16, badge_y + 8, badge_text)

    # Top Right Academy Name & Target Emblem Dot
    c.setFont(font_name, 12.5)
    acad_w = c.stringWidth(academy_name, font_name, 12.5)
    rx = page_width - 52 - acad_w
    c.setFillColorRGB(*C_COBALT)
    c.circle(rx - 10, page_height - 68, 3.5, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.circle(rx - 10, page_height - 68, 1.5, stroke=0, fill=1)
    c.setFillColorRGB(*C_MIDNIGHT)
    c.drawString(rx, page_height - 72, academy_name)

    center_x = page_width / 2.0
    slot_center_y = page_height - 195.0

    # 1-1. Center Mascot / Logo Stage (방안 A: 배경 투명화 + 세련된 더블 테두리 링 유지)
    if include_character:
        c.setStrokeColorRGB(*C_BORDER)
        c.setLineWidth(0.8)
        c.circle(center_x, slot_center_y, 74, stroke=1, fill=0)

        c.setStrokeColorRGB(0.78, 0.84, 0.92)
        c.setLineWidth(0.6)
        c.circle(center_x, slot_center_y, 67, stroke=1, fill=0)

        # 4 Crosshair Ticks
        c.setStrokeColorRGB(*C_COBALT)
        c.setLineWidth(1.0)
        for deg_dx, deg_dy in [(0, -74), (0, 74), (-74, 0), (74, 0)]:
            c.line(center_x + deg_dx * 0.94, slot_center_y + deg_dy * 0.94,
                   center_x + deg_dx * 1.06, slot_center_y + deg_dy * 1.06)

        char_bytes = custom_character_bytes
        if not char_bytes:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            is_middle = (department == "middle") or ("middle" in str(textbook).lower())
            if is_middle:
                candidates = [
                    os.path.join(base_dir, "middle-logo.png"),
                    os.path.join(base_dir, "..", "public", "middle-logo.png"),
                    os.path.join(base_dir, "dasan-mirae-logo.png"),
                    os.path.join(base_dir, "..", "public", "dasan-mirae-logo.png"),
                    os.path.join(base_dir, "character.png"),
                    os.path.join(base_dir, "..", "public", "character.png"),
                ]
            else:
                candidates = [
                    os.path.join(base_dir, "character.png"),
                    os.path.join(base_dir, "..", "public", "character.png"),
                    os.path.join(base_dir, "middle-logo.png"),
                    os.path.join(base_dir, "..", "public", "middle-logo.png"),
                    os.path.join(base_dir, "dasan-mirae-logo.png"),
                    os.path.join(base_dir, "..", "public", "dasan-mirae-logo.png"),
                ]
            for cand in candidates:
                if os.path.exists(cand):
                    try:
                        with open(cand, "rb") as f:
                            char_bytes = f.read()
                        break
                    except Exception:
                        pass

        if char_bytes:
            try:
                pil_img = Image.open(BytesIO(char_bytes))
                iw, ih = pil_img.size
                aspect = ih / iw if iw > 0 else 1.0
                max_w, max_h = 98.0, 112.0
                tw = max_w
                th = tw * aspect
                if th > max_h:
                    th = max_h
                    tw = th / aspect
                c.drawImage(ImageReader(BytesIO(char_bytes)), center_x - tw / 2, slot_center_y - th / 2, tw, th, mask="auto")
            except Exception as e:
                print("[-] Cover character insert error:", e)

    # 2. Center Title Area
    center_y = page_height - 385.0
    c.setStrokeColorRGB(*C_BORDER)
    c.setLineWidth(0.8)
    c.line(100, center_y + 75, page_width - 100, center_y + 75)
    c.setStrokeColorRGB(*C_COBALT)
    c.setLineWidth(1.8)
    c.line(center_x - 45, center_y + 75, center_x + 45, center_y + 75)

    # English Sub Label
    c.setFillColorRGB(*C_COBALT)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(center_x, center_y + 52, eng_sub)

    # Main Title
    c.setFillColorRGB(*C_MIDNIGHT)
    c.setFont(font_name, 36)
    c.drawCentredString(center_x, center_y + 5, title)

    # Subtitle
    c.setFillColorRGB(*C_SLATE_TXT)
    c.setFont(font_name, 13.5)
    c.drawCentredString(center_x, center_y - 32, subtitle)

    # Bottom Accent Line & Diamond Jewel
    c.setStrokeColorRGB(*C_BORDER)
    c.setLineWidth(0.8)
    c.line(100, center_y - 65, page_width - 100, center_y - 65)
    c.setStrokeColorRGB(*C_COBALT)
    c.setLineWidth(1.8)
    c.line(center_x - 45, center_y - 65, center_x + 45, center_y - 65)

    # Diamond Jewel
    c.saveState()
    c.translate(center_x, center_y - 65)
    c.rotate(45)
    c.setFillColorRGB(*C_COBALT)
    c.rect(-4.5, -4.5, 9, 9, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.rect(-1.5, -1.5, 3, 3, stroke=0, fill=1)
    c.restoreState()

    # 3. Bottom Student Info Card
    card_w = 400
    card_h = 168
    card_x = (page_width - card_w) / 2
    card_y = page_height - 595 - card_h

    # Card background & border
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(*C_BORDER)
    c.setLineWidth(1.0)
    c.rect(card_x, card_y, card_w, card_h, stroke=1, fill=1)

    # Card Header Band
    c.setFillColorRGB(*C_MIDNIGHT)
    c.rect(card_x, card_y + card_h - 36, card_w, 36, stroke=0, fill=1)
    c.setFillColorRGB(*C_COBALT)
    c.rect(card_x, card_y + card_h - 36, 6, 36, stroke=0, fill=1)

    c.setFillColorRGB(1, 1, 1)
    c.setFont(font_name, 11.5)
    c.drawString(card_x + 22, card_y + card_h - 23, "수험생 및 평가 정보")

    c.setFont("Helvetica-Bold", 8)
    c.setFillColorRGB(0.70, 0.80, 0.95)
    c.drawRightString(card_x + card_w - 18, card_y + card_h - 22, "CUSTOM CLINIC")

    # Info Items
    total_pages = max(1, (total_problems + 3) // 4)
    disp_name = (
        student_name
        if ("," in student_name or "\n" in student_name or "외" in student_name or student_name.endswith("학생"))
        else f"{student_name} 학생"
    )
    info_items = [
        ("학 생 성 명", disp_name, True),
        ("소 속 학 원", academy_name, False),
        ("출 제 문 항", f"총 {total_problems}문항 ({total_pages}페이지)", False),
        ("응 시 일 자", date_str, False),
    ]

    row_y = card_y + card_h - 60
    for idx, (lbl, val, is_hl) in enumerate(info_items):
        if idx % 2 == 1:
            c.setFillColorRGB(0.975, 0.985, 0.995)
            c.rect(card_x + 4, row_y - 5, card_w - 8, 22, stroke=0, fill=1)

        c.setFillColorRGB(*C_COBALT)
        c.circle(card_x + 24, row_y + 5, 2.5, stroke=0, fill=1)

        c.setFillColorRGB(*C_SLATE_TXT)
        c.setFont(font_name, 10.5)
        c.drawString(card_x + 36, row_y + 2, lbl)
        c.drawString(card_x + 118, row_y + 2, ":")

        if is_hl:
            c.setFillColorRGB(*C_COBALT)
            font_sz = 13.0
            if len(val) > 20:
                font_sz = 9.5
            elif len(val) > 13:
                font_sz = 11.0
            c.setFont(font_name, font_sz)
            c.drawString(card_x + 138, row_y + 2, val)
        else:
            c.setFillColorRGB(*C_MIDNIGHT)
            c.setFont(font_name, 10.5)
            c.drawString(card_x + 138, row_y + 2, val)

        row_y -= 24.5

    # Bottom Footer Guide Quote
    guide_text = f"{academy_name}  |  성실한 풀이와 오답 정리가 실력을 만듭니다."
    c.setFillColorRGB(*C_SLATE_TXT)
    c.setFont(font_name, 9)
    c.drawCentredString(center_x, 38, guide_text)


def draw_cover(
    c: canvas.Canvas,
    student: str,
    grade: str,
    page_width: float,
    page_height: float,
    textbook: str,
    cover_options: dict | None = None,
) -> None:
    """Delegates to draw_test_cover for complete test generator styling."""
    opts = cover_options or {}
    draw_test_cover(
        c,
        student_name=student,
        title=opts.get("title") or TEXTBOOKS.get(textbook, {}).get("title", "맞춤 오답노트"),
        academy_name=opts.get("academy_name") or "다산미래학원",
        subtitle=opts.get("subtitle") or "학생 맞춤형 클리닉 & 실전 평가",
        date_str=opts.get("date_str") or None,
        total_problems=opts.get("total_problems", 0),
        include_character=opts.get("include_character", True),
        custom_character_bytes=opts.get("custom_character_bytes"),
        textbook=textbook,
        department=opts.get("department"),
    )


def draw_footer(c: canvas.Canvas, page_number: int, page_width: float, academy_name: str = "다산미래학원") -> None:
    left = 10 * mm
    right = page_width - 10 * mm
    c.setStrokeColorRGB(0.72, 0.72, 0.72)
    c.setLineWidth(0.45)
    c.line(left, 9.5 * mm, right, 9.5 * mm)
    c.setFillColorRGB(0.16, 0.16, 0.16)
    c.setFont("HYSMyeongJo-Medium", 8)
    c.drawString(left, 5.2 * mm, academy_name)
    c.drawRightString(right, 5.2 * mm, str(page_number))


def draw_answer_page(c: canvas.Canvas, numbers: list[int], answers: dict[int, Any], page_number: int, page_width: float, page_height: float, textbook: str, academy_name: str = "다산미래학원") -> None:
    left = 16 * mm
    right = page_width - 16 * mm
    top = page_height - 18 * mm
    c.setFillColorRGB(0.12, 0.27, 0.48)
    c.setFont("HYSMyeongJo-Medium", 22)
    c.drawString(left, top, "빠른 정답")
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.setFont("HYSMyeongJo-Medium", 9)
    c.drawRightString(right, top + 1 * mm, f"오답 {len(numbers)}문제")
    c.setStrokeColorRGB(0.12, 0.27, 0.48)
    c.setLineWidth(1.2)
    c.line(left, top - 4 * mm, right, top - 4 * mm)

    columns = 2 if len(numbers) <= 24 else 3 if len(numbers) <= 48 else 4
    rows = (len(numbers) + columns - 1) // columns
    area_top = top - 14 * mm
    area_bottom = 19 * mm
    row_height = min(11 * mm, (area_top - area_bottom) / max(rows, 1))
    gap = 6 * mm
    column_width = (right - left - gap * (columns - 1)) / columns
    for index, number in enumerate(numbers):
        column = index // rows
        row = index % rows
        x = left + column * (column_width + gap)
        y = area_top - (row + 1) * row_height
        c.setFillColorRGB(0.96, 0.97, 0.99) if row % 2 == 0 else c.setFillColorRGB(1, 1, 1)
        c.rect(x, y, column_width, row_height, stroke=0, fill=1)
        c.setFillColorRGB(0.18, 0.18, 0.18)
        c.setFont("HYSMyeongJo-Medium", 12)
        c.drawString(x + 3 * mm, y + (row_height - 12) / 2 + 1, f"{number:04d}")

        ans_val = answers.get(number)
        if isinstance(ans_val, str):
            c.drawRightString(x + column_width - 3 * mm, y + (row_height - 12) / 2 + 1, ans_val)
        elif ans_val:
            reader = ImageReader(BytesIO(ans_val))
            iw, ih = reader.getSize()
            max_w = column_width - 24 * mm
            max_h = row_height - 2 * mm
            scale = min(max_w / iw, max_h / ih)
            dw, dh = iw * scale, ih * scale
            img_x = x + column_width - dw - 3 * mm
            img_y = y + (row_height - dh) / 2
            c.drawImage(reader, img_x, img_y, dw, dh, mask="auto")

    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.setFont("HYSMyeongJo-Medium", 7.5)
    c.drawString(left, 13.5 * mm, TEXTBOOKS.get(textbook, {}).get("answer_source", ""))
    draw_footer(c, page_number, page_width, academy_name)


def create_pdf(student: str, grade: str, images: list[tuple[int, bytes]], answers: dict[int, str] | None, textbook: str, cover_options: dict | None = None) -> bytes:
    opts = cover_options or {}
    include_cover = opts.get("include_cover", True)
    academy_name = opts.get("academy_name") or "다산미래학원"
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    page_width, page_height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    if include_cover:
        opts_with_prob = dict(opts)
        opts_with_prob.setdefault("total_problems", len(images))
        draw_cover(c, student, grade, page_width, page_height, textbook, opts_with_prob)
        c.showPage()

    side, bottom, gap = 10 * mm, 14 * mm, 5 * mm
    cell_w = (page_width - side * 2 - gap) / 2
    cell_h = (page_height - 10 * mm - bottom - gap) / 2
    boxes = [(side, bottom + cell_h + gap), (side + cell_w + gap, bottom + cell_h + gap), (side, bottom), (side + cell_w + gap, bottom)]
    for page_index, page_start in enumerate(range(0, len(images), 4), start=1):
        for index, (number, data) in enumerate(images[page_start:page_start + 4]):
            x, y = boxes[index]
            c.roundRect(x, y, cell_w, cell_h, 2 * mm)
            c.setFont("Helvetica-Bold", 9)
            label_number = f"{number:04d}" if "ssen" in textbook else str(number)
            c.drawString(x + 3 * mm, y + cell_h - 6 * mm, f"No. {label_number}")
            reader = pdf_image_reader(data, 900, 1150)
            iw, ih = reader.getSize()
            available_w, available_h = cell_w - 6 * mm, cell_h - 14 * mm
            scale = min(available_w / iw, available_h / ih)
            dw, dh = iw * scale, ih * scale
            c.drawImage(reader, x + (cell_w - dw) / 2, y + cell_h - 10 * mm - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, page_index, page_width, academy_name)
        c.showPage()
    if answers is not None:
        numbers = [number for number, _ in images]
        answer_chunks = [numbers[i:i + 60] for i in range(0, len(numbers), 60)]
        first_answer_page = (len(images) + 3) // 4 + 1
        for index, chunk in enumerate(answer_chunks):
            draw_answer_page(c, chunk, answers, first_answer_page + index, page_width, page_height, textbook, academy_name)
            if index < len(answer_chunks) - 1:
                c.showPage()
    c.save()
    return output.getvalue()


def parse_olympus_answer_block(block: str) -> dict[int, str]:
    answers: dict[int, str] = {}
    def find_marker(number: int, start: int) -> tuple[int, int] | None:
        match = re.search(rf"(?<!\d){number:02d}\s+", block[start:])
        return None if match is None else (start + match.start(), start + match.end())

    current = 1
    marker = find_marker(current, 0)
    while marker is not None:
        next_marker = find_marker(current + 1, marker[1])
        end = next_marker[0] if next_marker is not None else len(block)
        value = " ".join(block[marker[1]:end].split())
        if value:
            answers[current] = value
        if next_marker is None:
            break
        current += 1
        marker = next_marker
    return answers


def load_olympus_answers(supabase_url: str, secret_key: str, bucket: str) -> dict[tuple[int, str, int], str]:
    headers = {"apikey": secret_key}
    object_path = urllib.parse.quote(f"{bucket}/olympus-calculus/answers.pdf", safe="/")
    data = request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
    texts = [page.extract_text() or "" for page in PdfReader(BytesIO(data)).pages]
    headings = {
        "유형완성하기": "유형 완성하기",
        "서술형완성하기": "서술형 완성하기",
        "고난도도전": "내신 + 수능 고난도 도전",
    }
    result: dict[tuple[int, str, int], str] = {}
    for problem_type, heading in headings.items():
        unit_index = 0
        for text_value in texts:
            start = 0
            while True:
                position = text_value.find(heading, start)
                if position < 0:
                    break
                answer_start = position + len(heading)
                answer_end = text_value.find("본문", answer_start)
                if answer_end >= 0:
                    parsed = parse_olympus_answer_block(text_value[answer_start:answer_end])
                    if parsed:
                        unit_index += 1
                        for number, answer in parsed.items():
                            result[(unit_index, problem_type, number)] = answer
                start = answer_start
    return result


def create_olympus_pdf(student: str, grade: str, items: list[tuple[str, str, int, bytes]], answers: dict[tuple[int, str, int], str], cover_options: dict | None = None) -> bytes:
    opts = cover_options or {}
    include_cover = opts.get("include_cover", True)
    academy_name = opts.get("academy_name") or "다산미래학원"
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    if include_cover:
        opts_with_prob = dict(opts)
        opts_with_prob.setdefault("total_problems", len(items))
        draw_cover(c, student, grade, width, height, "olympus-calculus", opts_with_prob)
        c.showPage()
    side, bottom, gap = 10 * mm, 14 * mm, 5 * mm
    # 사용자가 단원을 임의 순서로 추가해도 PDF는 교재 단원 순서로 정렬한다.
    ordered_items = sorted(items, key=lambda item: int(item[0].split(".", 1)[0]))
    groups = []
    current_group = []
    current_wide = None
    for item in ordered_items:
        item_wide = item[1] == "고난도도전"
        if current_group and (item_wide != current_wide or len(current_group) >= 4):
            groups.append(current_group)
            current_group = []
        current_group.append(item)
        current_wide = item_wide
    if current_group:
        groups.append(current_group)
    normal_w = (width - side * 2 - gap) / 2
    for page_index, group in enumerate(groups, start=1):
        wide = group[0][1] == "고난도도전"
        rows = 4 if wide else 2
        cell_h = (height - 10 * mm - bottom - gap * (rows - 1)) / rows
        slots = []
        for row in range(rows):
            y = height - 10 * mm - (row + 1) * cell_h - row * gap
            if wide:
                slots.append((side, y, width - side * 2, cell_h))
            else:
                slots.extend(((side, y, normal_w, cell_h), (side + normal_w + gap, y, normal_w, cell_h)))
        for index, (unit, problem_type, number, data) in enumerate(group):
            x, y, box_w, box_h = slots[index]
            c.roundRect(x, y, box_w, box_h, 2 * mm)
            c.setFont("HYSMyeongJo-Medium", 8.5)
            c.drawString(x + 3 * mm, y + box_h - 5.3 * mm, f"{unit} · {problem_type} · {number}번")
            reader = pdf_image_reader(data, 1550 if wide else 900, 650 if wide else 1150)
            iw, ih = reader.getSize()
            scale = min((box_w - 6 * mm) / iw, (box_h - 14 * mm) / ih)
            dw, dh = iw * scale, ih * scale
            top_padding = 8 * mm if wide else 10 * mm
            c.drawImage(reader, x + (box_w - dw) / 2, y + box_h - top_padding - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, page_index, width, academy_name)
        c.showPage()
    selected = [
        (unit, problem_type, number, answers.get((int(unit.split(".", 1)[0]), problem_type, number)))
        for unit, problem_type, number, _ in ordered_items
    ]
    missing = [f"{unit} / {problem_type} / {number}번" for unit, problem_type, number, answer in selected if not answer]
    if missing:
        raise ValueError("빠른정답에 없는 문제번호입니다: " + ", ".join(missing))
    answer_chunks = [selected[i:i + 40] for i in range(0, len(selected), 40)]
    for index, chunk in enumerate(answer_chunks):
        draw_olympus_answer_page(c, chunk, len(groups) + index + 1, width, height, academy_name)
        if index < len(answer_chunks) - 1:
            c.showPage()
    c.save()
    return output.getvalue()


def draw_olympus_answer_page(c: canvas.Canvas, items: list[tuple[str, str, int, str]], page_number: int, width: float, height: float, academy_name: str = "다산미래학원") -> None:
    left, right, top = 16 * mm, width - 16 * mm, height - 18 * mm
    c.setFillColorRGB(0.12, 0.27, 0.48)
    c.setFont("HYSMyeongJo-Medium", 22)
    c.drawString(left, top, "빠른 정답")
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.setFont("HYSMyeongJo-Medium", 9)
    c.drawRightString(right, top + 1 * mm, f"오답 {len(items)}문제")
    c.setStrokeColorRGB(0.12, 0.27, 0.48)
    c.setLineWidth(1.2)
    c.line(left, top - 4 * mm, right, top - 4 * mm)
    columns = 2
    rows = (len(items) + 1) // 2
    area_top, row_height, gap = top - 14 * mm, 11 * mm, 6 * mm
    column_width = (right - left - gap) / 2
    short_type = {"유형완성하기": "유형", "서술형완성하기": "서술", "고난도도전": "고난도"}
    for index, (unit, problem_type, number, answer) in enumerate(items):
        column, row = index // rows, index % rows
        x = left + column * (column_width + gap)
        y = area_top - (row + 1) * row_height
        c.setFillColorRGB(0.96, 0.97, 0.99) if row % 2 == 0 else c.setFillColorRGB(1, 1, 1)
        c.rect(x, y, column_width, row_height, stroke=0, fill=1)
        c.setFillColorRGB(0.18, 0.18, 0.18)
        c.setFont("HYSMyeongJo-Medium", 9)
        label = f"{unit.split('.', 1)[0]}단원 {short_type[problem_type]} {number}번"
        c.drawString(x + 2 * mm, y + 3.5 * mm, label)
        c.drawRightString(x + column_width - 2 * mm, y + 3.5 * mm, str(answer))
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.setFont("HYSMyeongJo-Medium", 7.5)
    c.drawString(left, 13.5 * mm, TEXTBOOKS["olympus-calculus"]["answer_source"])
    draw_footer(c, page_number, width, academy_name)


BLACKLABEL_CHAPTER_SLUGS = {
    "I. 삼각형의 성질": "ch1",
    "II. 사각형의 성질": "ch2",
    "III. 도형의 닮음": "ch3",
    "IV. 피타고라스 정리": "ch4",
    "V. 확률": "ch5",
}

BLACKLABEL_STAGE_SLUGS = {
    "시험에 꼭 나오는 문제": "must",
    "A등급을 위한 문제": "grade-a",
    "종합 사고력 도전 문제": "challenge",
    "미리보는 학력평가": "mock",
    "대단원평가": "review",
}


def load_blacklabel_image(supabase_url: str, secret_key: str, bucket: str, chapter: str, subunit: str, stage: str, number_str: str, textbook: str = "blacklabel-middle-2-2") -> bytes:
    headers = {"apikey": secret_key}
    num = int(number_str) if number_str.isdigit() else None
    candidates: list[str] = []
    if num is not None:
        candidates.append(f"{num:04d}.png")
        candidates.append(f"{num}.png")
        candidates.append(f"{num:02d}.png")
    candidates.append(f"{number_str}.png")
    if num is not None:
        candidates.append(f"{num}-1.png")

    if textbook == "blacklabel-middle-3-1":
        c_slug = "ch" + chapter[:2]
        s_slug = stage.lower()
        for filename in candidates:
            object_path = urllib.parse.quote(f"{bucket}/blacklabel-middle-3-1/{c_slug}/{s_slug}/{filename}", safe="/")
            try:
                return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
            except urllib.error.HTTPError as err:
                if err.code in (400, 404):
                    continue
                raise
        clean_ch = chapter.replace("_", " ")
        raise ValueError(f"블랙라벨 문제 이미지를 찾을 수 없습니다: [{clean_ch} > {stage}] {number_str}번")

    c_slug = BLACKLABEL_CHAPTER_SLUGS.get(chapter, "ch1")
    sub_slug = "sub" + subunit.strip().split()[0]
    s_slug = BLACKLABEL_STAGE_SLUGS.get(stage, "must")

    for filename in candidates:
        object_path = urllib.parse.quote(f"{bucket}/blacklabel-middle-2-2/{c_slug}/{sub_slug}/{s_slug}/{filename}", safe="/")
        try:
            return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
        except urllib.error.HTTPError as err:
            if err.code in (400, 404):
                continue
            raise
    raise ValueError(f"블랙라벨 문제 이미지를 찾을 수 없습니다: [{subunit} > {stage}] {number_str}번 (해당 단계의 제공 번호를 확인해 주세요)")


def load_blacklabel_answers(supabase_url: str, secret_key: str, bucket: str) -> dict[str, str]:
    local_path = Path(__file__).resolve().parent / "blacklabel_answers.json"
    if local_path.is_file():
        return json.loads(local_path.read_text(encoding="utf-8"))
    headers = {"apikey": secret_key}
    object_path = urllib.parse.quote(f"{bucket}/blacklabel-middle-2-2/blacklabel_answers.json", safe="/")
    data = request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
    return json.loads(data.decode("utf-8"))


def draw_blacklabel_answer_page(
    c: canvas.Canvas,
    items: list[tuple[str, str, str, str, bytes]],
    answers: dict[str, str],
    page_number: int,
    page_width: float,
    page_height: float,
    answer_page_index: int,
    total_answer_pages: int,
    academy_name: str = "다산미래학원",
) -> None:
    left = 16 * mm
    right = page_width - 16 * mm
    top = page_height - 18 * mm

    c.setFillColorRGB(0.08, 0.13, 0.22)
    c.setFont("HYSMyeongJo-Medium", 22)
    title = "빠른 정답"
    if total_answer_pages > 1:
        title += f" ({answer_page_index}/{total_answer_pages})"
    c.drawString(left, top, title)

    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.setFont("HYSMyeongJo-Medium", 9)
    c.drawRightString(right, top + 1 * mm, f"오답 {len(items)}문제")

    c.setStrokeColorRGB(0.08, 0.13, 0.22)
    c.setLineWidth(1.2)
    c.line(left, top - 4 * mm, right, top - 4 * mm)

    columns = 2 if len(items) <= 24 else 3
    rows = (len(items) + columns - 1) // columns
    area_top = top - 14 * mm
    area_bottom = 19 * mm
    row_height = min(11 * mm, (area_top - area_bottom) / max(rows, 1))
    gap = 6 * mm
    column_width = (right - left - gap * (columns - 1)) / columns

    for index, (chapter, subunit, stage, num_str, _) in enumerate(items):
        column = index // rows
        row = index % rows
        x = left + column * (column_width + gap)
        y = area_top - (row + 1) * row_height

        c.setFillColorRGB(0.96, 0.97, 0.99) if row % 2 == 0 else c.setFillColorRGB(1, 1, 1)
        c.rect(x, y, column_width, row_height, stroke=0, fill=1)

        c.setFillColorRGB(0.18, 0.18, 0.18)
        c.setFont("HYSMyeongJo-Medium", 8.5)
        clean_sub = subunit.split(" ", 1)[-1] if " " in subunit else subunit
        short_stage = stage[:4]
        c.drawString(x + 2 * mm, y + 3.5 * mm, f"{clean_sub} {short_stage} {num_str}번")

        num_int = int(num_str) if num_str.isdigit() else None
        keys = [
            f"{chapter}/{subunit}/{stage}/{num_str}",
            f"{chapter}/{subunit}/{stage}/{num_int}" if num_int is not None else None,
            f"{chapter}/{subunit}/{stage}/{num_int:04d}" if num_int is not None else None,
        ]
        ans = next((answers[k] for k in keys if k and k in answers), "해설참조")
        c.drawRightString(x + column_width - 2 * mm, y + 3.5 * mm, str(ans))

    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.setFont("HYSMyeongJo-Medium", 7.5)
    c.drawString(left, 13.5 * mm, TEXTBOOKS["blacklabel-middle-2-2"]["answer_source"])
    draw_footer(c, page_number, page_width, academy_name)


def create_blacklabel_pdf(
    student: str,
    grade: str,
    items: list[tuple[str, str, str, str, bytes]],
    answers: dict[str, str],
    cover_options: dict | None = None,
    textbook: str = "blacklabel-middle-2-2",
) -> bytes:
    opts = cover_options or {}
    include_cover = opts.get("include_cover", True)
    academy_name = opts.get("academy_name") or "다산미래학원"
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    if include_cover:
        opts_with_prob = dict(opts)
        opts_with_prob.setdefault("total_problems", len(items))
        draw_cover(c, student, grade, width, height, textbook, opts_with_prob)
        c.showPage()

    side, bottom, gap = 10 * mm, 14 * mm, 5 * mm
    cell_w = (width - side * 2 - gap) / 2
    cell_h = (height - 10 * mm - bottom - gap) / 2
    boxes = [
        (side, bottom + cell_h + gap),
        (side + cell_w + gap, bottom + cell_h + gap),
        (side, bottom),
        (side + cell_w + gap, bottom),
    ]

    total_prob_pages = (len(items) + 3) // 4
    for p in range(total_prob_pages):
        chunk = items[p * 4 : (p + 1) * 4]
        for idx, (chapter, subunit, stage, num_str, data) in enumerate(chunk):
            x, y = boxes[idx]
            c.roundRect(x, y, cell_w, cell_h, 2 * mm)
            c.setFont("HYSMyeongJo-Medium", 8.5)
            disp_unit = subunit if subunit and subunit != "-" else chapter.replace("_", " ")
            c.drawString(x + 3 * mm, y + cell_h - 5.5 * mm, f"[{disp_unit}] {stage} {num_str}번")
            reader = pdf_image_reader(data, 900, 1150)
            iw, ih = reader.getSize()
            available_w, available_h = cell_w - 6 * mm, cell_h - 14 * mm
            scale = min(available_w / iw, available_h / ih)
            dw, dh = iw * scale, ih * scale
            c.drawImage(reader, x + (cell_w - dw) / 2, y + cell_h - 9.5 * mm - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, p + 1, width, academy_name)
        c.showPage()

    if answers:
        answer_chunks = [items[i:i + 48] for i in range(0, len(items), 48)]
        for chunk_idx, chunk in enumerate(answer_chunks, start=1):
            draw_blacklabel_answer_page(
                c, chunk, answers, total_prob_pages + chunk_idx, width, height, chunk_idx, len(answer_chunks), academy_name
            )
            if chunk_idx < len(answer_chunks):
                c.showPage()

    c.save()
    return output.getvalue()


CONCEPT_STAGE_SLUGS = {
    "01_개념익히기": "concept",
    "01_개념익히기_1": "concept1",
    "01_개념익히기_2": "concept2",
    "02_핵심유형": "type",
    "02_핵심유형_1": "type1",
    "02_핵심유형_2": "type2",
    "03_실력UP문제": "power",
    "04_실전테스트": "test",
}


def load_concept_image(supabase_url: str, secret_key: str, bucket: str, chapter: str, subunit: str, stage: str, number_str: str, textbook: str = "concept-middle-2-2") -> bytes:
    headers = {"apikey": secret_key}
    num = int(number_str) if number_str.isdigit() else None
    candidates: list[str] = []
    if num is not None:
        candidates.append(f"{num:04d}.png")
        candidates.append(f"{num}.png")
    candidates.append(f"{number_str}.png")
    if num is not None:
        candidates.append(f"{num}-1.png")

    if textbook == "concept-middle-3-1":
        c_slug = "ch" + chapter[:2]
        s_slug = "finish" if "마무리" in stage else "type"
        for filename in candidates:
            object_path = urllib.parse.quote(f"{bucket}/concept-middle-3-1/{c_slug}/{s_slug}/{filename}", safe="/")
            try:
                return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
            except urllib.error.HTTPError as err:
                if err.code in (400, 404):
                    continue
                raise
        clean_ch = chapter.replace("_", " ")
        clean_stg = stage.replace("_", " ")
        raise ValueError(f"개념유형(파워) 문제 이미지를 찾을 수 없습니다: [{clean_ch} > {clean_stg}] {number_str}번")

    c_slug = "ch" + chapter[:2]
    sub_slug = "sub" + subunit[:2]
    s_slug = CONCEPT_STAGE_SLUGS.get(stage, stage)

    for filename in candidates:
        object_path = urllib.parse.quote(f"{bucket}/concept-middle-2-2/{c_slug}/{sub_slug}/{s_slug}/{filename}", safe="/")
        try:
            return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
        except urllib.error.HTTPError as err:
            if err.code in (400, 404):
                continue
            raise
    clean_sub = subunit.replace("_", " ")
    clean_stg = stage.replace("_", " ")
    raise ValueError(f"개념유형파워 문제 이미지를 찾을 수 없습니다: [{clean_sub} > {clean_stg}] {number_str}번 (해당 단계의 제공 번호를 확인해 주세요)")


def create_concept_pdf(
    student: str,
    grade: str,
    items: list[tuple[str, str, str, str, bytes]],
    cover_options: dict | None = None,
    textbook: str = "concept-middle-2-2",
) -> bytes:
    opts = cover_options or {}
    include_cover = opts.get("include_cover", True)
    academy_name = opts.get("academy_name") or "다산미래학원"
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    if include_cover:
        opts_with_prob = dict(opts)
        opts_with_prob.setdefault("total_problems", len(items))
        draw_cover(c, student, grade, width, height, textbook, opts_with_prob)
        c.showPage()

    concept_items = [it for it in items if "개념익히기" in it[2] or "01_개념" in it[2]]
    grid_items = [it for it in items if "개념익히기" not in it[2] and "01_개념" not in it[2]]

    current_page = 1
    side, bottom, gap = 10 * mm, 14 * mm, 5 * mm

    if concept_items:
        groups = [concept_items[i:i + 4] for i in range(0, len(concept_items), 4)]
        cell_h = (height - 10 * mm - bottom - gap * 3) / 4
        box_w = width - side * 2
        for group in groups:
            for idx, (chapter, subunit, stage, num_str, data) in enumerate(group):
                y = height - 10 * mm - (idx + 1) * cell_h - idx * gap
                c.roundRect(side, y, box_w, cell_h, 2 * mm)
                c.setFont("HYSMyeongJo-Medium", 8.5)
                clean_sub = subunit.replace("_", " ")
                clean_stg = stage.replace("_", " ")
                c.drawString(side + 3 * mm, y + cell_h - 5.3 * mm, f"[{clean_sub}] {clean_stg}")
                c.drawRightString(side + box_w - 3 * mm, y + cell_h - 5.3 * mm, f"No. {num_str}")
                reader = pdf_image_reader(data, 1550, 650)
                iw, ih = reader.getSize()
                scale = min((box_w - 6 * mm) / iw, (cell_h - 12 * mm) / ih)
                dw, dh = iw * scale, ih * scale
                c.drawImage(reader, side + 3 * mm, y + cell_h - 9 * mm - dh, dw, dh, preserveAspectRatio=True)
            draw_footer(c, current_page, width, academy_name)
            c.showPage()
            current_page += 1

    if grid_items:
        groups = [grid_items[i:i + 4] for i in range(0, len(grid_items), 4)]
        cell_w = (width - side * 2 - gap) / 2
        cell_h = (height - 10 * mm - bottom - gap) / 2
        boxes = [
            (side, bottom + cell_h + gap),
            (side + cell_w + gap, bottom + cell_h + gap),
            (side, bottom),
            (side + cell_w + gap, bottom),
        ]
        for group in groups:
            for idx, (chapter, subunit, stage, num_str, data) in enumerate(group):
                x, y = boxes[idx]
                c.roundRect(x, y, cell_w, cell_h, 2 * mm)
                c.setFont("HYSMyeongJo-Medium", 8.5)
                clean_sub = subunit.replace("_", " ")
                clean_stg = stage.replace("_", " ")
                c.drawString(x + 3 * mm, y + cell_h - 5.3 * mm, f"[{clean_sub}] {clean_stg}")
                c.drawRightString(x + cell_w - 3 * mm, y + cell_h - 5.3 * mm, f"No. {num_str}")
                reader = pdf_image_reader(data, 900, 1150)
                iw, ih = reader.getSize()
                available_w, available_h = cell_w - 6 * mm, cell_h - 14 * mm
                scale = min(available_w / iw, available_h / ih)
                dw, dh = iw * scale, ih * scale
                c.drawImage(reader, x + 3 * mm, y + cell_h - 9 * mm - dh, dw, dh, preserveAspectRatio=True)
            draw_footer(c, current_page, width, academy_name)
            c.showPage()
            current_page += 1

    c.save()
    return output.getvalue()


BASIC_SSEN_CHAPTER_SLUGS = {
    "I. 도형의 성질": "ch1",
    "II. 도형의 닮음": "ch2",
    "III. 피타고라스 정리": "ch3",
    "IV. 확률": "ch4",
}


def basic_ssen_stage_slug(stage: str) -> str:
    if "기본&핵심유형 1" in stage:
        return "basic1"
    if "기본&핵심유형 2" in stage:
        return "basic2"
    if "기본&핵심유형 3" in stage:
        return "basic3"
    if "학교시험기출" in stage:
        return "school"
    return stage


def load_basic_ssen_image(
    supabase_url: str,
    secret_key: str,
    bucket: str,
    chapter: str,
    subunit: str,
    stage: str,
    number_str: str,
) -> bytes:
    num = int(number_str) if number_str.isdigit() else None
    filename = f"{num:04d}.png" if num is not None else f"{number_str}.png"

    # Local-first fast resolution
    local_source = Path(r"D:\중등부교재작업\중2학년2학기\베이직쎈\문제모음_인쇄용") / chapter / subunit / stage / filename
    if local_source.is_file():
        try:
            return local_source.read_bytes()
        except Exception:
            pass

    c_slug = BASIC_SSEN_CHAPTER_SLUGS.get(chapter, "ch1")
    sub_slug = "sub" + subunit.strip().split()[0]
    s_slug = basic_ssen_stage_slug(stage)

    candidates = [filename]
    if num is not None:
        candidates.extend([f"{num}.png", f"{num:02d}.png"])

    headers = {"apikey": secret_key}
    for cand in candidates:
        object_path = urllib.parse.quote(f"{bucket}/basic-ssen-middle-2-2/{c_slug}/{sub_slug}/{s_slug}/{cand}", safe="/")
        try:
            return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
        except urllib.error.HTTPError as err:
            if err.code in (400, 404):
                continue
            raise
    clean_sub = subunit.replace("_", " ")
    clean_stg = stage.replace("_", " ")
    raise ValueError(f"베이직쎈 문제 이미지를 찾을 수 없습니다: [{clean_sub} > {clean_stg}] {number_str}번 (해당 단계의 제공 번호를 확인해 주세요)")


def create_basic_ssen_pdf(
    student: str,
    grade: str,
    items: list[tuple[str, str, str, str, bytes]],
    cover_options: dict | None = None,
) -> bytes:
    opts = cover_options or {}
    include_cover = opts.get("include_cover", True)
    academy_name = opts.get("academy_name") or "다산미래학원"
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    if include_cover:
        opts_with_prob = dict(opts)
        opts_with_prob.setdefault("total_problems", len(items))
        draw_cover(c, student, grade, width, height, "basic-ssen-middle-2-2", opts_with_prob)
        c.showPage()

    current_page = 1
    side, bottom, gap = 10 * mm, 14 * mm, 5 * mm
    groups = [items[i:i + 4] for i in range(0, len(items), 4)]
    cell_w = (width - side * 2 - gap) / 2
    cell_h = (height - 10 * mm - bottom - gap) / 2
    boxes = [
        (side, bottom + cell_h + gap),
        (side + cell_w + gap, bottom + cell_h + gap),
        (side, bottom),
        (side + cell_w + gap, bottom),
    ]
    for group in groups:
        for idx, (chapter, subunit, stage, num_str, data) in enumerate(group):
            x, y = boxes[idx]
            c.roundRect(x, y, cell_w, cell_h, 2 * mm)
            c.setFont("HYSMyeongJo-Medium", 8.5)
            clean_sub = subunit.replace("_", " ")
            clean_stg = stage.replace("_", " ")
            c.drawString(x + 3 * mm, y + cell_h - 5.3 * mm, f"[{clean_sub}] {clean_stg}")
            c.drawRightString(x + cell_w - 3 * mm, y + cell_h - 5.3 * mm, f"No. {num_str}")
            reader = pdf_image_reader(data, 900, 1150)
            iw, ih = reader.getSize()
            available_w, available_h = cell_w - 6 * mm, cell_h - 14 * mm
            scale = min(available_w / iw, available_h / ih)
            dw, dh = iw * scale, ih * scale
            c.drawImage(reader, x + 3 * mm, y + cell_h - 9 * mm - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, current_page, width, academy_name)
        c.showPage()
        current_page += 1

    c.save()
    return output.getvalue()


class handler(BaseHTTPRequestHandler):
    def send_json_data(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status: int, message: str) -> None:
        self.send_json_data(status, {"error": message})

    def do_GET(self):
        body = json.dumps(
            {"status": "ok", "textbooks": sorted(TEXTBOOKS)},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
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
                return self.send_json(401, "로그인이 필요합니다.")
            user = verify_user(supabase_url, publishable_key, auth[7:])
            user_id = str(user.get("id", ""))
            if not user_id:
                raise ValueError("로그인 사용자 정보를 확인할 수 없습니다.")
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            student = str(payload.get("student", "")).strip()
            grade = str(payload.get("grade", "")).strip()
            textbook = str(payload.get("textbook", ""))
            if not student or grade not in {"1학년", "2학년", "3학년"}:
                raise ValueError("학생 이름과 학년을 확인해 주세요.")
            if textbook not in TEXTBOOKS:
                raise ValueError("지원하지 않는 교재입니다.")

            # Cover & Styling options
            include_cover = payload.get("includeCover", True)
            if isinstance(include_cover, str):
                include_cover = include_cover.lower() not in ("false", "0", "no")
            else:
                include_cover = bool(include_cover)

            include_character = payload.get("includeCharacter", True)
            if isinstance(include_character, str):
                include_character = include_character.lower() not in ("false", "0", "no")
            else:
                include_character = bool(include_character)

            cover_title = payload.get("coverTitle") or None
            academy_name = payload.get("academyName") or "다산미래학원"
            cover_subtitle = payload.get("coverSubtitle") or None
            test_date = payload.get("testDate") or None
            custom_character_str = payload.get("customCharacter")
            custom_character_bytes = None
            if custom_character_str and isinstance(custom_character_str, str):
                try:
                    if "," in custom_character_str:
                        custom_character_str = custom_character_str.split(",", 1)[1]
                    custom_character_bytes = base64.b64decode(custom_character_str)
                except Exception as e:
                    print("[-] Failed to decode customCharacter:", e)

            cover_options = {
                "include_cover": include_cover,
                "include_character": include_character,
                "title": cover_title,
                "academy_name": academy_name,
                "subtitle": cover_subtitle,
                "date_str": test_date,
                "custom_character_bytes": custom_character_bytes,
                "department": payload.get("department"),
            }

            # Student(s) parsing (support single student or batch list)
            is_preview = bool(payload.get("preview", False))
            is_batch_req = bool(payload.get("isBatch", False))
            raw_students = payload.get("studentNames")
            student_list: list[str] = []
            if raw_students:
                if isinstance(raw_students, str):
                    student_list = [n.strip() for n in raw_students.replace(",", "\n").split("\n") if n.strip()]
                elif isinstance(raw_students, list):
                    student_list = [str(n).strip() for n in raw_students if str(n).strip()]

            if not student_list:
                single_s = str(payload.get("student", "")).strip()
                if not single_s:
                    raise ValueError("학생 이름을 입력해 주세요.")
                student_list = [single_s]

            seen = set()
            unique_students: list[str] = []
            for s in student_list:
                if s not in seen:
                    unique_students.append(s)
                    seen.add(s)

            if not unique_students:
                raise ValueError("학생 이름을 1명 이상 입력해 주세요.")

            is_batch = (len(unique_students) > 1 and not is_preview and is_batch_req)

            if textbook == "olympus-calculus":
                raw_items = payload.get("olympusItems")
                if not isinstance(raw_items, list) or not raw_items:
                    raise ValueError("올림포스 문제를 목록에 추가해 주세요.")
                olympus_items = []
                total = 0
                for item in raw_items:
                    if not isinstance(item, dict):
                        raise ValueError("올림포스 입력 목록을 확인해 주세요.")
                    unit = str(item.get("unit", ""))
                    problem_type = str(item.get("problemType", ""))
                    if unit not in OLYMPUS_UNITS or problem_type not in OLYMPUS_TYPES:
                        raise ValueError("올림포스 단원과 문제유형을 확인해 주세요.")
                    numbers = parse_numbers(str(item.get("numbers", "")))
                    total += len(numbers)
                    if total > 100:
                        raise ValueError("전체 목록에서 최대 100문제까지 만들 수 있습니다.")
                    images = load_olympus_images(supabase_url, secret_key, bucket, unit, problem_type, numbers)
                    olympus_items.extend((unit, problem_type, number, data) for number, data in images)
                olympus_answers = load_olympus_answers(supabase_url, secret_key, bucket)

                def make_pdf(st: str) -> bytes:
                    return create_olympus_pdf(st, grade, olympus_items, olympus_answers, cover_options)

            elif textbook in ("blacklabel-middle-2-2", "blacklabel-middle-3-1"):
                raw_items = payload.get("blacklabelItems")
                if not isinstance(raw_items, list) or not raw_items:
                    raise ValueError("블랙라벨 문제를 목록에 추가해 주세요.")
                blacklabel_items = []
                total = 0
                for item in raw_items:
                    if not isinstance(item, dict):
                        raise ValueError("블랙라벨 입력 목록을 확인해 주세요.")
                    chapter = str(item.get("chapter", "")).strip()
                    subunit = str(item.get("subunit", "")).strip()
                    stage = str(item.get("stage", "")).strip()
                    tokens = parse_problem_tokens(str(item.get("numbers", "")))
                    total += len(tokens)
                    if total > 100:
                        raise ValueError("전체 목록에서 최대 100문제까지 만들 수 있습니다.")
                    for num_str in tokens:
                        data = load_blacklabel_image(supabase_url, secret_key, bucket, chapter, subunit, stage, num_str, textbook=textbook)
                        blacklabel_items.append((chapter, subunit, stage, num_str, data))
                blacklabel_answers = load_blacklabel_answers(supabase_url, secret_key, bucket) if textbook == "blacklabel-middle-2-2" else {}

                def make_pdf(st: str) -> bytes:
                    return create_blacklabel_pdf(st, grade, blacklabel_items, blacklabel_answers, cover_options, textbook=textbook)

            elif textbook in ("concept-middle-2-2", "concept-middle-3-1"):
                raw_items = payload.get("conceptItems")
                if not isinstance(raw_items, list) or not raw_items:
                    raise ValueError("개념유형파워 문제를 목록에 추가해 주세요.")
                concept_items = []
                total = 0
                for item in raw_items:
                    if not isinstance(item, dict):
                        raise ValueError("개념유형파워 입력 목록을 확인해 주세요.")
                    chapter = str(item.get("chapter", "")).strip()
                    subunit = str(item.get("subunit", "")).strip()
                    stage = str(item.get("stage", "")).strip()
                    tokens = parse_problem_tokens(str(item.get("numbers", "")))
                    total += len(tokens)
                    if total > 100:
                        raise ValueError("전체 목록에서 최대 100문제까지 만들 수 있습니다.")
                    for num_str in tokens:
                        data = load_concept_image(supabase_url, secret_key, bucket, chapter, subunit, stage, num_str, textbook=textbook)
                        concept_items.append((chapter, subunit, stage, num_str, data))

                def make_pdf(st: str) -> bytes:
                    return create_concept_pdf(st, grade, concept_items, cover_options, textbook=textbook)

            elif textbook == "basic-ssen-middle-2-2":
                raw_items = payload.get("basicSsenItems")
                if not isinstance(raw_items, list) or not raw_items:
                    raise ValueError("베이직쎈 문제를 목록에 추가해 주세요.")
                basic_ssen_items = []
                total = 0
                for item in raw_items:
                    if not isinstance(item, dict):
                        raise ValueError("베이직쎈 입력 목록을 확인해 주세요.")
                    chapter = str(item.get("chapter", "")).strip()
                    subunit = str(item.get("subunit", "")).strip()
                    stage = str(item.get("stage", "")).strip()
                    tokens = parse_problem_tokens(str(item.get("numbers", "")))
                    total += len(tokens)
                    if total > 100:
                        raise ValueError("전체 목록에서 최대 100문제까지 만들 수 있습니다.")
                    for num_str in tokens:
                        data = load_basic_ssen_image(supabase_url, secret_key, bucket, chapter, subunit, stage, num_str)
                        basic_ssen_items.append((chapter, subunit, stage, num_str, data))

                def make_pdf(st: str) -> bytes:
                    return create_basic_ssen_pdf(st, grade, basic_ssen_items, cover_options)

            else:
                numbers = parse_numbers(str(payload.get("numbers", "")))
                images = load_images(supabase_url, secret_key, bucket, textbook, numbers)
                selected_answers = None
                if textbook == "synergy-algebra":
                    selected_answers = load_synergy_algebra_answers(supabase_url, secret_key, bucket, numbers)
                elif textbook not in ("gojaengi-common-math-2", "ssen-middle-2-2", "ssen-middle-3-1"):
                    all_answers = load_quick_answers(supabase_url, secret_key, bucket, textbook)
                    missing_answers = [number for number in numbers if number not in all_answers]
                    if missing_answers:
                        listed = ", ".join(f"{number:04d}" for number in missing_answers)
                        raise ValueError(f"빠른정답에 없는 문제번호입니다: {listed}")
                    selected_answers = {number: all_answers[number] for number in numbers}

                def make_pdf(st: str) -> bytes:
                    result = create_pdf(st, grade, images, selected_answers, textbook, cover_options)
                    if textbook == "ssen-middle-2-2":
                        result = append_ssen_selected_answers(result, numbers)
                    return result

            title_label = cover_title or TEXTBOOKS.get(textbook, {}).get("title", "오답노트")

            if is_batch:
                # 인쇄는 ZIP 대신 학생별 PDF를 하나의 인쇄용 PDF로 합친다.
                if payload.get("printBatch"):
                    writer = PdfWriter()
                    for st_name in unique_students:
                        for page in PdfReader(BytesIO(make_pdf(st_name))).pages:
                            writer.add_page(page)
                    print_buffer = BytesIO()
                    writer.write(print_buffer)
                    print_bytes = print_buffer.getvalue()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/pdf")
                    self.send_header("Content-Disposition", 'inline; filename="wrong-answer-notes-print.pdf"')
                    self.send_header("Content-Length", str(len(print_bytes)))
                    self.end_headers()
                    self.wfile.write(print_bytes)
                    log_usage_event(
                        supabase_url, secret_key, user_id, "print_started", textbook,
                        len(numbers), len(unique_students), {"mode": "batch"},
                    )
                    return

                zip_buffer = BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                    for idx, st_name in enumerate(unique_students):
                        safe_name = "".join(c for c in st_name if c.isalnum() or c in (" ", "_", "-")).strip() or f"학생{idx+1}"
                        pdf_data = make_pdf(st_name)
                        zf.writestr(f"{safe_name}_{title_label}_오답노트.pdf", pdf_data)

                zip_bytes = zip_buffer.getvalue()
                zip_filename = f"{title_label}_학생별_오답노트_모음.zip"
                if len(zip_bytes) > 4_300_000:
                    download_url = upload_temporary_file(
                        supabase_url, secret_key, bucket, zip_bytes, "application/zip", "zip"
                    )
                    if not is_preview:
                        log_usage_event(
                            supabase_url, secret_key, user_id, "pdf_generated", textbook,
                            len(numbers), len(unique_students), {"format": "zip"},
                        )
                    return self.send_json_data(
                        200,
                        {
                            "downloadUrl": download_url,
                            "expiresIn": 1800,
                            "filename": zip_filename,
                        },
                    )
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                encoded_zip_name = urllib.parse.quote(zip_filename)
                self.send_header(
                    "Content-Disposition",
                    f'attachment; filename="{encoded_zip_name}"; filename*=UTF-8\'\'{encoded_zip_name}',
                )
                self.send_header("Access-Control-Expose-Headers", "Content-Disposition, Content-Type")
                self.send_header("Content-Length", str(len(zip_bytes)))
                self.end_headers()
                self.wfile.write(zip_bytes)
                if not is_preview:
                    log_usage_event(
                        supabase_url, secret_key, user_id, "pdf_generated", textbook,
                        len(numbers), len(unique_students), {"format": "zip"},
                    )
                return

            pdf = make_pdf(unique_students[0])
            if len(pdf) > 4_300_000:
                download_url = upload_temporary_pdf(supabase_url, secret_key, bucket, pdf)
                if not is_preview:
                    log_usage_event(
                        supabase_url, secret_key, user_id,
                        "print_started" if payload.get("printBatch") else "pdf_generated",
                        textbook, len(numbers), 1, {"format": "pdf", "temporary": True},
                    )
                return self.send_json_data(
                    200,
                    {
                        "downloadUrl": download_url,
                        "expiresIn": 1800,
                    },
                )
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", 'attachment; filename="wrong-answer-note.pdf"')
            self.send_header("Content-Length", str(len(pdf)))
            self.end_headers()
            self.wfile.write(pdf)
            if not is_preview:
                log_usage_event(
                    supabase_url, secret_key, user_id,
                    "print_started" if payload.get("printBatch") else "pdf_generated",
                    textbook, len(numbers), 1, {"format": "pdf"},
                )
        except KeyError:
            self.send_json(503, "서버 연결 설정이 아직 완료되지 않았습니다.")
        except urllib.error.HTTPError as error:
            err_msg = "로그인 또는 저장소 접근을 확인해 주세요."
            try:
                err_body = json.loads(error.read().decode("utf-8", errors="ignore"))
                if err_body.get("message"):
                    err_msg = err_body["message"]
            except Exception:
                pass
            self.send_json(401 if error.code in (401, 403) else 502, err_msg)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, str(error))
        except Exception as err:
            self.send_json(500, f"PDF 생성 중 오류가 발생했습니다: {err}")
