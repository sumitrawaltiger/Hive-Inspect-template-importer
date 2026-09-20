"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { unsupportedRichEditorMarkup } from "@/lib/rich-editor-support";
import type { CommentNode, CommentType, ItemNode, SectionNode, TemplateTree } from "@/lib/types";
import { InlineText } from "./InlineText";
import { RichTextEditor } from "./RichTextEditor";

const TYPE_LABEL: Record<CommentType, string> = {
  info: "Information",
  limit: "Limitation",
  defect: "Defect",
  unknown: "Unknown type",
};

const TYPE_TONE: Record<CommentType, string> = {
  info: "bg-sky-100 text-sky-800",
  limit: "bg-violet-100 text-violet-800",
  defect: "bg-red-100 text-red-800",
  unknown: "bg-amber-100 text-amber-900",
};

function MoveButtons({ onMove, first, last, what }: { onMove: (d: "up" | "down") => void; first: boolean; last: boolean; what: string }) {
  const style = "rounded border border-stone-200 px-1.5 text-xs text-stone-500 hover:bg-stone-100 disabled:opacity-30";
  return (
    <span className="inline-flex gap-1">
      <button type="button" className={style} disabled={first} onClick={() => onMove("up")} title={`Move ${what} up`}>↑</button>
      <button type="button" className={style} disabled={last} onClick={() => onMove("down")} title={`Move ${what} down`}>↓</button>
    </span>
  );
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, " ");
}

interface CommentProps {
  comment: CommentNode;
  first: boolean;
  last: boolean;
  onSaved: (patch: Partial<CommentNode>) => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => Promise<void>;
  startOpen: boolean;
}

