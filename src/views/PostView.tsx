// A single post's page: the article reader, the album page, or a status card.
import { useEffect, useState } from "react";
import { ArrowLeftIcon, ImagesSquareIcon, NotebookIcon } from "@phosphor-icons/react";
import { api, errorMessage, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { formatPostDate, readingMinutes } from "../lib/format";
import { Composer } from "../components/Composer";
import { MediaGrid, MediaPreview, MediaTile, Theater } from "../components/Media";
import { PostCard, PostMenu } from "../components/PostCard";
import { PostContent } from "../components/PostContent";
import { Page } from "../components/Shell";
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
  const [viewing, setViewing] = useState(false);
  const cover = post.media[0];

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {cover && (
        <button onClick={() => setViewing(true)} className="block h-[26rem] w-full overflow-hidden bg-slate-100" aria-label="View cover">
          <MediaPreview media={cover} />
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
          <PostContent content={post.content} large />
        </div>
        {post.media.length > 1 && <MediaGrid post={post} media={post.media.slice(1)} />}
      </div>
      {viewing && <Theater items={post.media.map((m) => ({ media: m, post }))} index={0} onClose={() => setViewing(false)} />}
      {editing && <Composer editing={post} onDone={() => setEditing(false)} />}
    </article>
  );
}

function AlbumPage({ post }: { post: Post }) {
  const { back } = useJournal();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const photos = post.media.filter((m) => m.kind === "image").length;
  const videos = post.media.length - photos;
  const counts = [photos && `${photos} photo${photos > 1 ? "s" : ""}`, videos && `${videos} video${videos > 1 ? "s" : ""}`].filter(Boolean).join(" · ");

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
      </section>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {post.media.map((m, i) => (
          <figure key={m.id}>
            <MediaTile media={m} onClick={() => setOpen(i)} className="aspect-square w-full rounded-xl" />
            {m.caption && <figcaption className="mt-1.5 line-clamp-2 text-xs text-slate-500">{m.caption}</figcaption>}
          </figure>
        ))}
      </div>

      {open !== null && <Theater items={post.media.map((m) => ({ media: m, post }))} index={open} onClose={() => setOpen(null)} />}
      {editing && <Composer editing={post} onDone={() => setEditing(false)} />}
    </>
  );
}
