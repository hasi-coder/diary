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

Not yet built (later phases): media attachments and the `journal://` protocol, Git LFS,
SQLCipher cache, map view, password change.

## On-disk format

```
data_sources/workspace_<label>/
├── workspace.json      plaintext: format version, Argon2id params, wrapped data key
├── manifest.enc        workspace name, owner profile, created time
├── entities/<uuid>.enc profiles
├── posts/<uuid>.enc    journal entries
└── items/<uuid>.enc    shop listings
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