function CommentRow({ comment, first, last, onSaved, onMove, onDelete, startOpen }: CommentProps) {
  const [editing, setEditing] = useState(startOpen);
  const [name, setName] = useState(comment.name);
  const [body, setBody] = useState(comment.bodyHtml);
  const [type, setType] = useState<CommentType>(comment.commentType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsupported = useMemo(() => unsupportedRichEditorMarkup(comment.bodyHtml), [comment.bodyHtml]);
  const [sourceMode, setSourceMode] = useState(unsupported.length > 0);

  const edited =
    comment.originalName !== null &&
    (comment.name !== comment.originalName || comment.bodyHtml !== (comment.originalBodyHtml ?? ""));
  const isNew = comment.originalName === null;
  const attributes = Object.entries(comment.attributes);

  function open() {
    setName(comment.name);
    setBody(comment.bodyHtml);
    setType(comment.commentType);
    setSourceMode(unsupported.length > 0);
    setError(null);
    setEditing(true);
  }

  async function save(patch: { name: string; bodyHtml: string; commentType?: CommentType }) {
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ bodyHtml: string | null }>(`/api/comments/${comment.id}`, { method: "PATCH", json: patch });
      onSaved({
        name: patch.name.trim(),
        bodyHtml: result.bodyHtml ?? patch.bodyHtml,
        commentType: patch.commentType ?? comment.commentType,
      });
      setEditing(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-brand/40 bg-amber-50/40 p-3">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-64 flex-1 text-xs font-medium uppercase tracking-wide text-stone-500">
            Comment name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-ink"
            />
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Type
            <select
              value={type === "unknown" ? "" : type}
              onChange={(event) => setType(event.target.value as CommentType)}
              className="mt-1 block rounded border border-stone-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-ink"
            >
              {type === "unknown" && <option value="">{comment.rawCommentType || "Unknown"} (from file)</option>}
              <option value="info">Information</option>
              <option value="limit">Limitation</option>
              <option value="defect">Defect</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-stone-500">
            <span>Comment text</span>
            <button type="button" className="normal-case tracking-normal text-stone-500 underline" onClick={() => setSourceMode(!sourceMode)}>
              {sourceMode ? "Switch to the formatting editor" : "Edit the HTML directly"}
            </button>
          </div>
          {unsupported.length > 0 && (
            <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              This comment uses formatting the simple editor cannot show ({unsupported.join(", ")}). It opens as HTML so that
              formatting is not lost. Switching to the formatting editor will simplify it when you save.
            </p>
          )}
          {sourceMode ? (
            <div className="grid gap-2 md:grid-cols-2">
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                spellCheck={false}
                className="min-h-40 w-full rounded border border-stone-300 bg-white p-2 font-mono text-xs"
              />
              <div className="rounded border border-dashed border-stone-300 bg-white p-2">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-stone-400">Currently saved</div>
                <div className="rich text-sm" dangerouslySetInnerHTML={{ __html: comment.bodyHtml }} />
              </div>
            </div>
          ) : (
            <RichTextEditor html={body} onChange={setBody} />
          )}
        </div>

        {error && (
          <p role="alert" className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800">
            Not saved: {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ name, bodyHtml: body, ...(type !== "unknown" && type !== comment.commentType ? { commentType: type } : {}) })}
            className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save comment"}
          </button>
          <button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded border border-stone-300 bg-white px-4 py-1.5 text-sm">
            Cancel
          </button>
          {edited && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ name: comment.originalName ?? "", bodyHtml: comment.originalBodyHtml ?? "" })}
              className="text-sm text-stone-600 underline"
            >
              Restore the imported version
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (!window.confirm(`Delete the comment “${comment.name || "(unnamed)"}”? This cannot be undone.`)) return;
              setSaving(true);
              try {
                await onDelete();
              } catch (caught) {
                setError((caught as Error).message);
                setSaving(false);
              }
            }}
            className="ml-auto text-sm text-red-700 underline"
          >
            Delete comment
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group rounded-lg border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_TONE[comment.commentType]}`}>
          {comment.commentType === "unknown" ? `${comment.rawCommentType} (unknown type)` : TYPE_LABEL[comment.commentType]}
        </span>
        <span className="font-medium">{comment.name || <i className="font-normal text-stone-400">(unnamed comment)</i>}</span>
        {edited && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">Edited since import</span>}
        {isNew && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">Added here</span>}
        {comment.sourceBodyHtml !== null && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600" title="Some markup in the file is not supported. The original HTML is kept below.">
            Markup simplified on import
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <MoveButtons onMove={onMove} first={first} last={last} what="comment" />
          <button type="button" onClick={open} className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50">
            Edit
          </button>
        </span>
      </div>
      {comment.bodyHtml ? (
        <div className="rich mt-2 text-sm text-stone-700" dangerouslySetInnerHTML={{ __html: comment.bodyHtml }} />
      ) : (
        <p className="mt-1 text-sm italic text-stone-400">No text{comment.originalName !== null ? " in the export for this comment" : " yet"}.</p>
      )}
      {(attributes.length > 0 || comment.sourceBodyHtml !== null) && (
        <details className="mt-2 text-xs text-stone-500">
          <summary className="cursor-pointer">
            Other data from Spectora ({attributes.length}){comment.sourceRow ? ` · file row ${comment.sourceRow}` : ""}
          </summary>
          <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
            {attributes.map(([key, value]) => (
              <div key={key} className="contents">
                <dt>{key}</dt>
                <dd className="break-words text-stone-700">{value}</dd>
              </div>
            ))}
          </dl>
          {comment.sourceBodyHtml !== null && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-2 font-mono">{comment.sourceBodyHtml}</pre>
          )}
        </details>
      )}
    </li>
  );
}

export function TemplateEditor({ initial }: { initial: TemplateTree }) {
  const router = useRouter();
  const [tree, setTree] = useState(initial);
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(initial.sectionNodes.slice(0, 1).map((s) => s.id)));
  const [freshComment, setFreshComment] = useState<string | null>(null);

  async function reload() {
    const { template } = await api<{ template: TemplateTree }>(`/api/templates/${tree.id}`);
    setTree(template);
  }

  async function guarded(action: () => Promise<void>) {
    setBanner(null);
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setBanner({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function patchSection(id: string, patch: Partial<SectionNode>) {
    setTree((t) => ({ ...t, sectionNodes: t.sectionNodes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }
  function patchItem(id: string, patch: Partial<ItemNode>) {
    setTree((t) => ({
      ...t,
      sectionNodes: t.sectionNodes.map((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
    }));
  }
  function patchComment(id: string, patch: Partial<CommentNode>) {
    setTree((t) => ({
      ...t,
      sectionNodes: t.sectionNodes.map((s) => ({
        ...s,
        items: s.items.map((i) => ({ ...i, comments: i.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      })),
    }));
  }

  const move = (kind: "section" | "item" | "comment", id: string, direction: "up" | "down") =>
    guarded(async () => {
      await api("/api/move", { method: "POST", json: { kind, id, direction } });
      await reload();
    });

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return tree.sectionNodes;
    const hit = (text: string) => text.toLowerCase().includes(needle);
    return tree.sectionNodes
      .map((section) => {
        if (hit(section.name)) return section;
        const items = section.items
          .map((item) => {
            if (hit(item.name)) return item;
            const comments = item.comments.filter((c) => hit(c.name) || hit(stripTags(c.bodyHtml)));
            return comments.length ? { ...item, comments } : null;
          })
          .filter((item): item is ItemNode => item !== null);
        return items.length ? { ...section, items } : null;
      })
      .filter((section): section is SectionNode => section !== null);
  }, [tree.sectionNodes, needle]);

  const totals = useMemo(() => {
    let edited = 0;
    let comments = 0;
    let items = 0;
    for (const s of tree.sectionNodes) {
      if (s.originalName !== null && s.name !== s.originalName) edited++;
      for (const i of s.items) {
        items++;
        if (i.originalName !== null && i.name !== i.originalName) edited++;
        for (const c of i.comments) {
          comments++;
          if (c.originalName !== null && (c.name !== c.originalName || c.bodyHtml !== (c.originalBodyHtml ?? ""))) edited++;
        }
      }
    }
    return { edited, comments, items };
  }, [tree.sectionNodes]);

  const issueCount = tree.importReport?.issues.filter((i) => i.severity !== "info").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              <InlineText
                value={tree.name}
                label="Template name"
                onSave={async (name) => {
                  await api(`/api/templates/${tree.id}`, { method: "PATCH", json: { name } });
                  setTree((t) => ({ ...t, name }));
                }}
              />
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {tree.sectionNodes.length} sections · {totals.items} items · {totals.comments} comments ·{" "}
              {totals.edited === 0 ? "unchanged since import" : `${totals.edited} edited since import`}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {tree.copiedFromId ? (
                <>
                  Copy of{" "}
                  <Link className="underline" href={`/templates/${tree.copiedFromId}`}>{tree.copiedFromName ?? "another template"}</Link>
                  . Changes here do not affect it.
                </>
              ) : tree.copiedFromName === null && tree.sourceFileName && tree.copiedFromId === null ? (
                <>Imported from <span className="font-mono text-xs">{tree.sourceFileName}</span></>
              ) : null}
              {tree.isSample && " · Sample template (cannot be deleted)"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                guarded(async () => {
                  const { id } = await api<{ id: string }>(`/api/templates/${tree.id}/copy`, { method: "POST", json: {} });
                  router.push(`/templates/${id}`);
                })
              }
              className="rounded bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Duplicate
            </button>
            {tree.importReport && (
              <Link href={`/templates/${tree.id}/report`} className="rounded border border-stone-300 px-3 py-1.5 hover:bg-stone-50">
                Import report{issueCount > 0 ? ` (${issueCount})` : ""}
              </Link>
            )}
            <a href={`/api/templates/${tree.id}/export`} className="rounded border border-stone-300 px-3 py-1.5 hover:bg-stone-50">
              Download .xlsx
            </a>
            {!tree.isSample && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Delete “${tree.name}” and everything in it? This cannot be undone.`)) return;
                  guarded(async () => {
                    await api(`/api/templates/${tree.id}`, { method: "DELETE" });
                    router.push("/templates");
                    router.refresh();
                  });
                }}
                className="rounded border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search section, item and comment text…"
          className="mt-4 w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
      </div>

      {banner && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {banner.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden self-start text-sm lg:sticky lg:top-4 lg:block">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Sections</div>
          <ol className="space-y-1">
            {tree.sectionNodes.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#s-${section.id}`}
                  onClick={() => setOpenSections((open) => new Set(open).add(section.id))}
                  className="block truncate rounded px-2 py-1 text-stone-600 hover:bg-stone-200"
                >
                  {index + 1}. {section.name}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-4">
          {visible.length === 0 && <p className="text-sm text-stone-500">Nothing in this template matches “{query}”.</p>}
          {visible.map((section) => {
            const index = tree.sectionNodes.findIndex((s) => s.id === section.id);
            const isOpen = needle !== "" || openSections.has(section.id);
            return (
              <section key={section.id} id={`s-${section.id}`} className="scroll-mt-4 rounded-xl border border-stone-200 bg-stone-50">
                <header className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    aria-label={isOpen ? "Collapse section" : "Expand section"}
                    onClick={() =>
                      setOpenSections((open) => {
                        const next = new Set(open);
                        if (next.has(section.id)) next.delete(section.id);
                        else next.add(section.id);
                        return next;
                      })
                    }
                    className="w-5 text-stone-500"
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <h2 className="min-w-0 flex-1 text-lg font-semibold">
                    <InlineText
                      value={section.name}
                      label="Section name"
                      onSave={async (name) => {
                        await api(`/api/sections/${section.id}`, { method: "PATCH", json: { name } });
                        patchSection(section.id, { name });
                      }}
                    />
                  </h2>
                  {section.originalName !== null && section.originalName !== section.name && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900" title={`Imported as “${section.originalName}”`}>
                      Renamed
                    </span>
                  )}
                  <span className="text-xs text-stone-500">
                    {section.items.length} items · {section.items.reduce((n, i) => n + i.comments.length, 0)} comments
                  </span>
                  {!needle && (
                    <MoveButtons
                      what="section"
                      first={index === 0}
                      last={index === tree.sectionNodes.length - 1}
                      onMove={(direction) => move("section", section.id, direction)}
                    />
                  )}
                </header>

                {isOpen && (
                  <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                    {section.items.length === 0 && <p className="text-sm italic text-stone-400">This section has no items in the export.</p>}
                    {section.items.map((item, itemIndex) => (
                      <div key={item.id}>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="min-w-0 flex-1 font-semibold text-stone-800">
                            <InlineText
                              value={item.name}
                              label="Item name"
                              onSave={async (name) => {
                                await api(`/api/items/${item.id}`, { method: "PATCH", json: { name } });
                                patchItem(item.id, { name });
                              }}
                            />
                          </h3>
                          {item.originalName !== null && item.originalName !== item.name && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900" title={`Imported as “${item.originalName}”`}>
                              Renamed
                            </span>
                          )}
                          {!needle && (
                            <MoveButtons
                              what="item"
                              first={itemIndex === 0}
                              last={itemIndex === section.items.length - 1}
                              onMove={(direction) => move("item", item.id, direction)}
                            />
                          )}
                        </div>
                        <ul className="mt-2 space-y-2">
                          {item.comments.map((comment, commentIndex) => (
                            <CommentRow
                              key={comment.id}
                              comment={comment}
                              startOpen={freshComment === comment.id}
                              first={commentIndex === 0 || needle !== ""}
                              last={commentIndex === item.comments.length - 1 || needle !== ""}
                              onSaved={(patch) => patchComment(comment.id, patch)}
                              onMove={(direction) => move("comment", comment.id, direction)}
                              onDelete={async () => {
                                await api(`/api/comments/${comment.id}`, { method: "DELETE" });
                                await reload();
                              }}
                            />
                          ))}
                        </ul>
                        {item.comments.length === 0 && <p className="mt-1 text-sm italic text-stone-400">No comments for this item.</p>}
                        {!needle && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              guarded(async () => {
                                const { id } = await api<{ id: string }>(`/api/items/${item.id}/comments`, { method: "POST" });
                                setFreshComment(id);
                                await reload();
                              })
                            }
                            className="mt-2 text-sm text-stone-600 underline"
                          >
                            + Add a comment to {item.name}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
