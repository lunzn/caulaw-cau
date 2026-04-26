#!/usr/bin/env python3
"""
CIEE Faculty Scraper — CLI

Scrapes teacher information from 信息与电气工程学院 department pages.
Data source: https://ciee.cau.edu.cn/col/col50403/index.html (and sibling department pages)

Usage:
  python main.py --list
  python main.py --pretty
  python main.py --dept col50403 --pretty
  python main.py --dept col50401 col50403 --output /tmp/faculty.json
  python main.py --fetch-bio --local-pages D:/work/CAU-CLAW --pretty
"""

import argparse
import io
import json
import logging
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

import _cache

_DEPT_LIST_TTL = 43200   # 12 h — department faculty lists
_BIO_TTL       = 86400   # 24 h — individual bio pages

# Ensure stdout handles UTF-8 on all platforms (Windows GBK fix)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE_URL = "https://ciee.cau.edu.cn"

# All faculty department pages (col ID → department name)
# col50409 (离退休教职工) uses a different format: text-only list parsed from local HTML
DEPARTMENTS: dict[str, str] = {
    "col50401": "电气工程系",
    "col50402": "电子工程系",
    "col50403": "计算机工程系",
    "col50404": "人工智能系",
    "col50405": "数据科学与工程系",
    "col50406": "计算机图学研究室",
    "col50407": "工程实践创新中心",
    "col50408": "计算中心",
    "col50409": "离退休教职工",
}

# Default path to the locally saved retired faculty page.
# Script is at: caulaw-cau/.pi/skills/ciee-faculty-scraper/main.py
# CAU-CLAW root is 5 levels up from the script file.
# Override with --retired-html at runtime.
DEFAULT_RETIRED_HTML = (
    Path(__file__).resolve().parent  # ciee-faculty-scraper/
    .parent                          # skills/
    .parent                          # .pi/
    .parent                          # caulaw-cau/
    .parent                          # CAU-CLAW/
    / "信息与电气工程学院 离退休教职工.html"
)

# Teachers whose profile links are ciee.cau.edu.cn/art/... pages.
# These pages have no bio content when fetched live (JavaScript-rendered).
# Save the browser-rendered page to --local-pages dir, named by article ID
# (e.g. art_50403_1052845.html), and the scraper will read it instead.
ART_PAGE_TEACHERS = {
    # dept_id → [(name, art_url), ...]
    "col50402": [
        ("王宁",                                    "/art/2025/9/25/art_50402_1082844.html"),
        ("MAHMOUD ABDELHAMID ABDELTAWAB ABDELHAMID", "/art/2025/9/25/art_50402_1082845.html"),
        ("MUHAMMAD HILAL KABIR",                    "/art/2025/2/20/art_50402_1052842.html"),
        ("Mustafa Mhamed Abdalaa Kakoum",           "/art/2025/2/20/art_50402_1052843.html"),
    ],
    "col50403": [
        ("张盼", "/art/2025/2/20/art_50403_1052845.html"),
    ],
    "col50404": [
        ("李双", "/art/2025/2/20/art_50404_1052846.html"),
    ],
    "col50405": [
        ("宋伟", "/art/2025/2/20/art_50405_1052847.html"),
    ],
    "col50407": [
        ("赵雅昆", "/art/2026/1/15/art_50407_1096976.html"),
    ],
    "col50408": [
        ("李飞", "/art/2024/9/4/art_50408_1035805.html"),
    ],
}

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
}

# CIEE CMS embeds content in XML CDATA blocks
_CDATA_RE = re.compile(r"<!\[CDATA\[(.*?)\]\]>", re.DOTALL)

# Extract article ID from a CIEE art URL, e.g. "art_50403_1052845"
_ART_ID_RE = re.compile(r"(art_\d+_\d+)\.html")


@dataclass
class FacultyMember:
    name: str
    rank: str           # e.g. 教授, 副教授, 讲师, 博士后, 离退休教职工
    department: str     # e.g. 计算机工程系
    dept_id: str        # e.g. col50403
    profile_url: str    # link to faculty profile page (empty if no page)
    bio: Optional[str] = None  # full bio text, populated by --fetch-bio

    def to_dict(self) -> dict:
        return asdict(self)


