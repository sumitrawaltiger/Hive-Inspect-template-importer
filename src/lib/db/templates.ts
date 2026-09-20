import { randomUUID } from "node:crypto";
import { sanitizeForSave } from "../html";
import type {
  CommentNode,
  CommentType,
  ImportReport,
  ItemNode,
  ParseResult,
  SectionNode,
  TemplateSummary,
  TemplateTree,
} from "../types";
import type { Database, Queryable } from "./client";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found. It may have been deleted.`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

interface SectionRow {
  id: string;
  template_id: string;
  position: number;
  name: string;
  original_name: string | null;
  source_row: number | null;
}

interface ItemRow {
  id: string;
  section_id: string;
  position: number;
  name: string;
  original_name: string | null;
  source_row: number | null;
}

interface CommentRow {
  id: string;
  item_id: string;
  position: number;
  name: string;
  original_name: string | null;
  body_html: string;
  original_body_html: string | null;
  source_body_html: string | null;
  comment_type: CommentType;
  raw_comment_type: string | null;
  attributes: Record<string, string>;
  source_row: number | null;
}

interface SummaryRow {
  id: string;
  name: string;
  source_file_name: string | null;
  source_sha256: string | null;
  copied_from_id: string | null;
  copied_from_name: string | null;
  is_sample: boolean;
  import_report: ImportReport | null;
  sections: number;
  items: number;
  comments: number;
  edited_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const SUMMARY_SQL = `
  select t.id, t.name, t.source_file_name, t.source_sha256, t.copied_from_id, t.is_sample,
         t.created_at, t.updated_at,
         parent.name as copied_from_name,
         (select count(*)::int from sections s where s.template_id = t.id) as sections,
         (select count(*)::int from items i join sections s on s.id = i.section_id where s.template_id = t.id) as items,
         (select count(*)::int from comments c join items i on i.id = c.item_id join sections s on s.id = i.section_id
           where s.template_id = t.id) as comments,
         (
           (select count(*)::int from sections s where s.template_id = t.id and s.name is distinct from s.original_name)
           + (select count(*)::int from items i join sections s on s.id = i.section_id
               where s.template_id = t.id and i.name is distinct from i.original_name)
           + (select count(*)::int from comments c join items i on i.id = c.item_id join sections s on s.id = i.section_id
               where s.template_id = t.id
                 and (c.name is distinct from c.original_name or c.body_html is distinct from c.original_body_html))
         ) as edited_count
  from templates t
  left join templates parent on parent.id = t.copied_from_id
