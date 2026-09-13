from http.server import BaseHTTPRequestHandler
from io import BytesIO
import json
import math
import os
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


def draw_common_math_2_cover(c: canvas.Canvas, student: str, grade: str, page_width: float, page_height: float) -> None:
    """Reproduce the approved Common Mathematics 2 cover from the local generator."""
    charcoal = (0.08, 0.18, 0.17)
    emerald = (0.08, 0.48, 0.38)
    mint = (0.25, 0.72, 0.59)
    orange = (0.95, 0.48, 0.20)
    plum = (0.55, 0.25, 0.47)
    gold = (0.94, 0.68, 0.18)

    c.setFillColorRGB(0.975, 0.992, 0.982)
    c.rect(0, 0, page_width, page_height, stroke=0, fill=1)

    c.saveState()
    c.setStrokeColorRGB(0.79, 0.91, 0.85)
    c.setLineWidth(0.25)
    for x in range(-20, 241, 14):
        c.line(x * mm, 0, x * mm, page_height)
    for y in range(-20, 321, 14):
        c.line(0, y * mm, page_width, y * mm)

    origin_x, origin_y = 106 * mm, 250 * mm
    c.setStrokeColorRGB(*emerald)
    c.setLineWidth(1.2)
    c.line(25 * mm, origin_y, 190 * mm, origin_y)
    c.line(origin_x, 218 * mm, origin_x, 282 * mm)
    c.line(190 * mm, origin_y, 186 * mm, origin_y + 2 * mm)
    c.line(190 * mm, origin_y, 186 * mm, origin_y - 2 * mm)
    c.line(origin_x, 282 * mm, origin_x - 2 * mm, 278 * mm)
    c.line(origin_x, 282 * mm, origin_x + 2 * mm, 278 * mm)

    c.setStrokeColorRGB(*orange)
    c.setLineWidth(2.0)
    c.circle(78 * mm, 250 * mm, 18 * mm, stroke=1, fill=0)
    c.setFillColorRGB(*orange)
    c.circle(78 * mm, 250 * mm, 2.1 * mm, stroke=0, fill=1)

    c.setStrokeColorRGB(*plum)
    c.setLineWidth(1.8)
    c.line(118 * mm, 225 * mm, 180 * mm, 275 * mm)
    for x, y, color in ((132, 236, plum), (154, 254, gold), (173, 269, mint)):
        c.setFillColorRGB(*color)
        c.circle(x * mm, y * mm, 2.2 * mm, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1)
        c.circle(x * mm, y * mm, 0.8 * mm, stroke=0, fill=1)

    c.setStrokeColorRGB(*mint)
    c.setLineWidth(1.2)
    c.ellipse(28 * mm, 218 * mm, 50 * mm, 239 * mm, stroke=1, fill=0)
    c.ellipse(57 * mm, 218 * mm, 79 * mm, 239 * mm, stroke=1, fill=0)
    for source_y, target_y in ((233, 232), (228, 224)):
        c.line(44 * mm, source_y * mm, 61 * mm, target_y * mm)
    c.restoreState()

    c.setFillColorRGB(*charcoal)
    c.setFont("Helvetica-Bold", 48)
    c.setFillAlpha(0.07)
    c.drawString(21 * mm, 259 * mm, "x² + y²")
    c.setFillAlpha(1)

    center_y = 145 * mm
    c.setFillColorRGB(1, 1, 1)
    c.setFillAlpha(0.93)
    c.roundRect(19 * mm, center_y - 31 * mm, page_width - 38 * mm, 75 * mm, 7 * mm, stroke=0, fill=1)
    c.setFillAlpha(1)
    c.setFillColorRGB(*emerald)
    c.roundRect(page_width / 2 - 20 * mm, center_y + 34 * mm, 40 * mm, 4 * mm, 2 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*charcoal)
    c.setFont("HYSMyeongJo-Medium", 40)
    c.drawCentredString(page_width / 2, center_y, "시너지 공통수학2")
    c.setFillColorRGB(*plum)
    c.setFont("HYSMyeongJo-Medium", 19)
    c.drawCentredString(page_width / 2, center_y - 15 * mm, "오답을 실력으로 바꾸는 수학 기록")

    card_x, card_y, card_w, card_h = 39 * mm, 31 * mm, page_width - 78 * mm, 25 * mm
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(0.70, 0.85, 0.79)
    c.setLineWidth(0.8)
    c.roundRect(card_x, card_y, card_w, card_h, 4 * mm, stroke=1, fill=1)
    c.setFillColorRGB(0.34, 0.43, 0.40)
    c.setFont("Helvetica", 9)
    c.drawString(card_x + 9 * mm, card_y + 9.5 * mm, "STUDENT")
    c.setFillColorRGB(*charcoal)
    c.setFont("HYSMyeongJo-Medium", 14)
    c.drawRightString(card_x + card_w - 9 * mm, card_y + 8.5 * mm, f"{grade}  {student}")


