"""
Scraper for 信息与电气工程学院 (ciee.cau.edu.cn).

Column list pages:
  https://ciee.cau.edu.cn/col/col{ID}/index.html        (page 1)
  https://ciee.cau.edu.cn/col/col{ID}/index_{n}.html    (page n, n >= 2)

Each list item structure (confirmed from live page):
  <li>
    <a href="/art/YYYY/M/D/art_COLID_ARTID.html" title="标题">
      <div class="time">
        <h3>10</h3>          <!-- day -->
        <h6>2026-04</h6>     <!-- YYYY-MM -->
      </div>
      <div class="con">
        <h5 class="overfloat-dot">标题</h5>
        <p class="overfloat-dot-2">摘要</p>
      </div>
    </a>
  </li>

Alternative structure (list_box_06, list_box_07):
  <li>
    <a href="URL">
      <div class="box-date">
        <div class="date-01">07</div>    <!-- day -->
        <div class="date-02">2026-02</div> <!-- YYYY-MM -->
      </div>
      ...
    </a>
  </li>
"""

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scraper.base import NewsScraper, NewsItem

# The CIEE CMS embeds list items inside XML CDATA blocks:
#   <datastore> ... <record><![CDATA[ <li>...</li> ]]></record> ... </datastore>
# We extract the CDATA content and parse it as HTML.
_CDATA_RE = re.compile(r"<!\[CDATA\[(.*?)\]\]>", re.DOTALL)


def _extract_cdata_html(raw_html: str) -> str:
    """Concatenate all CDATA block contents into one HTML fragment."""
    blocks = _CDATA_RE.findall(raw_html)
    return "\n".join(blocks)


def _build_date(day: str, ym: str) -> str:
    """Combine day '10' and YYYY-MM '2026-04' into 'YYYY-MM-DD'."""
    day = day.strip().zfill(2)
    parts = re.split(r"[-.]", ym.strip())
    if len(parts) >= 2:
        year, month = parts[0], parts[1].zfill(2)
        return f"{year}-{month}-{day}"
    return f"{ym}-{day}"


def _is_article_link(href: str) -> bool:
    """Return True only for links that point to actual articles, not navigation."""
    if not href or href.startswith("javascript") or href.startswith("#"):
        return False
    # CIEE articles: /art/YYYY/M/D/art_COLID_ARTID.html or external (mp.weixin, etc.)
    # Exclude nav col pages like /col/col50389/index.html
    if "/col/" in href and "index.html" in href:
        return False
    # Must end in .html or .htm or look like an article
    return href.endswith(".html") or href.endswith(".htm") or "art_" in href or "mp.weixin" in href


def _parse_items(soup: BeautifulSoup, base_url: str, source: str,
                 source_name: str, channel: dict) -> list[NewsItem]:
    items: list[NewsItem] = []
    seen: set[str] = set()

    for li in soup.select("li"):
        a = li.find("a", href=True)
        if not a:
            continue
        href = a["href"].strip()
        if not _is_article_link(href):
            continue
        url = urljoin(base_url, href)
        if url in seen:
            continue

        # ---- date ----
        date = ""
        # Pattern A: div.time > h3 (day) + h6 (YYYY-MM)
        time_div = li.select_one("div.time, div.time_li")
        if time_div:
            day_el = time_div.find("h3") or time_div.find("div", class_="date-01")
            ym_el  = time_div.find("h6") or time_div.find("div", class_="date-02")
            if day_el and ym_el:
                date = _build_date(day_el.get_text(), ym_el.get_text())

        # Pattern B: div.box-date > div.date-01 + div.date-02
        if not date:
            box = li.select_one("div.box-date")
            if box:
                d1 = box.select_one(".date-01")
                d2 = box.select_one(".date-02")
                if d1 and d2:
                    date = _build_date(d1.get_text(), d2.get_text())

        # ---- title ----
        title = a.get("title", "").strip()
        if not title:
            title_el = li.select_one("h5, h6, .title, p.title")
            title = title_el.get_text(strip=True) if title_el else a.get_text(strip=True)

        if title:
            seen.add(url)
            items.append(NewsItem(
                title=title, url=url, date=date,
                source=source, source_name=source_name,
                channel=channel["id"], channel_name=channel["name"],
            ))

    return items


class CIEEScraper(NewsScraper):
    """Scraper for ciee.cau.edu.cn column list pages."""

    # Article body on ciee.cau.edu.cn: confirmed selector `.v_news_content`
    CONTENT_SELECTORS = [".v_news_content", ".wp_articlecontent", ".article"]

    def fetch_channel(self, channel: dict, limit: int = 10) -> list[NewsItem]:
        base_url = self.config["base_url"]
        source = self.config["id"]
        source_name = self.config["name"]
        channel_url = channel["url"]

        items: list[NewsItem] = []
        page = 1

        while len(items) < limit:
            if page == 1:
                url = channel_url
            else:
                # Replace index.html with index_{n}.html
                url = re.sub(r"index\.html$", f"index_{page}.html", channel_url)

            try:
                resp = self.get(url, headers={"Referer": base_url})
                raw = resp.content.decode("utf-8", errors="replace")
                # Extract li items from CDATA blocks (CIEE CMS pattern)
                cdata_html = _extract_cdata_html(raw)
                if cdata_html:
                    soup = BeautifulSoup(cdata_html, "html.parser")
                else:
                    soup = BeautifulSoup(raw, "html.parser")
                page_items = _parse_items(soup, base_url, source, source_name, channel)
            except Exception as exc:
                self.logger.warning("Failed to fetch page %d of %s: %s", page, channel["name"], exc)
                break

            if not page_items:
                break

            seen = {i.url for i in items}
            new = [i for i in page_items if i.url not in seen]
            if not new:
                break  # all duplicates → end of pages
            items.extend(new)

            # Check for next-page link
            next_link = soup.select_one('a.Next, a[href*="index_"], .page-next')
            if not next_link:
                break
            page += 1

        return items[:limit]
