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
data_sources/workspace_personal/
├── workspace.json      plaintext: name, Argon2id params, wrapped data key
├── manifest.enc        owner profile id, created time
├── entities/<uuid>.enc profiles
├── posts/<uuid>.enc    journal entries
└── items/<uuid>.enc    shop listings
```

Each `.enc` file is `MDJ1 | 12-byte nonce | ciphertext+tag`. The associated data (for example
`post:<uuid>`) binds the file to its identity, so renamed or swapped files are rejected.

## Development

```bash
npm install
npm run seed:demo     # creates data_sources/workspace_demo (password: demo-password)
npm run tauri:dev     # desktop app with hot reload
npm run test:rust     # backend unit tests
npm run typecheck
```

Set `MY_DIARY_DATA_DIR` to keep workspaces somewhere other than `./data_sources`.
The demo workspace is git-ignored. Real workspaces are meant to be committed:

```bash
git add data_sources/workspace_personal && git commit -m "Journal update"
```
