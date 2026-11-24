#!/usr/bin/env python3
"""
Pureripple 글 목록 생성기
--------------------------------------------------------------------------
posts/ 폴더의 마크다운(.md) 파일을 읽어 posts.json 을 새로 만듭니다.
새 글을 올릴 때는 posts/ 안에 .md 파일 하나를 만들고 이 스크립트를 실행하면 끝.

    python3 add-post.py

마크다운 맨 위의 --- 로 감싼 부분(제목/카테고리/날짜/요약/표지/태그)을 읽습니다.
필요 없는 항목은 지워도 되고, 글자 수에 따라 읽는 시간(분)은 자동 계산됩니다.
영문 버전은 같은 폴더의 `글주소.en.md` 에 두고, front matter 에 title_en · summary_en 을 적으면 됩니다.
카테고리 목록은 categories.json 에서 읽습니다(기본: Main · Minor · Edu).
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import site_files

ROOT = Path(__file__).resolve().parent
POSTS_DIR = ROOT / "posts"
OUTPUT = ROOT / "posts.json"

SITE = {
    "title": "Pureripple",
    "description": "일상과 생각, 작업의 기록을 천천히 쌓아 두는 개인 블로그.",
    "author": "양갱",
    "url": "",
}

CATEGORIES = site_files.load_categories(ROOT)
REQUIRED = ["title", "category", "date"]
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_front_matter(text: str) -> tuple[dict, str]:
    """맨 위 --- ... --- 사이의 key: value 를 읽고 (메타, 본문) 을 돌려준다."""
    text = text.replace("\r\n", "\n").lstrip("\ufeff")
    if not text.startswith("---"):
        return {}, text

    lines = text.split("\n")
    meta: dict[str, object] = {}
    end = None

    for i in range(1, len(lines)):
        line = lines[i]
        if line.strip() in ("---", "..."):
            end = i
            break
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if not value:
            continue
        if key == "tags":
            meta[key] = [t.strip() for t in re.split(r"[,\n]", value) if t.strip()]
        elif key == "featured":
            meta[key] = value.lower() in ("true", "yes", "y", "1")
        else:
            meta[key] = value

    if end is None:
        return {}, text

    return meta, "\n".join(lines[end + 1 :]).lstrip("\n")


def reading_minutes(body: str) -> int:
    chars = len(re.sub(r"\s+", "", body))
    return max(1, round(chars / 400))


def build() -> int:
    if not POSTS_DIR.is_dir():
        print(f"posts 폴더가 없습니다: {POSTS_DIR}")
        return 1

    posts = []
    problems = []

    for path in sorted(POSTS_DIR.glob("*.md")):
        # 영문 본문(start.en.md)은 같은 글의 다른 언어 파일이라 목록에 따로 넣지 않습니다.
        if path.name.endswith(".en.md"):
            continue
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        slug = str(meta.get("slug") or path.stem)

        missing = [key for key in REQUIRED if not meta.get(key)]
        if missing:
            problems.append(f"{path.name}: {', '.join(missing)} 항목이 비어 있습니다.")
            continue

        date = str(meta["date"])
        if not DATE_RE.match(date):
            problems.append(f"{path.name}: date 는 2026-11-21 형식으로 적어 주세요.")
            continue

        category = str(meta["category"])
        if category not in CATEGORIES:
            problems.append(
                f"{path.name}: category '{category}' — 사용 가능: {', '.join(CATEGORIES)}"
            )
            continue

        entry = {
            "slug": slug,
            "title": str(meta["title"]),
            "category": category,
            "date": date,
            "summary": str(meta.get("summary", "")),
            "cover": str(meta.get("cover", "assets/hero.jpg")),
            "tags": meta.get("tags", []),
            "author": str(meta.get("author", SITE["author"])),
            "featured": bool(meta.get("featured", False)),
            "minutes": reading_minutes(body),
            "file": f"posts/{path.name}",
        }
        title_en = str(meta.get("title_en", "")).strip()
        summary_en = str(meta.get("summary_en", "")).strip()
        if title_en:
            entry["title_en"] = title_en
        if summary_en:
            entry["summary_en"] = summary_en
        if (POSTS_DIR / f"{path.stem}.en.md").exists():
            entry["hasEnBody"] = True
        posts.append(entry)

    posts.sort(key=lambda p: p["date"], reverse=True)

    data = {"site": SITE, "generatedAt": datetime.now().isoformat(timespec="seconds"), "posts": posts}
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"posts.json 갱신 완료 — 글 {len(posts)}편")
    for post in posts:
        mark = "★" if post["featured"] else " "
        print(f" {mark} {post['date']}  [{post['category']}] {post['title']} ({post['minutes']}분)")

    # sitemap.xml · feed.xml · p/{slug}.html 도 같은 목록으로 맞춥니다.
    print("사이트 파일:")
    for name in site_files.write_site_files(ROOT, data):
        print(" ·", name)
    if problems:
        print("\n확인이 필요한 파일:")
        for problem in problems:
            print(" -", problem)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(build())
