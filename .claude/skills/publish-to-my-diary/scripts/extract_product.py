#!/usr/bin/env python3
"""Extract a product (and its shop) from a product page URL, as JSON for My Diary.

    python3 extract_product.py <product-url>

Tries, in order:
  1. Shopify: <url>.js (clean JSON: title, HTML description, price in cents,
     every image, variants and options).
  2. JSON-LD (schema.org Product) in the page.
  3. Open Graph / meta tags.

Prints {"shop": {...}, "product": {...}, "warnings": [...]}. Image URLs are
absolute https and, for Shopify's CDN, sized to 1600 px wide (My Diary stores
images up to 5 MB). Standard library only.
"""
import html
import json
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = "Mozilla/5.0 (Macintosh) MyDiaryImporter/1.0"
MAX_IMAGES = 20


def fetch(url, accept="text/html"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
    except urllib.error.URLError as e:
        # python.org builds on macOS often lack CA certificates; curl uses the
        # system's. Verification stays on either way.
        if not isinstance(getattr(e, "reason", None), ssl.SSLError):
            raise
        out = subprocess.run(["curl", "-fsSL", "--max-time", "30", "-A", UA, "-H", f"Accept: {accept}", url], capture_output=True, check=True)
        return out.stdout.decode("utf-8", "replace")


class Meta(HTMLParser):
    """Collects <meta>, <link rel=icon>, <title> and JSON-LD blocks."""

    def __init__(self):
        super().__init__()
        self.meta, self.jsonld, self.title, self.icon = {}, [], "", ""
        self._in_ld = self._in_title = False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = a.get("property") or a.get("name") or a.get("itemprop")
            if key and a.get("content") and key not in self.meta:
                self.meta[key.lower()] = a["content"]
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld, self._buf = True, []
        elif tag == "title":
            self._in_title = True
        elif tag == "link" and "icon" in (a.get("rel") or "") and not self.icon:
            self.icon = a.get("href", "")

    def handle_endtag(self, tag):
        if tag == "script" and self._in_ld:
            self._in_ld = False
            try:
                self.jsonld.append(json.loads("".join(self._buf)))
            except ValueError:
                pass
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_ld:
            self._buf.append(data)
        elif self._in_title:
            self.title += data


def text_from_html(fragment):
    """HTML description -> readable plain text, keeping paragraphs and bullet lines."""
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", fragment or "")
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)<li[^>]*>", "\n- ", s)
    s = re.sub(r"(?i)</(p|div|h[1-6]|ul|ol|tr)>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in s.splitlines()]
    out = "\n".join(line for line in lines if line)
    return re.sub(r"\n{3,}", "\n\n", out).strip()


def absolute(url, base):
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    return urllib.parse.urljoin(base, url)


def sized(url):
    """Shopify CDN: ask for a 1600 px wide version (originals can exceed 5 MB)."""
    if "cdn.shopify.com" in url or "/cdn/shop/" in url:
        parts = urllib.parse.urlsplit(url)
        q = dict(urllib.parse.parse_qsl(parts.query))
        q["width"] = "1600"
        return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(q)))
    return url


def unique(seq):
    seen, out = set(), []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def jsonld_products(blocks):
    def walk(x):
        if isinstance(x, list):
            for y in x:
                yield from walk(y)
        elif isinstance(x, dict):
            t = x.get("@type")
            if t == "Product" or (isinstance(t, list) and "Product" in t):
                yield x
            for v in x.values():
                if isinstance(v, (list, dict)):
                    yield from walk(v)

    return [p for b in blocks for p in walk(b)]


