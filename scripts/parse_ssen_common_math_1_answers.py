# -*- coding: utf-8 -*-
"""
공통수학1 빠른정답 PDF (5페이지 이미지 기반) 전수 텍스트 분할 및 정답 DB 생성기
- RapidOCR 기반으로 문항 번호와 정답 텍스트를 추출
- api/ssen_common_math_1_answers.json 에 저장
"""
import json
import re
import sys
from pathlib import Path

try:
    if sys.stdout and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if sys.stderr and hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import fitz
import numpy as np
from rapidocr_onnxruntime import RapidOCR

PDF_PATH = Path(r"D:\공통수학1_쎈\[공통수학1] 라이트쎈_빠른정답.pdf")
OUT_JSON = Path(__file__).resolve().parents[1] / "api" / "ssen_common_math_1_answers.json"


def main():
    print(f"=== 공통수학1 빠른정답 OCR 텍스트 분할 추출 시작 ===")
    print(f"소스 PDF: {PDF_PATH}")
    if not PDF_PATH.is_file():
        raise SystemExit(f"PDF 파일을 찾을 수 없습니다: {PDF_PATH}")

    doc = fitz.open(str(PDF_PATH))
    ocr = RapidOCR()
    answers = {}

    # 정답 기호 및 서술형 텍스트 정규화
    # 4자리 문항 번호 패턴: 0040, 0159 등
    # 또는 3자리/4자리 번호 뒤 정답
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=200)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))[:, :, :3]
        results, _ = ocr(arr)
        if not results:
            continue

        print(f"Page {page_idx + 1}: {len(results)}개 OCR 블록 검출")

        # 각 OCR 항목: [box, text, score]
        # X좌표, Y좌표 기준 정렬
        sorted_blocks = sorted(results, key=lambda b: (min(pt[1] for pt in b[0]) // 30, min(pt[0] for pt in b[0])))

        for box, raw_text, score in sorted_blocks:
            t = raw_text.strip()
            if not t:
                continue

            # 패턴 1: 한 블록 내에 "0040 6" 또는 "0040 ③" 처럼 번호와 답이 함께 있는 경우
            m = re.match(r"^(\d{4})[\s:.]+([^\d].*|\d+.*)$", t)
            if m:
                num = int(m.group(1))
                ans = m.group(2).strip()
                if num not in answers:
                    answers[num] = ans
                continue

            # 패턴 2: "0040" 단독 번호
            m_num = re.match(r"^(\d{4})$", t)
            if m_num:
                num = int(m_num.group(1))
                if num not in answers:
                    answers[num] = ""
                continue

            # 패턴 3: 블록 내에 0040이 포함된 경우 (예: "0040 ③ 0041 ④")
            pairs = re.findall(r"(\d{4})\s*([①-⑤]|[0-9]+(?:/[0-9]+)?|[가-힣a-zA-Z0-9^/+\-.,_~ ()]+?)(?=\s*\d{4}|$)", t)
            for num_str, ans_str in pairs:
                num = int(num_str)
                if num not in answers or not answers[num]:
                    answers[num] = ans_str.strip()

    print(f"\n1차 정규화 매핑 완료: 총 {len(answers)}개 문항 번호 수집")

    # 번호만 수집되고 답이 비어있는 경우 주변 블록에서 답 보강
    # 추가로 전체 텍스트에서 4자리 번호 시퀀스를 매칭
    all_text_lines = []
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=150)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))[:, :, :3]
        results, _ = ocr(arr)
        for box, text, _ in (results or []):
            all_text_lines.append(text)

    full_blob = " ".join(all_text_lines)
    # 정규식으로 0001 ~ 1500 번호 파싱
    tokens = re.split(r"(?<!\d)(\d{4})(?!\d)", full_blob)
    # tokens will alternate: [pre, "0001", text1, "0002", text2, ...]
    for i in range(1, len(tokens), 2):
        n_str = tokens[i]
        n_val = int(n_str)
        content = tokens[i+1].strip() if i+1 < len(tokens) else ""
        # 다음 문항 번호 전까지의 첫 의미있는 답안 토큰 추출
        if content:
            # 쉼표나 공백으로 자르되 답안 형태 추출
            parts = content.split()
            first_ans = parts[0] if parts else ""
            if 40 <= n_val <= 1400:
                if n_val not in answers or not answers[n_val]:
                    answers[n_val] = first_ans[:30]

    # 기본값 보정 (해설참조 등)
    # 문자열 키로 변환하여 저장: {"40": "...", "41": "...", "0040": "..."}
    out_dict = {}
    for k, v in sorted(answers.items()):
        val = str(v).strip()
        if not val:
            val = "해설참조"
        out_dict[str(k)] = val
        out_dict[f"{k:04d}"] = val

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out_dict, f, ensure_ascii=False, indent=2)

    print(f"최종 정답 DB 생성 완료: {OUT_JSON}")
    print(f"저장된 문항 수: {len([k for k in out_dict if not k.startswith('0') or k == '0'])}개")


if __name__ == "__main__":
    main()
