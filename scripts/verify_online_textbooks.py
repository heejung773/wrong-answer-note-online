from __future__ import annotations

from io import BytesIO
from pathlib import Path
import sys

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api import generate


COMMON = Path(r"D:\시너지_공통수학2")
OLYMPUS = Path(r"D:\올림푸스_미적분")
GOJAENGI = Path(r"D:\공수2_고쟁이")


def read(path: Path) -> bytes:
    return path.read_bytes()


def assert_pdf(name: str, data: bytes, expected_pages: int) -> None:
    reader = PdfReader(BytesIO(data))
    if len(reader.pages) != expected_pages:
        raise AssertionError(f"{name}: expected {expected_pages} pages, got {len(reader.pages)}")
    output = ROOT / "tmp" / f"{name}-online-sample.pdf"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    print(f"{name}: {len(reader.pages)} pages, {len(data)} bytes")


def main() -> None:
    original_request = generate.request_bytes
    try:
        common_answer = read(COMMON / "마플시너지-공통수학2-빠른정답.pdf")
        generate.request_bytes = lambda url, headers: common_answer
        common_answers = generate.load_quick_answers("https://local", "secret", "bucket", "synergy-common-math-2")
        common_numbers = [1, 990]
        common_images = [(number, read(COMMON / "문제모음" / f"{number:04d}.png")) for number in common_numbers]
        assert_pdf("synergy-common-math-2", generate.create_pdf("테스트", "2학년", common_images, {n: common_answers[n] for n in common_numbers}, "synergy-common-math-2"), 3)

        olympus_answer = read(OLYMPUS / "EBS 올림포스 유형편 미적분Ⅰ (22개정) - 해설.pdf")
        generate.request_bytes = lambda url, headers: olympus_answer
        olympus_answers = generate.load_olympus_answers("https://local", "secret", "bucket")
        olympus_numbers = [1, 2]
        olympus_images = [(number, read(OLYMPUS / "3. 미분계수와 도함수" / "유형완성하기" / f"{number:04d}.png")) for number in olympus_numbers]
        assert_pdf("olympus-calculus", generate.create_olympus_pdf("테스트", "2학년", "3. 미분계수와 도함수", "유형완성하기", olympus_images, olympus_answers), 3)

        gojaengi_numbers = [1, 724]
        gojaengi_images = [(number, read(GOJAENGI / "문제이미지모음" / f"{number:04d}.png")) for number in gojaengi_numbers]
        assert_pdf("gojaengi-common-math-2", generate.create_pdf("테스트", "2학년", gojaengi_images, None, "gojaengi-common-math-2"), 2)
    finally:
        generate.request_bytes = original_request


if __name__ == "__main__":
    main()
