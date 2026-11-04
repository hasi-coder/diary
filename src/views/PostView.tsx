// A single post's page: the article reader, the album page, or a status card.
import { useEffect, useState } from "react";
import { ArrowLeftIcon, ImagesSquareIcon, NotebookIcon } from "@phosphor-icons/react";
import { api, errorMessage, type MediaRef, type Post } from "../lib/api";
import { articleMedia } from "../lib/inlinePhotos";
import { useJournal } from "../lib/journal";
import { formatPostDate, readingMinutes } from "../lib/format";
import { Composer } from "../components/Composer";
import { LayerViewer } from "../components/Layers";
import { MediaGrid, MediaPreview, MediaTile, Theater } from "../components/Media";
import { PostCard, PostMenu } from "../components/PostCard";
import { PostContent } from "../components/PostContent";
import { PostFooter } from "../components/PostFooter";
import { Page } from "../components/Shell";
import { LookProducts, TaggedPhoto } from "../components/Products";
import { SeriesNav } from "../components/SeriesParts";
import { Avatar, EmptyState } from "../components/ui";

export function PostView({ id }: { id: string }) {
  const { version, back } = useJournal();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPost(id)
      .then((p) => (setPost(p), setError(null)))
      .catch((e) => setError(errorMessage(e)));
  }, [id, version]);

  const label = post?.kind === "article" ? "Article" : post?.kind === "album" ? "Album" : "Post";
  return (
    <Page
      wide={post?.kind === "album"}
      title={
        <button onClick={back} className="flex items-center gap-2 hover:text-brand-600">
          <ArrowLeftIcon /> {label}
        </button>
      }
    >
      {post && <SeriesNav post={post} />}
      {error ? (
        <EmptyState icon={<NotebookIcon />} title="This post no longer exists" />
      ) : !post ? null : post.kind === "article" ? (
        <ArticleReader post={post} />
      ) : post.kind === "album" ? (
        <AlbumPage post={post} />
      ) : (
        <PostCard post={post} />
      )}
    </Page>
  );
}

function Byline({ post, extra }: { post: Post; extra?: string }) {
  const { profiles, navigate } = useJournal();
  const author = profiles.get(post.authorId);
  return (
    <button className="flex items-center gap-3 text-left" onClick={() => author && navigate({ view: "profile", id: author.id })}>
      <Avatar profile={author} />
      <span>
        <span className="block text-sm font-semibold text-slate-800 hover:underline">{author?.name ?? "Unknown"}</span>
        <span className="block text-xs text-slate-400">
          {formatPostDate(post.occurredAt)}
          {extra && ` · ${extra}`}
        </span>
      </span>
    </button>
  );
}

function ArticleReader({ post }: { post: Post }) {
  const { back } = useJournal();
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const { cover, rest } = articleMedia(post);
  const view = (m: MediaRef) => setViewing(post.media.indexOf(m));
  // The cover shows whole, in a box shaped like it (within portrait 4:5 and panorama 2.4:1).
  const [aspect, setAspect] = useState<number | null>(null);

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {cover && (
        <button
          onClick={() => view(cover)}
          className={`block w-full overflow-hidden bg-slate-100 ${aspect === null ? "h-[26rem]" : "max-h-[32rem]"}`}
          style={aspect === null ? undefined : { aspectRatio: Math.min(Math.max(aspect, 4 / 5), 2.4) }}
          aria-label="View cover"
        >
          <MediaPreview media={cover} fit={aspect === null ? "cover" : "contain"} onAspect={setAspect} />
        </button>
      )}
      <div className="px-6 py-8 sm:px-12">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">Article</div>
        <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-900">{post.title}</h1>
        <div className="mt-5 flex items-center justify-between border-b border-slate-100 pb-5">
          <Byline post={post} extra={`${readingMinutes(post.content)} min read`} />
          <PostMenu post={post} onEdit={() => setEditing(true)} onDeleted={back} />
        </div>
        <div className="mt-8">
          <PostContent
            content={post.content}
            large
            media={post.media}
            onOpenMedia={(id) => setViewing(post.media.findIndex((m) => m.id === id))}
          />
        </div>
        {rest.length > 0 && <MediaGrid post={post} media={rest} />}
        <div className="mt-8">
          <PostFooter post={post} flush />
        </div>
      </div>
      {viewing !== null && viewing >= 0 && (
        <Theater items={post.media.map((m) => ({ media: m, post }))} index={viewing} onClose={() => setViewing(null)} />
      )}
      {editing && <Composer editing={post} onDone={() => setEditing(false)} />}
    </article>
  );
}

