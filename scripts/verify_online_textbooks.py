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
SSEN = Path(r"D:\중등부교재작업\중2학년2학기\쎈수학")
BLACKLABEL = Path(r"D:\중등부교재작업\중2학년2학기\블랙라벨")
CONCEPT = Path(r"D:\중등부교재작업\중2학년2학기\개념유형파워(유형편)")


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
        olympus_items = [("3. 미분계수와 도함수", "유형완성하기", number, data) for number, data in olympus_images]
        assert_pdf("olympus-calculus", generate.create_olympus_pdf("테스트", "2학년", olympus_items, olympus_answers), 3)

        gojaengi_numbers = [1, 724]
        gojaengi_images = [(number, read(GOJAENGI / "문제이미지모음" / f"{number:04d}.png")) for number in gojaengi_numbers]
        assert_pdf("gojaengi-common-math-2", generate.create_pdf("테스트", "2학년", gojaengi_images, None, "gojaengi-common-math-2"), 2)

        ssen_numbers = [21, 100]
        ssen_images = [(number, read(SSEN / "문제모음" / f"{number:04d}.png")) for number in ssen_numbers]
        assert_pdf("ssen-middle-2-2", generate.create_pdf("테스트", "2학년", ssen_images, None, "ssen-middle-2-2"), 2)

        bl_ch, bl_sub, bl_stg = "I. 삼각형의 성질", "01 삼각형의 성질", "시험에 꼭 나오는 문제"
        bl_img1 = read(BLACKLABEL / "문제모음" / bl_ch / bl_sub / bl_stg / "0001.png")
        bl_img2 = read(BLACKLABEL / "문제모음" / bl_ch / bl_sub / bl_stg / "0002.png")
        bl_items = [(bl_ch, bl_sub, bl_stg, "1", bl_img1), (bl_ch, bl_sub, bl_stg, "2", bl_img2)]
        bl_answers = generate.json.loads(read(BLACKLABEL / "blacklabel_answers.json"))
        assert_pdf("blacklabel-middle-2-2", generate.create_blacklabel_pdf("테스트", "2학년", bl_items, bl_answers), 3)

        cp_ch, cp_sub = "01_삼각형의_성질", "01_이등변삼각형의_성질"
        cp_img1 = read(CONCEPT / "문제모음" / cp_ch / cp_sub / "01_개념익히기" / "0001.png")
        cp_img2 = read(CONCEPT / "문제모음" / cp_ch / cp_sub / "02_핵심유형" / "0008.png")
        cp_items = [(cp_ch, cp_sub, "01_개념익히기", "1", cp_img1), (cp_ch, cp_sub, "02_핵심유형", "8", cp_img2)]
        assert_pdf("concept-middle-2-2", generate.create_concept_pdf("테스트", "2학년", cp_items), 3)
    finally:
        generate.request_bytes = original_request


if __name__ == "__main__":
    main()
