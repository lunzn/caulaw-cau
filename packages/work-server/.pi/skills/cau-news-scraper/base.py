"""
Base scraper class and data models for CAU news scrapers.
All site-specific scrapers must inherit from NewsScraper.
"""

from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from typing import Optional
import logging
import re
import requests
from bs4 import BeautifulSoup


@dataclass
class NewsItem:
    title: str
    url: str
    date: str           # ISO-8601, e.g. "2026-04-10"
    source: str         # site key, e.g. "cau_news"
    source_name: str    # e.g. "中国农业大学新闻网"
    channel: str        # channel id, e.g. "ttgznew"
    channel_name: str   # e.g. "头条关注"
    summary: Optional[str] = None
    content: Optional[str] = None   # full article text, populated by fetch_content()

    def to_dict(self) -> dict:
        return asdict(self)


def clean_text(text: str) -> str:
    """Normalise whitespace in extracted article text."""
    text = re.sub(r"\xa0", " ", text)                # non-breaking spaces
    text = re.sub(r"[ \t]+", " ", text)              # collapse horizontal whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)           # collapse excessive blank lines
    return text.strip()


class NewsScraper(ABC):
    """Abstract base class for all site scrapers.

    To add a new site:
    1. Create a new file in scraper/sites/
    2. Subclass NewsScraper and implement fetch_channel()
    3. Optionally override fetch_article_content() for site-specific extraction
    4. Add the site config to config.json
    5. Register the scraper class in main.py SCRAPERS dict
    """

    DEFAULT_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    }

    # Generic fallback selectors tried in order (subclasses override CONTENT_SELECTORS)
    CONTENT_SELECTORS: list[str] = [
        ".article", ".v_news_content", ".wp_articlecontent",
        ".TRS_Editor", "#vsb_content", "#zoom",
        ".con", ".content", ".detail", ".news_txt",
    ]

    def __init__(self, config: dict):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(self.DEFAULT_HEADERS)
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def fetch_channel(self, channel: dict, limit: int = 10) -> list[NewsItem]:
        """Fetch news item stubs (title, url, date) from one channel list page."""

    def fetch_all(self, limit: int = 10, channels: Optional[list[str]] = None, workers: int = 6) -> list[NewsItem]:
        """Fetch stubs from all (or selected) channels concurrently."""
        target_channels = [
            ch for ch in self.config.get("channels", [])
            if not channels or ch["id"] in channels
        ]
        if not target_channels:
            return []

        results: list[NewsItem] = []

        def fetch_one(ch: dict) -> list[NewsItem]:
            items = self.fetch_channel(ch, limit)
            self.logger.info(
                "Fetched %d items from %s / %s", len(items), self.config["name"], ch["name"]
            )
            return items

        with ThreadPoolExecutor(max_workers=min(workers, len(target_channels))) as executor:
            futures = {executor.submit(fetch_one, ch): ch for ch in target_channels}
            for future in as_completed(futures):
                ch = futures[future]
                try:
                    results.extend(future.result())
                except Exception as exc:
                    self.logger.error("Error fetching %s / %s: %s", self.config["name"], ch["name"], exc)

        return results

    # Domains that block scraping or are not owned by CAU — skip content fetch
    _EXTERNAL_DOMAINS = ("mp.weixin.qq.com", "weibo.com", "bilibili.com", "douyin.com")

    def fetch_article_content(self, url: str) -> str:
        """Fetch and return the full plain-text content of a single article.

        Tries CONTENT_SELECTORS in order; subclasses override for site-specific logic.
        Returns empty string on any failure or for known external/blocked domains.
        """
        if any(d in url for d in self._EXTERNAL_DOMAINS):
            self.logger.debug("Skipping external URL: %s", url)
            return ""
        try:
            resp = self.get(url, headers={"Referer": self.config.get("base_url", "")})
            raw  = resp.content.decode("utf-8", errors="replace")
            soup = BeautifulSoup(raw, "html.parser")

            for sel in self.CONTENT_SELECTORS:
                el = soup.select_one(sel)
                if el:
                    text = el.get_text("\n", strip=True)
                    if len(text) > 30:
                        return clean_text(text)
        except Exception as exc:
            self.logger.warning("Content fetch failed for %s: %s", url, exc)
        return ""

    # ------------------------------------------------------------------ helpers

    def get(self, url: str, **kwargs) -> requests.Response:
        resp = self.session.get(url, timeout=15, **kwargs)
        resp.raise_for_status()
        return resp

    def post(self, url: str, **kwargs) -> requests.Response:
        resp = self.session.post(url, timeout=15, **kwargs)
        resp.raise_for_status()
        return resp