function AlbumPage({ post }: { post: Post }) {
  const { back } = useJournal();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  // A lookbook puts each photo beside the products tagged on it.
  const hasLooks = post.media.some((m) => m.tags.some((t) => t.itemId));
  const layouts = post.layered ? (["layers", "grid", "lookbook"] as const) : (["grid", "lookbook"] as const);
  const [layout, setLayout] = useState<"layers" | "grid" | "lookbook">(post.layered ? "layers" : hasLooks ? "lookbook" : "grid");
  // Turning layers off in an edit leaves no "layers" tab to be on.
  const shown = layout === "layers" && !post.layered ? "grid" : layout;
  const photos = post.media.filter((m) => m.kind === "image").length;
  const videos = post.media.length - photos;
  const counts = [photos && `${photos} photo${photos > 1 ? "s" : ""}`, videos && `${videos} video${videos > 1 ? "s" : ""}`].filter(Boolean).join(" · ");

  return (
    <>
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
              <ImagesSquareIcon /> Album · {counts}
            </div>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">{post.title}</h1>
          </div>
          <PostMenu post={post} onEdit={() => setEditing(true)} onDeleted={back} />
        </div>
        <div className="mt-4">
          <Byline post={post} />
        </div>
        {post.content && (
          <div className="mt-4">
            <PostContent content={post.content} />
          </div>
        )}
        <div className="-mx-6 -mb-6 mt-4">
          <PostFooter post={post} flush />
        </div>
      </section>

      <div className="mt-6 mb-3 flex justify-end">
        <div className="flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Album layout">
          {layouts.map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${shown === l ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {shown === "layers" ? (
        <section className="rounded-2xl bg-white p-4 shadow-sm [&>div]:mt-0">
          <LayerViewer post={post} className="max-h-[70vh]" withProducts />
        </section>
      ) : shown === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {post.media.map((m, i) => (
            <figure key={m.id}>
              <MediaTile media={m} onClick={() => setOpen(i)} className="aspect-square w-full rounded-xl" />
              {m.caption && <figcaption className="mt-1.5 line-clamp-2 text-xs text-slate-500">{m.caption}</figcaption>}
            </figure>
          ))}
        </div>
      ) : (
        <ol className="space-y-8">
          {post.media.map((m, i) => (
            <li key={m.id} className="grid gap-6 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_22rem]">
              <figure>
                {m.kind === "image" ? <TaggedPhoto media={m} onOpen={() => setOpen(i)} /> : <MediaTile media={m} onClick={() => setOpen(i)} className="aspect-video w-full rounded-xl" />}
                {m.caption && <figcaption className="mt-2 text-sm text-slate-600">{m.caption}</figcaption>}
              </figure>
              <section aria-label="In this look">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Look {i + 1} · {m.tags.filter((t) => t.itemId).length} product{m.tags.filter((t) => t.itemId).length === 1 ? "" : "s"}
                </h3>
                <LookProducts tags={m.tags.filter((t) => t.itemId)} empty="No products tagged. Open the photo and use “Tag people & products”." />
              </section>
            </li>
          ))}
        </ol>
      )}

      {open !== null && <Theater items={post.media.map((m) => ({ media: m, post }))} index={open} onClose={() => setOpen(null)} />}
      {editing && <Composer editing={post} onDone={() => setEditing(false)} />}
    </>
  );
}
