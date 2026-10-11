// A Facebook-style profile page for any entity: cover, intro, posts, about, shop.
import { useState } from "react";
import {
  ArrowsVerticalIcon,
  BriefcaseIcon,
  CameraIcon,
  ChatTextIcon,
  GenderIntersexIcon,
  HeartIcon,
  HeartStraightIcon,
  MapPinIcon,
  NotebookIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { api, type Profile } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { canSell, KINDS, subtitle } from "../lib/format";
import { Composer } from "../components/Composer";
import { ItemCard } from "../components/ItemCard";
import { MediaGallery } from "../components/Media";
import { ItemForm, ProfileForm } from "../components/forms";
import { PostCard } from "../components/PostCard";
import { LifeEventsCard, PhotoDialog, RelationIntro, RelationshipsSection } from "../components/ProfileExtras";
import { Page } from "../components/Shell";
import { Avatar, Button, ConfirmDialog, CoverImage, EmptyState, KindBadge } from "../components/ui";

type Tab = "posts" | "about" | "media" | "shop";

export function ProfileView({ id, tab }: { id: string; tab?: Tab }) {
  const { profiles, snapshot, navigate, refresh } = useJournal();
  const profile = profiles.get(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photo, setPhoto] = useState<"avatar" | "cover" | null>(null);
  const [coverMenu, setCoverMenu] = useState(false);
  const [reposition, setReposition] = useState<number | null>(null);

  if (!profile) {
    return (
      <Page title="Profile">
        <EmptyState icon={<NotebookIcon />} title="This profile no longer exists" />
      </Page>
    );
  }

  const stats = snapshot.stats[id] ?? { posts: 0, mentions: 0 };
  const items = snapshot.items.filter((i) => i.shopId === id);
  const sells = canSell(profile);
  const active: Tab = tab === "shop" && !sells ? "posts" : (tab ?? "posts");
  const KindIcon = KINDS[profile.kind].icon;

  const tabs: { key: Tab; label: string }[] = [
    { key: "posts", label: "Posts" },
    { key: "about", label: "About" },
    { key: "media", label: "Photos & videos" },
    ...(sells ? [{ key: "shop" as Tab, label: `Shop · ${items.length}` }] : []),
  ];

  return (
    <Page
      wide
      title={
        <>
          <KindIcon className="text-brand-500" /> {profile.name}
        </>
      }
    >
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative">
          <CoverImage profile={reposition === null ? profile : { ...profile, coverPosition: reposition }} className="h-56" />
          {reposition === null ? (
            <div className="absolute bottom-3 right-3">
              <button
                onClick={() => setCoverMenu((o) => !o)}
                className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-700 shadow hover:bg-white"
              >
                <CameraIcon /> {profile.cover ? "Edit cover photo" : "Add cover photo"}
              </button>
              {coverMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCoverMenu(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                    <button className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => (setPhoto("cover"), setCoverMenu(false))}>
                      Choose or upload…
                    </button>
                    {profile.cover && (
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => (setReposition(profile.coverPosition), setCoverMenu(false))}
                      >
                        <ArrowsVerticalIcon /> Reposition
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-black/50 px-4 py-2 text-sm text-white">
              <ArrowsVerticalIcon />
              <input
                type="range"
                min={0}
                max={100}
                value={reposition}
                onChange={(e) => setReposition(Number(e.target.value))}
                className="flex-1 accent-white"
                aria-label="Cover position"
              />
              <button className="rounded-md px-3 py-1 hover:bg-white/10" onClick={() => setReposition(null)}>
                Cancel
              </button>
              <button
                className="rounded-md bg-white px-3 py-1 font-medium text-slate-800"
                onClick={async () => {
                  await api.setCoverPosition(profile.id, reposition);
                  await refresh();
                  setReposition(null);
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 px-6 pb-4 sm:flex-row sm:items-end">
          <div className="relative -mt-20">
            <Avatar profile={profile} size="xl" />
            <button
              onClick={() => setPhoto("avatar")}
              className="absolute bottom-2 right-2 rounded-full bg-slate-100 p-2 text-slate-700 shadow ring-2 ring-white hover:bg-slate-200"
              aria-label="Update profile picture"
              title="Update profile picture"
            >
              <CameraIcon size={18} />
            </button>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-3xl font-bold text-slate-900">
              {profile.name}
              {profile.pronouns && <span className="ml-2 text-base font-normal text-slate-400">({profile.pronouns})</span>}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <KindBadge profile={profile} />
              {profile.kind !== "me" && subtitle(profile) !== KINDS[profile.kind].label && <span>{subtitle(profile)}</span>}
              <span>
                · {stats.posts} posts · {stats.mentions} mentions
              </span>
            </div>
            {profile.tagline && <p className="mt-1 text-sm text-slate-600">{profile.tagline}</p>}
          </div>
          <div className="flex gap-2 pb-1">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilSimpleIcon /> Edit profile
            </Button>
            {profile.kind !== "me" && (
              <Button variant="outline" onClick={() => setDeleting(true)} aria-label="Delete profile" className="!px-3 text-rose-600">
                <TrashIcon />
              </Button>
            )}
          </div>
        </div>
        <nav className="flex gap-1 border-t border-slate-100 px-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => navigate({ view: "profile", id, tab: t.key })}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                active === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </section>

      <div className="mt-6">
        {active === "posts" && (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <div className="space-y-6">
              <IntroCard profile={profile} />
              <LifeEventsCard profile={profile} />
              {sells && items.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-bold text-slate-800">Shop</h2>
                    <button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => navigate({ view: "profile", id, tab: "shop" })}>
                      See all
                    </button>
                  </div>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {items.slice(0, 4).map((i) => (
                      <li key={i.id} className="truncate">
                        <ShoppingBagIcon className="mr-1.5 inline text-slate-400" />
                        {i.name}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <ProfileFeed profile={profile} />
          </div>
        )}
        {active === "about" && (
          <div className="space-y-6">
            <AboutCard profile={profile} />
            <RelationshipsSection profile={profile} />
          </div>
        )}
        {active === "media" && <MediaGallery profileId={profile.id} />}
        {active === "shop" && <ShopTab profile={profile} />}
      </div>

      {editing && <ProfileForm profile={profile} onClose={() => setEditing(false)} />}
      {photo && <PhotoDialog profile={profile} slot={photo} onClose={() => setPhoto(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${profile.name}?`}
          message={
            <>
              This deletes the profile, the <b>{stats.posts}</b> posts written as {profile.name}
              {items.length > 0 && (
                <>
                  , and <b>{items.length}</b> listed items
                </>
              )}
              . Mentions in other posts will show as a deleted profile.
            </>
          }
          onConfirm={async () => {
            await api.deleteProfile(id);
            navigate({ view: "profiles" });
            await refresh();
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Page>
  );
}

function ProfileFeed({ profile }: { profile: Profile }) {
  const { posts } = usePosts({ profileId: profile.id });
  return (
    <div className="min-w-0 space-y-6">
      <Composer defaultAuthorId={profile.id} />
      {posts?.map((p) => <PostCard key={p.id} post={p} />)}
      {posts?.length === 0 && (
        <EmptyState icon={<NotebookIcon />} title="No posts yet">
          Posts written as {profile.name}, or mentioning @{profile.name}, show up here.
        </EmptyState>
      )}
    </div>
  );
}

function IntroCard({ profile }: { profile: Profile }) {
  const rows = detailRows(profile);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-slate-800">Intro</h2>
      {profile.bio && <p className="mb-3 text-center text-sm text-slate-600">{profile.bio}</p>}
      <ul className="space-y-2 text-sm text-slate-600">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <r.icon className="shrink-0 text-slate-400" size={18} /> {r.value}
          </li>
        ))}
      </ul>
      <div className={rows.length ? "mt-3" : ""}>
        <RelationIntro profile={profile} />
      </div>
      {!profile.bio && rows.length === 0 && <p className="text-sm text-slate-400">No details yet. Use “Edit profile” to add some.</p>}
    </section>
  );
}

function AboutCard({ profile }: { profile: Profile }) {
  const rows = [
    { label: "Type", value: KINDS[profile.kind].label },
    { label: "Tagline", value: profile.tagline },
    { label: "Bio", value: profile.bio },
    { label: "Relationship", value: profile.relationship },
    { label: "Gender", value: profile.genders.join(", ") },
    { label: "Pronouns", value: profile.pronouns },
    { label: "Relationship status", value: profile.relationshipStatus },
    { label: "Category", value: profile.category },
    { label: "Location", value: profile.location },
    { label: "Added", value: new Date(profile.createdAt).toLocaleDateString(undefined, { dateStyle: "long" }) },
  ].filter((r) => r.value);
  return (
    <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-slate-800">About</h2>
      <dl className="divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[8rem_1fr] gap-4 py-3 text-sm">
            <dt className="font-medium text-slate-500">{r.label}</dt>
            <dd className="whitespace-pre-wrap text-slate-800">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ShopTab({ profile }: { profile: Profile }) {
  const { snapshot } = useJournal();
  const [adding, setAdding] = useState(false);
  const items = snapshot.items.filter((i) => i.shopId === profile.id);
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Items for sale</h2>
        <Button onClick={() => setAdding(true)}>
          <PlusIcon /> List an item
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<ShoppingBagIcon />} title="Nothing listed yet">
          Add the things {profile.name} sells.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} />
          ))}
        </div>
      )}
      {adding && <ItemForm shopId={profile.id} onClose={() => setAdding(false)} />}
    </section>
  );
}

function detailRows(p: Profile) {
  const rows: { label: string; value: string; icon: typeof MapPinIcon }[] = [];
  if (p.relationship) rows.push({ label: "relationship", value: p.relationship, icon: HeartIcon });
  if (p.genders.length) rows.push({ label: "gender", value: p.genders.join(", "), icon: GenderIntersexIcon });
  if (p.pronouns) rows.push({ label: "pronouns", value: p.pronouns, icon: ChatTextIcon });
  if (p.relationshipStatus) rows.push({ label: "status", value: p.relationshipStatus, icon: HeartStraightIcon });
  if (p.category) rows.push({ label: "category", value: p.category, icon: BriefcaseIcon });
  if (p.location) rows.push({ label: "location", value: p.location, icon: MapPinIcon });
  return rows;
}
