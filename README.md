# My Diary

A private, local-first journal with a Facebook-style interface. Everything is end-to-end encrypted
with a password only you know, and the encrypted journal lives in this git repository next to the
code.

You write as yourself, and you can also give voices to the **supporting characters** in your life
(friends, family), **pages** (clubs, groups), **shops** (which list items for sale) and **places**.
Each has its own profile page. Entries can be quick **posts**, long-form **articles** or photo
**albums**, with mentions, hashtags, photos and videos.

Built with **Tauri 2** (Rust backend) and **React + TypeScript** (webview UI).

> The original design is in [system_architecture_proposal.md](system_architecture_proposal.md),
> and the original UI mockup is [journal_ui_mockup.html](journal_ui_mockup.html). This README
> describes what is actually built, including where it deliberately differs from the proposal
> (see [Design decisions](#design-decisions)).

---

## Contents

- [Quick start](#quick-start)
- [Features](#features)
- [Security and privacy model](#security-and-privacy-model)
- [Architecture](#architecture)
- [On-disk format](#on-disk-format)
- [Data model](#data-model)
- [Search](#search)
- [Media](#media)
- [Migrations](#migrations)
- [Changing the password](#changing-the-password)
- [Working with git](#working-with-git)
- [Development](#development)
- [Design decisions](#design-decisions)
- [Project history](#project-history)
- [Roadmap](#roadmap)

---

## Quick start

```bash
npm install
npm run seed:demo     # (re)creates data_sources/workspace_demo, password: demo-password
npm run tauri:dev     # starts the desktop app with hot reload
```

Then, on the unlock screen, either:

- **unlock "demo"** with `demo-password`, or
- choose **Create a new workspace** for your own journal. Pick a strong password: it cannot be
  recovered.

**Prerequisites:** Node.js (LTS), a Rust toolchain, the [Tauri system
dependencies](https://v2.tauri.app/start/prerequisites/) for your OS, and (recommended) Git LFS.

---

## Features

### Workspaces

- **Multiple journals in one repo:** each workspace is its own folder under `data_sources/` and
  has its own password.
- **Folder label:** you choose the folder label when creating a workspace. It's the only name
  visible in the repository; the real workspace name is encrypted.
- **Lock:** locking wipes all decrypted data and the key from memory.

### Profiles: the people, pages, shops and places in your story

| Kind | Notes |
| --- | --- |
| **You** | The journal owner. Exactly one per workspace; can't be deleted. |
| **Person** | Supporting characters, with a relationship (e.g. "Sister"). |
| **Page** | Clubs, groups and so on. Can optionally sell items (a Shop tab). |
| **Shop** | Always has a Shop tab for listing items. |
| **Place** | Lakes, cafés, cities. |

Every profile has a Facebook-style page:

- a **profile picture and cover photo**: upload one, or **choose from photos already in the
  journal** (copied, so deleting the post doesn't remove it); the cover can be **repositioned**
  or removed
- an intro card
- for people and you: **gender identity** (any number, up to 10, from Facebook's ~58 custom
  options or typed freely: Non-binary, Two-Spirit, Genderqueer, Trans woman, …), **pronouns**,
  **relationship status** (Facebook's list plus modern ones such as polyamorous or
  queerplatonic), and the **words for family and relationships** (neutral, feminine or masculine).
- tabs: **Posts** (written by or mentioning them), **About**, **Photos & videos** and, for
  sellers, **Shop**.

**Relationships**, like Facebook's "Family and relationships": the **About** tab lists them and
**Add** creates one.

- About 100 kinds, grouped as Family, Partners, Friends & community, Work, Pets, and Places &
  groups. They include today's families and relationships, not only the traditional ones:
  - Family: step, half, adoptive, birth, foster, guardian, donor, gestational carrier,
    co-parent, chosen family, pibling/nibling.
  - Partners: civil and domestic partner, open, poly, nesting partner, metamour, queerplatonic
    partner, "it's complicated", separated, ex, late spouse.
  - Plus mentor, caregiver, therapist, landlord and more, or a **custom** pair of labels.
- Labels are gendered by the **described** profile's chosen words: with neutral words a
  profile shows as *Sibling* or *Parent*, with feminine words as *Sister* or *Mother*. The kinds
  live in one file, [src/lib/relations.json](src/lib/relations.json), which both the UI (labels)
  and the Rust backend (validation, inverses) read, and a test checks every inverse pairs up.
- Each relationship is stored once, on the profile that declared it, and shown on **both**
  profiles with the matching label. If Alex declares Sarah as his *sibling*, Alex appears on
  Sarah's page as her *sibling*. If he declares The Rusty Bean as his *workplace*, he appears on
  the shop's page as an *employee*.
- Some kinds also add a line to the intro card: "Married to …", "Works at …", "Lives in …",
  "Regular at …".

**Any profile can post.** Choose the author with the "as …" selector in the composer. On a
profile's page, the composer posts as that profile by default.

**Deleting a profile** also deletes the posts it wrote and the items it lists. Mentions of it in
other posts show as "deleted profile".

### Posts, articles and albums

The composer has three modes:

| Mode | What it's for | Display |
| --- | --- | --- |
| **Post** | Everyday entries: text plus up to 20 photos/videos. | Inline in the feed with a photo grid. |
| **Article** | Long-form writing with a title. The first image is the cover. | A teaser card in the feed (cover, title, excerpt, reading time) that opens a reading view. |
| **Album** | A titled collection of up to 500 photos and videos, each with its own caption. Drag to add; reorder; mark the cover. | A teaser with a grid in the feed, opening an album page with captioned tiles. |

There is no separate "life event" post: life events are part of a post's **story** (below). A
post whose story has life events shows them big in the feed and in the profile's **Life
events** timeline.

Every type can also carry a story and Facebook-style extras, shown in the headline. For example:
*"Alex Morgan is 😊 feeling happy with Sarah Jenkins and Dev Patel at The Rusty Bean."*

- **Story** (☺): tell what happened as a sentence, built from **clauses** chosen in four groups:

  | Group | Example clause | Reads |
  | --- | --- | --- |
  | 😊 **Feeling** | feeling festive | *is / was* 🥳 feeling festive |
  | 🎬 **Doing** (a verb, then a thing or your own words; plus 🌶️ **Spicy & naughty** and 💔 **Hard times** lists of whole clauses) | attending + an office party · making out · crying at work | *is / was* 🎄 attending an office party · *was* 💋 making out with Dev |
  | 🏁 **Life events** (~5,400, grouped by category) | got promoted, visited Japan | 📈 got promoted (a done thing: no *is/was*) |
  | 🧑‍⚕️ **As** (roles) | *as a nurse* joins the clause before it; *a nurse* stands alone | 🎄 attending the party **as a nurse** · *was* a nurse |

  In the story editor under the post, you can:
  - drag clauses (or use ↑ ↓) into any order;
  - switch each one between **is** (now) and **was** (then), or tell the whole story one way;
  - reword it;
  - tag people on just that clause (*attending the ward party **with Dev***);
  - add your own words (*wearing a saree **for the first time at work***).

  A preview shows the sentence the feed will show:

  > Sarah Jenkins was 🥳 feeling festive, 🎄 attending the ward Christmas party with Dev Patel
  > 🧑‍⚕️ as a nurse and 🥻 wearing a saree for the first time at work.

  > Alex Morgan is 😊 feeling happy, 🏢 attending an office party 🧑‍⚕️ as a nurse, and 📈 got
  > promoted and 🇱🇰 visited Sri Lanka.

  A story on its own, with no text or photos, is a post.
- **Tag people** (👤+): people and pages you were with.
- **Check in** (📍): a place, shop or page.

Tagged people and check-ins count as mentions. The post appears on their profiles, and their
names are searchable.

All three use the same **rich-text editor**:

- headings, bold, italic, strikethrough and inline code
- bulleted, numbered and check lists
- quotes, code blocks, tables, links and dividers
- undo/redo and Markdown shortcuts (typing `## ` makes a heading)
- **`@` mentions** with a profile picker, and `#hashtags`
- ⌘/Ctrl+↵ to save, and a distraction-free focus mode

Entries can be **back-dated** with "Happened on".

### Stories, life events and shared vocabularies

A post's story is a list of **clauses** (`activities[]`), up to 12, in the author's order
([story.ts](src/lib/story.ts) joins them into a sentence). Each clause has:

- an emoji, a verb and an object;
- the `thing` it names (`role:nurse`, `occasion:office_party`, `event:travel.visited@jp`);
- its own tagged people (`withIds`) and extra words (`detail`);
- a `tense` (`was`, or none for *is*).

| Clause | How it's recognised | How it joins |
| --- | --- | --- |
| state | a verb ("feeling", "attending"), or a role on its own ("a nurse") | after *is* or *was*; a change of tense or kind starts a new part: ", and was …" |
| done (life event) | no verb, `thing: "event:…"` | reads on its own: "📈 got promoted" |
| as | verb `as` | attaches to the clause before it: "attending the party as a nurse" |

**Shared vocabularies** ([vocab.ts](src/lib/vocab.ts)) list each thing once:

- about 185 roles (including adult work: content creator, exotic dancer, sex worker, cam model…),
  75 pieces of clothing, 130 occasions (festivals such as Vesak, Diwali, Eid and Christmas,
  parties, trips, dates) and 100 everyday moments
- 58 spicy & naughty moments and 28 hard times, each a whole clause ("skinny dipping",
  "having a one-night stand", "job hunting")
- every country, about 100 sports, 28 races, 90 hobbies, 47 instruments and 108 languages
- pets, exams (including O/L and A/L), degrees and subjects

Doing, As and typed life events all pick from them:

- "Attending" picks an occasion, "wearing" picks clothing, **As** picks a role.
- A **typed life event** (`Visited {country}`, `Became {role}`, `Took up {sport}`,
  `Wore {clothing} for the first time`) is one template; choosing it asks which thing. It is
  stored bound to that thing: `event:travel.visited@jp` reads as "🇯🇵 visited Japan".
- Search expands typed life events, so "japan" finds Visited Japan, Moved to Japan, Started
  learning Japanese and so on.

**Life events** (about 1,900 templates covering about 5,400 concrete events) are in 27 categories,
each split into sub-groups:

| Area | Examples |
| --- | --- |
| Family, baby, childhood, teen | First smile, first steps, Kiri bath, Akuru kiyaweema, Grade 5 scholarship exam, first period, bar/bat/b-mitzvah, quinceañera, Seijin no Hi; mother & daughter, mother & son, father & daughter, father & son, grandparent and sibling moments |
| Work & school life | Milestones grouped by role, from getting in and the first uniform to leaving, plus shared **Work life** and **School life** moments. Spicy moments and passing hard times are not life events: tell them with **Doing** and **As**
("was 🌙 having a night-shift romance 🧑‍⚕️ as a nurse"). The 56 groups are: school students (boys', girls', mixed), university student, intern and software engineer, part-time, primary, preschool and secondary teacher, nurse, midwife, flight attendant, doctor, lawyer, secretary, typist, telephone operator, government clerk, postal worker, bus conductor, tea plucker, housemaid, beautician, hairdresser, fashion designer, model, dancer, receptionist, bank officer, garment worker, working abroad, homemaker, nanny, police, armed forces, pilot, chef, engineer, accountant, part-time jobs, and adult work (content creator, exotic dancer, adult film performer, sex worker, burlesque performer, sex educator). Combine any of them with an **As** clause ("got my wings as a flight attendant") |
| Education and career | Exams, degrees and fields of study (typed); `Became {role}`; work anniversaries |
| Love, weddings and identity | Dating, love and intimacy, **intimate firsts** (🌶️), **heartache & mistakes** (💔), polyamory and queerplatonic partnerships, Poruwa ceremony, Nikah, Anand Karaj, coming out, transition, Pride |
| Women's and reproductive health | Fertility and IVF, pregnancy week by week, birth types, NICU, loss, menopause |
| Everything else | Travel (typed by country), sports and races, hobbies and music, languages, pets, faith and culture, civic life, money, health and sobriety, style firsts, birthdays 1–110, anniversaries, later life, loss and remembrance |

The **Life events** tab filters by **category**, **sub-group**, **life stage** (baby to later
life) and **tone** (🌶️ intimate firsts or 💔 hard times), plus full-text search.

What counts as a life event is a turning point: a first, a start, an end, a change. Things that
happen often or for a while are **Doing**: festivals and celebrations (*celebrating Vesak*), trips
and outings (*on a road trip*), dates and nights out, everyday moments, spicy moments and passing
hard times. They were moved out of the life-event catalog, which now has about 1,900 templates
covering about 5,400 events.

Old ids keep working:

- Per-item ids from before typed templates (`travel.visited_jp`, `career.became_nurse`) and
  per-role copies of shared moments (`roles.nurse_burned_out`) map to their new form when read.
- Phase-2 keys (`work`, `home`, …) resolve to each category's "Other …" template.
- **Life-event posts** saved before stories (`kind: milestone`, with `eventType` and
  `alsoEventTypes`) display as stories: their title becomes the first clause. Editing one saves it
  as an ordinary post with event clauses.

### Photos and videos

- **Formats:** images up to **5 MB** (JPEG, PNG, GIF, WebP, HEIC, AVIF) and videos up to
  **20 MB** (MP4, MOV, WebM).
- **Adding them:** use the image button, drag and drop, or paste.
- **Photo viewer:** clicking any photo opens a full-screen Facebook-style viewer, wherever it is
  (post grid, article, album, gallery or profile tab):
  - the photo on the left, with ‹ › arrows and a **filmstrip** of thumbnails
  - a side panel with the author, date, album or article it belongs to, the **caption**, and file
    details
  - keys: ← → Home End, and Esc (unzoom, then close)
  - click the photo to zoom to full size
  - **Tag people** on a photo: click a spot, then pick who's there. Names appear over the photo
    on hover and are listed under "In this photo". A person's **Photos & videos** tab shows the
    photos they're tagged in.
- **Media Gallery:** every photo and video, filterable by Photos, Videos or **Albums**. Every
  profile has the same view under **Photos & videos**.

### Timeline

- A **year/month scrubber** and **active-entity** filters (the most-mentioned profiles).
- A search box (uses the [search index](#search)); clicking a `#tag` filters by it.
- **Hover cards** on mentions show a profile summary.

### Shops and marketplace

- **Listing items:** shops, and pages with a shop, list items with a price, currency and status
  (available, reserved or sold).
- **Marketplace:** shows every listing in the workspace, with search and a "show sold" toggle.

### Search

Press **⌘K / Ctrl K** (or use **Search** in the sidebar). It searches across posts, articles,
albums, photo captions, profiles and shop items:

- results are ranked and the matches are highlighted
- `#tag` filters by hashtag
- **Show all results** opens a full results page

See [Search](#search) for how it works.

### Settings

- Workspace details, encryption parameters, and **what the repository reveals** (see below).
- **Storage format and migrations**, with a **Run migration** button.
- **Change password**, optionally re-encrypting everything with a new key.

---

## Security and privacy model

**Goal:** the repository contains only ciphertext. Nobody can read your journal without your
password, including people with access to the repo and AI coding agents working in it.

- **Password:** Argon2id (64 MiB, 3 passes) derives a key-encryption key. That key unwraps a
  random 256-bit **data key**.
- **Records:** every profile, post and item, plus the manifest, is sealed with **AES-256-GCM**
  under the data key. Each write uses a fresh random nonce. The record's kind and id are
  authenticated as associated data, so files can't be swapped, renamed or relabelled undetected.
- **Padding:** records are padded to **1 KiB** and media to **64 KiB**, so file sizes don't reveal
  how long an entry is.
- **No plaintext on disk:** decrypted data, the search index and media all live **in memory only**.
  Nothing decrypted is ever written to disk, media responses are marked `no-store`, and locking or
  quitting drops everything and zeroizes the key.
- **Passwords never leave the app:** they're typed into the app and passed straight to Rust.

### What the repository reveals

| Encrypted | Visible |
| --- | --- |
| Workspace name, profiles, every post/article/album, dates, mentions, tags, captions, shop items and prices, who wrote what, photo/video content and file names | The folder label you chose; the format version and Argon2id parameters; the wrapped (encrypted) data key; each file's record kind (profile/post/item/media) and how many of each there are; sizes rounded to the padding block; git commit times |

### Keeping AI agents out

`.claude/settings.json` denies Claude Code read and write access to `data_sources/`. That's a
safety net. The real protection is that the files are ciphertext and the password is only ever
typed into the app. **Never paste a real password into a chat.**

---

## Architecture

```
┌──────────────────────── Webview (React) ────────────────────────┐
│  Timeline · Profiles · Gallery · Marketplace · Search · Settings │
│  RichEditor (TipTap, Markdown in/out) · Theater photo viewer     │
└──────────────┬───────────────────────────────────┬───────────────┘
      invoke() │ JSON / raw bytes                  │ journal://<media-id>
               ▼                                   ▼
┌──────────────────────────── Rust (Tauri) ────────────────────────┐
│ commands.rs   IPC commands; AppState holds the unlocked Workspace │
│ store.rs      workspace lifecycle, CRUD, password change, views   │
│ search.rs     in-memory inverted index (BM25)                     │
│ media.rs      upload validation, protocol handler, LRU cache      │
│ record.rs     encrypted record/blob container                     │
│ migrate.rs    versioned migration steps                           │
│ crypto.rs     Argon2id, AES-256-GCM, padding                      │
└──────────────────────────────┬────────────────────────────────────┘
                               ▼
              data_sources/workspace_<label>/  (ciphertext, in git)
```

### Repository layout

```
my-diary/
├── data_sources/              Encrypted workspaces (each committed except workspace_demo)
├── src/                       React frontend
│   ├── App.tsx                Unlock vs. workspace; routes; ⌘K
│   ├── lib/                   api.ts (typed IPC), journal.tsx (state and routing),
│   │                          mentions.ts, format.ts, catalog.ts (feelings, genders,
│   │                          statuses), relations.json, lifeEvents.ts
│   ├── components/            Composer, RichEditor, PostCard, Media (grid, Theater, gallery),
│   │                          Attachments (uploads, album editor), Search, ChangePassword, ...
│   └── views/                 Timeline, Profiles, Profile, Post (article/album pages),
│                              Gallery, Marketplace, Search, Settings
├── src-tauri/
│   ├── src/                   Rust backend (see above); bin/seed.rs makes the demo workspace
│   ├── capabilities/          Tauri permissions
│   └── tauri.conf.json        Window, CSP (allows journal: for media), build config
├── assets/app-icon.svg        Source for the generated app icons
├── system_architecture_proposal.md
└── journal_ui_mockup.html
```

---

## On-disk format

```
data_sources/workspace_<label>/
├── workspace.json        plaintext: format version, Argon2id params + salt, wrapped data key
├── manifest.enc          workspace name, owner profile id, created time
├── entities/<uuid>.enc   profiles
├── posts/<uuid>.enc      posts, articles and albums
├── items/<uuid>.enc      shop listings
└── media/<uuid>.enc      photo and video bytes (Git LFS)
```

**Records:**

```
"MDJ2" | kind byte | 12-byte nonce | AES-256-GCM( pad_1KiB( envelope JSON ) )
AAD = header (5 bytes) + record id

envelope = { "schema": 2, "kind": "post", "meta": { ...pre-built front matter... }, "data": { ... } }
```

**Media:**

```
"MDJ2" | 0x05 | nonce | AES-256-GCM( pad_64KiB( raw bytes ) )
```

Media has no JSON envelope. A file's name, type, size and caption are stored in the (encrypted)
post that references it, so listing media never decrypts large files.

The **5-byte header** is the only plaintext in a record. It names the record kind, so
migration tooling can route files. `meta` is derived data that's recomputed on every write; for
posts that's the mentions and hashtags.

Writes use temp file + rename, so a crash never leaves a half-written record.

---

## Data model

Defined in `src-tauri/src/model.rs` and mirrored in `src/lib/api.ts`.

| Record | Key fields |
| --- | --- |
| **Profile** | `kind` (me/person/page/shop/place), `name`, `tagline`, `bio`, `relationship`, `category`, `location`, `color`, `hasShop`, `genders[]`, `pronouns`, `terms` (neutral/feminine/masculine), `relationshipStatus`, `avatar`/`cover` (MediaRef), `coverPosition`, `relations[]` |
| **Relation** (inside a profile) | `toId`, `kind` ("`toId` is my `kind`"), `label`/`inverseLabel` (custom), `since` |
| **Post** | `kind` (status/article/album/milestone), `title`, `authorId`, `content` (Markdown), `occurredAt`, `withIds[]`, `placeId`, `feeling` {emoji, text}, `activities[]` (the story: ordered clauses {emoji, verb, object, thing, withIds[], detail, tense}; see [Stories](#stories-life-events-and-shared-vocabularies)), `media[]`. Read-only from older versions: `kind: milestone`, `eventType`, `alsoEventTypes[]` |
| **MediaRef** (inside a post or profile) | `id`, `kind` (image/video), `mime`, `name`, `size`, `caption`, `tags[]` ({profileId, x, y} in 0..1) |
| **Item** | `shopId`, `name`, `description`, `priceCents`, `currency`, `status` (available/reserved/sold) |
| **Manifest** | workspace `name`, `ownerProfileId`, `createdAt` |

- **Markdown is the storage format** for post content. The editor reads and writes Markdown, so
  entries stay readable and independent of the editor framework.
- **Mentions** are stored as `@[profile:<uuid>]` and displayed with the profile's *current* name,
  so renames propagate everywhere.
- **New fields are additive:** fields like `kind`, `title` and `caption` have defaults, so older
  records load unchanged.

---

## Search

`src-tauri/src/search.rs` is an inverted index built from the decrypted cache on unlock and
updated on every write. It lives **only in memory**, so neither plaintext nor plaintext-derived
term lists reach the disk.

- **Tokenizing:** Unicode word boundaries (UAX #29), so Sinhala, Tamil and other scripts with
  combining marks stay whole words. Text is NFKC-normalized, lower-cased and Latin accents are
  folded (`cafe` finds `Café`).
- **Ranking:** BM25 with field weights:

  | Weight | Fields |
  | --- | --- |
  | 3 | Profile names and item names |
  | 2.5 | Article and album titles |
  | 1 | Post text, with mentions resolved to names |
  | 0.8 | Photo captions |
  | 0.5 | Author and file names |

- **Matching:** every word must match (AND), and words also match as prefixes (scored lower), so
  results update as you type. `#tag` matches hashtags.
- **Freshness:** renaming a profile re-indexes the posts that mention it.

---

## Media

- **Uploads:** files go to Rust as a **raw binary IPC body** (no base64). Rust identifies the type
  from the file's magic bytes and ignores the declared MIME type, then enforces the size limits.
- **Staging:** uploads are **staged in memory** until the post is saved, so abandoned drafts
  never leave files behind. Removing an attachment, or deleting its post or author, deletes the
  file.
- **Serving:** the webview loads `journal://localhost/<id>` (`http://journal.localhost/<id>` on
  Windows). The handler decrypts into a **256 MB in-memory LRU cache** and answers HTTP **Range**
  requests, which video seeking needs.

---

## Migrations

Storage formats are versioned (`record::CURRENT_SCHEMA`), and `src-tauri/src/migrate.rs` holds an
ordered list of steps.

1. On unlock, older records are **upgraded in memory**, so the app works immediately.
2. **Settings → Storage format** shows the pending steps and how many files they affect.
3. **Run migration** rewrites them atomically. You then review and commit the diff. An
   interrupted run is safe to repeat.

Because `meta` is recomputed on every write, a migration that only adds new pre-built metadata
just bumps the schema; it needs no data transform.

**To add a migration:**

1. Bump `CURRENT_SCHEMA`.
2. Append a `Step` to `migrate.rs`.
3. Add a test that builds a fixture in the previous format (see `migrates_phase1_workspace`).

**Migrations so far:** schema 1 → 2 (Phase 1 → hardened container). It added padding and the
self-describing header, moved the workspace name out of plaintext, and added post front matter.

---

## Changing the password

**Settings → Password** offers two modes:

| Mode | What changes | Old password still opens… |
| --- | --- | --- |
| **Change password** | `workspace.json` only: new salt, current Argon2id settings, same data key re-wrapped | old clones and git history, **and** anything written later, because the data key is unchanged |
| **Change password and re-encrypt everything** | A **new data key**; every record and media file is re-encrypted (this also completes pending migrations) | only old clones and git history, frozen at the change |

Use re-encryption if someone may know the old password. Neither mode can alter what's already in
git history; removing that needs a history rewrite or a fresh repository.

**Re-encryption is crash-safe:**

1. Every file is written and fsynced into `<workspace>/.rotate/` (git-ignored), followed by a
   `READY` marker.
2. The files are moved into place, with `workspace.json` moved last.
3. On the next unlock, a staged run with `READY` is **rolled forward**. One without it is
   **discarded**, and the old password still works.

---

## Working with git

**Committing your journal:**

```bash
git add data_sources/workspace_<label>
git commit -m "Journal update"
```

- `data_sources/workspace_demo/`, `*/.cache/`, `*/.rotate/` and `*.enc.tmp` are git-ignored.
- `.gitattributes` marks every `.enc` file as binary and sends `media/*.enc` through **Git LFS**.
  Run `brew install git-lfs && git lfs install` once per machine **before committing real
  photos**. Without it, media is stored as ordinary git blobs.
- **Commit author:** this repository has a local git identity (`git config --local user.name`)
  that differs from the global one. Commits use it automatically.
- **Keep journal data out of code commits:** stage code paths explicitly rather than
  `git add -A`, so journal data is only committed when you mean to.

---

## Development

```bash
npm run tauri:dev      # desktop app with hot reload (Vite on :1420)
npm run seed:demo      # recreate the demo workspace (6 profiles, posts, an album, an article, items)
npm run test:rust      # backend tests
npm run typecheck      # frontend types
npm run build          # typecheck + production frontend build
cd src-tauri && cargo clippy --all-targets
```

- **Data location:** set `MY_DIARY_DATA_DIR` to keep workspaces somewhere other than
  `./data_sources`.
- **Tests:** the Rust suite covers the following, using fast Argon2 settings:
  - crypto round-trips and tamper rejection
  - padding
  - that no plaintext ends up on disk
  - workspace create/unlock and wrong passwords
  - cascading deletes and path-traversal guards
  - the Phase 1 → 2 migration
  - the media lifecycle and the protocol handler (including Range requests)
  - search consistency across edits and renames
  - articles and albums
  - tags, check-ins, feelings and life events
  - relationships, in both directions, including cleanup when a profile is deleted
  - profile and cover photos, including copies of journal photos
  - both password-change modes and both crash-recovery paths
- **Debug builds:** Argon2 and AES are compiled with `opt-level = 3`, so unlocking isn't
  painfully slow.

---

## Design decisions

Where the build deliberately differs from `system_architecture_proposal.md`:

| Proposal | Built | Why |
| --- | --- | --- |
| Password-derived key encrypts everything | Password unwraps a random **data key** | Password changes don't require re-encrypting everything, and key rotation is still available |
| SQLCipher cache plus a decrypted `.cache/` media folder | **Memory-only** cache, search index and media LRU | Nothing decrypted ever touches the disk, so there's no cache to shred |
| `manifest.enc` decrypt proves the password | The key-wrap AEAD tag proves it; the manifest is bound by AAD | Same guarantee, and it supports re-wrapping |
| Code under `/app` | `src/` and `src-tauri/` at the repo root | Kept the existing scaffold layout |
| Plaintext workspace name | Name encrypted; only a user-chosen folder label is visible | Minimizes plaintext metadata |
| No padding | 1 KiB record / 64 KiB media padding | Hides entry length |
| Entities: User/Shop/Place/Page | me/person/page/shop/place, plus items for sellers | A single primary user plus supporting characters, with shops that list items |
| Rich text format unspecified | **Markdown** via a TipTap editor | Portable, readable, independent of the editor |

---

## Project history

| Commit | Phase |
| --- | --- |
| `7bec0f2` | Node + Tauri scaffold |
| `2ee6a38` | **Phase 1:** encrypted workspaces, profiles, posts, shops/items, timeline, profile pages, marketplace, demo seed |
| `00d852d` | **Hardening:** MDJ2 record container, padding, encrypted workspace name, UI-driven migrations, Settings page, agent guard |
| `24dc214` | **Media:** encrypted photos/videos, `journal://` protocol with Range support, gallery, Git LFS rules |
| `10e117f` | **Editor and search:** TipTap rich-text editor (Markdown storage), in-memory BM25 search, ⌘K palette |
| `54c8325` | **Password change:** re-wrap or full key rotation with crash-safe staging |
| `1ef207d` | **Articles and albums:** post kinds, per-photo captions, album editor, the photo viewer, article reader, album pages |
| `2d2a6c1` | **Facebook social features:** tag people, check-ins, feelings/activities, life events, photo tagging, relationships, profile pictures and cover photos |
| *latest* | **Life for everyone:** stories: every post tells an ordered sentence of clauses (feelings, doing, ~5,400 life events, *as* roles), each with is/was, its own people and words, replacing the separate life-event post; shared vocabularies; life events by category, sub-group, life stage and tone (spicy, hard); ~100 modern relationship kinds with gendered labels; non-binary gender identities, pronouns and relationship status |

---

## Roadmap

- **Map view:** pin places on a map.
- **Comments and reactions** on posts (from supporting characters).
- **Export:** e.g. Markdown + media, decrypted to a folder you choose.
- **Hiding activity:** batching commits or splitting files further, to hide activity patterns.