def _extract_cdata_html(raw_html: str) -> str:
    """Concatenate all CDATA block contents into one HTML fragment."""
    blocks = _CDATA_RE.findall(raw_html)
    return "\n".join(blocks)


def _clean_text(text: str) -> str:
    text = re.sub(r"\xa0", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Faculty list page parser (card-style pages for col50401–col50408)
# ---------------------------------------------------------------------------

def _parse_faculty_from_soup(
    soup: BeautifulSoup,
    dept_id: str,
    dept_name: str,
) -> list[FacultyMember]:
    """
    Parse teacher cards from a faculty list page soup.

    HTML structure (both live CDATA-extracted and local saved HTML):
      <ul class="sz_N">
        <h5>教授</h5>
        <li date1="教授" ...>
          <a href="https://faculty.cau.edu.cn/..." title="姓名">
            <div class="pic slow"><img src="..."></div>
            <div class="jsml_name">姓名</div>
          </a>
        </li>
        ...
      </ul>

    On the live site the CDATA blocks contain raw <li> items; the <ul class="sz_N">
    wrapper may not be present in the extracted CDATA. We therefore look for <li>
    elements both inside sz_ <ul> wrappers and at top level, and always prefer the
    `date1` attribute on the <li> for rank (most reliable source).
    """
    members: list[FacultyMember] = []
    seen_keys: set[str] = set()   # profile_url, or "name:{name}" for href=# entries

    def _process_li(li, fallback_rank: str = "") -> None:
        # Prefer date1 attribute on li for rank; fall back to h5-derived rank
        rank = li.get("date1", "").strip() or fallback_rank

        a = li.find("a", href=True)
        if not a:
            return

        href = a["href"].strip()
        if not href or href.startswith("javascript"):
            return

        # Skip sidebar navigation links (department list, not faculty profiles)
        # e.g. /col/col50401/index.html
        if re.search(r"/col/col\d+/index\.html", href):
            return

        # Name: prefer title attribute, fall back to .jsml_name text
        name = a.get("title", "").strip()
        if not name:
            name_div = a.select_one(".jsml_name")
            name = name_div.get_text(strip=True) if name_div else ""
        # Normalise internal spaces (e.g. "黄\xa0岚" → "黄岚")
        name = re.sub(r"\s+", "", name)
        if not name:
            return

        # href=# means teacher has no personal page yet; keep them but skip URL
        if href == "#":
            dedup_key = f"name:{name}"
            profile_url = ""
        else:
            profile_url = href if href.startswith("http") else BASE_URL + href
            dedup_key = profile_url

        if dedup_key in seen_keys:
            return
        seen_keys.add(dedup_key)

        members.append(FacultyMember(
            name=name,
            rank=rank,
            department=dept_name,
            dept_id=dept_id,
            profile_url=profile_url,
        ))

    # Strategy 1: <ul class="sz_N"> wrappers present (local saved HTML or
    # live pages where CDATA contains the full ul structure)
    ul_list = soup.select("ul[class*='sz_']")
    if ul_list:
        for ul in ul_list:
            h5 = ul.find("h5")
            fallback_rank = h5.get_text(strip=True) if h5 else ""
            for li in ul.find_all("li", recursive=False):
                _process_li(li, fallback_rank)
    else:
        # Strategy 2: live pages where CDATA contains bare <li> items without
        # <ul class="sz_N"> wrappers (e.g. 工程实践创新中心, 计算中心).
        # Only process <li> elements that carry the `date1` attribute — these
        # are the faculty cards injected by the CMS. Plain <li> elements (e.g.
        # sidebar navigation items) do NOT have `date1` and are ignored.
        for li in soup.find_all("li", attrs={"date1": True}):
            _process_li(li)

    return members


# ---------------------------------------------------------------------------
# Retired faculty parser (col50409: text-only name list in local HTML)
# ---------------------------------------------------------------------------

def parse_retired_faculty_from_html(html_path: Path) -> list[FacultyMember]:
    """
    Parse retired faculty names from the locally saved 离退休教职工 page.

    The page has a .v_news_content div containing <p> elements with names
    separated by whitespace. Some 2-character names have an internal space
    (e.g. "常    华" = "常华"), handled by merging single-character tokens.
    """
    if not html_path.exists():
        return []

    raw = html_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(raw, "html.parser")
    el = soup.select_one(".v_news_content")
    if not el:
        return []

    names: list[str] = []
    for p in el.find_all("p"):
        tokens = p.get_text().split()
        i = 0
        while i < len(tokens):
            t = tokens[i]
            # Single Chinese char → merge with next token to form full name
            # (e.g. "常" + "华" → "常华")
            if len(t) == 1 and i + 1 < len(tokens):
                names.append(t + tokens[i + 1])
                i += 2
            else:
                names.append(t)
                i += 1

    # Deduplicate while preserving order (website has some duplicates)
    seen: set[str] = set()
    members: list[FacultyMember] = []
    for name in names:
        if name and name not in seen:
            seen.add(name)
            members.append(FacultyMember(
                name=name,
                rank="离退休教职工",
                department="离退休教职工",
                dept_id="col50409",
                profile_url="",
            ))
    return members


# ---------------------------------------------------------------------------
# Network fetchers
# ---------------------------------------------------------------------------

def fetch_dept_faculty(
    session: requests.Session,
    dept_id: str,
    dept_name: str,
    logger: logging.Logger,
) -> list[FacultyMember]:
    """Fetch and parse all teachers from one department page."""
    cached = _cache.get("ciee-dept", dept_id, _DEPT_LIST_TTL)
    if cached is not None:
        logger.info("Cache hit for %s (%s): %d teachers", dept_name, dept_id, len(cached))
        return [FacultyMember(**d) for d in cached]

    url = f"{BASE_URL}/col/{dept_id}/index.html"
    try:
        resp = session.get(url, timeout=15, headers={"Referer": BASE_URL})
        resp.raise_for_status()
        raw = resp.content.decode("utf-8", errors="replace")

        # Try CDATA extraction first (live CIEE CMS pages)
        cdata_html = _extract_cdata_html(raw)
        if cdata_html:
            soup = BeautifulSoup(cdata_html, "html.parser")
        else:
            soup = BeautifulSoup(raw, "html.parser")

        members = _parse_faculty_from_soup(soup, dept_id, dept_name)
        logger.info("Fetched %d teachers from %s (%s)", len(members), dept_name, dept_id)
        _cache.set("ciee-dept", dept_id, [m.to_dict() for m in members])
        return members

    except Exception as exc:
        logger.error("Failed to fetch %s (%s): %s", dept_name, dept_id, exc)
        return []


def _extract_art_id(url: str) -> Optional[str]:
    """Extract article ID from a CIEE art URL, e.g. 'art_50403_1052845'."""
    m = _ART_ID_RE.search(url)
    return m.group(1) if m else None


def fetch_bio(
    session: requests.Session,
    member: FacultyMember,
    logger: logging.Logger,
    local_pages_dir: Optional[Path] = None,
) -> str:
    """
    Fetch plain-text bio from a faculty profile page.

    For ciee.cau.edu.cn/art/... pages (postdoc/staff announcement pages),
    the live page has no content (JavaScript-rendered). If local_pages_dir
    is provided, looks for a locally saved HTML file named {art_id}.html
    (e.g. art_50403_1052845.html) in that directory.
    """
    url = member.profile_url
    if not url:
        return ""
    if any(d in url for d in ("mp.weixin.qq.com", "weibo.com")):
        return ""

    # Check if this is a CIEE art page that needs local file
    if "ciee.cau.edu.cn/art/" in url or url.startswith(BASE_URL + "/art/"):
        art_id = _extract_art_id(url)
        if art_id and local_pages_dir:
            local_file = local_pages_dir / f"{art_id}.html"
            if local_file.exists():
                return _parse_bio_from_file(local_file)
        # Art pages have no live bio content — skip network fetch
        logger.debug("Art page has no live content (save locally): %s", url)
        return ""

    # Regular faculty.cau.edu.cn or other profile pages — check cache first
    cached = _cache.get("ciee-bio", url, _BIO_TTL)
    if cached is not None:
        return cached

    try:
        resp = session.get(url, timeout=15, headers={"Referer": BASE_URL})
        resp.raise_for_status()
        raw = resp.content.decode("utf-8", errors="replace")
        soup = BeautifulSoup(raw, "html.parser")
        bio = _extract_bio_from_soup(soup)
        if bio:
            _cache.set("ciee-bio", url, bio)
        return bio
    except Exception as exc:
        logger.debug("Bio fetch failed for %s: %s", member.name, exc)
    return ""


def _parse_bio_from_file(path: Path) -> str:
    """Parse bio text from a locally saved HTML file."""
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
        soup = BeautifulSoup(raw, "html.parser")
        return _extract_bio_from_soup(soup)
    except Exception:
        return ""


def _extract_bio_from_soup(soup: BeautifulSoup) -> str:
    """Extract bio text from a parsed soup using known selectors."""
    for sel in [
        ".mr.mainbox",          # faculty.cau.edu.cn right column (full profile)
        ".mainbox",             # faculty.cau.edu.cn fallback
        ".v_news_content",      # ciee.cau.edu.cn article pages
        ".wp_articlecontent",
        ".article",
        "#vsb_content",
    ]:
        el = soup.select_one(sel)
        if el:
            text = el.get_text("\n", strip=True)
            if len(text) > 50:
                return _clean_text(text)
    return ""


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def run(
    dept_ids: Optional[list[str]] = None,
    fetch_bio_flag: bool = True,
    search_query: Optional[str] = None,
    workers: int = 8,
    verbose: bool = False,
    retired_html: Optional[Path] = None,
    local_pages_dir: Optional[Path] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> dict:
    """
    Main scraping function.

    Args:
        dept_ids:        Department col IDs to fetch (None = all departments).
        fetch_bio_flag:  If True, visit each profile page and fill member.bio.
        search_query:    If set, filter members by name (case-insensitive substring).
                         When combined with --fetch-bio, only fetches bio for matches.
        workers:         Thread count for concurrent bio fetching.
        verbose:         Enable DEBUG logging.
        retired_html:    Path to locally saved 离退休教职工 page HTML.
                         Defaults to ../../../../CAU-CLAW/信息与电气工程学院 离退休教职工.html
        local_pages_dir: Directory containing locally saved art page HTML files
                         (named by article ID, e.g. art_50403_1052845.html).
                         Required to get bio for postdoc/staff art pages.

    Returns:
        dict with keys: success, total, members (list of dicts), errors (list of str).
    """
    log_level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(level=log_level, format="%(name)s %(levelname)s: %(message)s")
    logger = logging.getLogger("ciee-faculty")

    # 整体结果缓存：相同参数命中时直接返回
    run_key = f"depts={','.join(sorted(dept_ids or []))}|bio={fetch_bio_flag}|search={search_query or ''}|limit={limit}|offset={offset}"
    cached_run = _cache.get("faculty-run", run_key, _DEPT_LIST_TTL)
    if cached_run is not None:
        return cached_run

    targets = dept_ids or list(DEPARTMENTS.keys())
    errors: list[str] = []
    all_members: list[FacultyMember] = []

    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)

    # Phase 1: Fetch faculty lists
    for dept_id in targets:
        dept_name = DEPARTMENTS.get(dept_id)
        if not dept_name:
            errors.append(f"Unknown department ID: {dept_id}")
            continue

        if dept_id == "col50409":
            # Retired faculty: parse from local HTML (text-only name list)
            html_path = retired_html or DEFAULT_RETIRED_HTML
            members = parse_retired_faculty_from_html(html_path)
            if members:
                logger.info("Parsed %d retired faculty from local HTML", len(members))
            else:
                errors.append(
                    f"col50409: retired faculty HTML not found at {html_path}. "
                    "Save https://ciee.cau.edu.cn/col/col50409/index.html locally "
                    "and pass --retired-html <path>."
                )
        else:
            members = fetch_dept_faculty(session, dept_id, dept_name, logger)
        all_members.extend(members)

    # Apply name filter before bio fetching (only fetch bios for matched teachers)
    if search_query:
        q = search_query.strip().lower()
        all_members = [m for m in all_members if q in m.name.lower()]
        if not all_members:
            return {"success": True, "total": 0, "members": [], "errors": errors,
                    "note": f"未找到姓名包含 '{search_query}' 的教师"}

    # Apply pagination BEFORE bio fetching to avoid fetching bios for skipped pages
    total_matched = len(all_members)
    if offset:
        all_members = all_members[offset:]
    if limit is not None:
        all_members = all_members[:limit]

    # Phase 2: Fetch bios (optional, concurrent)
    if fetch_bio_flag:
        fetchable = [m for m in all_members if m.profile_url]
        logger.info("Fetching bios for %d teachers with %d workers...", len(fetchable), workers)

        def _fetch(member: FacultyMember) -> tuple[FacultyMember, str]:
            return member, fetch_bio(session, member, logger, local_pages_dir)

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(_fetch, m): m for m in fetchable}
            for future in as_completed(futures):
                try:
                    member, bio = future.result()
                    member.bio = bio or None
                except Exception as exc:
                    logger.warning("Bio fetch error: %s", exc)

    page_end = offset + len(all_members)
    result = {
        "success": len(errors) == 0,
        "total": total_matched,          # 符合筛选条件的总人数
        "offset": offset,
        "limit": limit,
        "has_more": limit is not None and page_end < total_matched,
        "next_offset": page_end if (limit is not None and page_end < total_matched) else None,
        "members": [m.to_dict() for m in all_members],
        "errors": errors,
    }
    _cache.set("faculty-run", run_key, result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch teacher info from CIEE faculty pages.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dept", nargs="+", metavar="COL_ID",
        help="Department col IDs to fetch (default: all). E.g.: col50403 col50404",
    )
    parser.add_argument(
        "--no-fetch-bio", action="store_true",
        help="Skip fetching teacher bio pages (faster, names/ranks only).",
    )
    parser.add_argument(
        "--search", metavar="NAME",
        help=(
            "Filter output to teachers whose name contains NAME (case-insensitive). "
            "Searches all departments by default; combine with --dept to narrow scope. "
            "When used with --fetch-bio, only fetches bio for matched teachers (fast)."
        ),
    )
    parser.add_argument(
        "--local-pages", metavar="DIR",
        help=(
            "Directory with locally saved art page HTML files "
            "(named art_XXXXX_YYYYYYY.html). Required for postdoc bio."
        ),
    )
    parser.add_argument(
        "--retired-html", metavar="FILE",
        help=(
            "Path to locally saved 离退休教职工 page HTML. "
            f"Default: {DEFAULT_RETIRED_HTML}"
        ),
    )
    parser.add_argument(
        "--workers", type=int, default=8,
        help="Concurrent threads for bio fetching (default: 8).",
    )
    parser.add_argument(
        "--limit", type=int, default=None, metavar="N",
        help="Return at most N teachers (for pagination). Default: no limit.",
    )
    parser.add_argument(
        "--offset", type=int, default=0, metavar="N",
        help="Skip the first N teachers before applying --limit (for pagination). Default: 0.",
    )
    parser.add_argument(
        "--output", metavar="FILE",
        help="Write JSON to this file (default: stdout).",
    )
    parser.add_argument(
        "--pretty", action="store_true",
        help="Pretty-print JSON output.",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable DEBUG logging.",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="List all department IDs and names, then exit.",
    )
    parser.add_argument(
        "--list-art-pages", action="store_true",
        help="List all teachers with ciee.cau.edu.cn/art/ profile pages, then exit.",
    )

    args = parser.parse_args()

    if args.list:
        for dept_id, dept_name in DEPARTMENTS.items():
            print(f"  {dept_id}: {dept_name}")
        sys.exit(0)

    if args.list_art_pages:
        print("Teachers with ciee.cau.edu.cn/art/ profile pages (save these for --fetch-bio):\n")
        for dept_id, teachers in ART_PAGE_TEACHERS.items():
            print(f"[{DEPARTMENTS[dept_id]}]")
            for name, path in teachers:
                print(f"  {name}")
                print(f"    URL:      {BASE_URL}{path}")
                art_id = _extract_art_id(path)
                print(f"    Save as:  {art_id}.html")
        sys.exit(0)

    result = run(
        dept_ids=args.dept,
        fetch_bio_flag=not args.no_fetch_bio,
        search_query=args.search,
        workers=args.workers,
        verbose=args.verbose,
        retired_html=Path(args.retired_html) if args.retired_html else None,
        local_pages_dir=Path(args.local_pages) if args.local_pages else None,
        limit=args.limit,
        offset=args.offset,
    )

    indent = 2 if args.pretty else None
    json_output = json.dumps(result, ensure_ascii=False, indent=indent)
    if args.output:
        Path(args.output).write_text(json_output, encoding="utf-8")
    else:
        print(json_output)


if __name__ == "__main__":
    main()