`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toSummary(row: SummaryRow): TemplateSummary {
  return {
    id: row.id,
    name: row.name,
    sourceFileName: row.source_file_name,
    copiedFromId: row.copied_from_id,
    copiedFromName: row.copied_from_name,
    isSample: row.is_sample,
    sections: row.sections,
    items: row.items,
    comments: row.comments,
    editedCount: row.edited_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function cleanName(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string") throw new ValidationError(`${label} must be text.`);
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed && !allowEmpty) throw new ValidationError(`${label} cannot be empty.`);
  if (trimmed.length > 300) throw new ValidationError(`${label} is too long (300 characters maximum).`);
  return trimmed;
}

export async function listTemplates(db: Queryable): Promise<TemplateSummary[]> {
  const { rows } = await db.query<SummaryRow>(`${SUMMARY_SQL} order by t.is_sample desc, t.created_at asc`);
  return rows.map(toSummary);
}

export async function getTemplateTree(db: Queryable, id: string): Promise<TemplateTree> {
  const { rows } = await db.query<SummaryRow>(
    `select summary.*, t2.import_report from (${SUMMARY_SQL}) summary join templates t2 on t2.id = summary.id where summary.id = $1`,
    [id]
  );
  if (rows.length === 0) throw new NotFoundError("This template");
  const row = rows[0];

  const [sections, items, comments] = await Promise.all([
    db.query<SectionRow>(`select * from sections where template_id = $1 order by position`, [id]),
    db.query<ItemRow>(
      `select i.* from items i join sections s on s.id = i.section_id where s.template_id = $1 order by i.position`,
      [id]
    ),
    db.query<CommentRow>(
      `select c.* from comments c join items i on i.id = c.item_id join sections s on s.id = i.section_id
       where s.template_id = $1 order by c.position`,
      [id]
    ),
  ]);

  const commentsByItem = new Map<string, CommentNode[]>();
  for (const c of comments.rows) {
    const list = commentsByItem.get(c.item_id) ?? [];
    list.push({
      id: c.id,
      position: c.position,
      name: c.name,
      originalName: c.original_name,
      bodyHtml: c.body_html,
      originalBodyHtml: c.original_body_html,
      sourceBodyHtml: c.source_body_html,
      commentType: c.comment_type,
      rawCommentType: c.raw_comment_type,
      attributes: c.attributes ?? {},
      sourceRow: c.source_row,
    });
    commentsByItem.set(c.item_id, list);
  }
  const itemsBySection = new Map<string, ItemNode[]>();
  for (const i of items.rows) {
    const list = itemsBySection.get(i.section_id) ?? [];
    list.push({
      id: i.id,
      position: i.position,
      name: i.name,
      originalName: i.original_name,
      sourceRow: i.source_row,
      comments: commentsByItem.get(i.id) ?? [],
    });
    itemsBySection.set(i.section_id, list);
  }
  const sectionNodes: SectionNode[] = sections.rows.map((s) => ({
    id: s.id,
    position: s.position,
    name: s.name,
    originalName: s.original_name,
    sourceRow: s.source_row,
    items: itemsBySection.get(s.id) ?? [],
  }));

  return {
    ...toSummary(row),
    sourceSha256: row.source_sha256,
    importReport: row.import_report,
    sectionNodes,
  };
}

interface InsertableTree {
  sections: {
    name: string;
    originalName: string | null;
    sourceRow: number | null;
    items: {
      name: string;
      originalName: string | null;
      sourceRow: number | null;
      comments: {
        name: string;
        originalName: string | null;
        bodyHtml: string;
        originalBodyHtml: string | null;
        sourceBodyHtml: string | null;
        commentType: CommentType;
        rawCommentType: string | null;
        attributes: Record<string, string>;
        sourceRow: number | null;
      }[];
    }[];
  }[];
}

async function insertTree(tx: Queryable, templateId: string, tree: InsertableTree) {
  const sectionRows: unknown[] = [];
  const itemRows: unknown[] = [];
  const commentRows: unknown[] = [];
  tree.sections.forEach((section, s) => {
    const sectionId = randomUUID();
    sectionRows.push({
      id: sectionId,
      template_id: templateId,
      position: s,
      name: section.name,
      original_name: section.originalName,
      source_row: section.sourceRow,
    });
    section.items.forEach((item, i) => {
      const itemId = randomUUID();
      itemRows.push({
        id: itemId,
        section_id: sectionId,
        position: i,
        name: item.name,
        original_name: item.originalName,
        source_row: item.sourceRow,
      });
      item.comments.forEach((comment, c) => {
        commentRows.push({
          id: randomUUID(),
          item_id: itemId,
          position: c,
          name: comment.name,
          original_name: comment.originalName,
          body_html: comment.bodyHtml,
          original_body_html: comment.originalBodyHtml,
          source_body_html: comment.sourceBodyHtml,
          comment_type: comment.commentType,
          raw_comment_type: comment.rawCommentType,
          attributes: comment.attributes,
          source_row: comment.sourceRow,
        });
      });
    });
  });

  await tx.query(
    `insert into sections (id, template_id, position, name, original_name, source_row)
     select id, template_id, position, name, original_name, source_row
     from jsonb_to_recordset($1::jsonb)
       as x(id uuid, template_id uuid, position int, name text, original_name text, source_row int)`,
    [JSON.stringify(sectionRows)]
  );
  await tx.query(
    `insert into items (id, section_id, position, name, original_name, source_row)
     select id, section_id, position, name, original_name, source_row
     from jsonb_to_recordset($1::jsonb)
       as x(id uuid, section_id uuid, position int, name text, original_name text, source_row int)`,
    [JSON.stringify(itemRows)]
  );
  await tx.query(
    `insert into comments (id, item_id, position, name, original_name, body_html, original_body_html,
                           source_body_html, comment_type, raw_comment_type, attributes, source_row)
     select id, item_id, position, name, original_name, body_html, original_body_html,
            source_body_html, comment_type, raw_comment_type, coalesce(attributes, '{}'::jsonb), source_row
     from jsonb_to_recordset($1::jsonb)
       as x(id uuid, item_id uuid, position int, name text, original_name text, body_html text,
            original_body_html text, source_body_html text, comment_type text, raw_comment_type text,
            attributes jsonb, source_row int)`,
    [JSON.stringify(commentRows)]
  );
}

export async function findBySha(db: Queryable, sha256: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await db.query<{ id: string; name: string }>(
    `select id, name from templates where source_sha256 = $1 and copied_from_id is null order by created_at`,
    [sha256]
  );
  return rows;
}

export async function createFromImport(
  db: Database,
  parsed: ParseResult,
  options: { name?: string; isSample?: boolean } = {}
): Promise<string> {
  const name = cleanName(options.name?.trim() ? options.name : parsed.suggestedName, "Template name");
  const report: ImportReport = {
    stats: parsed.stats,
    columns: parsed.columns,
    missingColumns: parsed.missingColumns,
    issues: parsed.issues,
  };
  const templateId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into templates (id, name, source_file_name, source_sha256, is_sample, import_report)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [templateId, name, parsed.fileName, parsed.sha256, options.isSample ?? false, JSON.stringify(report)]
    );
    await insertTree(tx, templateId, {
      sections: parsed.sections.map((section) => ({
        name: section.name,
        originalName: section.name,
        sourceRow: section.sourceRow,
        items: section.items.map((item) => ({
          name: item.name,
          originalName: item.name,
          sourceRow: item.sourceRow,
          comments: item.comments.map((comment) => ({
            name: comment.name,
            originalName: comment.name,
            bodyHtml: comment.bodyHtml,
            originalBodyHtml: comment.bodyHtml,
            sourceBodyHtml: comment.markupAltered ? comment.sourceBodyHtml : null,
            commentType: comment.commentType,
            rawCommentType: comment.rawCommentType,
            attributes: comment.attributes,
            sourceRow: comment.sourceRow,
          })),
        })),
      })),
    });
  });
  return templateId;
}

export async function copyTemplate(db: Database, sourceId: string, name?: string): Promise<string> {
  const source = await getTemplateTree(db, sourceId);
  const copyName = cleanName(name?.trim() ? name : `${source.name} (copy)`, "Template name");
  const templateId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into templates (id, name, source_kind, source_file_name, source_sha256, copied_from_id, import_report)
       select $1, $2, source_kind, source_file_name, source_sha256, id, import_report from templates where id = $3`,
      [templateId, copyName, sourceId]
    );
    await insertTree(tx, templateId, { sections: source.sectionNodes });
  });
  return templateId;
}

