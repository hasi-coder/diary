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
  /** Free-form gender identities (up to 10), e.g. ["Non-binary", "Two-Spirit"]. */
  genders: string[];
  pronouns: string;
  /** Words used for this profile in relationship labels. */
  terms: "neutral" | "feminine" | "masculine";
  relationshipStatus: string;
  avatar: MediaRef | null;
  cover: MediaRef | null;
  /** Vertical focus of the cover, 0 (top) to 100 (bottom). */
  coverPosition: number;
  relations: Relation[];
  createdAt: number;
  updatedAt: number;
}

/** "`toId` is this profile's `kind`" (e.g. sibling, workplace). */
export interface Relation {
  id: string;
  toId: string;
  kind: string;
  label: string;
  inverseLabel: string;
  since: string;
}

export type RelationInput = Omit<Relation, "id"> & { id?: string };

export type ProfileInput = Omit<Profile, "id" | "createdAt" | "updatedAt" | "avatar" | "cover" | "coverPosition" | "relations"> & { id?: string };

export type PostKind = "status" | "article" | "album" | "milestone";

export interface Feeling {
  emoji: string;
  text: string;
}

export interface Post {
  id: string;
  kind: PostKind;
  /** Articles and albums only. */
  title: string;
  authorId: string;
  /** Markdown; mentions are stored as `@[profile:<uuid>]`. */
  content: string;
  occurredAt: number;
  /** Tagged "with" profiles. */
  withIds: string[];
  /** Check-in place, shop or page. */
  placeId: string | null;
  feeling: Feeling | null;
  /** Life-event category (milestones only). */
  eventType: string;
  media: MediaRef[];
  createdAt: number;
  updatedAt: number;
}

export interface PostInput {
  id?: string;
  kind: PostKind;
  title: string;
  /** Caption per attachment id. */
  captions: Record<string, string>;
  withIds: string[];
  placeId: string | null;
  feeling: Feeling | null;
  eventType: string;
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
  caption: string;
  tags: PhotoTag[];
}

/** A profile tagged on a photo; x/y are 0..1 of the image size. */
export interface PhotoTag {
  profileId: string;
  x: number;
  y: number;
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
  kind?: PostKind;
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

export interface SearchResults {
  /** Folded query terms, for highlighting. */
  terms: string[];
  posts: { post: Post; snippet: string }[];
  profiles: { id: string; snippet: string }[];
  items: { id: string; snippet: string }[];
  totals: { posts: number; profiles: number; items: number };
}

export interface PasswordChange {
  rotated: boolean;
  filesRewritten: number;
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
  search: (query: string, limit = 20) => invoke<SearchResults>("search", { query, limit }),
  getPost: (id: string) => invoke<Post>("get_post", { id }),
  setProfilePhoto: (profileId: string, slot: "avatar" | "cover", mediaId: string | null) =>
    invoke<Profile>("set_profile_photo", { profileId, slot, mediaId }),
  setCoverPosition: (profileId: string, position: number) => invoke<Profile>("set_cover_position", { profileId, position }),
  stageMediaCopy: (mediaId: string) => invoke<MediaRef>("stage_media_copy", { mediaId }),
  saveRelation: (profileId: string, input: RelationInput) => invoke<Profile>("save_relation", { profileId, input }),
  deleteRelation: (profileId: string, relationId: string) => invoke<Profile>("delete_relation", { profileId, relationId }),
  setPhotoTags: (postId: string, mediaId: string, tags: PhotoTag[]) => invoke<Post>("set_photo_tags", { postId, mediaId, tags }),
  changePassword: (current: string, newPassword: string, rotateKey: boolean) =>
    invoke<PasswordChange>("change_password", { current, newPassword, rotateKey }),
};

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
