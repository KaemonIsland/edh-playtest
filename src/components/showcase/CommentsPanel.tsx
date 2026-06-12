"use client";

import { useCallback, useEffect, useState } from "react";
import { getRepo, type DeckComment } from "@/lib/repo";

/** Threaded comments — only functional with the Supabase backend. */
export function CommentsPanel({ deckId }: { deckId: string }) {
  const repo = getRepo();
  const [comments, setComments] = useState<DeckComment[]>([]);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<DeckComment | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (repo.mode === "supabase") setComments(await repo.listComments(deckId));
  }, [deckId, repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (repo.mode === "local") {
    return (
      <div>
        <p className="text-xs text-stone-600">
          Comments need the shared backend. Create a Supabase project, run{" "}
          <code className="rounded bg-stone-900 px-1">supabase/schema.sql</code>, and set{" "}
          <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_SUPABASE_URL</code> +{" "}
          <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    );
  }

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await repo.addComment({
        deckId,
        author: author.trim() || "Anonymous",
        body: body.trim(),
        date: Date.now(),
        parentId: replyTo?.id ?? null,
      });
      setBody("");
      setReplyTo(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const roots = comments.filter((c) => !c.parentId);
  const childrenOf = (id: DeckComment["id"]) => comments.filter((c) => c.parentId === id);

  const CommentRow = ({ comment, depth }: { comment: DeckComment; depth: number }) => (
    <div style={{ marginLeft: depth * 20 }} className="mb-2 rounded-md bg-stone-900/60 px-3 py-2">
      <div className="flex items-baseline gap-2 text-[11px]">
        <span className="font-bold text-stone-300">{comment.author}</span>
        <span className="text-stone-600">{new Date(comment.date).toLocaleString()}</span>
        <button
          onClick={() => setReplyTo(comment)}
          className="ml-auto text-stone-500 hover:text-stone-300"
        >
          Reply
        </button>
        <button
          onClick={async () => {
            if (comment.id !== undefined) {
              await repo.deleteComment(deckId, comment.id);
              await refresh();
            }
          }}
          className="text-stone-600 hover:text-rose-400"
          title="Delete (owner moderation)"
        >
          ✕
        </button>
      </div>
      <p className="mt-0.5 text-xs whitespace-pre-line text-stone-300">{comment.body}</p>
      {childrenOf(comment.id).map((c) => (
        <CommentRow key={String(c.id)} comment={c} depth={depth + 1} />
      ))}
    </div>
  );

  return (
    <div>
      {roots.map((c) => (
        <CommentRow key={String(c.id)} comment={c} depth={0} />
      ))}
      <div className="mt-3 rounded-lg border border-stone-800 bg-stone-900/60 p-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-[11px] text-stone-400">
            Replying to <span className="font-bold">{replyTo.author}</span>
            <button onClick={() => setReplyTo(null)} className="text-stone-600 hover:text-stone-300">
              cancel
            </button>
          </div>
        )}
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Name (optional)"
          className="mb-2 w-full max-w-60 rounded-md border border-stone-700 bg-stone-950 px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="mb-2 w-full rounded-md border border-stone-700 bg-stone-950 p-2 text-xs outline-none focus:border-emerald-600"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !body.trim()}
          className="rounded-md bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          Post comment
        </button>
      </div>
    </div>
  );
}
