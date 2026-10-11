# Architecture Proposal: Zero-Knowledge Encrypted Journal

## 1. Executive Summary

This document outlines the architecture for a fully encrypted, local-first journaling system built with Tauri (Rust + Webview). The system ensures zero-knowledge privacy using a master root password per workspace. It features a Facebook-style timeline, handles rich media (images/video), supports interconnected entities (Profiles, Shops), and utilizes an intelligent local caching layer for high-performance rendering. Code and data will coexist in a single Git repository for fast iteration.

## 2. Project Organization (Single Repo Coexistence)

To meet the requirement of rapid iteration with code and data in the same repository, the directory structure cleanly separates the application logic from the workspaces.

```
/my-journal-repo
├── .git/                      # Standard Git repository
├── .gitignore                 # Ignores local caches and build artifacts
├── /app                       # Tauri Application Code
│   ├── /src-tauri             # Rust backend (Crypto, File I/O, Git)
│   ├── /src                   # Frontend (React/Vue/Svelte UI)
│   └── package.json
└── /data_sources              # The Encrypted Data Workspaces (Tracked in Git)
    ├── /workspace_personal    # Data Source A (Root Password A)
    │   ├── .cache/            # (GIT-IGNORED) High-speed local SQLite/Asset cache
    │   ├── /entities          # Encrypted .enc files for Profiles, Shops, Pages
    │   ├── /posts             # Encrypted .enc files for journal entries & media
    │   └── manifest.enc       # Workspace metadata and integrity checks
    └── /workspace_travel      # Data Source B (Root Password B)
        ├── ...

```

## 3. Data & Entity Model

The journal moves beyond a simple diary by introducing a relational entity model.

* **Workspace (Data Source):** The top-level boundary. Switching workspaces requires entering that workspace's specific root password.

* **Post (Journal Entry):** A self-contained unit representing a specific time.

  * Contains: Timestamp, Markdown content, and an array of embedded media references.

* **Profiles (Entities):** Metadata objects representing nouns in the journal.

  * Types: `User` (friends/family), `Shop`, `Place`, `Page`.

  * Posts can tag Profiles (e.g., `"Had lunch at @[Shop:uuid] with @[User:uuid]"`).

* **Media:** Encrypted images (≤5MB) and videos (≤20MB) tied to specific posts.

## 4. Encryption & Zero-Knowledge Pipeline

Security is absolute. The repository contains *only* ciphertext.

1. **Key Derivation:** User inputs the Master Password for a Workspace. Rust uses **Argon2id** to derive a strong symmetric key.

2. **Decryption:** The key decrypts `manifest.enc`. If successful, the workspace is unlocked.

3. **File Format:** Every Markdown post and Profile is serialized to JSON/Text and encrypted using **AES-256-GCM**.

4. **Media Handling:** Videos and Images are encrypted as binary blobs. Git LFS (Large File Storage) is used to track these `.enc` media files to prevent repository history bloat.

## 5. The Intelligent Caching Layer (High-Performance UX)

A Facebook-style timeline requires instant scrolling. Decrypting 50 posts and 200 images sequentially on every scroll event would cause UI stuttering.

**The Solution: The Ephemeral / Secure Cache**

* When a workspace is unlocked, the Rust backend synchronizes the encrypted `/posts` and `/entities` into a local, hidden `.cache/` folder.

* **Metadata & Text Cache:** Rust populates an in-memory or **SQLCipher** (encrypted SQLite) database with the decrypted Markdown, Timestamps, and Profile data. This allows the timeline to perform ultra-fast filtering (e.g., "Show me all posts in 2024 tagged with 'Coffee Shop'").

* **Media Cache:** For images/videos, Rust decrypts them into a local `.cache/media/` directory.

* **Security Constraint:** To maintain zero-knowledge, the `.cache` folder is **strictly `.gitignore`d**. Furthermore, the cache files can be encrypted with a volatile *Session Key* (held only in RAM). When the app closes, the session key is destroyed, making the local disk cache cryptographically shredded.

## 6. User Experience (UX) - The Timeline

The frontend (running in the Tauri Webview) provides a fluid, modern interface.

* **Infinite Scroll Timeline:** Posts flow chronologically.

* **Scrubber & Filters:** A right-hand sidebar allows jumping to specific Years/Months. A filter bar allows isolating the timeline to specific `@Users` or `#Shops`.

* **Custom URI Protocol:** Media is rendered via a custom protocol (e.g., `journal://cache/media1.jpg`). The Tauri Rust backend intercepts this, reads the decrypted asset from the secure cache, and serves it to the UI (supporting HTTP `Range` requests for video seeking).

* **Profile Cards:** Hovering over a tagged Shop or User in a post brings up a localized Profile Card showing metadata (e.g., shop location, user relationship).

## 7. Developer Experience (DX) & Workflow

Having the code and data in the same repo creates a powerful DX.

* **Hot-Reloading:** You can run `npm run tauri dev`. The frontend will hot-reload instantly as you tweak the React/Vue components, while securely connecting to the Rust backend.

* **Mock Data Generation:** The DX includes a script to generate a "Dummy Workspace" with a known password. This allows you to test the UI and timeline filtering without risking corruption of your actual encrypted journal data during development.

* **Seamless Git Workflow:** You write a journal entry -> Click "Save" -> Rust encrypts it to `.enc` -> You open your terminal in the same repo -> `git add data_sources/` -> `git commit -m "Journal update"` -> `git push`.