def draw_ssen_middle_2_2_cover(c: canvas.Canvas, student: str, grade: str, page_width: float, page_height: float) -> None:
    navy = (0.055, 0.13, 0.24)
    blue = (0.10, 0.34, 0.62)
    cyan = (0.18, 0.67, 0.76)

    c.setFillColorRGB(0.975, 0.985, 0.995)
    c.rect(0, 0, page_width, page_height, stroke=0, fill=1)

    c.setFillColorRGB(0.92, 0.95, 0.98)
    c.circle(page_width - 25 * mm, page_height - 25 * mm, 60 * mm, stroke=0, fill=1)
    c.setFillColorRGB(0.95, 0.97, 0.99)
    c.circle(35 * mm, 45 * mm, 45 * mm, stroke=0, fill=1)

    c.setFillColorRGB(*navy)
    c.setFont("HYSMyeongJo-Medium", 30)
    c.drawString(18 * mm, page_height - 38 * mm, "중2-2 쎈수학 오답노트")

    c.setFillColorRGB(*blue)
    c.setFont("HYSMyeongJo-Medium", 13)
    c.drawString(18 * mm, page_height - 48 * mm, "개념 반복과 유형 마스터를 위한 맞춤 클리닉")

    c.setStrokeColorRGB(*cyan)
    c.setLineWidth(1.6)
    c.line(18 * mm, page_height - 54 * mm, 65 * mm, page_height - 54 * mm)

    card_x, card_y, card_w, card_h = 18 * mm, 28 * mm, page_width - 36 * mm, 46 * mm
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(0.83, 0.87, 0.92)
    c.setLineWidth(0.8)
    c.roundRect(card_x, card_y, card_w, card_h, 4 * mm, stroke=1, fill=1)

    c.setFillColorRGB(*navy)
    c.setFont("HYSMyeongJo-Medium", 14)
    c.drawString(card_x + 8 * mm, card_y + card_h - 13 * mm, f"이름: {student}")
    c.setFont("HYSMyeongJo-Medium", 11)
    c.drawString(card_x + 8 * mm, card_y + card_h - 23 * mm, f"학년: {grade}")
    c.setFillColorRGB(0.4, 0.45, 0.5)
    c.drawString(card_x + 8 * mm, card_y + 9 * mm, "강석수학 맞춤 학습 시스템")


