const RICH_EDITOR_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "del",
  "ul", "ol", "li", "blockquote", "a", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "code", "pre",
]);

export function unsupportedRichEditorMarkup(html: string): string[] {
  const found = new Set<string>();
  const pattern = /<([a-z][a-z0-9]*)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const tag = match[1].toLowerCase();
    if (!RICH_EDITOR_TAGS.has(tag)) found.add(`<${tag}>`);
  }
  if (/\sstyle\s*=/i.test(html)) found.add("inline styles");
  return [...found];
}
