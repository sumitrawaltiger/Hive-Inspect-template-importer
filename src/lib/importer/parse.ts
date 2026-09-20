import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { htmlToText, extractLinks, looksLikeHtml, sanitizeCommentHtml } from "../html";
import type {
  ColumnReport,
  CommentType,
  ImportIssue,
  ParsedComment,
  ParsedItem,
  ParsedSection,
  ParseResult,
} from "../types";
import {
  FIELD_LABELS,
  OPTIONAL_FIELDS,
  REQUIRED_FIELDS,
  StructuralField,
  matchColumn,
} from "./columns";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const HEADER_SCAN_ROWS = 40;
const EXCEL_CELL_LIMIT = 32767;

export class ImportError extends Error {
  constructor(
    public code:
      | "empty_file"
      | "file_too_large"
      | "not_a_spreadsheet"
      | "no_header_row"
      | "missing_required_columns"
      | "no_content",
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ImportError";
  }
}

type Grid = string[][];

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function readWorkbook(buffer: Buffer, fileName: string): XLSX.WorkBook {
  const head = buffer.subarray(0, 8);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  const isCsv = /\.(csv|tsv|txt)$/i.test(fileName);
  if (!isZip && !isOle && !isCsv) {
    throw new ImportError(
      "not_a_spreadsheet",
      "This file is not a spreadsheet. In Spectora, open the template, choose ⋯ → Export to spreadsheet → Export HTML Text, and upload the .xlsx file it downloads."
    );
  }
  try {
    return XLSX.read(buffer, { type: "buffer", cellDates: true, raw: isCsv });
  } catch {
    throw new ImportError(
      "not_a_spreadsheet",
      "The file could not be opened as a spreadsheet. It may be corrupted or password protected. Try exporting it from Spectora again."
    );
  }
}

function sheetToGrid(sheet: XLSX.WorkSheet): Grid {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  return rows.map((row) => row.map(cellToString));
}

function scoreHeaderRow(row: string[]): { fields: Set<StructuralField>; score: number } {
  const fields = new Set<StructuralField>();
  let score = 0;
  for (const cell of row) {
    const match = matchColumn(cell);
    if (match.kind === "structural") {
      fields.add(match.field);
      score += 2;
    } else if (match.kind === "attribute") {
      score += 1;
    }
  }
  return { fields, score };
}

function findHeader(workbook: XLSX.WorkBook) {
  let best: { sheetName: string; grid: Grid; rowIndex: number; score: number; fields: Set<StructuralField> } | null = null;
  for (const sheetName of workbook.SheetNames) {
    const grid = sheetToGrid(workbook.Sheets[sheetName]);
    const limit = Math.min(grid.length, HEADER_SCAN_ROWS);
    for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
      const { fields, score } = scoreHeaderRow(grid[rowIndex]);
      if (fields.size < 2) continue;
      if (!best || score > best.score) best = { sheetName, grid, rowIndex, score, fields };
    }
  }
  return best;
}

function normalizeCommentType(raw: string): CommentType {
  const value = raw.trim().toLowerCase();
  if (!value) return "info";
  if (["info", "information", "informational"].includes(value)) return "info";
  if (["limit", "limitation", "limitations"].includes(value)) return "limit";
  if (["defect", "deficiency", "defects"].includes(value)) return "defect";
  return "unknown";
}

function deriveName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/[-_ ]*\d{4}-\d{2}-\d{2}.*$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || base || "Imported template";
}

