"""노션 '내신기출 문항별 손풀이' DB → Supabase naesin_solution_links 동기화 (로컬 실행용, 기본은 미리보기).

    python scripts/sync_naesin_solution_links.py                  # 미리보기 + 차이 보고서(reports/) — 쓰기 없음
    python scripts/sync_naesin_solution_links.py --go             # 새 행만 upsert (기존 행 링크가 바뀌면 멈춤)
    python scripts/sync_naesin_solution_links.py --go --allow-change   # 바뀌는 기존 행까지 덮어씀

- 노션은 읽기만, 표는 upsert(name 기준)만. 표에만 있는 행은 지우지 않는다(보고서에만).
- 이름→키는 트윈 시험목록.json(--twin-list, 기본 D:\\변형문제\\data\\내신\\시험목록.json)으로 계산.
  --index 를 주면 운영과 같이 저장소 사본 data/naesin_twin_index.json 으로 매칭한다. 두 파일이 다 있으면 서로 같은지 먼저 비교해 출력.
- 노션 토큰·Supabase 키는 .env.local 에서만 읽고 출력하지 않는다.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import datetime as dt
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding="utf-8")

import naesin_solution_links as nsl  # noqa: E402


def _exam_of(name: str) -> str:
    return name.rsplit("-", 1)[0]


def _t(url: str) -> str:
    vid, sec = nsl._link_parts(url)
    return f"{vid} t={sec if sec is not None else '-'}"


def _kind(old: str, new: str) -> str:
    (ov, os_), (nv, ns) = nsl._link_parts(old), nsl._link_parts(new)
    if ov != nv:
        return "영상 다름"
    if os_ is None or ns is None:
        return "시간 있음/없음"
    return f"시간 {ns - os_:+d}초"


def build_report(result: dict, args) -> str:
    notion, diff = result["notion"], result["diff"]
    rows = notion["rows"]
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    out: list[str] = []
    w = out.append
    w(f"# 내신 손풀이 링크 노션 → Supabase 차이 보고서 ({now}, 미리보기 — 쓰기 없음)")
    w("")
    w(f"- 노션 DB: 내신기출 문항별 손풀이 (`{nsl.NOTION_DATABASE_ID}`), 읽은 행 {notion['pages']}")
    w(f"- 트윈 원본 문항 이름: {result['twin_names']}개 (`{args.twin_list}`)")
    w(f"- Supabase `{nsl.TABLE}` 지금 {result['table_rows']}행")
    w(f"- 노션에서 만든 넣을 후보(이름 기준 한 개씩): {len(rows)}개")
    w("")
    w("## 요약")
    w("")
    w("| 구분 | 개수 | 동기화하면 |")
    w("|---|---:|---|")
    w(f"| 같음 (키·링크 같음) | {len(diff['same'])} | 그대로(쓰지 않음) |")
    w(f"| 링크(영상·시간)가 다름 | {len(diff['url_changed'])} | **바뀜** — `--allow-change` 때만 노션 값으로 |")
    w(f"| 키가 다름 (이름 같음) | {len(diff['key_changed'])} | **바뀜** — `--allow-change` 때만 |")
    w(f"| 노션에만 있음 (새 행) | {len(diff['new'])} | 추가 |")
    w(f"| 키 겹침 (같은 키가 표에 다른 이름) | {len(diff['clashes'])} | 있으면 전체 멈춤 |")
    w(f"| Supabase 에만 있음 | {len(diff['only_table'])} | 그대로 둠(지우지 않음) |")
    w(f"| 바꾸기 실패 (노션 행) | {len(notion['failures'])} | 넣지 않음 |")
    conflicts = [d for d in notion["duplicates"] if d["conflict"]]
    w(f"| 노션 중복 이름 (링크 같음 / 다름) | {len(notion['duplicates']) - len(conflicts)} / {len(conflicts)} | 같으면 하나로, 다르면 넣지 않음 |")
    w(f"| 주의 (노션 칸끼리 안 맞음 등) | {len(notion['warnings'])} | 링크 칸 기준으로 넣음 |")
    w("")

    # 판정
    category = {}
    for key in ("same", "url_changed", "key_changed", "new"):
        for r in diff[key]:
            category[r["name"]] = key
    labels = {"same": "같음", "url_changed": "링크 다름", "key_changed": "키 다름", "new": "노션에만"}
    cross: dict[str, Counter] = defaultdict(Counter)
    for name, r in rows.items():
        cross[r["judgement"]][category.get(name, "?")] += 1
    for f in notion["failures"]:
        cross[f["judgement"]]["실패"] += 1
    for d in conflicts:
        for e in d["entries"]:
            cross[e["judgement"]]["중복충돌"] += 1
    w("## 노션 '판정' 값별 개수 (노션 전체 행)")
    w("")
    w("| 판정 | 노션 행 | 같음 | 링크 다름 | 키 다름 | 노션에만 | 실패 | 중복충돌 |")
    w("|---|---:|---:|---:|---:|---:|---:|---:|")
    for judgement, count in notion["judgements"].most_common():
        c = cross[judgement]
        w(f"| {judgement} | {count} | {c['same']} | {c['url_changed']} | {c['key_changed']} | {c['new']} | {c['실패']} | {c['중복충돌']} |")
    w("")
    w("(같은 이름 중복은 한 개로 세므로 '같음~노션에만' 합계가 노션 행 수보다 적을 수 있다.)")
    w("")

    w(f"## 1. 링크가 다름 — 동기화하면 바뀌게 될 기존 행 ({len(diff['url_changed'])}개)")
    w("")
    if diff["url_changed"]:
        w("| 이름 | Supabase 지금 | 노션 | 차이 | 노션 판정 | 노션 제목 |")
        w("|---|---|---|---|---|---|")
        for r in diff["url_changed"]:
            w(f"| {r['name']} | {_t(r['table_url'])} | {_t(r['url'])} | {_kind(r['table_url'], r['url'])} | "
              f"{r['judgement']} | {r['title']} |")
    else:
        w("없음")
    w("")
    w(f"## 2. 키가 다름 ({len(diff['key_changed'])}개)")
    w("")
    for r in diff["key_changed"]:
        w(f"- {r['name']}: 표 키 `{r['table_key']}` → 계산 키 `{r['key']}` (표 {_t(r['table_url'])}, 노션 {_t(r['url'])})")
    if not diff["key_changed"]:
        w("없음")
    w("")
    w(f"## 3. 키 겹침 ({len(diff['clashes'])}개)")
    w("")
    for r in diff["clashes"]:
        w(f"- {r['name']}: 키 `{r['key']}` 가 표에 '{r['table_name']}' 이름으로 있음")
    if not diff["clashes"]:
        w("없음")
    w("")
    w(f"## 4. 노션에만 있음 — 새로 추가될 행 ({len(diff['new'])}개)")
    w("")
    if diff["new"]:
        w("| 이름 | 키 | 노션 링크 | 판정 |")
        w("|---|---|---|---|")
        for r in diff["new"]:
            w(f"| {r['name']} | {r['key']} | {r['url']} | {r['judgement']} |")
    else:
        w("없음")
    w("")
    w(f"## 5. Supabase 에만 있음 — 지우지 않음 ({len(diff['only_table'])}개)")
    w("")
    if diff["only_table"]:
        w("| 이름 | 키 | 표 링크 | source |")
        w("|---|---|---|---|")
        for r in diff["only_table"]:
            w(f"| {r['name']} | {r['key']} | {r['url']} | {r.get('source') or ''} |")
    else:
        w("없음")
    w("")
    w(f"## 6. 바꾸기 실패 — 넣지 않음 ({len(notion['failures'])}개)")
    w("")
    if notion["failures"]:
        w("| 이유 | 노션 제목 | 시험ID | 문항번호 | 판정 | 손풀이링크 |")
        w("|---|---|---|---|---|---|")
        for f in sorted(notion["failures"], key=lambda f: (f["reason"], f["exam_id"], f["number"] or 0)):
            w(f"| {f['reason']} | {f['title']} | {f['exam_id']} | {f['number']} | {f['judgement']} | {f['raw_link']} |")
    else:
        w("없음")
    w("")
    w(f"## 7. 노션 중복 이름 ({len(notion['duplicates'])}개, 링크 다름 {len(conflicts)}개)")
    w("")
    for d in notion["duplicates"]:
        mark = "**링크 다름 → 넣지 않음**" if d["conflict"] else "링크 같음 → 하나로"
        parts = "; ".join(f"'{e['title']}' {_t(e['url'])} [{e['judgement']}]" for e in d["entries"])
        w(f"- {d['name']} ({mark}): {parts}")
    if not notion["duplicates"]:
        w("없음")
    w("")
    w(f"## 8. 주의 ({len(notion['warnings'])}개)")
    w("")
    for line in notion["warnings"]:
        w(f"- {line}")
    if not notion["warnings"]:
        w("없음")
    w("")

    # 시험별
    per: dict[str, Counter] = defaultdict(Counter)
    for name in rows:
        per[_exam_of(name)]["notion"] += 1
    for key in ("same", "url_changed", "key_changed", "new"):
        for r in diff[key]:
            per[_exam_of(r["name"])][key] += 1
    for r in diff["only_table"]:
        per[_exam_of(r["name"])]["only_table"] += 1
    table_count = Counter(_exam_of(r["name"]) for r in diff["only_table"])
    for key in ("same", "url_changed", "key_changed"):
        for r in diff[key]:
            table_count[_exam_of(r["name"])] += 1
    for f in notion["failures"]:
        per[f["exam_id"] or "(시험ID 빈칸)"]["fail"] += 1
    w(f"## 시험별 요약 ({len(per)}개 시험)")
    w("")
    w("시험 = 표 name 의 앞부분(트윈 이름). 6개 시험은 노션 시험ID 뒤에 꼬리(_공통수학1·_대수·_수학1·_내신테스트)가 붙는다. "
      "실패 행은 노션 시험ID 로 센다.")
    w("")
    w("| 시험 | 노션(넣을 후보) | Supabase | 같음 | 링크 다름 | 키 다름 | 노션에만 | Supabase에만 | 실패 |")
    w("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    total = Counter()
    for exam in sorted(per):
        c = per[exam]
        c["table"] = table_count[exam]
        total.update(c)
        w(f"| {exam} | {c['notion']} | {c['table']} | {c['same']} | {c['url_changed']} | {c['key_changed']} | "
          f"{c['new']} | {c['only_table']} | {c['fail']} |")
    w(f"| **합계** | {total['notion']} | {total['table']} | {total['same']} | {total['url_changed']} | "
      f"{total['key_changed']} | {total['new']} | {total['only_table']} | {total['fail']} |")
    w("")
    return "\n".join(out) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="노션 내신 손풀이 → Supabase naesin_solution_links (기본 미리보기)")
    parser.add_argument("--twin-list", default=nsl.DEFAULT_TWIN_LIST)
    parser.add_argument("--go", action="store_true", help="실제로 Supabase 표에 upsert")
    parser.add_argument("--allow-change", action="store_true", help="--go 때 이미 있는 행의 링크·키가 바뀌어도 덮어씀")
    parser.add_argument("--report", help="차이 보고서 경로 (기본 reports/naesin_solution_links_diff_<날짜>.md)")
    parser.add_argument("--index", nargs="?", const=str(nsl.DEFAULT_INDEX),
                        help="트윈 파일 대신 저장소 사본 data/naesin_twin_index.json 으로 매칭(운영과 같은 방식)")
    args = parser.parse_args()

    twin = nsl.twin_exam_index(args.twin_list) if Path(args.twin_list).is_file() else None
    stored = nsl.load_twin_index(args.index or nsl.DEFAULT_INDEX) if Path(args.index or nsl.DEFAULT_INDEX).is_file() else None
    if twin is not None and stored is not None:
        differ = sorted(k for k in set(twin) | set(stored) if twin.get(k, ())[:2] != stored.get(k, ())[:2])
        print(f"트윈 직접 {len(twin)}문항 vs 사본 {len(stored)}문항: 다름 {len(differ)}"
              + ("" if not differ else " — scripts/build_naesin_twin_index.py 로 사본을 다시 만들 것"))
        for tag, no in differ[:20]:
            print(f"  다름: {tag} {no}번 트윈 {twin.get((tag, no), ('없음',))[0]} / 사본 {stored.get((tag, no), ('없음',))[0]}")
    index = stored if args.index else twin
    if index is None:
        sys.exit("매칭 목록이 없습니다: " + (args.index or args.twin_list))
    args.twin_list = args.index or args.twin_list  # 보고서 머리말에 쓴 목록 표시

    nsl.load_local_env()
    result = nsl.sync(go=args.go, allow_change=args.allow_change, index=index)
    report_path = Path(args.report) if args.report else (
        ROOT / "reports" / f"naesin_solution_links_diff_{dt.date.today():%Y%m%d}.md")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(build_report(result, args), encoding="utf-8")

    notion, diff = result["notion"], result["diff"]
    print(f"노션 {notion['pages']}행 → 넣을 후보 {len(notion['rows'])}개, 실패 {len(notion['failures'])}, "
          f"중복 {len(notion['duplicates'])}, 주의 {len(notion['warnings'])}")
    print(f"Supabase {result['table_rows']}행: 같음 {len(diff['same'])}, 링크 다름 {len(diff['url_changed'])}, "
          f"키 다름 {len(diff['key_changed'])}, 새로 {len(diff['new'])}, 키 겹침 {len(diff['clashes'])}, "
          f"표에만 {len(diff['only_table'])}")
    print("판정: " + ", ".join(f"{k} {v}" for k, v in notion["judgements"].most_common()))
    print(f"보고서: {report_path}")
    if not args.go:
        print("미리보기만 했습니다(쓰기 없음). 실제로 넣으려면 --go (바뀌는 기존 행까지는 --allow-change)")
    elif result["stopped"]:
        sys.exit("멈춤: " + result["stopped"])
    else:
        print(f"넣음 {result['written']}행, 다시 읽어 다름 {len(result.get('verify_mismatch') or [])}")


if __name__ == "__main__":
    main()