def main(url):
    url = url.strip()
    parts = urllib.parse.urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    clean_url = urllib.parse.urlunsplit(parts._replace(query="", fragment="")).rstrip("/")
    warnings = []

    page = fetch(url)
    meta = Meta()
    meta.feed(page)
    m = meta.meta

    shop = {
        "name": m.get("og:site_name") or parts.netloc.removeprefix("www.").split(".")[0].title(),
        "url": origin + "/",
        "sourceUrl": origin + "/",
        "iconUrl": absolute(meta.icon, url),
    }
    product = {"sourceUrl": clean_url, "name": "", "description": "", "price": None, "currency": "", "status": "available", "images": [], "options": {}}

    # 1. Shopify
    try:
        js = json.loads(fetch(clean_url + ".js", "application/json"))
        product["name"] = js.get("title", "")
        product["vendor"] = js.get("vendor", "")
        product["description"] = text_from_html(js.get("description", ""))
        if isinstance(js.get("price"), int):
            product["price"] = js["price"] / 100
        product["status"] = "available" if js.get("available", True) else "sold"
        product["images"] = [sized(absolute(i, url)) for i in js.get("images", [])]
        product["options"] = {o["name"]: o["values"] for o in js.get("options", []) if o.get("name") and o["name"] != "Title"}
        product["platform"] = "shopify"
    except Exception:
        pass

    # 2. JSON-LD
    for p in jsonld_products(meta.jsonld):
        product["name"] = product["name"] or html.unescape(p.get("name", ""))
        product["description"] = product["description"] or text_from_html(p.get("description", ""))
        imgs = p.get("image") or []
        imgs = [imgs] if isinstance(imgs, (str, dict)) else imgs
        if product.get("platform") != "shopify":  # Shopify's own list is complete and ordered
            product["images"] += [sized(absolute(i if isinstance(i, str) else i.get("url", ""), url)) for i in imgs]
        offers = p.get("offers") or {}
        offers = offers[0] if isinstance(offers, list) and offers else offers
        if isinstance(offers, dict):
            if product["price"] is None and offers.get("price") not in (None, ""):
                try:
                    product["price"] = float(str(offers["price"]).replace(",", ""))
                except ValueError:
                    pass
            product["currency"] = product["currency"] or offers.get("priceCurrency", "")
            if "OutOfStock" in str(offers.get("availability", "")) and product.get("platform") != "shopify":
                product["status"] = "sold"
        brand = p.get("brand")
        if isinstance(brand, dict) and not product.get("vendor"):
            product["vendor"] = brand.get("name", "")

    # 3. Open Graph / meta
    product["name"] = product["name"] or html.unescape(m.get("og:title", "") or meta.title.strip())
    product["description"] = product["description"] or html.unescape(m.get("og:description", "") or m.get("description", ""))
    if product["price"] is None:
        amount = m.get("og:price:amount") or m.get("product:price:amount")
        if amount:
            try:
                product["price"] = float(amount.replace(",", ""))
            except ValueError:
                pass
    product["currency"] = (product["currency"] or m.get("og:price:currency") or m.get("product:price:currency") or "").upper()
    if m.get("og:image") and not product["images"]:
        product["images"].append(sized(absolute(m["og:image"], url)))

    # The same photo often appears under several URLs (CDN host, size): keep one per file name.
    seen_files, images = set(), []
    for i in unique(i for i in product["images"] if i.startswith("http")):
        name = urllib.parse.urlsplit(i).path.rsplit("/", 1)[-1].lower()
        if name not in seen_files:
            seen_files.add(name)
            images.append(i)
    product["images"] = images
    if len(product["images"]) > MAX_IMAGES:
        warnings.append(f"{len(product['images'])} images found; keeping the first {MAX_IMAGES} (My Diary's limit).")
        product["images"] = product["images"][:MAX_IMAGES]
    if not product["name"]:
        warnings.append("No product name found; this may not be a product page.")
    if product["price"] is None:
        warnings.append("No price found.")
    if not product["currency"]:
        warnings.append("No currency found; ask or infer from the site.")
    # Options read well as a line at the end of the description.
    if product["options"]:
        lines = [f"{k}: {', '.join(map(str, v))}" for k, v in product["options"].items()]
        product["optionsText"] = "\n".join(lines)

    print(json.dumps({"shop": shop, "product": product, "warnings": warnings}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: extract_product.py <product-url>")
    main(sys.argv[1])