export function parseSpectoraExport(buffer: Buffer, fileName: string): ParseResult {
  if (!buffer || buffer.length === 0) {
    throw new ImportError("empty_file", "The uploaded file is empty (0 bytes).");
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new ImportError(
      "file_too_large",
      `The file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. The importer accepts files up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`
    );
  }

  const workbook = readWorkbook(buffer, fileName);
  const header = findHeader(workbook);
  if (!header) {
    throw new ImportError(
      "no_header_row",
      `No header row was found in the first ${HEADER_SCAN_ROWS} rows of any sheet. A Spectora export has a row with "Section Name", "Item Name" and "Comment Text" columns.`,
      { sheets: workbook.SheetNames }
    );
  }

  const missingRequired = REQUIRED_FIELDS.filter((field) => !header.fields.has(field));
  if (missingRequired.length > 0) {
    throw new ImportError(
      "missing_required_columns",
      `The header row (row ${header.rowIndex + 1}) is missing required column(s): ${missingRequired
        .map((field) => `"${FIELD_LABELS[field]}"`)
        .join(", ")}. Nothing was imported.`,
      { found: header.grid[header.rowIndex].filter(Boolean) }
    );
  }

  const issues: ImportIssue[] = [];
  const headerRow = header.grid[header.rowIndex];
  const fieldIndex = new Map<StructuralField, number>();
  const attributeColumns: { index: number; label: string; isPhoto: boolean }[] = [];
  const unknownColumns: { index: number; header: string }[] = [];
  const columns: ColumnReport[] = [];
  const usedAttributeLabels = new Set<string>();

  headerRow.forEach((rawHeader, index) => {
    const headerText = rawHeader.trim();
    const match = matchColumn(headerText);
    if (!headerText) {
      const hasData = header.grid.slice(header.rowIndex + 1).some((row) => (row[index] ?? "").trim());
      if (!hasData) return;
      const label = `Column ${XLSX.utils.encode_col(index)} (no header)`;
      unknownColumns.push({ index, header: label });
      columns.push({ header: label, index, status: "unknown", nonEmptyCells: 0 });
      return;
    }
    if (match.kind === "structural") {
      if (fieldIndex.has(match.field)) {
        unknownColumns.push({ index, header: `${headerText} [column ${XLSX.utils.encode_col(index)}]` });
        columns.push({ header: headerText, index, status: "duplicate", nonEmptyCells: 0 });
        return;
      }
      fieldIndex.set(match.field, index);
      columns.push({ header: headerText, index, status: "structural", mappedTo: FIELD_LABELS[match.field], nonEmptyCells: 0 });
    } else if (match.kind === "attribute" && !usedAttributeLabels.has(match.label)) {
      usedAttributeLabels.add(match.label);
      attributeColumns.push({ index, label: match.label, isPhoto: match.isPhoto });
      columns.push({ header: headerText, index, status: "attribute", mappedTo: match.label, nonEmptyCells: 0 });
    } else if (match.kind === "attribute") {
      unknownColumns.push({ index, header: `${headerText} [column ${XLSX.utils.encode_col(index)}]` });
      columns.push({ header: headerText, index, status: "duplicate", nonEmptyCells: 0 });
    } else {
      unknownColumns.push({ index, header: headerText });
      columns.push({ header: headerText, index, status: "unknown", nonEmptyCells: 0 });
    }
  });

  const columnByIndex = new Map(columns.map((column) => [column.index, column]));
  const missingColumns = OPTIONAL_FIELDS.filter((field) => !fieldIndex.has(field)).map((field) => FIELD_LABELS[field]);
  for (const label of missingColumns) {
    issues.push({
      severity: "info",
      code: "missing_optional_column",
      column: label,
      message: `The export has no "${label}" column, so that information is missing from the file itself. ${
        label === "Comment Type" ? "Every comment was imported as Information." : "Comments were imported without names."
      }`,
    });
  }

  if (header.rowIndex > 0) {
    const preamble = header.grid
      .slice(0, header.rowIndex)
      .map((row, i) => ({ row: i + 1, text: row.filter((cell) => cell.trim()).join(" | ") }))
      .filter((entry) => entry.text);
    if (preamble.length > 0) {
      issues.push({
        severity: "info",
        code: "preamble_rows",
        message: `${preamble.length} row(s) above the header were not imported: ${preamble
          .map((entry) => `row ${entry.row}: “${entry.text.slice(0, 120)}”`)
          .join("; ")}`,
      });
    }
  }

  const otherSheets = workbook.SheetNames.filter((name) => name !== header.sheetName).filter((name) => {
    const ref = workbook.Sheets[name]["!ref"];
    return Boolean(ref);
  });
  if (otherSheets.length > 0) {
    issues.push({
      severity: "warning",
      code: "extra_sheets",
      message: `Only the sheet “${header.sheetName}” was imported. Other sheets with content were ignored: ${otherSheets
        .map((name) => `“${name}”`)
        .join(", ")}.`,
    });
  }

  const get = (row: string[], field: StructuralField) => {
    const index = fieldIndex.get(field);
    return index === undefined ? "" : row[index] ?? "";
  };

  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let currentItem: ParsedItem | null = null;
  const seenSectionNames = new Map<string, number>();
  let seenItemNames = new Map<string, number>();

  const commentsByType: Record<CommentType, number> = { info: 0, limit: 0, defect: 0, unknown: 0 };
  let dataRows = 0;
  let blankRows = 0;
  let importedRows = 0;
  let skippedRows = 0;
  let commentsWithHtml = 0;
  let commentsWithLinks = 0;
  let commentsAltered = 0;
  let sourceTextChars = 0;
  let importedTextChars = 0;
  let photoReferences = 0;
  let photoComments = 0;

  for (let r = header.rowIndex + 1; r < header.grid.length; r++) {
    const row = header.grid[r];
    const sourceRow = r + 1;
    if (row.every((cell) => !cell.trim())) {
      blankRows++;
      continue;
    }
    dataRows++;
    row.forEach((cell, index) => {
      const column = columnByIndex.get(index);
      if (column && cell.trim()) column.nonEmptyCells++;
    });

    const rawRecord: Record<string, string> = {};
    headerRow.forEach((name, index) => {
      if ((row[index] ?? "").trim()) rawRecord[name.trim() || `Column ${XLSX.utils.encode_col(index)}`] = row[index];
    });

    let sectionName = get(row, "section").trim();
    let itemName = get(row, "item").trim();
    const commentName = get(row, "commentName").trim();
    const commentText = get(row, "commentText");
    const rawType = get(row, "commentType").trim();

    if (!sectionName) {
      if (!currentSection) {
        skippedRows++;
        issues.push({
          severity: "error",
          code: "row_skipped_no_section",
          sourceRow,
          message: `Row ${sourceRow} has no Section Name and there is no earlier section to attach it to. The row was not imported.`,
          raw: rawRecord,
        });
        continue;
      }
      sectionName = currentSection.name;
      issues.push({
        severity: "warning",
        code: "section_inherited",
        sourceRow,
        sectionName,
        message: `Row ${sourceRow} has a blank Section Name. It was kept under the section above it, “${sectionName}”.`,
      });
    }

    if (!currentSection || currentSection.name !== sectionName) {
      const earlier = seenSectionNames.get(sectionName);
      if (earlier !== undefined) {
        issues.push({
          severity: "info",
          code: "repeated_section_name",
          sourceRow,
          sectionName,
          message: `Section “${sectionName}” appears again at row ${sourceRow} (first seen at row ${earlier}). Both were kept as separate sections so the file's order is preserved.`,
        });
      } else {
        seenSectionNames.set(sectionName, sourceRow);
      }
      currentSection = { name: sectionName, sourceRow, items: [] };
      sections.push(currentSection);
      currentItem = null;
      seenItemNames = new Map();
    }

    if (!itemName) {
      const hasCommentContent = Boolean(commentName || commentText.trim());
      if (!hasCommentContent) {
        importedRows++;
        continue;
      }
      if (!currentItem) {
        skippedRows++;
        issues.push({
          severity: "error",
          code: "row_skipped_no_item",
          sourceRow,
          sectionName,
          message: `Row ${sourceRow} has comment text but no Item Name, and section “${sectionName}” has no earlier item to attach it to. The row was not imported.`,
          raw: rawRecord,
        });
        continue;
      }
      itemName = currentItem.name;
      issues.push({
        severity: "warning",
        code: "item_inherited",
        sourceRow,
        sectionName,
        itemName,
        message: `Row ${sourceRow} has a blank Item Name. Its comment was kept under the item above it, “${itemName}”.`,
      });
    }

    if (!currentItem || currentItem.name !== itemName) {
      const earlier = seenItemNames.get(itemName);
      if (earlier !== undefined) {
        issues.push({
          severity: "info",
          code: "repeated_item_name",
          sourceRow,
          sectionName,
          itemName,
          message: `Item “${itemName}” appears again in “${sectionName}” at row ${sourceRow} (first seen at row ${earlier}). Both were kept as separate items so the file's order is preserved.`,
        });
      } else {
        seenItemNames.set(itemName, sourceRow);
      }
      currentItem = { name: itemName, sourceRow, comments: [] };
      currentSection.items.push(currentItem);
    }

    const attributes: Record<string, string> = {};
    let rowPhotoRefs = 0;
    for (const column of attributeColumns) {
      const value = (row[column.index] ?? "").trim();
      if (!value) continue;
      attributes[column.label] = row[column.index];
      if (column.isPhoto) rowPhotoRefs++;
    }
    for (const column of unknownColumns) {
      const value = (row[column.index] ?? "").trim();
      if (value) attributes[`Unrecognised: ${column.header}`] = row[column.index];
    }
    if (rowPhotoRefs > 0) {
      photoReferences += rowPhotoRefs;
      photoComments++;
    }

    const hasComment = Boolean(commentName || commentText.trim() || rawType || Object.keys(attributes).length > 0);
    importedRows++;
    if (!hasComment) continue;

    const outcome = sanitizeCommentHtml(commentText);
    const commentType = normalizeCommentType(rawType);
    commentsByType[commentType]++;
    if (commentText.trim() && looksLikeHtml(commentText)) commentsWithHtml++;
    if (extractLinks(outcome.html).length > 0) commentsWithLinks++;
    sourceTextChars += htmlToText(looksLikeHtml(commentText) ? commentText : outcome.html).length;
    importedTextChars += htmlToText(outcome.html).length;

    const where = { sourceRow, sectionName, itemName };
    const label = commentName ? `“${commentName}”` : "(unnamed comment)";

    if (commentType === "unknown") {
      issues.push({
        ...where,
        severity: "warning",
        code: "unknown_comment_type",
        column: "Comment Type",
        message: `Row ${sourceRow}: comment type “${rawType}” is not one of info, limit or defect. The comment ${label} was imported and the original value kept; pick a type in the editor.`,
      });
    }
    if (outcome.removedEmbeds.length > 0) {
      issues.push({
        ...where,
        severity: "warning",
        code: "html_embed_removed",
        column: "Comment Text",
        message: `Row ${sourceRow}: embedded media (${outcome.removedEmbeds.join(", ")}) in ${label} is not supported and is not shown. The original HTML is kept with the comment.`,
      });
    }
    if (outcome.removedUnsafe.length > 0 || outcome.textChanged) {
      issues.push({
        ...where,
        severity: "warning",
        code: "html_unsafe_removed",
        column: "Comment Text",
        message: `Row ${sourceRow}: unsupported markup was removed from ${label}${
          outcome.removedUnsafe.length ? ` (${outcome.removedUnsafe.join(", ")})` : ""
        }${outcome.textChanged ? "; the visible text changed as a result" : "; the visible text is unchanged"}. The original HTML is kept with the comment.`,
      });
    }
    if (outcome.externalImages.length > 0) {
      issues.push({
        ...where,
        severity: "info",
        code: "html_external_image",
        column: "Comment Text",
        message: `Row ${sourceRow}: ${label} shows ${outcome.externalImages.length} image(s) that are still hosted outside this app (${outcome.externalImages
          .map((src) => hostOf(src))
          .join(", ")}). They will stop loading if that host removes them.`,
      });
    }
    if (commentText.length >= EXCEL_CELL_LIMIT) {
      issues.push({
        ...where,
        severity: "warning",
        code: "cell_truncation_risk",
        column: "Comment Text",
        message: `Row ${sourceRow}: ${label} is ${commentText.length} characters, which is Excel's per-cell limit. The text may have been cut off by the export before it reached this importer.`,
      });
    }
    if (outcome.altered) commentsAltered++;

    const comment: ParsedComment = {
      name: commentName,
      bodyHtml: outcome.html,
      sourceBodyHtml: commentText,
      commentType,
      rawCommentType: rawType,
      attributes,
      sourceRow,
    };
    currentItem.comments.push(comment);
  }

  for (const column of columns) {
    if (column.status === "unknown") {
      issues.push({
        severity: column.nonEmptyCells > 0 ? "warning" : "info",
        code: "unknown_column",
        column: column.header,
        message:
          column.nonEmptyCells > 0
            ? `Column “${column.header}” is not part of the Spectora format this importer understands. Its ${column.nonEmptyCells} value(s) were kept as read-only data on each comment.`
            : `Column “${column.header}” is not recognised. It is empty in this file, so nothing was lost.`,
      });
    } else if (column.status === "duplicate") {
      issues.push({
        severity: "warning",
        code: "duplicate_column",
        column: column.header,
        message: `Column “${column.header}” appears more than once. The first one was used; the ${column.nonEmptyCells} value(s) in the later one were kept as read-only data.`,
      });
    }
  }

  if (photoReferences > 0) {
    issues.push({
      severity: "warning",
      code: "default_photos_not_imported",
      message: `${photoComments} comment(s) reference default photos (${photoReferences} photo/caption value(s)). Photos are not supported: the file names and captions were kept as read-only data, the image files themselves are not in the export.`,
    });
  }

  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const commentCount = sections.reduce(
    (sum, section) => sum + section.items.reduce((inner, item) => inner + item.comments.length, 0),
    0
  );
  if (sections.length === 0) {
    throw new ImportError(
      "no_content",
      dataRows === 0
        ? "The header row was found but there are no rows under it. Nothing to import."
        : `None of the ${dataRows} row(s) could be imported because they have no Section Name.`,
      { issues }
    );
  }

  return {
    suggestedName: deriveName(fileName),
    fileName,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    sections,
    issues,
    columns,
    missingColumns,
    stats: {
      sheetName: header.sheetName,
      headerRow: header.rowIndex + 1,
      dataRows,
      blankRows,
      importedRows,
      skippedRows,
      sections: sections.length,
      items: itemCount,
      comments: commentCount,
      commentsByType,
      commentsWithHtml,
      commentsWithLinks,
      commentsAlteredBySanitizer: commentsAltered,
      sourceTextChars,
      importedTextChars,
    },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}
