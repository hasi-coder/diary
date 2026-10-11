# My Diary

A local-first, zero-knowledge encrypted journal with a Facebook-style timeline.
Built with Tauri 2 (Rust) + React. See [system_architecture_proposal.md](system_architecture_proposal.md)
for the full design.

## What's in Phase 1

- **Encrypted workspaces** in `data_sources/workspace_<name>/`. A master password is stretched with
  Argon2id and unwraps a random data key. Every record is sealed with AES-256-GCM, and the repo only
  ever holds ciphertext.
- **Profiles**:
  - **You**: the journal owner.
  - **People**: supporting characters.
  - **Pages**: optionally selling items.
  - **Shops**.
  - **Places**.

  Each profile has its own page with cover, intro, posts, about and shop tabs.
- **Posts** in Markdown, written as any profile. Use `@` to mention profiles (stored as
  `@[profile:<uuid>]`, so renames propagate) and `#tags`. Entries can be back-dated.
- **Shops**: list items with price, currency and status (available, reserved or sold). The
  **Marketplace** view shows every listing.
- **Timeline**: a year/month scrubber, active-entity filters, search, and hover profile cards.
- The decrypted cache lives **only in memory**. Locking drops it and zeroizes the key.

- **Photos and videos** (Phase 3): attach them with the image button, by drag-and-drop or by paste.
  Images can be up to 5 MB (JPEG, PNG, GIF, WebP, HEIC, AVIF) and videos up to 20 MB (MP4, MOV, WebM).
  There's a Facebook-style grid and a lightbox on posts, a **Media Gallery**, and a "Photos & videos"
  tab on every profile.

- **Rich-text editor** (Phase 4): headings, bold, italic, strikethrough, code, lists, checklists,
  quotes, code blocks, tables, links, undo/redo, `@` mentions, ⌘↵ to save, and a distraction-free
  focus mode. It's built on TipTap but **stores plain Markdown**, so entries don't depend on the
  editor.
- **Search** (Phase 4): press ⌘K (Ctrl K) or use the sidebar to search posts, profiles and shop
  items, with ranked results and highlighted snippets. The timeline search box and `#tag` clicks
  use the same index.

- **Password change** (Phase 5): in **Settings → Password**, either re-wrap the key (instant) or
  generate a new key and re-encrypt everything. There's a strength meter here and when creating a
  workspace.

Not yet built: map view.

## On-disk format

```
data_sources/workspace_<label>/
├── workspace.json      plaintext: format version, Argon2id params, wrapped data key
├── manifest.enc        workspace name, owner profile, created time
├── entities/<uuid>.enc profiles
├── posts/<uuid>.enc    journal entries
├── items/<uuid>.enc    shop listings
└── media/<uuid>.enc    photo and video bytes (Git LFS)
```

Each record file looks like this:

```
"MDJ2" | kind byte | 12-byte nonce | AES-256-GCM( pad_1KiB( envelope ) )
envelope = { "schema": 2, "kind": "post", "meta": { mentions, tags }, "data": { ... } }
```

The 5-byte header is the only plaintext in a record. It names the record kind, so migration
tooling can route files. The header and the record id are authenticated as associated data, so a
renamed, swapped or relabelled file fails to decrypt.

**What the repo reveals:** the folder label you chose, the format version, the KDF parameters, the
number of records of each kind, their sizes in 1 KiB steps, and git commit times. Everything else
is ciphertext.

## Media

- **Uploads:** the bytes go to Rust as a raw IPC body. Rust identifies the file type from its magic
  bytes and ignores the declared type. Uploads are **staged in memory** until the post is saved, so
  an abandoned draft never leaves a file behind.
- **Saved files:** each one is stored as `"MDJ2" | 0x05 | nonce | AES-256-GCM( pad_64KiB( bytes ) )`.
  The file name, type and size live inside the encrypted post, so listing media never decrypts the
  large files.
- **Serving:** the webview loads `journal://localhost/<id>`. The handler (`media.rs`) decrypts the
  file into a 256 MB in-memory LRU cache and answers HTTP `Range` requests for video seeking.
  Responses are `no-store`. Decrypted bytes never touch the disk, and the cache is dropped and
  zeroized when you lock.
- **Deleting:** removing an attachment, deleting its post, or deleting the post's author deletes
  the media file.

### Git LFS

`.gitattributes` routes `data_sources/**/media/*.enc` through Git LFS and marks every `.enc` file
as binary. Enable it once per machine **before committing real photos**:

```bash
brew install git-lfs && git lfs install
```

Without it, media is committed as ordinary git blobs.

## Search index

`src-tauri/src/search.rs` holds an inverted index with BM25 ranking. It's built from the decrypted
cache on unlock and updated on every write. It lives **only in memory**, so no plaintext or
plaintext-derived term list is ever written to disk. That replaces the SQLCipher cache from the
original proposal.

- **Tokenizing:** words are split on Unicode word boundaries, so Sinhala, Tamil and other scripts
  with combining marks stay whole. Text is NFKC-normalized, lower-cased and Latin accents are folded
  (`cafe` finds `Café`).
- **Matching:** every word must match. Words also match as prefixes (scored lower), so results
  update as you type. `#tag` matches hashtags.
- **What's indexed:** post text with mentions resolved to current names, the author's name,
  attachment file names; profile names and details; item names, descriptions and shop names.
  Renaming a profile re-indexes the posts that mention it.

## Changing the password

The password only unwraps a random data key, so there are two ways to change it:

| Mode | What changes | Old password still opens… |
| --- | --- | --- |
| **Change password** | `workspace.json` only (new salt, current Argon2id settings, key re-wrapped) | old clones and git history, **and** anything written later, because the data key is the same |
| **Re-encrypt everything** | A new data key; every record and media file is re-encrypted (this also completes pending migrations) | only old clones and git history, frozen at the change |

Use re-encryption if the old password may be known to someone. Neither mode can change what's
already in git history; that would need a history rewrite or a fresh repository.

Re-encryption is crash-safe:

1. Every file is written and fsynced into `<workspace>/.rotate/` (git-ignored), followed by a
   `READY` marker.
2. The files are moved into place, with `workspace.json` moved last.
3. When you next unlock, a run that has `READY` is rolled forward. A run without it is discarded,
   and the old password still works.

## Migrations

Storage formats are versioned (`record::CURRENT_SCHEMA`), and `src-tauri/src/migrate.rs` holds an
ordered list of steps. On unlock, older records are upgraded **in memory**, so the app works
immediately. Files on disk change only when you click **Settings → Run migration**. That rewrites
the stale files atomically, and you review and commit the diff.

Derived front matter (`meta`) is recomputed on every write. So a migration that only adds new
pre-built metadata just bumps the schema; it doesn't need a data transform.

To add a migration:

1. Bump `CURRENT_SCHEMA`.
2. Append a `Step` to `migrate.rs`.
3. Add a test that builds a fixture in the previous format. See `migrates_phase1_workspace`.

## Keeping agents out

`.claude/settings.json` denies Claude Code read and write access to `data_sources/`. The files are
ciphertext anyway. What actually protects the content is that the password is only ever typed into
the app.

## Development

```bash
npm install
npm run seed:demo     # (re)creates data_sources/workspace_demo (password: demo-password)
npm run tauri:dev     # desktop app with hot reload
npm run test:rust     # backend unit tests
npm run typecheck
```

Set `MY_DIARY_DATA_DIR` to keep workspaces somewhere other than `./data_sources`.
The demo workspace is git-ignored. Real workspaces are meant to be committed:

```bash
git add data_sources/workspace_personal && git commit -m "Journal update"
```
