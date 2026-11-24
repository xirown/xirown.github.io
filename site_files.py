#!/usr/bin/env python3
"""
Pureripple 사이트 파일 생성기
--------------------------------------------------------------------------
posts.json 과 categories.json 을 읽어 아래를 만듭니다. add-post.py 가 자동으로 불러 씁니다.

  - sitemap.xml   검색엔진용 주소 목록 (robots.txt 가 공개 상태일 때만)
  - feed.xml      RSS 피드
  - p/{slug}.html 글별 공유 카드 (og 태그 + 글 페이지로 이동)

관리자 페이지(admin.js)도 같은 형식으로 커밋하므로, 둘을 번갈아 써도 파일이 같습니다.
카테고리 목록은 categories.json 하나로 관리합니다(공개 화면·관리자·이 스크립트가 함께 읽음).
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from urllib.parse import quote

SITE_URL = "https://xirown.github.io"
DEFAULT_COVER = "assets/hero.jpg"
CATEGORIES_FILE = "categories.json"
DEFAULT_CATEGORIES = ["Main", "Minor", "Edu"]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def esc(value) -> str:
    return (
        str(value if value is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def load_categories(root: Path | str) -> list[str]:
    """categories.json 의 목록을 읽습니다. 파일이 없거나 비어 있으면 기본 목록을 씁니다.

    {"categories": ["Main", ...]} 와 ["Main", ...] 두 형식을 모두 받습니다.
    """
    path = Path(root) / CATEGORIES_FILE
    data = None
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = None
    raw = data.get("categories") if isinstance(data, dict) else data
    if not isinstance(raw, list):
        return list(DEFAULT_CATEGORIES)
    seen: list[str] = []
    for item in raw:
        name = str(item).strip()
        if name and name not in seen:
            seen.append(name)
    return seen or list(DEFAULT_CATEGORIES)


def categories_json_text(categories: list[str]) -> str:
    """관리자 화면이 커밋하는 것과 같은 형식의 categories.json 본문."""
    return json.dumps({"categories": list(categories)}, ensure_ascii=False, indent=2) + "\n"


def site_base(site: dict | None) -> str:
    url = str((site or {}).get("url") or "").strip()
    if url.startswith("http://") or url.startswith("https://"):
        return url.rstrip("/")
    return SITE_URL


def sorted_posts(posts: list[dict]) -> list[dict]:
    return sorted(
        [p for p in posts if p.get("slug")],
        key=lambda p: str(p.get("date", "")),
        reverse=True,
    )


def sitemap_text(posts: list[dict], site: dict | None = None) -> str:
    base = site_base(site)
    items = sorted_posts(posts)
    newest = items[0].get("date", "") if items else dt.date.today().isoformat()
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    out += [
        "  <url>",
        f"    <loc>{esc(base + '/')}</loc>",
        f"    <lastmod>{esc(newest)}</lastmod>",
        "    <changefreq>weekly</changefreq>",
        "    <priority>1.0</priority>",
        "  </url>",
    ]
    for post in items:
        out += [
            "  <url>",
            f"    <loc>{esc(base + '/post.html?slug=' + quote(str(post['slug']), safe=''))}</loc>",
            f"    <lastmod>{esc(post.get('date', ''))}</lastmod>",
            "    <changefreq>monthly</changefreq>",
            "    <priority>0.7</priority>",
            "  </url>",
        ]
    out.append("</urlset>")
    return "\n".join(out) + "\n"


def feed_date(value: str) -> str:
    d = dt.date.fromisoformat(value)
    return "%s, %02d %s %04d 09:00:00 +0900" % (WEEKDAYS[d.weekday()], d.day, MONTHS[d.month - 1], d.year)


def feed_text(
    posts: list[dict],
    site: dict | None = None,
    categories: list[str] | None = None,
) -> str:
    base = site_base(site)
    site = site or {}
    fallback_category = (categories or DEFAULT_CATEGORIES)[0]
    items = sorted_posts(posts)
    newest = items[0].get("date", "") if items else dt.date.today().isoformat()
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        f"    <title>{esc(site.get('title') or 'Pureripple')}</title>",
        f"    <link>{esc(base + '/')}</link>",
        f"    <description>{esc(site.get('description') or '일상과 생각, 작업의 기록을 천천히 쌓아 두는 개인 블로그.')}</description>",
        "    <language>ko</language>",
        f"    <lastBuildDate>{esc(feed_date(newest))}</lastBuildDate>",
        '    <atom:link href="%s" rel="self" type="application/rss+xml" />' % esc(base + "/feed.xml"),
    ]
    for post in items:
        url = base + "/post.html?slug=" + quote(str(post["slug"]), safe="")
        out += [
            "    <item>",
            f"      <title>{esc(post.get('title', ''))}</title>",
            f"      <link>{esc(url)}</link>",
            f'      <guid isPermaLink="true">{esc(url)}</guid>',
            f"      <pubDate>{esc(feed_date(str(post.get('date') or newest)))}</pubDate>",
            f"      <category>{esc(post.get('category') or fallback_category)}</category>",
            f"      <description>{esc(post.get('summary', ''))}</description>",
            "    </item>",
        ]
    out += ["  </channel>", "</rss>"]
    return "\n".join(out) + "\n"


def share_page_html(post: dict, site: dict | None = None) -> str:
    base = site_base(site)
    slug = str(post["slug"])
    url_slug = quote(slug, safe="")
    title = str(post.get("title") or slug)
    summary = str(post.get("summary") or "")
    cover = str(post.get("cover") or DEFAULT_COVER).lstrip("/")
    og_title = esc(title + " — Pureripple")
    lines = [
        "<!DOCTYPE html>",
        '<html lang="ko">',
        "  <head>",
        '    <meta charset="utf-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
        f"    <title>{esc(title)} — Pureripple</title>",
        f'    <meta name="description" content="{esc(summary)}" />',
        f'    <link rel="canonical" href="{esc(base + "/post.html?slug=" + url_slug)}" />',
        '    <meta name="robots" content="noindex, follow" />',
        '    <meta name="theme-color" content="#fdf1f7" />',
        "",
        '    <meta property="og:type" content="article" />',
        '    <meta property="og:site_name" content="Pureripple" />',
        f'    <meta property="og:title" content="{og_title}" />',
        f'    <meta property="og:description" content="{esc(summary)}" />',
        f'    <meta property="og:image" content="{esc(base + "/" + cover)}" />',
        f'    <meta property="og:url" content="{esc(base + "/p/" + slug + ".html")}" />',
        '    <meta property="og:locale" content="ko_KR" />',
        '    <meta name="twitter:card" content="summary_large_image" />',
        f'    <meta name="twitter:title" content="{og_title}" />',
        f'    <meta name="twitter:description" content="{esc(summary)}" />',
        f'    <meta name="twitter:image" content="{esc(base + "/" + cover)}" />',
        "",
        f'    <meta http-equiv="refresh" content="0; url=../post.html?slug={esc(url_slug)}" />',
        '    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />',
        '    <link rel="stylesheet" href="../style.css" />',
        "    <script>",
        f'      location.replace("../post.html?slug={slug}" + location.hash);',
        "    </script>",
        "  </head>",
        '  <body class="share-page">',
        '    <main class="container share-fallback">',
        '      <p class="eyebrow">Pureripple</p>',
        f'      <h1 class="share-title">{esc(title)}</h1>',
        f'      <p class="share-summary">{esc(summary)}</p>',
        f'      <p><a class="link-arrow" href="../post.html?slug={esc(url_slug)}">글로 이동하기</a></p>',
        "    </main>",
        "  </body>",
        "</html>",
        "",
    ]
    return "\n".join(lines)


def robots_public(root: Path) -> bool:
    path = root / "robots.txt"
    if not path.exists():
        return True
    allow = deny = False
    for line in path.read_text(encoding="utf-8").splitlines():
        value = line.split("#", 1)[0].strip().lower()
        if value == "allow: /":
            allow = True
        elif value == "disallow: /":
            deny = True
    return not deny if deny or allow else True


def write_site_files(root: Path, data: dict) -> list[str]:
    """sitemap.xml · feed.xml · p/*.html 을 다시 만들고, 쓴 파일 이름을 돌려줍니다."""
    root = Path(root)
    posts = sorted_posts(data.get("posts", []))
    site = data.get("site") or {}
    categories = load_categories(root)
    written: list[str] = []

    sitemap_path = root / "sitemap.xml"
    if robots_public(root):
        sitemap_path.write_text(sitemap_text(posts, site), encoding="utf-8")
        written.append("sitemap.xml")
    elif sitemap_path.exists():
        sitemap_path.unlink()
        written.append("sitemap.xml (삭제)")

    (root / "feed.xml").write_text(feed_text(posts, site, categories), encoding="utf-8")
    written.append("feed.xml")

    share_dir = root / "p"
    share_dir.mkdir(exist_ok=True)
    keep = set()
    for post in posts:
        name = f"{post['slug']}.html"
        keep.add(name)
        (share_dir / name).write_text(share_page_html(post, site), encoding="utf-8")
    for stale in share_dir.glob("*.html"):
        if stale.name not in keep:
            stale.unlink()
    written.append(f"p/*.html ({len(posts)}편)")
    return written


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    data = json.loads((root / "posts.json").read_text(encoding="utf-8"))
    for name in write_site_files(root, data):
        print(" ·", name)
