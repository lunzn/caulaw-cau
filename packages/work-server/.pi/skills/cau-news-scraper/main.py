#!/usr/bin/env python3
"""
CAU News Scraper — CLI

Usage:
  python main.py --list
  python main.py --pretty
  python main.py --sites ciee --channels col50389 --limit 10 --fetch-content --pretty
  python main.py --sites cau_news --limit 5 --output /tmp/news.json
"""

import argparse
import io
import json
import logging
import sys
import types
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import _cache

_NEWS_LIST_TTL = 1800      # 30 min — channel listing pages
_ARTICLE_TTL   = 604800    # 7 days — article content never changes

# Allow `python main.py` to work even when the directory is not named 'scraper'.
# Registers this directory as the 'scraper' package so sibling imports resolve.
if "scraper" not in sys.modules:
    _here = Path(__file__).resolve().parent
    _pkg = types.ModuleType("scraper")
    _pkg.__file__ = str(_here / "__init__.py")
    _pkg.__path__ = [str(_here)]
    _pkg.__package__ = "scraper"
    sys.modules["scraper"] = _pkg

# Ensure stdout handles UTF-8 on all platforms (Windows GBK fix)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ---- Scraper registry: add new scrapers here --------------------------------
from scraper.base import NewsScraper, NewsItem
from scraper.sites.cau_news import CauNewsScraper
from scraper.sites.ciee import CIEEScraper
from scraper.sites.scc import SCCScraper

SCRAPERS: dict[str, type[NewsScraper]] = {
    "cau_news": CauNewsScraper,
    "ciee": CIEEScraper,
    "scc": SCCScraper,
}
# ----------------------------------------------------------------------------

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_config() -> dict:
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def list_sites(config: dict) -> None:
    for site_id, site in config["sites"].items():
        print(f"\n[{site_id}] {site['name']}")
        for ch in site.get("channels", []):
            print(f"  - {ch['id']}: {ch['name']}")


def _fill_content(
    items: list[NewsItem],
    scraper_map: dict[str, NewsScraper],
    workers: int,
    logger: logging.Logger,
) -> None:
    """Concurrently fetch full article content for all items, filling item.content in-place."""

    def fetch_one(item: NewsItem) -> tuple[NewsItem, str]:
        scraper = scraper_map.get(item.source)
        if not scraper:
            return item, ""
        cached = _cache.get("news-content", item.url, _ARTICLE_TTL)
        if cached is not None:
            return item, cached
        content = scraper.fetch_article_content(item.url)
        if content:
            _cache.set("news-content", item.url, content)
        return item, content

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_one, item): item for item in items}
        done = 0
        for future in as_completed(futures):
            try:
                item, content = future.result()
                item.content = content or None
            except Exception as exc:
                logger.warning("Content fetch error: %s", exc)
            done += 1
            if done % 20 == 0:
                logger.info("Content fetched: %d / %d", done, len(items))


def run(
    sites: Optional[list[str]] = None,
    channels: Optional[list[str]] = None,
    limit: int = 10,
    fetch_content: bool = True,
    workers: int = 8,
    verbose: bool = False,
) -> dict:
    """
    Main scraping function.

    Args:
        sites:         List of site IDs to fetch (None = all configured sites).
        channels:      List of channel IDs to restrict to (None = all channels).
        limit:         Max news items per channel.
        fetch_content: If True, visit each article page and fill item.content.
        workers:       Thread count for concurrent article fetching (used when fetch_content=True).
        verbose:       Enable DEBUG logging.

    Returns:
        dict with keys: success, total, items (list of dicts), errors (list of str).
    """
    log_level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(level=log_level, format="%(name)s %(levelname)s: %(message)s")
    logger = logging.getLogger("main")

    # 整体结果缓存：相同参数命中时直接返回，无需任何网络请求
    run_key = f"sites={','.join(sorted(sites or []))}|ch={','.join(sorted(channels or []))}|limit={limit}|content={fetch_content}"
    cached_run = _cache.get("news-run", run_key, _NEWS_LIST_TTL)
    if cached_run is not None:
        return cached_run

    config = load_config()
    target_sites = sites or list(config["sites"].keys())

    all_items: list[NewsItem] = []
    scraper_map: dict[str, NewsScraper] = {}
    errors: list[str] = []

    # ── Phase 1: Fetch list pages (stubs) ────────────────────────────────────
    for site_id in target_sites:
        if site_id not in config["sites"]:
            errors.append(f"Unknown site: {site_id}")
            continue
        site_cfg = config["sites"][site_id]
        scraper_key = site_cfg.get("scraper", site_id)
        scraper_cls = SCRAPERS.get(scraper_key)
        if not scraper_cls:
            errors.append(f"No scraper registered for key '{scraper_key}'")
            continue

        scraper = scraper_cls(site_cfg)
        scraper_map[site_id] = scraper
        try:
            cache_key = f"{site_id}:{limit}:{','.join(sorted(channels or []))}"
            cached_list = _cache.get("news-list", cache_key, _NEWS_LIST_TTL)
            if cached_list is not None:
                items = [NewsItem(**d) for d in cached_list]
            else:
                items = scraper.fetch_all(limit=limit, channels=channels)
                _cache.set("news-list", cache_key, [i.to_dict() for i in items])
            all_items.extend(items)
        except Exception as exc:
            errors.append(f"{site_id}: {exc}")

    # ── Phase 2: Fetch full article content (optional, concurrent) ────────────
    if fetch_content and all_items:
        logger.info("Fetching content for %d articles with %d workers...", len(all_items), workers)
        _fill_content(all_items, scraper_map, workers, logger)

    # Sort by date descending
    all_items.sort(key=lambda x: x.date or "", reverse=True)

    result = {
        "success": len(errors) == 0,
        "total": len(all_items),
        "items": [i.to_dict() for i in all_items],
        "errors": errors,
    }

    _cache.set("news-run", run_key, result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch news from CAU websites.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--sites", nargs="+", metavar="SITE_ID",
        help="Site IDs to fetch (default: all). E.g.: cau_news ciee scc",
    )
    parser.add_argument(
        "--channels", nargs="+", metavar="CHANNEL_ID",
        help="Channel IDs to restrict to within selected sites (default: all).",
    )
    parser.add_argument(
        "--limit", type=int, default=10,
        help="Max news items per channel (default: 10).",
    )
    parser.add_argument(
        "--no-fetch-content", action="store_true",
        help="Skip fetching article full text (faster, titles/dates only).",
    )
    parser.add_argument(
        "--workers", type=int, default=8,
        help="Concurrent threads for article content fetching (default: 8).",
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
        help="List all configured sites and channels, then exit.",
    )

    args = parser.parse_args()

    if args.list:
        list_sites(load_config())
        sys.exit(0)

    result = run(
        sites=args.sites,
        channels=args.channels,
        limit=args.limit,
        fetch_content=not args.no_fetch_content,
        workers=args.workers,
        verbose=args.verbose,
    )

    indent = 2 if args.pretty else None
    json_output = json.dumps(result, ensure_ascii=False, indent=indent)
    if args.output:
        Path(args.output).write_text(json_output, encoding="utf-8")
    else:
        print(json_output)


if __name__ == "__main__":
    main()
