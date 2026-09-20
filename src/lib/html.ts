import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "div", "span", "hr",
  "b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "sub", "sup", "mark", "small",
  "font", "center",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
];

const EMBED_TAGS = new Set(["iframe", "video", "audio", "embed", "object", "source", "track"]);

const SAFE_COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i];
const SAFE_SIZE = [/^\d+(\.\d+)?(px|em|rem|%|pt)?$/];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    font: ["color", "size", "face"],
    td: ["colspan", "rowspan", "align"],
    th: ["colspan", "rowspan", "align"],
    ol: ["start", "type"],
    "*": ["style"],
  },
  allowedStyles: {
    "*": {
      color: SAFE_COLOR,
      "background-color": SAFE_COLOR,
      "text-align": [/^(left|right|center|justify)$/],
      "font-weight": [/^(bold|normal|[1-9]00)$/],
      "font-style": [/^(italic|normal)$/],
      "text-decoration": [/^(underline|line-through|none)$/],
      "font-size": SAFE_SIZE,
      "margin-left": SAFE_SIZE,
      "padding-left": SAFE_SIZE,
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  parseStyleAttributes: true,
};

export interface SanitizeOutcome {
  html: string;
  removedEmbeds: string[];
  removedUnsafe: string[];
  externalImages: string[];
  textChanged: boolean;
  altered: boolean;
}

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value) || /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(value);
}

export function plainTextToHtml(value: string): string {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\r?\n\s*\r?\n/)
    .map((block) => `<p>${block.replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
}

export function htmlToText(html: string): string {
  const spaced = html.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|td|th|blockquote)>/gi, "$& ");
  const stripped = sanitizeHtml(spaced, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) => text,
  });
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function tagCounts(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  const pattern = /<([a-z][a-z0-9]*)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const tag = match[1].toLowerCase();
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

export function extractLinks(html: string): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    links.push(decodeEntities(match[1] ?? match[2] ?? match[3] ?? ""));
  }
  return links;
}

function extractImages(html: string): string[] {
  const images: string[] = [];
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    images.push(decodeEntities(match[1] ?? match[2] ?? match[3] ?? ""));
  }
  return images;
}

export function sanitizeCommentHtml(source: string): SanitizeOutcome {
  const input = looksLikeHtml(source) ? source : plainTextToHtml(source);
  const html = sanitizeHtml(input, OPTIONS).trim();

  const before = tagCounts(input);
  const after = tagCounts(html);
  const removedEmbeds: string[] = [];
  const removedUnsafe: string[] = [];
  for (const [tag, count] of before) {
    const lost = count - (after.get(tag) ?? 0);
    if (lost <= 0) continue;
    (EMBED_TAGS.has(tag) ? removedEmbeds : removedUnsafe).push(
      lost > 1 ? `<${tag}> ×${lost}` : `<${tag}>`
    );
  }

  const linksBefore = extractLinks(input);
  const linksAfter = extractLinks(html);
  if (linksBefore.length !== linksAfter.length) {
    removedUnsafe.push(`${linksBefore.length - linksAfter.length} link target(s) with an unsupported scheme`);
  }

  const textChanged = htmlToText(input) !== htmlToText(html);

  return {
    html,
    removedEmbeds,
    removedUnsafe,
    externalImages: extractImages(html),
    textChanged,
    altered: removedEmbeds.length > 0 || removedUnsafe.length > 0 || textChanged,
  };
}

export function sanitizeForSave(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
