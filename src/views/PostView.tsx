import { useEffect, useState } from "react";
import { ArrowLeftIcon, NotebookIcon } from "@phosphor-icons/react";
import { api, errorMessage, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { PostCard } from "../components/PostCard";
import { Page } from "../components/Shell";
import { EmptyState } from "../components/ui";

/** A single post, e.g. opened from search. */
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

  return (
    <Page
      title={
        <button onClick={back} className="flex items-center gap-2 hover:text-brand-600">
          <ArrowLeftIcon /> Post
        </button>
      }
    >
      {error ? <EmptyState icon={<NotebookIcon />} title="This post no longer exists" /> : post && <PostCard post={post} />}
    </Page>
  );
}
