// Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type ProfileKind = "me" | "person" | "page" | "shop" | "place";

export interface Profile {
  id: string;
  kind: ProfileKind;
  name: string;
  tagline: string;
  bio: string;
  relationship: string;
  category: string;
  location: string;
  color: string;
  hasShop: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ProfileInput = Omit<Profile, "id" | "createdAt" | "updatedAt"> & { id?: string };

export interface Post {
  id: string;
  authorId: string;
  /** Markdown; mentions are stored as `@[profile:<uuid>]`. */
  content: string;
  occurredAt: number;
  media: MediaRef[];
  createdAt: number;
  updatedAt: number;
}

export interface PostInput {
  id?: string;
  authorId: string;
  content: string;
  occurredAt?: number;
  /** Attachments in display order: staged uploads or media already on the post. */
  mediaIds: string[];
}

export type MediaKind = "image" | "video";

export interface MediaRef {
  id: string;
  kind: MediaKind;
  mime: string;
  name: string;
  size: number;
}

// Mirrors src-tauri/src/media.rs.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

/** URL the webview loads to get decrypted media from the Rust backend. */
export const mediaUrl = (id: string) => convertFileSrc(id, "journal");

function base64Utf8(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type ItemStatus = "available" | "reserved" | "sold";

export interface Item {
  id: string;
  shopId: string;
  name: string;
  description: string;
  priceCents: number | null;
  currency: string;
  status: ItemStatus;
  createdAt: number;
  updatedAt: number;
}

export type ItemInput = Omit<Item, "id" | "createdAt" | "updatedAt"> & { id?: string };

export interface PostFilter {
  profileId?: string;
  from?: number;
  to?: number;
  search?: string;
}

export interface WorkspaceInfo {
  /** Folder name, e.g. `workspace_personal`. */
  id: string;
  /** Folder name without the prefix. The real name is encrypted. */
  label: string;
}

export interface MigrationStatus {
  currentSchema: number;
  diskSchema: number;
  staleFiles: number;
  pending: { version: number; title: string; detail: string }[];
}

export interface StorageInfo {
  path: string;
  cipher: string;
  kdf: string;
  kdfMemoryKib: number;
  kdfIterations: number;
  kdfParallelism: number;
  padBlock: number;
}

export interface ProfileStats {
  posts: number;
  mentions: number;
}

export interface Snapshot {
  workspace: { id: string; label: string; name: string; ownerProfileId: string };
  profiles: Profile[];
  items: Item[];
  stats: Record<string, ProfileStats>;
  postDates: number[];
  migration: MigrationStatus;
  storage: StorageInfo;
}

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export const api = {
  listWorkspaces: () => invoke<WorkspaceInfo[]>("list_workspaces"),
  createWorkspace: (folder: string, name: string, ownerName: string, password: string) =>
    invoke<Snapshot>("create_workspace", { folder, name, ownerName, password }),
  unlockWorkspace: (id: string, password: string) => invoke<Snapshot>("unlock_workspace", { id, password }),
  lockWorkspace: () => invoke<void>("lock_workspace"),
  getSnapshot: () => invoke<Snapshot>("get_snapshot"),
  listPosts: (filter: PostFilter) => invoke<Post[]>("list_posts", { filter }),
  saveProfile: (input: ProfileInput) => invoke<Profile>("save_profile", { input }),
  deleteProfile: (id: string) => invoke<void>("delete_profile", { id }),
  savePost: (input: PostInput) => invoke<Post>("save_post", { input }),
  deletePost: (id: string) => invoke<void>("delete_post", { id }),
  saveItem: (input: ItemInput) => invoke<Item>("save_item", { input }),
  deleteItem: (id: string) => invoke<void>("delete_item", { id }),
  runMigration: () => invoke<Snapshot>("run_migration"),
  /** Uploads a file as a raw binary body; it stays in memory until a post references it. */
  stageMedia: async (file: File) =>
    invoke<MediaRef>("stage_media", new Uint8Array(await file.arrayBuffer()), {
      headers: { "x-file-name": base64Utf8(file.name) },
    }),
  discardMedia: (ids: string[]) => invoke<void>("discard_media", { ids }),
};

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
