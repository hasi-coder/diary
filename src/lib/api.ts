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
  /** Where a page or shop was imported from by an agent; absent when none. */
  sourceUrl?: string;
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

export type ProfileInput = Omit<Profile, "id" | "createdAt" | "updatedAt" | "avatar" | "cover" | "coverPosition" | "relations" | "sourceUrl"> & { id?: string };

export type PostKind = "status" | "article" | "album" | "milestone";

export interface Feeling {
  emoji: string;
  text: string;
}

/**
 * One clause of a post's story, in the author's order: a feeling ("feeling" +
 * "festive"), an activity ("working as" + "a nurse"), a life event (no verb:
 * "earned a BSc") or a role ("as" + "a nurse", or no verb: "a nurse"). `thing` is what it names (`role:nurse`, `event:education.earned@bsc`).
 */
export interface Activity {
  emoji: string;
  verb: string;
  object: string;
  thing?: string;
  /** People this clause was with: "attending a party with Dev". */
  withIds?: string[];
  /** Free text after it: "for the first time". */
  detail?: string;
  /** Words describing the object, put before its noun: "gorgeous red" → "a gorgeous red saree". */
  adjectives?: string;
  /** How it was done, after the clause: "quietly", "passionately". */
  adverb?: string;
  /** "was" when it was going on rather than is; absent for "is". */
  tense?: "was";
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
  /** What they're doing: "working as a nurse", "wearing a saree"; absent when none. */
  activities?: Activity[];
  /** Life-event template id (milestones only). */
  eventType: string;
  /** More life events combined into this milestone; absent when none. */
  alsoEventTypes?: string[];
  /** Series it belongs to; absent when none. */
  seriesIds?: string[];
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
  activities: Activity[];
  eventType: string;
  alsoEventTypes: string[];
  seriesIds: string[];
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
/** A person (`profileId`) or a product (`itemId`) tagged at a spot on a photo; x/y are 0..1. */
export interface PhotoTag {
  profileId?: string;
  itemId?: string;
  x: number;
  y: number;
}

/** A named collection of posts; a post can be in several, so series can overlap in time. */
export interface Series {
  id: string;
  title: string;
  description: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export type SeriesInput = Pick<Series, "title" | "description" | "color"> & { id?: string };

/** A series with its posts in date order (part 1 first) and the span they cover. */
export interface SeriesSummary extends Series {
  postIds: string[];
  from: number | null;
  to: number | null;
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
  /** Product photos and videos; the first is the main one. */
  media: MediaRef[];
  /** The product page it was imported from; absent when none. */
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type ItemInput = Omit<Item, "id" | "createdAt" | "updatedAt" | "media" | "sourceUrl"> & { id?: string; mediaIds: string[] };

/** Something in the Trash. */
export interface TrashEntry {
  kind: "post" | "profile" | "item";
  id: string;
  title: string;
  subtitle: string;
  trashedAt: number;
  /** Posts and products that went with a deleted profile. */
  withCount: number;
}

export interface AgentEvent {
  at: number;
  tool: string;
  summary: string;
  ok: boolean;
}

/** Save & Sync settings for a workspace, on this device. */
export interface SyncSettings {
  gitRemote: string;
  gitBranch: string;
  backupDir: string;
  keep: number;
  onLock: boolean;
  lastPushedCommit: string;
  lastGitAt: number | null;
  lastBackupAt: number | null;
  lastError: string;
}

export interface SyncView {
  workspace: string;
  settings: SyncSettings;
  gitAvailable: boolean;
}

export interface SyncReport {
  backup: { snapshot: string | null; newFiles: number; pruned: number } | null;
  git: { commit: string; pushed: boolean } | null;
  errors: string[];
}

export interface BackupInfo {
  name: string;
  createdAt: number;
  files: number;
  bytes: number;
}

/** Agent access (MCP) as Settings shows it. */
export interface AgentAccess {
  enabled: boolean;
  port: number;
  token: string;
  running: boolean;
  url: string;
  /** This app's executable, for the stdio bridge (`--mcp-stdio`). */
  executable: string;
  log: AgentEvent[];
}

export interface PostFilter {
  profileId?: string;
  kind?: PostKind;
  seriesId?: string;
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
  series: SeriesSummary[];
  trashCount: number;
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
  saveSeries: (input: SeriesInput) => invoke<Series>("save_series", { input }),
  listTrash: () => invoke<TrashEntry[]>("list_trash"),
  restoreFromTrash: (kind: TrashEntry["kind"], id: string) => invoke<void>("restore_from_trash", { kind, id }),
  purgeFromTrash: (kind: TrashEntry["kind"], id: string) => invoke<void>("purge_from_trash", { kind, id }),
  emptyTrash: () => invoke<number>("empty_trash"),
  getAgentAccess: () => invoke<AgentAccess>("get_agent_access"),
  setAgentAccess: (enabled: boolean, port?: number) => invoke<AgentAccess>("set_agent_access", { enabled, port }),
  regenerateAgentToken: () => invoke<AgentAccess>("regenerate_agent_token"),
  getSyncSettings: () => invoke<SyncView>("get_sync_settings"),
  saveSyncSettings: (input: Pick<SyncSettings, "gitRemote" | "gitBranch" | "backupDir" | "keep" | "onLock">) => invoke<SyncView>("save_sync_settings", { input }),
  syncNow: (force = false) => invoke<SyncReport>("sync_now", { force }),
  listBackups: () => invoke<BackupInfo[]>("list_backups"),
  restoreBackup: (name: string) => invoke<string>("restore_backup", { name }),
  deleteSeries: (id: string) => invoke<void>("delete_series", { id }),
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
