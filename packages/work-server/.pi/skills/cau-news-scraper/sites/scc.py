"""
Scraper for 中国农业大学学生就业服务网 (scc.cau.edu.cn).

The site is SPA-based. News data is loaded via:
  POST https://scc.cau.edu.cn/f/newsCenter/ajax_list
  Body: categoryId=<id>&currentPage=1&pageSize=<n>

Response structure:
  {
    "state": 1,
    "object": {
      "newsPage": {
        "pageNo": 1, "totalPage": 409,
        "list": [
          {"title": "...", "url": "/frontpage/cau/html/newsDetail.html?id=UUID",
           "updateDate": "2026-03-18 15:14", "summary": "..."},
          ...
        ]
      }
    }
  }

URLs in the response are relative paths (starting with /).
Fallback: parse pre-rendered HTML from the homepage if the API is unavailable.

Fallback list item HTML:
  <li>
    <a href="/frontpage/cau/html/newsDetail.html?id=UUID">
      <span class="desc">Title text</span>
      <span class="date">[2026-03-18]</span>
    </a>
  </li>
"""

import re
from urllib.parse import urlparse, parse_qs, urljoin

from bs4 import BeautifulSoup

from scraper.base import NewsScraper, NewsItem, clean_text

_DOMAIN = "https://scc.cau.edu.cn"
_DATE_BRACKET_RE = re.compile(r"\[(\d{4}-\d{2}-\d{2})\]")
_DATE_PLAIN_RE   = re.compile(r"(\d{4}-\d{2}-\d{2})")


def _normalize_scc_date(raw: str) -> str:
    m = _DATE_BRACKET_RE.search(raw)
    if m:
        return m.group(1)
    m = _DATE_PLAIN_RE.search(raw)
    if m:
        return m.group(1)
    return raw.strip("[] ")


def _absolutify(url: str) -> str:
    """Convert a relative path to an absolute URL."""
    if url.startswith("http"):
        return url
    return urljoin(_DOMAIN, url)


class SCCScraper(NewsScraper):
    """Scraper for scc.cau.edu.cn (就业服务网)."""

    _API_LIST   = f"{_DOMAIN}/f/newsCenter/ajax_list"
    _API_VIEW   = f"{_DOMAIN}/f/newsCenter/ajax_view"
    _HOME_URL   = f"{_DOMAIN}/frontpage/cau/html/index.html"

    def fetch_article_content(self, url: str) -> str:
        """Use ajax_view API to get full article text instead of scraping HTML."""
        # Extract article id from URL: newsDetail.html?id=UUID
        parsed = urlparse(url)
        article_id = parse_qs(parsed.query).get("id", [None])[0]
        if not article_id:
            # URL doesn't belong to scc (e.g. links to news.cau.edu.cn) — use generic scraper
            return super().fetch_article_content(url)
        try:
            resp = self.post(
                self._API_VIEW,
                data={"id": article_id},
                headers={"Referer": self._HOME_URL, "X-Requested-With": "XMLHttpRequest"},
            )
            payload = resp.json()
            if payload.get("state") != 1:
                return ""
            article = payload.get("object", {}).get("article", {})
            # Prefer full HTML content (`articleData.content`) over the short
            # `description` preview (~200 chars).
            html_content = (article.get("articleData") or {}).get("content", "")
            if html_content:
                soup = BeautifulSoup(html_content, "html.parser")
                text = clean_text(soup.get_text("\n", strip=True))
                if len(text) > 50:
                    return text
            # Fallback: description field
            description = (article.get("description") or "").strip()
            if description:
                return clean_text(description)
        except Exception as exc:
            self.logger.warning("ajax_view failed for %s: %s", url, exc)
        return ""

    def fetch_channel(self, channel: dict, limit: int = 10) -> list[NewsItem]:
        source       = self.config["id"]
        source_name  = self.config["name"]
        channel_id   = channel["id"]
        channel_name = channel["name"]

        # ---- Try primary API ----
        try:
            return self._fetch_via_list_api(
                channel_id, channel_name, source, source_name, limit
            )
        except Exception as exc:
            self.logger.warning("API failed for %s: %s", channel_name, exc)

        # ---- Fallback: scrape homepage pre-rendered HTML ----
        try:
            return self._fetch_via_homepage(
                channel_id, channel_name, source, source_name, limit
            )
        except Exception as exc:
            self.logger.error("All methods failed for %s: %s", channel_name, exc)
            return []

    def _fetch_via_list_api(self, channel_id: str, channel_name: str,
                            source: str, source_name: str, limit: int) -> list[NewsItem]:
        page  = 1
        items: list[NewsItem] = []

        while len(items) < limit:
            data = {
                "categoryId":  channel_id,
                "currentPage": str(page),
                "pageSize":    str(min(limit - len(items), 20)),
            }
            resp = self.post(
                self._API_LIST, data=data,
                headers={"Referer": self._HOME_URL,
                         "X-Requested-With": "XMLHttpRequest"},
            )
            payload = resp.json()
            if payload.get("state") != 1:
                raise ValueError(f"API state={payload.get('state')}")

            # Navigate: object → newsPage → list
            obj       = payload.get("object", {})
            news_page = obj.get("newsPage", {}) if isinstance(obj, dict) else {}
            records   = news_page.get("list", [])
            if not records:
                break

            for rec in records:
                if not isinstance(rec, dict):
                    continue
                title   = rec.get("title", "").strip()
                url     = _absolutify(rec.get("url", "") or rec.get("link", ""))
                # Prefer releaseDate (publication time) over updateDate (last edit)
                date    = _normalize_scc_date(
                    rec.get("releaseDate") or rec.get("updateDate") or ""
                )
                summary = (rec.get("description") or rec.get("summary") or "").strip() or None
                if title and url:
                    items.append(NewsItem(
                        title=title, url=url, date=date,
                        source=source, source_name=source_name,
                        channel=channel_id, channel_name=channel_name,
                        summary=summary,
                    ))

            total_pages = news_page.get("totalPage", 1)
            if page >= total_pages:
                break
            page += 1

        return items[:limit]

    def _fetch_via_homepage(self, channel_id: str, channel_name: str,
                            source: str, source_name: str, limit: int) -> list[NewsItem]:
        """Last-resort: parse pre-rendered news from the index page."""
        resp = self.get(self._HOME_URL)
        soup = BeautifulSoup(resp.content.decode("utf-8", errors="replace"), "html.parser")

        items: list[NewsItem] = []

        for news_div in soup.select(".noticeLsitWrap .newsList"):
            for li in news_div.select("ul li"):
                a = li.find("a", href=True)
                if not a:
                    continue
                href  = a["href"].strip()
                url   = _absolutify(href)
                desc  = a.select_one("span.desc")
                date_el = a.select_one("span.date")
                title = desc.get_text(strip=True) if desc else a.get_text(strip=True)
                date  = _normalize_scc_date(date_el.get_text()) if date_el else ""
                if title:
                    items.append(NewsItem(
                        title=title, url=url, date=date,
                        source=source, source_name=source_name,
                        channel=channel_id, channel_name=channel_name,
                    ))
                if len(items) >= limit:
                    return items
        return items
