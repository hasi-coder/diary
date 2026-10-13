#!/usr/bin/env python3
"""Extract a public Facebook page (or public profile) as JSON for My Diary.

    python3 extract_facebook.py <facebook-url>

Reads only what Facebook shows to a logged-out visitor: the name, the
"about" line and the profile photo (Open Graph tags). Posts, shop items and
Marketplace listings need a login, so they aren't fetched; the user has to
give those (text and photos) themselves.

Prints {"page": {...}, "warnings": [...]}. Standard library only.
"""
import html
import json
import re
import sys
import urllib.parse

from extract_product import Meta, fetch

# Facebook paths that aren't a page or profile, and need a login anyway.
NOT_A_PAGE = ("marketplace", "groups", "events", "watch", "reel", "photo", "photos", "posts", "story.php", "permalink.php", "share", "login", "commerce")


def canonical(url):
    """https://www.facebook.com/<name>/ (or profile.php?id=…), without tracking parameters."""
    parts = urllib.parse.urlsplit(url.strip())
    host = parts.netloc.lower().removeprefix("m.").removeprefix("web.").removeprefix("www.")
    if host not in ("facebook.com", "fb.com"):
        sys.exit(f"Not a Facebook URL: {url}")
    segments = [s for s in parts.path.split("/") if s]
    if not segments:
        sys.exit("That's Facebook's home page; give the URL of a page or profile.")
    if segments[0] == "profile.php":
        page_id = dict(urllib.parse.parse_qsl(parts.query)).get("id", "")
        return f"https://www.facebook.com/profile.php?id={page_id}", segments
    return f"https://www.facebook.com/{segments[0]}/", segments


def main(url):
    source, segments = canonical(url)
    warnings = []
    if segments[0] in NOT_A_PAGE or len(segments) > 1 and segments[1] in NOT_A_PAGE:
        warnings.append("This links to a post, listing or group, which Facebook only shows after login. Importing the page it belongs to; ask the user for the item's text and photos.")
    if segments[0] in NOT_A_PAGE:
        print(json.dumps({"page": None, "warnings": warnings}, indent=2))
        return

    meta = Meta()
    meta.feed(fetch(source))
    m = meta.meta
    name = html.unescape(m.get("og:title", "")).strip()
    if not name or name.lower() in ("facebook", "log in or sign up to view", "log into facebook"):
        print(json.dumps({"page": None, "warnings": ["Facebook didn't show this page without login: it's private, restricted (age or country) or doesn't exist."]}, indent=2))
        return

    # "Name. 12,345 followers · 67 talking about this. About text" -> "About text"
    about = html.unescape(m.get("og:description", "") or m.get("description", ""))
    about = re.sub(rf"^{re.escape(name)}\.\s*", "", about)
    stats = re.match(r"^((?:[\d.,]+[KM]? (?:followers|likes|talking about this|were here)[ ·]*)+)\.?\s*", about)
    followers = ""
    if stats:
        followers = stats.group(1).strip(" ·")
        about = about[stats.end():]
    canonical_url = m.get("og:url", "").split("?")[0] or source
    if "profile.php" in source:
        canonical_url = source

    page = {
        "name": name,
        "kind": "page",
        "tagline": about.strip(),
        "followers": followers,
        "sourceUrl": canonical_url,
        "avatarUrl": html.unescape(m.get("og:image", "")),
    }
    if not page["tagline"]:
        warnings.append("No about text; leave the tagline empty or ask the user.")
    if not page["avatarUrl"]:
        warnings.append("No profile photo found.")
    print(json.dumps({"page": page, "warnings": warnings}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: extract_facebook.py <facebook page or profile url>")
    main(sys.argv[1])