async function touch(tx: Queryable, templateId: string) {
  await tx.query(`update templates set updated_at = now() where id = $1`, [templateId]);
}

export async function renameTemplate(db: Queryable, id: string, name: unknown) {
  const { rows } = await db.query(`update templates set name = $2, updated_at = now() where id = $1 returning id`, [
    id,
    cleanName(name, "Template name"),
  ]);
  if (rows.length === 0) throw new NotFoundError("This template");
}

export async function deleteTemplate(db: Queryable, id: string) {
  const { rows } = await db.query<{ is_sample: boolean }>(`select is_sample from templates where id = $1`, [id]);
  if (rows.length === 0) throw new NotFoundError("This template");
  if (rows[0].is_sample) {
    throw new ValidationError("The sample template is protected so the demo always opens on something. Make a copy and delete that instead.");
  }
  await db.query(`delete from templates where id = $1`, [id]);
}

export async function updateSection(db: Database, id: string, patch: { name?: unknown }) {
  const name = cleanName(patch.name, "Section name");
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ template_id: string }>(
      `update sections set name = $2 where id = $1 returning template_id`,
      [id, name]
    );
    if (rows.length === 0) throw new NotFoundError("This section");
    await touch(tx, rows[0].template_id);
  });
}

export async function updateItem(db: Database, id: string, patch: { name?: unknown }) {
  const name = cleanName(patch.name, "Item name");
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ template_id: string }>(
      `update items i set name = $2 from sections s where i.id = $1 and s.id = i.section_id returning s.template_id`,
      [id, name]
    );
    if (rows.length === 0) throw new NotFoundError("This item");
    await touch(tx, rows[0].template_id);
  });
}

