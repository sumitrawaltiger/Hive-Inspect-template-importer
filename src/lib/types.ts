export type CommentType = "info" | "limit" | "defect" | "unknown";

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCode =
  | "preamble_rows"
  | "blank_row"
  | "row_skipped_no_section"
  | "row_skipped_no_item"
  | "section_inherited"
  | "item_inherited"
  | "unknown_column"
  | "duplicate_column"
  | "missing_optional_column"
  | "unknown_comment_type"
  | "html_unsafe_removed"
  | "html_embed_removed"
  | "html_external_image"
  | "default_photos_not_imported"
  | "repeated_section_name"
  | "repeated_item_name"
  | "extra_sheets"
  | "cell_truncation_risk";

export interface ImportIssue {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  sourceRow?: number;
  column?: string;
  sectionName?: string;
  itemName?: string;
  raw?: Record<string, string>;
}

export interface ParsedComment {
  name: string;
  bodyHtml: string;
  sourceBodyHtml: string;
  commentType: CommentType;
  rawCommentType: string;
  attributes: Record<string, string>;
  sourceRow: number;
}

export interface ParsedItem {
  name: string;
  sourceRow: number;
  comments: ParsedComment[];
}

export interface ParsedSection {
  name: string;
  sourceRow: number;
  items: ParsedItem[];
}

export interface ColumnReport {
  header: string;
  index: number;
  status: "structural" | "attribute" | "unknown" | "duplicate";
  mappedTo?: string;
  nonEmptyCells: number;
}

export interface ImportStats {
  sheetName: string;
  headerRow: number;
  dataRows: number;
  blankRows: number;
  importedRows: number;
  skippedRows: number;
  sections: number;
  items: number;
  comments: number;
  commentsByType: Record<CommentType, number>;
  commentsWithHtml: number;
  commentsWithLinks: number;
  commentsAlteredBySanitizer: number;
  sourceTextChars: number;
  importedTextChars: number;
}

export interface ParseResult {
  suggestedName: string;
  fileName: string;
  sha256: string;
  sections: ParsedSection[];
  issues: ImportIssue[];
  columns: ColumnReport[];
  missingColumns: string[];
  stats: ImportStats;
}

export interface TemplateSummary {
  id: string;
  name: string;
  sourceFileName: string | null;
  copiedFromId: string | null;
  copiedFromName: string | null;
  isSample: boolean;
  sections: number;
  items: number;
  comments: number;
  editedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentNode {
  id: string;
  position: number;
  name: string;
  originalName: string | null;
  bodyHtml: string;
  originalBodyHtml: string | null;
  sourceBodyHtml: string | null;
  commentType: CommentType;
  rawCommentType: string | null;
  attributes: Record<string, string>;
  sourceRow: number | null;
}

export interface ItemNode {
  id: string;
  position: number;
  name: string;
  originalName: string | null;
  sourceRow: number | null;
  comments: CommentNode[];
}

export interface SectionNode {
  id: string;
  position: number;
  name: string;
  originalName: string | null;
  sourceRow: number | null;
  items: ItemNode[];
}

export interface TemplateTree extends TemplateSummary {
  sourceSha256: string | null;
  importReport: ImportReport | null;
  sectionNodes: SectionNode[];
}

export interface ImportReport {
  stats: ImportStats;
  columns: ColumnReport[];
  missingColumns: string[];
  issues: ImportIssue[];
}
