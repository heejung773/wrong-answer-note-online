from http.server import BaseHTTPRequestHandler
from io import BytesIO
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


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
    headers = {"apikey": secret_key, "Authorization": f"Bearer {secret_key}"}
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


def create_pdf(student: str, grade: str, images: list[tuple[int, bytes]]) -> bytes:
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    output = BytesIO()
    page_width, page_height = A4
    c = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    c.setFillColorRGB(0.05, 0.14, 0.28)
    c.setFont("HYSMyeongJo-Medium", 30)
    c.drawCentredString(page_width / 2, page_height - 85 * mm, "시너지 미적분 오답노트")
    c.setFont("HYSMyeongJo-Medium", 16)
    c.drawCentredString(page_width / 2, page_height - 120 * mm, f"{grade}  {student}")
    c.showPage()

    side, bottom, gap = 10 * mm, 14 * mm, 5 * mm
    cell_w = (page_width - side * 2 - gap) / 2
    cell_h = (page_height - 10 * mm - bottom - gap) / 2
    boxes = [(side, bottom + cell_h + gap), (side + cell_w + gap, bottom + cell_h + gap), (side, bottom), (side + cell_w + gap, bottom)]
    for page_start in range(0, len(images), 4):
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
        c.setFont("HYSMyeongJo-Medium", 8)
        c.drawString(side, 6 * mm, "강석수학")
        if page_start + 4 < len(images):
            c.showPage()
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
            if textbook != "synergy-calculus":
                raise ValueError("지원하지 않는 교재입니다.")
            numbers = parse_numbers(str(payload.get("numbers", "")))
            images = load_images(supabase_url, secret_key, bucket, textbook, numbers)
            pdf = create_pdf(student, grade, images)
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
