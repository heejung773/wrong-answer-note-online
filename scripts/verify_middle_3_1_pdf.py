import os
from pathlib import Path
import sys
from io import BytesIO
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api import generate

def read_env(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values

def main():
    env = read_env(ROOT / ".env.local")
    base_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = env.get("SUPABASE_SECRET_KEY", "") or env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    bucket = env.get("SUPABASE_STORAGE_BUCKET", "textbook-problems")

    if not base_url or not key:
        print("Missing Supabase credentials in .env.local")
        return

    print("Testing 중3-1 PDF Generation against Supabase Storage...")

    # 1. 쎈수학 중3-1
    print("\n--- 1. Testing 쎈수학 중3-1 ---")
    s31_numbers = [50, 51]
    s31_images = generate.load_images(base_url, key, bucket, "ssen-middle-3-1", s31_numbers)
    assert len(s31_images) == 2, f"Failed to download ssen 3-1 problems {s31_numbers}"
    print(f"Downloaded ssen 3-1 problems {s31_numbers}: {[len(d) for _, d in s31_images]}")
    s31_pdf = generate.create_pdf("홍길동", "중3", s31_images, None, "ssen-middle-3-1")
    reader = PdfReader(BytesIO(s31_pdf))
    print(f"Generated ssen-middle-3-1 PDF: {len(reader.pages)} pages, {len(s31_pdf)} bytes")
    (ROOT / "tmp" / "test_ssen_3_1.pdf").write_bytes(s31_pdf)

    # 2. 블랙라벨 중3-1
    print("\n--- 2. Testing 블랙라벨 중3-1 ---")
    # Unit 1: 01. 제곱근과 실수 -> ch01, Step 1 -> step1, problem 1
    bl31_items_meta = [
        ("01. 제곱근과 실수", "01. 제곱근과 실수", "Step1", "1"),
        ("01. 제곱근과 실수", "01. 제곱근과 실수", "Step2", "2"),
    ]
    bl31_items = []
    for ch, sub, stg, num in bl31_items_meta:
        img_bytes = generate.load_blacklabel_image(base_url, key, bucket, ch, sub, stg, num, "blacklabel-middle-3-1")
        assert img_bytes, f"Failed to download blacklabel 3-1: {ch}/{stg}/{num}"
        bl31_items.append((ch, sub, stg, num, img_bytes))
        print(f"Downloaded blacklabel 3-1 [{stg} #{num}]: {len(img_bytes)} bytes")
    
    bl31_pdf = generate.create_blacklabel_pdf("홍길동", "3학년", bl31_items, {}, textbook="blacklabel-middle-3-1")
    reader_bl = PdfReader(BytesIO(bl31_pdf))
    print(f"Generated blacklabel-middle-3-1 PDF: {len(reader_bl.pages)} pages, {len(bl31_pdf)} bytes")
    (ROOT / "tmp" / "test_blacklabel_3_1.pdf").write_bytes(bl31_pdf)

    # 3. 개념유형(파워) 중3-1
    print("\n--- 3. Testing 개념유형(파워) 중3-1 ---")
    # Unit 1: 01. 제곱근과 실수 -> ch01, 유형별 -> type, problem 1
    cp31_items_meta = [
        ("01. 제곱근과 실수", "01. 제곱근과 실수", "유형별", "1"),
        ("01. 제곱근과 실수", "01. 제곱근과 실수", "단원마무리", "1"),
    ]
    cp31_items = []
    for ch, sub, stg, num in cp31_items_meta:
        img_bytes = generate.load_concept_image(base_url, key, bucket, ch, sub, stg, num, "concept-middle-3-1")
        assert img_bytes, f"Failed to download concept 3-1: {ch}/{stg}/{num}"
        cp31_items.append((ch, sub, stg, num, img_bytes))
        print(f"Downloaded concept 3-1 [{stg} #{num}]: {len(img_bytes)} bytes")

    cp31_pdf = generate.create_concept_pdf("홍길동", "3학년", cp31_items, textbook="concept-middle-3-1")
    reader_cp = PdfReader(BytesIO(cp31_pdf))
    print(f"Generated concept-middle-3-1 PDF: {len(reader_cp.pages)} pages, {len(cp31_pdf)} bytes")
    (ROOT / "tmp" / "test_concept_3_1.pdf").write_bytes(cp31_pdf)

    print("\nAll 3 Middle School 3-1 textbooks successfully verified against Supabase!")

if __name__ == "__main__":
    main()
