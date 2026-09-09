from http.server import BaseHTTPRequestHandler
from io import BytesIO
import json
import math
import os
import re
import urllib.error
import urllib.parse
import urllib.request

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
    if len(result) > 20:
        raise ValueError("시험판은 한 번에 최대 20문제까지 만들 수 있습니다.")
    return result


def request_bytes(url: str, headers: dict[str, str]) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


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


def draw_cover(c: canvas.Canvas, student: str, grade: str, page_width: float, page_height: float, textbook: str) -> None:
    """Reproduce the calculus-themed cover used by the local generator."""
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
    c.setFont("HYSMyeongJo-Medium", 40 if textbook == "synergy-common-math-2" else 46)
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
            c.drawString(x + 3 * mm, y + cell_h - 6 * mm, f"No. {number}")
            reader = ImageReader(BytesIO(data))
            iw, ih = reader.getSize()
            available_w, available_h = cell_w - 6 * mm, cell_h - 14 * mm
            scale = min(available_w / iw, available_h / ih)
            dw, dh = iw * scale, ih * scale
            c.drawImage(reader, x + (cell_w - dw) / 2, y + cell_h - 10 * mm - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, page_index, page_width)
        c.showPage()
    if answers is not None:
        numbers = [number for number, _ in images]
        draw_answer_page(c, numbers, answers, (len(images) + 3) // 4 + 1, page_width, page_height, textbook)
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


def create_olympus_pdf(student: str, grade: str, unit: str, problem_type: str, images: list[tuple[int, bytes]], answers: dict[tuple[int, str, int], str]) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    width, height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    draw_cover(c, student, grade, width, height, "olympus-calculus")
    c.showPage()
    side, bottom, gap = 10 * mm, 14 * mm, 5 * mm
    wide = problem_type == "고난도도전"
    rows = 4 if wide else 2
    cell_h = (height - 10 * mm - bottom - gap * (rows - 1)) / rows
    normal_w = (width - side * 2 - gap) / 2
    slots = []
    for row in range(rows):
        y = height - 10 * mm - (row + 1) * cell_h - row * gap
        if wide:
            slots.append((side, y, width - side * 2, cell_h))
        else:
            slots.extend(((side, y, normal_w, cell_h), (side + normal_w + gap, y, normal_w, cell_h)))
    per_page = 4
    for page_start in range(0, len(images), per_page):
        for index, (number, data) in enumerate(images[page_start:page_start + per_page]):
            x, y, box_w, box_h = slots[index]
            c.roundRect(x, y, box_w, box_h, 2 * mm)
            c.setFont("HYSMyeongJo-Medium", 8.5)
            c.drawString(x + 3 * mm, y + box_h - 5.3 * mm, f"{unit} · {problem_type} · {number}번")
            reader = ImageReader(BytesIO(data))
            iw, ih = reader.getSize()
            scale = min((box_w - 6 * mm) / iw, (box_h - 14 * mm) / ih)
            dw, dh = iw * scale, ih * scale
            c.drawImage(reader, x + (box_w - dw) / 2, y + box_h - 10 * mm - dh, dw, dh, preserveAspectRatio=True)
        draw_footer(c, page_start // per_page + 1, width)
        c.showPage()
    unit_number = int(unit.split(".", 1)[0])
    selected = {(number): answers.get((unit_number, problem_type, number)) for number, _ in images}
    missing = [number for number, answer in selected.items() if not answer]
    if missing:
        raise ValueError("빠른정답에 없는 문제번호입니다: " + ", ".join(map(str, missing)))
    draw_answer_page(c, [number for number, _ in images], selected, (len(images) + 3) // 4 + 1, width, height, "olympus-calculus")
    c.save()
    return output.getvalue()


class handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, message: str) -> None:
        body = json.dumps({"error": message}, ensure_ascii=False).encode("utf-8")
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
            numbers = parse_numbers(str(payload.get("numbers", "")))
            if textbook == "olympus-calculus":
                unit = str(payload.get("olympusUnit", ""))
                problem_type = str(payload.get("olympusType", ""))
                if unit not in OLYMPUS_UNITS or problem_type not in OLYMPUS_TYPES:
                    raise ValueError("올림포스 단원과 문제유형을 확인해 주세요.")
                images = load_olympus_images(supabase_url, secret_key, bucket, unit, problem_type, numbers)
                olympus_answers = load_olympus_answers(supabase_url, secret_key, bucket)
                pdf = create_olympus_pdf(student, grade, unit, problem_type, images, olympus_answers)
            else:
                images = load_images(supabase_url, secret_key, bucket, textbook, numbers)
                selected_answers = None
                if textbook != "gojaengi-common-math-2":
                    all_answers = load_quick_answers(supabase_url, secret_key, bucket, textbook)
                    missing_answers = [number for number in numbers if number not in all_answers]
                    if missing_answers:
                        listed = ", ".join(f"{number:04d}" for number in missing_answers)
                        raise ValueError(f"빠른정답에 없는 문제번호입니다: {listed}")
                    selected_answers = {number: all_answers[number] for number in numbers}
                pdf = create_pdf(student, grade, images, selected_answers, textbook)
            if len(pdf) > 4_300_000:
                raise ValueError("PDF가 시험판 다운로드 한도를 넘었습니다. 문제 수를 줄여 주세요.")
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