const COMMENT_TYPES: CommentType[] = ["info", "limit", "defect"];

export async function updateComment(
  db: Database,
  id: string,
  patch: { name?: unknown; bodyHtml?: unknown; commentType?: unknown }
): Promise<{ bodyHtml: string | null }> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let savedBody: string | null = null;
  if (patch.name !== undefined) {
    params.push(cleanName(patch.name, "Comment name", true));
    sets.push(`name = $${params.length}`);
  }
  if (patch.bodyHtml !== undefined) {
    if (typeof patch.bodyHtml !== "string") throw new ValidationError("Comment text must be text.");
    if (patch.bodyHtml.length > 200_000) throw new ValidationError("Comment text is too long.");
    savedBody = sanitizeForSave(patch.bodyHtml);
    params.push(savedBody);
    sets.push(`body_html = $${params.length}`);
  }
  if (patch.commentType !== undefined) {
    if (!COMMENT_TYPES.includes(patch.commentType as CommentType)) {
      throw new ValidationError("Comment type must be info, limit or defect.");
    }
    params.push(patch.commentType);
    sets.push(`comment_type = $${params.length}`);
  }
  if (sets.length === 0) throw new ValidationError("Nothing to update.");
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ template_id: string }>(
      `update comments c set ${sets.join(", ")}
       from items i join sections s on s.id = i.section_id
       where c.id = $1 and i.id = c.item_id returning s.template_id`,
      params
    );
    if (rows.length === 0) throw new NotFoundError("This comment");
    await touch(tx, rows[0].template_id);
  });
  return { bodyHtml: savedBody };
}

export async function addComment(db: Database, itemId: string): Promise<string> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ template_id: string }>(
      `select s.template_id from items i join sections s on s.id = i.section_id where i.id = $1`,
      [itemId]
    );
    if (rows.length === 0) throw new NotFoundError("This item");
    await tx.query(
      `insert into comments (id, item_id, position, name, body_html, comment_type)
       values ($1, $2, (select coalesce(max(position), -1) + 1 from comments where item_id = $2), 'New comment', '', 'info')`,
      [id, itemId]
    );
    await touch(tx, rows[0].template_id);
  });
  return id;
}

export async function deleteComment(db: Database, id: string) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ template_id: string }>(
      `select s.template_id from comments c join items i on i.id = c.item_id join sections s on s.id = i.section_id
       where c.id = $1`,
      [id]
    );
    if (rows.length === 0) throw new NotFoundError("This comment");
    await tx.query(`delete from comments where id = $1`, [id]);
    await touch(tx, rows[0].template_id);
  });
}

const MOVE_TARGETS = {
  section: { table: "sections", parent: "template_id" },
  item: { table: "items", parent: "section_id" },
  comment: { table: "comments", parent: "item_id" },
} as const;

export async function moveNode(
  db: Database,
  kind: keyof typeof MOVE_TARGETS,
  id: string,
  direction: "up" | "down"
) {
  const target = MOVE_TARGETS[kind];
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select sibling.id from ${target.table} me
       join ${target.table} sibling on sibling.${target.parent} = me.${target.parent}
       where me.id = $1 order by sibling.position, sibling.id`,
      [id]
    );
    if (rows.length === 0) throw new NotFoundError(`This ${kind}`);
    const ids = rows.map((row) => row.id);
    const from = ids.indexOf(id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await tx.query(
      `update ${target.table} t set position = x.position
       from jsonb_to_recordset($1::jsonb) as x(id uuid, position int) where t.id = x.id`,
      [JSON.stringify(ids.map((rowId, position) => ({ id: rowId, position })))]
    );
  });
}
