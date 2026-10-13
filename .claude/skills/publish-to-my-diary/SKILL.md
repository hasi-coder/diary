---
name: publish-to-my-diary
description: Publish a shop/brand page (including public Facebook pages) and its products from a URL into the user's My Diary journal over its MCP server (tools like create_page, create_product, add_product_photos). Use when the user gives a product or shop URL and asks to add, publish, import or save it to My Diary, or to update products already imported.
---

# Publish pages and products to My Diary

My Diary is the user's encrypted journal app. While it's unlocked with **Agent access** on
(Settings › Agent access), it exposes an MCP server with tools for **pages, shops and
products only**. You give it clean details; it downloads the photos itself, encrypts
everything and remembers each record's source URL.

You cannot read posts, people or anything else in the journal, and you must not try.

## 1. Connect

- **As an MCP client (preferred):** look for tools named `find_by_source_url`, `create_page`,
  `create_product`, `add_product_photos`, etc. Their prefix depends on the server name in the
  agent's config (e.g. `my-diary.create_product` or `mcp__my-diary__create_product`), so match on
  the tool name, not the prefix. If they're available, use them and skip the script below.
- **Otherwise (fallback):** use the bundled script. It reads the token from `MY_DIARY_MCP_TOKEN`, or from
  `~/.my-diary-agent-token`, which the user can create with `pbpaste > ~/.my-diary-agent-token
  && chmod 600 ~/.my-diary-agent-token` after copying the token in Settings › Agent access. If
  neither exists, ask the user to create that file. Never print the token or write it anywhere
  else.

  ```bash
  python3 scripts/mcp_call.py --list
  python3 scripts/mcp_call.py find_by_source_url '{"url": "https://shop.example/products/x"}'
  ```

  Pass arguments as one JSON string; for long JSON, build it with `python3 -c` or a heredoc.
- **Errors you may see:**
  - `locked` (HTTP 503): ask the user to unlock My Diary.
  - `Agent access is turned off` (403): ask them to switch it on.
  - Connection refused: My Diary isn't running, or uses another port (shown in Settings).
  - `Invalid token` (401): either the token was regenerated (ask for the current one), or the
    agent's config is wrong. For Codex, `bearer_token_env_var` must name an environment
    variable that holds the token, not contain the token itself. Codex logs "Environment
    variable … is not set" and shows no My Diary tools. The simplest setup is
    `http_headers = { Authorization = "Bearer <token>" }`. Point this out instead of retrying.

## 2. Extract the product

Run the extractor; don't scrape the HTML by hand:

```bash
python3 scripts/extract_product.py "<product url>"
```

It prints `{shop, product, warnings}`:

- **Shopify stores** (most small shops) are read from `<url>.js`. That gives every photo in
  order, the price, availability and options (sizes, colours).
- **Other sites** fall back to schema.org JSON-LD, then Open Graph tags.
- **Image URLs** are absolute; Shopify CDN images are sized to 1600 px. My Diary stores images up
  to 5 MB and at most 20 photos per product.

Read the `warnings`. If the name, price or currency is missing, look at the page yourself or ask
the user rather than guessing. If the URL is a collection or home page rather than a product, ask
which products they want, or extract each product URL.

**Tidy before publishing:**

- **name:** keep the shop's wording but fix ALL CAPS to title case ("Snake Print Double Strap
  Block Heels").
- **description:** keep the substance (what it is, materials, key details, care), drop marketing
  filler and repeated headings. Append the options line from `optionsText` (e.g. `Size: 3, 4, 5`).
- **price:** in major units (`4950`, not cents), with **currency** as an ISO code (`LKR`).
- **status:** `available`, or `sold` if out of stock.

## 2b. Facebook pages

For a `facebook.com` URL, don't use `extract_product.py`; run:

```bash
python3 scripts/extract_facebook.py "<facebook page url>"
```

- **Public only.** It reads what Facebook shows a logged-out visitor: the page's name, its
  about line and its profile photo. Never ask for the user's Facebook login or cookies, and
  never try to get around a login wall.
- **Not available without login:** posts, shop items and Marketplace listings. For those, the
  extractor warns, and `page` may be `null`. Import the page itself (from its main URL), then ask
  the user to paste the item's text and give you its photos. Send those photos as base64
  `images`; use `imageUrls` only for public web addresses.
- **People:** a public personal profile can only be saved as a **page** (`kind: "page"`),
  because agents can't create people in the journal. Say so, and suggest the user add the person
  in the app instead if that's what they meant.
- **Publishing:**
  - Check `find_by_source_url` with the `sourceUrl` first. The extractor normalises it to
    `https://www.facebook.com/<name>/`.
  - Then `create_page` with `name`, `kind` (`shop` if it clearly sells things), `tagline`,
    `sourceUrl` and `avatarUrl`.
  - Leave the follower count out of the tagline.
  - Facebook photo links expire after a few days, so pass them straight on rather than
    saving them.

## 3. Publish

Always check for duplicates first: `find_by_source_url` with the **product URL**, and again with
the **shop's home URL**.

1. **The shop**
   - If a page with that source URL exists, use its `id`.
   - Otherwise call `list_pages` with the shop name, in case the user made it by hand. If one
     matches clearly, use it; set its `sourceUrl` with `update_page` if that's empty.
   - Otherwise `create_page`:
     ```json
     {"name": "Sereppu", "kind": "shop", "category": "Footwear", "tagline": "<one line about the brand>",
      "sourceUrl": "https://sereppu.com/", "avatarUrl": "<shop logo url, if any>"}
     ```
     Use `kind: "shop"` for stores, `"page"` for brands or clubs that only sometimes sell.
     `avatarUrl` and `coverUrl` are optional; a logo from `shop.iconUrl` is often tiny, so prefer
     a larger logo or skip it.
2. **The product**
   - **New:** `create_product` with `pageId`, `name`, `description`, `price`, `currency`,
     `status`, `sourceUrl` (the product URL) and `imageUrls` (all extracted images, in order,
     up to 20).
   - **Already imported:** `update_product` with only the changed fields. To refresh photos,
     pass `removePhotoIds` (from `get_product`), then `add_product_photos` with `imageUrls`.
3. **Report back:** the shop and product names, price, number of photos, and whether you created
   or updated each.

**Photos:** pass `imageUrls`, and let My Diary download them. Don't fetch images yourself and
send base64: it's slow and fills your context. Use `images` (base64) only for files the user gives
you locally.

**If an image fails** ("isn't a public address", "larger than 25 MB", "Unsupported file type"),
retry `add_product_photos` without that image and tell the user which one was skipped. The app
refuses non-public addresses on purpose.

## Rules

- Only pages, shops and products. Never try to reach posts, people, series or the Trash.
- Don't invent details (prices, materials, sizes) that aren't on the page.
- `delete_page` and `delete_product` move things to the user's Trash. Only use them when asked.
- Publish one product per `create_product` call; for many products, go one by one and summarise.
- Never echo or store the token.
