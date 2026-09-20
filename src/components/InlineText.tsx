"use client";

import { useState } from "react";

interface Props {
  value: string;
  label: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}

export function InlineText({ value, label, onSave, className = "", placeholder, allowEmpty = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const next = draft.trim();
    if (next === value) {
      setEditing(false);
      return;
    }
    if (!next && !allowEmpty) {
      setError(`${label} cannot be empty.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        title={`Rename ${label.toLowerCase()}`}
        onClick={() => {
          setDraft(value);
          setError(null);
          setEditing(true);
        }}
        className={`group inline-flex max-w-full items-baseline gap-2 rounded text-left hover:bg-amber-50 ${className}`}
      >
        <span className="truncate">{value || <i className="font-normal text-stone-400">{placeholder ?? "(unnamed)"}</i>}</span>
        <span className="shrink-0 text-xs font-normal text-stone-400 opacity-0 group-hover:opacity-100">Rename</span>
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        autoFocus
        aria-label={label}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        className={`min-w-64 rounded border border-stone-300 bg-white px-2 py-1 font-normal ${className}`}
      />
      <button type="button" onClick={commit} disabled={saving} className="rounded bg-brand px-3 py-1 text-sm font-medium text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded border border-stone-300 px-3 py-1 text-sm font-normal">
        Cancel
      </button>
      {error && <span role="alert" className="w-full text-sm font-normal text-red-700">{error}</span>}
    </span>
  );
}