def draw_blacklabel_middle_2_2_cover(c: canvas.Canvas, student: str, grade: str, w: float, h: float) -> None:
    bg_clean = (0.985, 0.995, 0.99)
    sky_blue = (0.05, 0.58, 0.88)
    mint_green = (0.05, 0.75, 0.55)
    lime_gold = (0.45, 0.80, 0.18)
    soft_aqua = (0.88, 0.96, 0.96)
    soft_mint = (0.90, 0.97, 0.93)
    soft_sky = (0.90, 0.95, 0.99)
    deep_teal = (0.04, 0.16, 0.24)
    sub_slate = (0.32, 0.44, 0.50)
    card_shadow = (0.88, 0.93, 0.92)

    c.setFillColorRGB(*bg_clean)
    c.rect(0, 0, w, h, stroke=0, fill=1)

    c.setFillColorRGB(*soft_mint)
    c.circle(w - 15 * mm, h - 20 * mm, 80 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*soft_sky)
    c.circle(w - 40 * mm, h - 45 * mm, 55 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*soft_aqua)
    c.circle(w - 60 * mm, h - 25 * mm, 38 * mm, stroke=0, fill=1)

    c.setFillColorRGB(*soft_sky)
    c.circle(30 * mm, 55 * mm, 60 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*soft_mint)
    c.circle(48 * mm, 35 * mm, 40 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*soft_aqua)
    c.circle(18 * mm, 75 * mm, 28 * mm, stroke=0, fill=1)

    c.setFillColorRGB(*lime_gold)
    c.circle(26 * mm, h - 22 * mm, 2.5 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*sky_blue)
    c.circle(34 * mm, h - 19 * mm, 1.8 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*mint_green)
    c.circle(42 * mm, h - 23 * mm, 2.2 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*lime_gold)
    c.circle(w - 25 * mm, 110 * mm, 2.2 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*sky_blue)
    c.circle(w - 32 * mm, 118 * mm, 1.6 * mm, stroke=0, fill=1)

    badge_x, badge_y, badge_w, badge_h = 18 * mm, h - 40 * mm, 68 * mm, 7.5 * mm
    c.setFillColorRGB(*sky_blue)
    c.roundRect(badge_x, badge_y, badge_w, badge_h, badge_h / 2, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(badge_x + badge_w / 2, badge_y + 2.0 * mm, "★ BLACKLABEL MATH CLINIC")

    c.setFillColorRGB(*deep_teal)
    c.setFont("HYSMyeongJo-Medium", 32)
    c.drawString(18 * mm, h - 56 * mm, "중2-2 블랙라벨")

    c.setFillColorRGB(*mint_green)
    c.setFont("HYSMyeongJo-Medium", 35)
    c.drawString(18 * mm, h - 70 * mm, "오답노트")

    c.setFillColorRGB(*sky_blue)
    c.rect(18 * mm, h - 77 * mm, 38 * mm, 2.4 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*mint_green)
    c.rect(58 * mm, h - 77 * mm, 24 * mm, 2.4 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*lime_gold)
    c.rect(84 * mm, h - 77 * mm, 14 * mm, 2.4 * mm, stroke=0, fill=1)
    c.setFillColorRGB(0.82, 0.90, 0.88)
    c.rect(100 * mm, h - 77 * mm, w - 118 * mm, 0.8 * mm, stroke=0, fill=1)

    c.setFont("HYSMyeongJo-Medium", 12)
    c.setFillColorRGB(*sub_slate)
    c.drawString(18 * mm, h - 88 * mm, "최고난도 수학의 완성 | 상위권 도약을 위한 1:1 맞춤 클리닉")

    card_w, card_h = 125 * mm, 56 * mm
    card_x = (w - card_w) / 2
    card_y = 65 * mm

    c.setFillColorRGB(*card_shadow)
    c.roundRect(card_x + 1.5 * mm, card_y - 1.5 * mm, card_w, card_h, 5 * mm, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(0.85, 0.91, 0.90)
    c.setLineWidth(0.9)
    c.roundRect(card_x, card_y, card_w, card_h, 5 * mm, stroke=1, fill=1)

    c.setFillColorRGB(*sky_blue)
    c.roundRect(card_x + 15 * mm, card_y + card_h - 2.5 * mm, 32 * mm, 2.5 * mm, 1 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*mint_green)
    c.roundRect(card_x + 49 * mm, card_y + card_h - 2.5 * mm, 20 * mm, 2.5 * mm, 1 * mm, stroke=0, fill=1)

    c.setFillColorRGB(*mint_green)
    c.roundRect(card_x, card_y + 9 * mm, 4 * mm, card_h - 18 * mm, 2 * mm, stroke=0, fill=1)

    c.setFillColorRGB(0.45, 0.55, 0.58)
    c.setFont("Helvetica", 8.5)
    c.drawString(card_x + 13 * mm, card_y + card_h - 13 * mm, "STUDENT CLINIC PROFILE")

    c.setStrokeColorRGB(0.90, 0.94, 0.93)
    c.setLineWidth(0.6)
    c.line(card_x + 13 * mm, card_y + card_h - 16 * mm, card_x + card_w - 13 * mm, card_y + card_h - 16 * mm)

    c.setFillColorRGB(*deep_teal)
    c.setFont("HYSMyeongJo-Medium", 15)
    c.drawString(card_x + 13 * mm, card_y + card_h - 28 * mm, f"이 름 :  {student}")

    c.setFont("HYSMyeongJo-Medium", 12.5)
    c.setFillColorRGB(0.25, 0.35, 0.40)
    c.drawString(card_x + 13 * mm, card_y + card_h - 40 * mm, f"학 년 :  {grade}")

    c.setFont("HYSMyeongJo-Medium", 11)
    c.setFillColorRGB(*sky_blue)
    c.drawRightString(card_x + card_w - 13 * mm, card_y + 10 * mm, "강 석 수 학")

    c.setFont("Helvetica", 8.5)
    c.setFillColorRGB(0.50, 0.60, 0.64)
    c.drawCentredString(w / 2, 18 * mm, "KANG SEOK MATH • BLACKLABEL CUSTOM CLINIC")


def draw_concept_middle_2_2_cover(c: canvas.Canvas, student: str, grade: str, w: float, h: float) -> None:
    bg_clean = (0.985, 0.99, 1.0)
    vibrant_orange = (1.0, 0.40, 0.15)
    sunshine_gold = (1.0, 0.72, 0.05)
    ocean_cyan = (0.02, 0.65, 0.90)
    deep_navy = (0.05, 0.14, 0.28)
    soft_slate = (0.38, 0.46, 0.58)

    c.setFillColorRGB(*bg_clean)
    c.rect(0, 0, w, h, stroke=0, fill=1)

    c.setFillColorRGB(1.0, 0.94, 0.90)
    c.circle(w - 10 * mm, h - 15 * mm, 85 * mm, stroke=0, fill=1)
    c.setFillColorRGB(0.92, 0.97, 1.0)
    c.circle(w - 35 * mm, h - 45 * mm, 60 * mm, stroke=0, fill=1)
    c.setFillColorRGB(1.0, 0.96, 0.92)
    c.circle(w - 55 * mm, h - 20 * mm, 40 * mm, stroke=0, fill=1)

    p = c.beginPath()
    p.moveTo(w - 70 * mm, h)
    p.lineTo(w, h - 70 * mm)
    p.lineTo(w, h - 55 * mm)
    p.lineTo(w - 55 * mm, h)
    p.close()
    c.setFillColorRGB(1.0, 0.85, 0.75)
    c.drawPath(p, stroke=0, fill=1)

    c.setFillColorRGB(0.93, 0.97, 1.0)
    c.circle(25 * mm, 45 * mm, 55 * mm, stroke=0, fill=1)
    c.setFillColorRGB(1.0, 0.95, 0.90)
    c.circle(45 * mm, 30 * mm, 35 * mm, stroke=0, fill=1)

    c.setFillColorRGB(*sunshine_gold)
    c.circle(25 * mm, h - 22 * mm, 2.8 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*ocean_cyan)
    c.circle(34 * mm, h - 20 * mm, 1.8 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*vibrant_orange)
    c.circle(41 * mm, h - 23 * mm, 2.2 * mm, stroke=0, fill=1)

    badge_x, badge_y, badge_w, badge_h = 18 * mm, h - 40 * mm, 68 * mm, 7.5 * mm
    c.setFillColorRGB(*vibrant_orange)
    c.roundRect(badge_x, badge_y, badge_w, badge_h, badge_h / 2, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(badge_x + badge_w / 2, badge_y + 2.0 * mm, "★ CONCEPT + TYPE POWER")

    c.setFillColorRGB(*deep_navy)
    c.setFont("HYSMyeongJo-Medium", 32)
    c.drawString(18 * mm, h - 56 * mm, "중2-2 개념+유형 파워")

    c.setFillColorRGB(*vibrant_orange)
    c.setFont("HYSMyeongJo-Medium", 35)
    c.drawString(18 * mm, h - 70 * mm, "오답노트")

    c.setFillColorRGB(*vibrant_orange)
    c.rect(18 * mm, h - 77 * mm, 38 * mm, 2.4 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*sunshine_gold)
    c.rect(58 * mm, h - 77 * mm, 24 * mm, 2.4 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*ocean_cyan)
    c.rect(84 * mm, h - 77 * mm, 14 * mm, 2.4 * mm, stroke=0, fill=1)
    c.setFillColorRGB(0.85, 0.90, 0.94)
    c.rect(100 * mm, h - 77 * mm, w - 118 * mm, 0.8 * mm, stroke=0, fill=1)

    c.setFont("HYSMyeongJo-Medium", 12)
    c.setFillColorRGB(*soft_slate)
    c.drawString(18 * mm, h - 88 * mm, "유형 마스터 & 실전력 완성을 위한 1:1 맞춤 클리닉")

    card_w, card_h = 125 * mm, 56 * mm
    card_x = (w - card_w) / 2
    card_y = 65 * mm

    c.setFillColorRGB(0.90, 0.93, 0.96)
    c.roundRect(card_x + 1.5 * mm, card_y - 1.5 * mm, card_w, card_h, 5 * mm, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(0.87, 0.91, 0.95)
    c.setLineWidth(0.9)
    c.roundRect(card_x, card_y, card_w, card_h, 5 * mm, stroke=1, fill=1)

    c.setFillColorRGB(*vibrant_orange)
    c.roundRect(card_x + 15 * mm, card_y + card_h - 2.5 * mm, 32 * mm, 2.5 * mm, 1 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*sunshine_gold)
    c.roundRect(card_x + 49 * mm, card_y + card_h - 2.5 * mm, 20 * mm, 2.5 * mm, 1 * mm, stroke=0, fill=1)

    c.setFillColorRGB(*vibrant_orange)
    c.roundRect(card_x, card_y + 9 * mm, 4 * mm, card_h - 18 * mm, 2 * mm, stroke=0, fill=1)

    c.setFillColorRGB(0.52, 0.58, 0.68)
    c.setFont("Helvetica", 8.5)
    c.drawString(card_x + 13 * mm, card_y + card_h - 13 * mm, "STUDENT CLINIC PROFILE")

    c.setStrokeColorRGB(0.92, 0.94, 0.97)
    c.setLineWidth(0.6)
    c.line(card_x + 13 * mm, card_y + card_h - 16 * mm, card_x + card_w - 13 * mm, card_y + card_h - 16 * mm)

    c.setFillColorRGB(*deep_navy)
    c.setFont("HYSMyeongJo-Medium", 15)
    c.drawString(card_x + 13 * mm, card_y + card_h - 28 * mm, f"이 름 :  {student}")

    c.setFont("HYSMyeongJo-Medium", 12.5)
    c.setFillColorRGB(0.25, 0.32, 0.42)
    c.drawString(card_x + 13 * mm, card_y + card_h - 40 * mm, f"학 년 :  {grade}")

    c.setFont("HYSMyeongJo-Medium", 11)
    c.setFillColorRGB(*vibrant_orange)
    c.drawRightString(card_x + card_w - 13 * mm, card_y + 10 * mm, "강 석 수 학")

    c.setFont("Helvetica", 8.5)
    c.setFillColorRGB(0.60, 0.66, 0.76)
    c.drawCentredString(w / 2, 18 * mm, "KANG SEOK MATH • FRESH POWER LEARNING SYSTEM")


def draw_cover(c: canvas.Canvas, student: str, grade: str, page_width: float, page_height: float, textbook: str) -> None:
    """Draw the textbook-specific cover used by the local generators."""
    if textbook == "synergy-common-math-2":
        draw_common_math_2_cover(c, student, grade, page_width, page_height)
        return
    if textbook == "ssen-middle-2-2":
        draw_ssen_middle_2_2_cover(c, student, grade, page_width, page_height)
        return
    if textbook == "blacklabel-middle-2-2":
        draw_blacklabel_middle_2_2_cover(c, student, grade, page_width, page_height)
        return
    if textbook == "concept-middle-2-2":
        draw_concept_middle_2_2_cover(c, student, grade, page_width, page_height)
        return
    navy = (0.055, 0.13, 0.24)
    blue = (0.10, 0.34, 0.62)
    cyan = (0.18, 0.67, 0.76)
    coral = (0.94, 0.34, 0.38)
    violet = (0.43, 0.28, 0.76)
    gold = (0.96, 0.64, 0.16)

    c.setFillColorRGB(0.975, 0.985, 0.995)
    c.rect(0, 0, page_width, page_height, stroke=0, fill=1)

    c.saveState()
    c.setStrokeColorRGB(0.82, 0.89, 0.95)
    c.setLineWidth(0.25)
    for x in range(-20, 241, 14):
        c.line(x * mm, 0, x * mm, page_height)
    for y in range(-20, 321, 14):
        c.line(0, y * mm, page_width, y * mm)

    c.setStrokeColorRGB(*cyan)
    c.setLineWidth(1.8)
    path = c.beginPath()
    for index in range(181):
        x = 15 * mm + index * (180 * mm / 180)
        y = 247 * mm + (12 * math.sin(index / 16) + 0.055 * (index - 90)) * mm
        path.moveTo(x, y) if index == 0 else path.lineTo(x, y)
    c.drawPath(path, stroke=1, fill=0)

    c.setStrokeColorRGB(*violet)
    c.setLineWidth(1.5)
    path = c.beginPath()
    for index in range(121):
        x = 69 * mm + index * (115 * mm / 120)
        y = 226 * mm + (5 * math.exp(index / 50)) * mm
        path.moveTo(x, y) if index == 0 else path.lineTo(x, y)
    c.drawPath(path, stroke=1, fill=0)

    c.setStrokeColorRGB(*coral)
    c.setLineWidth(1.1)
    c.setDash(4, 3)
    c.line(41 * mm, 228 * mm, 171 * mm, 263 * mm)
    c.setDash()
    for x, y, color in ((78, 251, coral), (131, 258, gold), (166, 264, violet)):
        c.setFillColorRGB(*color)
        c.circle(x * mm, y * mm, 2.2 * mm, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1)
        c.circle(x * mm, y * mm, 0.8 * mm, stroke=0, fill=1)
    c.restoreState()

    c.setFillColorRGB(*navy)
    c.setFont("Helvetica", 70)
    c.setFillAlpha(0.075)
    c.drawString(20 * mm, 251 * mm, "f(x)")
    c.setFillAlpha(1)

    center_y = 145 * mm
    c.setFillColorRGB(1, 1, 1)
    c.setFillAlpha(0.92)
    c.roundRect(19 * mm, center_y - 31 * mm, page_width - 38 * mm, 75 * mm, 7 * mm, stroke=0, fill=1)
    c.setFillAlpha(1)
    c.setFillColorRGB(*blue)
    c.roundRect(page_width / 2 - 20 * mm, center_y + 34 * mm, 40 * mm, 4 * mm, 2 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*navy)
    c.setFont("HYSMyeongJo-Medium", 46)
    c.drawCentredString(page_width / 2, center_y, TEXTBOOKS[textbook]["title"])
    c.setFillColorRGB(*violet)
    c.setFont("HYSMyeongJo-Medium", 19)
    c.drawCentredString(page_width / 2, center_y - 15 * mm, "오답을 실력으로 바꾸는 수학 기록")

    card_x, card_y, card_w, card_h = 39 * mm, 31 * mm, page_width - 78 * mm, 25 * mm
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(0.76, 0.84, 0.91)
    c.setLineWidth(0.8)
    c.roundRect(card_x, card_y, card_w, card_h, 4 * mm, stroke=1, fill=1)
    c.setFillColorRGB(0.36, 0.43, 0.51)
    c.setFont("Helvetica", 9)
    c.drawString(card_x + 9 * mm, card_y + 9.5 * mm, "STUDENT")
    c.setFillColorRGB(*navy)
    c.setFont("HYSMyeongJo-Medium", 14)
    c.drawRightString(card_x + card_w - 9 * mm, card_y + 8.5 * mm, f"{grade}  {student}")


def draw_footer(c: canvas.Canvas, page_number: int, page_width: float) -> None:
    left = 10 * mm
    right = page_width - 10 * mm
    c.setStrokeColorRGB(0.72, 0.72, 0.72)
    c.setLineWidth(0.45)
    c.line(left, 9.5 * mm, right, 9.5 * mm)
    c.setFillColorRGB(0.16, 0.16, 0.16)
    c.setFont("HYSMyeongJo-Medium", 8)
    c.drawString(left, 5.2 * mm, "강석수학")
    c.drawRightString(right, 5.2 * mm, str(page_number))


def draw_answer_page(c: canvas.Canvas, numbers: list[int], answers: dict[int, str], page_number: int, page_width: float, page_height: float, textbook: str) -> None:
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
    draw_footer(c, page_number, page_width)


def create_pdf(student: str, grade: str, images: list[tuple[int, bytes]], answers: dict[int, str] | None, textbook: str) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    page_width, page_height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    draw_cover(c, student, grade, page_width, page_height, textbook)
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
        draw_footer(c, page_index, page_width)
        c.showPage()
    if answers is not None:
        numbers = [number for number, _ in images]
        answer_chunks = [numbers[i:i + 60] for i in range(0, len(numbers), 60)]
        first_answer_page = (len(images) + 3) // 4 + 1
        for index, chunk in enumerate(answer_chunks):
            draw_answer_page(c, chunk, answers, first_answer_page + index, page_width, page_height, textbook)
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


def create_olympus_pdf(student: str, grade: str, items: list[tuple[str, str, int, bytes]], answers: dict[tuple[int, str, int], str]) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    draw_cover(c, student, grade, width, height, "olympus-calculus")
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
        draw_footer(c, page_index, width)
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
        draw_olympus_answer_page(c, chunk, len(groups) + index + 1, width, height)
        if index < len(answer_chunks) - 1:
            c.showPage()
    c.save()
    return output.getvalue()


def draw_olympus_answer_page(c: canvas.Canvas, items: list[tuple[str, str, int, str]], page_number: int, width: float, height: float) -> None:
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
    draw_footer(c, page_number, width)


def load_blacklabel_image(supabase_url: str, secret_key: str, bucket: str, chapter: str, subunit: str, stage: str, number_str: str) -> bytes:
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

    for filename in candidates:
        object_path = urllib.parse.quote(f"{bucket}/blacklabel-middle-2-2/{chapter}/{subunit}/{stage}/{filename}", safe="/")
        try:
            return request_bytes(f"{supabase_url}/storage/v1/object/authenticated/{object_path}", headers)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                continue
            raise
    raise ValueError(f"블랙라벨 문제 이미지를 찾을 수 없습니다: [{subunit}] {stage} {number_str}번")


def load_blacklabel_answers(supabase_url: str, secret_key: str, bucket: str) -> dict[str, str]:
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
    draw_footer(c, page_number, page_width)


def create_blacklabel_pdf(
    student: str,
    grade: str,
    items: list[tuple[str, str, str, str, bytes]],
    answers: dict[str, str],
) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    draw_cover(c, student, grade, width, height, "blacklabel-middle-2-2")
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
        draw_footer(c, p + 1, width)
        c.showPage()

    answer_chunks = [items[i:i + 48] for i in range(0, len(items), 48)]
    for chunk_idx, chunk in enumerate(answer_chunks, start=1):
        draw_blacklabel_answer_page(
            c, chunk, answers, total_prob_pages + chunk_idx, width, height, chunk_idx, len(answer_chunks)
        )
        if chunk_idx < len(answer_chunks):
            c.showPage()

    c.save()
    return output.getvalue()


def load_concept_image(supabase_url: str, secret_key: str, bucket: str, chapter: str, subunit: str, stage: str, number_str: str) -> bytes:
    headers = {"apikey": secret_key}
    num = int(number_str) if number_str.isdigit() else None
    candidates: list[str] = []
    if num is not None:
        candidates.append(f"{num:04d}.png")
        candidates.append(f"{num}.png")
    candidates.append(f"{number_str}.png")
    if num is not None:
        candidates.append(f"{num}-1.png")

    for filename in candidates:
        object_path = urllib.parse.quote(f"{bucket}/concept-middle-2-2/{chapter}/{subunit}/{stage}/{filename}", safe="/")
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
) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    draw_cover(c, student, grade, width, height, "concept-middle-2-2")
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
            draw_footer(c, current_page, width)
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
            draw_footer(c, current_page, width)
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
                pdf = create_olympus_pdf(student, grade, olympus_items, olympus_answers)
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
                pdf = create_blacklabel_pdf(student, grade, blacklabel_items, blacklabel_answers)
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
                pdf = create_concept_pdf(student, grade, concept_items)
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
                pdf = create_pdf(student, grade, images, selected_answers, textbook)
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
