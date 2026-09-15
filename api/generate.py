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

from PIL import Image
from pypdf import PdfReader
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
}

OLYMPUS_UNITS = {
    "1. 함수의 극한": "unit-1",
    "2. 함수의 연속": "unit-2",
    "3. 미분계수와 도함수": "unit-3",
    "4. 도함수의 활용": "unit-4",
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
        match = re.fullmatch(r"(\d+)\s*~\s*(\d+)", token)
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


def request_bytes(url: str, headers: dict[str, str]) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def upload_temporary_pdf(
    supabase_url: str,
    secret_key: str,
    bucket: str,
    pdf: bytes,
) -> str:
    """Upload a large PDF and return a short-lived private download URL."""
    object_name = f"temporary-pdfs/{uuid.uuid4().hex}.pdf"
    object_path = urllib.parse.quote(f"{bucket}/{object_name}", safe="/")
    upload_request = urllib.request.Request(
        f"{supabase_url}/storage/v1/object/{object_path}",
        data=pdf,
        headers={
            "apikey": secret_key,
            "Content-Type": "application/pdf",
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
        try:
            urllib.request.urlopen(delete_request, timeout=10).close()
        except Exception:
            pass
        raise

    signed_path = signed.get("signedURL") or signed.get("signedUrl")
    if not isinstance(signed_path, str) or not signed_path:
        raise ValueError("임시 PDF 다운로드 주소를 만들지 못했습니다.")
    if signed_path.startswith("http://") or signed_path.startswith("https://"):
        return signed_path
    if signed_path.startswith("/object/"):
        return f"{supabase_url}/storage/v1{signed_path}"
    return f"{supabase_url}{signed_path if signed_path.startswith('/') else '/' + signed_path}"


def pdf_image_reader(data: bytes, max_width: int, max_height: int) -> ImageReader:
    """Resize only the PDF-embedded copy and encode it compactly for downloads."""
    with Image.open(BytesIO(data)) as source:
        image = source.convert("RGB")
        image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
        compact = BytesIO()
        image.save(compact, format="JPEG", quality=82, optimize=True, progressive=True)
    compact.seek(0)
    return ImageReader(compact)


def verify_user(supabase_url: str, publishable_key: str, token: str) -> None:
    request_bytes(f"{supabase_url}/auth/v1/user", {"apikey": publishable_key, "Authorization": f"Bearer {token}"})


def load_images(supabase_url: str, secret_key: str, bucket: str, textbook: str, numbers: list[int]) -> list[tuple[int, bytes]]:
    images = []
    # Modern sb_secret_ keys are API keys, not JWTs. Send them only as apikey.
    headers = {"apikey": secret_key}
    for number in numbers:
        object_path = urllib.parse.quote(f"{bucket}/{textbook}/{number:04d}.png", safe="/")
        url = f"{supabase_url}/storage/v1/object/authenticated/{object_path}"
        try:
            data = request_bytes(url, headers)
            Image.open(BytesIO(data)).verify()
            images.append((number, data))
        except urllib.error.HTTPError as error:
            if error.code == 404:
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
            if error.code == 404:
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
    if "미적분" in title or "calculus" in textbook:
        badge_text = "고등 수학 영역  |  미적분"
        eng_sub = "SYNERGY CALCULUS CUSTOM TEST" if "시너지" in title else "CALCULUS CUSTOM TEST"
    elif "공통수학" in title:
        badge_text = "고등 수학 영역  |  공통수학2"
        eng_sub = "COMMON MATHEMATICS II CUSTOM TEST"
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

    # 1-1. Center Mascot / Logo Stage
    if include_character:
        c.setFillColorRGB(0.94, 0.965, 1.0)
        c.setStrokeColorRGB(*C_BORDER)
        c.setLineWidth(0.8)
        c.circle(center_x, slot_center_y, 74, stroke=1, fill=1)

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
            candidates = [
                os.path.join(base_dir, "character.png"),
                os.path.join(base_dir, "dasan-mirae-logo.png"),
                os.path.join(base_dir, "..", "public", "character.png"),
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
                max_w, max_h = 88.0, 112.0
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
    info_items = [
        ("학 생 성 명", f"{student_name} 학생", True),
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
            c.setFont(font_name, 13)
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


def draw_answer_page(c: canvas.Canvas, numbers: list[int], answers: dict[int, str], page_number: int, page_width: float, page_height: float, textbook: str, academy_name: str = "다산미래학원") -> None:
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
        c.drawRightString(x + column_width - 3 * mm, y + (row_height - 12) / 2 + 1, answers[number])

    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.setFont("HYSMyeongJo-Medium", 7.5)
    c.drawString(left, 13.5 * mm, TEXTBOOKS[textbook]["answer_source"])
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
            label_number = f"{number:04d}" if textbook == "ssen-middle-2-2" else str(number)
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
    normal_items = [item for item in items if item[1] != "고난도도전"]
    wide_items = [item for item in items if item[1] == "고난도도전"]
    groups = [normal_items[i:i + 4] for i in range(0, len(normal_items), 4)]
    groups.extend(wide_items[i:i + 4] for i in range(0, len(wide_items), 4))
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
            c.drawImage(reader, x + (box_w - dw) / 2, y + box_h - 10 * mm - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, page_index, width, academy_name)
        c.showPage()
    selected = [
        (unit, problem_type, number, answers.get((int(unit.split(".", 1)[0]), problem_type, number)))
        for unit, problem_type, number, _ in normal_items + wide_items
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


def load_blacklabel_image(supabase_url: str, secret_key: str, bucket: str, chapter: str, subunit: str, stage: str, number_str: str) -> bytes:
    headers = {"apikey": secret_key}
    c_slug = BLACKLABEL_CHAPTER_SLUGS.get(chapter, "ch1")
    sub_slug = "sub" + subunit.strip().split()[0]
    s_slug = BLACKLABEL_STAGE_SLUGS.get(stage, "must")

    num = int(number_str) if number_str.isdigit() else None
    candidates: list[str] = []
    if num is not None:
        candidates.append(f"{num:04d}.png")
        candidates.append(f"{num}.png")
        candidates.append(f"{num:02d}.png")
    candidates.append(f"{number_str}.png")
    if num is not None:
        candidates.append(f"{num}-1.png")

    for filename in candidates:
        object_path = urllib.parse.quote(f"{bucket}/blacklabel-middle-2-2/{c_slug}/{sub_slug}/{s_slug}/{filename}", safe="/")
        try:
            return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                continue
            raise
    raise ValueError(f"블랙라벨 문제 이미지를 찾을 수 없습니다: [{subunit}] {stage} {number_str}번")


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
        draw_cover(c, student, grade, width, height, "blacklabel-middle-2-2", opts_with_prob)
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
            c.drawString(x + 3 * mm, y + cell_h - 5.5 * mm, f"[{subunit}] {stage} {num_str}번")
            reader = pdf_image_reader(data, 900, 1150)
            iw, ih = reader.getSize()
            available_w, available_h = cell_w - 6 * mm, cell_h - 14 * mm
            scale = min(available_w / iw, available_h / ih)
            dw, dh = iw * scale, ih * scale
            c.drawImage(reader, x + (cell_w - dw) / 2, y + cell_h - 9.5 * mm - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, p + 1, width, academy_name)
        c.showPage()

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


def load_concept_image(supabase_url: str, secret_key: str, bucket: str, chapter: str, subunit: str, stage: str, number_str: str) -> bytes:
    headers = {"apikey": secret_key}
    c_slug = "ch" + chapter[:2]
    sub_slug = "sub" + subunit[:2]
    s_slug = CONCEPT_STAGE_SLUGS.get(stage, stage)

    num = int(number_str) if number_str.isdigit() else None
    candidates: list[str] = []
    if num is not None:
        candidates.append(f"{num:04d}.png")
        candidates.append(f"{num}.png")
    candidates.append(f"{number_str}.png")
    if num is not None:
        candidates.append(f"{num}-1.png")

    for filename in candidates:
        object_path = urllib.parse.quote(f"{bucket}/concept-middle-2-2/{c_slug}/{sub_slug}/{s_slug}/{filename}", safe="/")
        try:
            return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                continue
            raise
    raise ValueError(f"개념유형파워 문제 이미지를 찾을 수 없습니다: [{subunit} > {stage}] {number_str}번")


def create_concept_pdf(
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
        draw_cover(c, student, grade, width, height, "concept-middle-2-2", opts_with_prob)
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
            verify_user(supabase_url, publishable_key, auth[7:])
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
            }

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
                pdf = create_olympus_pdf(student, grade, olympus_items, olympus_answers, cover_options)
            elif textbook == "blacklabel-middle-2-2":
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
                        data = load_blacklabel_image(supabase_url, secret_key, bucket, chapter, subunit, stage, num_str)
                        blacklabel_items.append((chapter, subunit, stage, num_str, data))
                blacklabel_answers = load_blacklabel_answers(supabase_url, secret_key, bucket)
                pdf = create_blacklabel_pdf(student, grade, blacklabel_items, blacklabel_answers, cover_options)
            elif textbook == "concept-middle-2-2":
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
                        data = load_concept_image(supabase_url, secret_key, bucket, chapter, subunit, stage, num_str)
                        concept_items.append((chapter, subunit, stage, num_str, data))
                pdf = create_concept_pdf(student, grade, concept_items, cover_options)
            else:
                numbers = parse_numbers(str(payload.get("numbers", "")))
                images = load_images(supabase_url, secret_key, bucket, textbook, numbers)
                selected_answers = None
                if textbook not in ("gojaengi-common-math-2", "ssen-middle-2-2"):
                    all_answers = load_quick_answers(supabase_url, secret_key, bucket, textbook)
                    missing_answers = [number for number in numbers if number not in all_answers]
                    if missing_answers:
                        listed = ", ".join(f"{number:04d}" for number in missing_answers)
                        raise ValueError(f"빠른정답에 없는 문제번호입니다: {listed}")
                    selected_answers = {number: all_answers[number] for number in numbers}
                pdf = create_pdf(student, grade, images, selected_answers, textbook, cover_options)
            if len(pdf) > 4_300_000:
                download_url = upload_temporary_pdf(supabase_url, secret_key, bucket, pdf)
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
        except KeyError:
            self.send_json(503, "서버 연결 설정이 아직 완료되지 않았습니다.")
        except urllib.error.HTTPError as error:
            self.send_json(401 if error.code in (401, 403) else 502, "로그인 또는 저장소 접근을 확인해 주세요.")
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, str(error))
        except Exception:
            self.send_json(500, "PDF 생성 중 오류가 발생했습니다.")
