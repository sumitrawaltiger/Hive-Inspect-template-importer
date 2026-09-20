import * as XLSX from "xlsx";
import { ATTRIBUTE_COLUMNS } from "./importer/columns";
import type { TemplateTree } from "./types";

const BASE_HEADERS = ["Section Name", "Item Name", "Comment Name", "Comment Text", "Comment Type"];

export function templateToRows(tree: TemplateTree): string[][] {
  const known = Object.values(ATTRIBUTE_COLUMNS);
  const seen = new Set<string>();
  for (const section of tree.sectionNodes) {
    for (const item of section.items) {
      for (const comment of item.comments) {
        Object.keys(comment.attributes).forEach((key) => seen.add(key));
      }
    }
  }
  const extras = [...seen].filter((key) => !known.includes(key)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const attributeHeaders = [...known.filter((key) => seen.has(key)), ...extras];
  const rows: string[][] = [[...BASE_HEADERS, ...attributeHeaders.map((h) => h.replace(/^Unrecognised: /, ""))]];

  for (const section of tree.sectionNodes) {
    if (section.items.length === 0) rows.push([section.name]);
    for (const item of section.items) {
      if (item.comments.length === 0) rows.push([section.name, item.name]);
      for (const comment of item.comments) {
        rows.push([
          section.name,
          item.name,
          comment.name,
          comment.bodyHtml,
          comment.commentType === "unknown" ? comment.rawCommentType ?? "" : comment.commentType,
          ...attributeHeaders.map((key) => comment.attributes[key] ?? ""),
        ]);
      }
    }
  }
  return rows;
}

export function templateToXlsx(tree: TemplateTree): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(templateToRows(tree));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Template");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
