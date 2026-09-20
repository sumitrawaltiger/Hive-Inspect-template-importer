"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface Props {
  html: string;
  onChange: (html: string) => void;
}

export function RichTextEditor({ html, onChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } })],
    content: html,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });

  if (!editor) return <div className="h-32 rounded border border-stone-300 bg-white" />;

  const button = (label: string, active: boolean, run: () => void, title: string) => (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
      className={`rounded px-2 py-1 text-sm ${active ? "bg-stone-800 text-white" : "hover:bg-stone-200"}`}
    >
      {label}
    </button>
  );

  function setLink() {
    const previous = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address (leave empty to remove the link)", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="rounded border border-stone-300 bg-white focus-within:border-brand">
      <div className="flex flex-wrap gap-1 border-b border-stone-200 bg-stone-50 px-2 py-1">
        {button("Bold", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold")}
        {button("Italic", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic")}
        {button("Underline", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "Underline")}
        {button("• List", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "Bulleted list")}
        {button("1. List", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Numbered list")}
        {button("Link", editor.isActive("link"), setLink, "Add or change a link")}
      </div>
      <EditorContent editor={editor} className="rich px-3 py-2 text-sm" />
    </div>
  );
}
