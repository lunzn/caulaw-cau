"""
Scraper for 中国农业大学新闻网 (news.cau.edu.cn).

List page pattern:
  https://news.cau.edu.cn/{channel}/index.htm    (page 1)
  https://news.cau.edu.cn/{channel}/index{n}.htm (page n >= 2)

Confirmed list item HTML structure (from live page):
  <li>
    <a href="UUID.htm" target="_blank">
      <div class="img">
        <div class="date">
          <span class="day gp-f22">08</span>
          <span class="month gp-f12">2026.04</span>
        </div>
      </div>
      <div class="infoBox">
        <div class="title gp-f20 gp-ellipsis-2">Title text</div>
        <div class="summary gp-f14 gp-ellipsis-2">Summary...</div>
      </div>
    </a>
  </li>

Some items may link to external sites (absolute URLs) rather than UUIDs.
"""

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scraper.base import NewsScraper, NewsItem

_UUID_RE = re.compile(r"[a-f0-9]{32}\.htm$")
_DATE_RE  = re.compile(r"(\d{4})[.\-](\d{1,2})")   # "2026.04" or "2026-04"


def _build_date(day_str: str, month_str: str) -> str:
    """Build YYYY-MM-DD from '08' and '2026.04'."""
    day = day_str.strip().zfill(2)
    m = _DATE_RE.search(month_str)
    if m:
        year, month = m.group(1), m.group(2).zfill(2)
        return f"{year}-{month}-{day}"
    return ""


def _parse_items(soup: BeautifulSoup, base_url: str, source: str,
                 source_name: str, channel: dict,
                 channel_base: str = "") -> list[NewsItem]:
    items: list[NewsItem] = []
    seen: set[str] = set()

    for li in soup.find_all("li"):
        a = li.find("a", href=True)
        if not a:
            continue
        href = a["href"].strip()
        if not href or href.startswith("javascript") or href.startswith("#"):
            continue
        # Must be a UUID article link or an absolute article URL
        if not (_UUID_RE.search(href) or href.startswith("http")):
            continue
        resolve_base = (channel_base + "/") if channel_base else (base_url + "/")
        url = urljoin(resolve_base, href)  # resolve relative UUID paths
        if url in seen:
            continue

        # ---- date ----
        # Require at least one known date element — this also filters out
        # navigation/quicklink <li> items which don't have dates.
        #
        # Known date structures across CAU news category pages:
        #   A) div.img > div.date > span.day + span.month   (ttgznew/zhxwnew/kxyj/rwgs/jcdt)
        #   B) div.sj > p(day) + span(YYYY.MM)              (mtndnew)
        #   C) div.textBox > div.date "YYYY.MM.DD"          (sidebar/homepage)
        day_el   = a.select_one("span.day")
        month_el = a.select_one("span.month")
        sj_div   = a.select_one("div.sj")          # mtndnew layout
        date_el  = a.select_one("div.date, span.date, div.textBox div.date")

        if not (day_el or date_el or sj_div):
            continue  # skip navigation items without any date element

        date = ""
        if day_el and month_el:
            # Layout A
            date = _build_date(day_el.get_text(), month_el.get_text())
        elif sj_div:
            # Layout B: div.sj > p(day) + span(YYYY.MM)
            p_el   = sj_div.find("p")
            sp_el  = sj_div.find("span")
            if p_el and sp_el:
                date = _build_date(p_el.get_text(), sp_el.get_text())
        else:
            # Layout C: sidebar "YYYY.MM.DD"
            if date_el:
                raw  = date_el.get_text(strip=True)
                full = re.search(r"(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})", raw)
                if full:
                    date = f"{full.group(1)}-{full.group(2).zfill(2)}-{full.group(3).zfill(2)}"

        # ---- title ----
        # Known title elements: div.title (A/C), div.tit > p.bt (B), span.title, h5, h3
        title_el = a.select_one("div.title, div.tit p.bt, span.title, h5, h3")
        title = title_el.get_text(strip=True) if title_el else a.get_text(strip=True)
        title = title.strip()
        if not title:
            continue

        # ---- summary ----
        summary_el = a.select_one("div.summary, div.textBox p, span.summary")
        summary = summary_el.get_text(strip=True) if summary_el else None

        seen.add(url)
        items.append(NewsItem(
            title=title, url=url, date=date,
            source=source, source_name=source_name,
            channel=channel["id"], channel_name=channel["name"],
            summary=summary or None,
        ))

    return items


class CauNewsScraper(NewsScraper):
    """Scraper for news.cau.edu.cn category list pages."""

    # Article body on news.cau.edu.cn: main content div is `.article`
    CONTENT_SELECTORS = [".article", ".con", ".content"]

    def fetch_channel(self, channel: dict, limit: int = 10) -> list[NewsItem]:
        base_url    = self.config["base_url"]
        source      = self.config["id"]
        source_name = self.config["name"]
        channel_url = channel["url"]
        # channel base for resolving relative UUID links, e.g. "https://news.cau.edu.cn/ttgznew"
        channel_base = channel_url.rsplit("/", 1)[0]

        items: list[NewsItem] = []
        page = 1

        while len(items) < limit:
            if page == 1:
                url = channel_url
            else:
                url = re.sub(r"index\.htm$", f"index{page}.htm", channel_url)

            try:
                resp = self.get(url, headers={"Referer": base_url})
                raw  = resp.content.decode("utf-8", errors="replace")
                soup = BeautifulSoup(raw, "html.parser")
                page_items = _parse_items(soup, base_url, source, source_name, channel,
                                          channel_base=channel_base)
            except Exception as exc:
                self.logger.warning("Failed page %d of %s: %s", page, channel["name"], exc)
                break

            if not page_items:
                break

            seen = {i.url for i in items}
            new  = [i for i in page_items if i.url not in seen]
            if not new:
                break
            items.extend(new)

            # Check for next-page link in pagination area
            next_link = soup.select_one('a.Next, a[href^="index"]')
            if not next_link:
                break
            page += 1

        return items[:limit]
