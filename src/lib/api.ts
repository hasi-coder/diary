// Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
import { invoke } from "@tauri-apps/api/core";

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
  createdAt: number;
  updatedAt: number;
}

export interface PostInput {
  id?: string;
  authorId: string;
  content: string;
  occurredAt?: number;
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
  id: string;
  name: string;
}

export interface ProfileStats {
  posts: number;
  mentions: number;
}

export interface Snapshot {
  workspace: { id: string; name: string; ownerProfileId: string };
  profiles: Profile[];
  items: Item[];
  stats: Record<string, ProfileStats>;
  postDates: number[];
}

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export const api = {
  listWorkspaces: () => invoke<WorkspaceInfo[]>("list_workspaces"),
  createWorkspace: (name: string, ownerName: string, password: string) =>
    invoke<Snapshot>("create_workspace", { name, ownerName, password }),
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
};

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
