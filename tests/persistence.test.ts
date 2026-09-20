import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPglite, Database } from "../src/lib/db/client";
import {
  ValidationError,
  addComment,
  copyTemplate,
  createFromImport,
  deleteComment,
  deleteTemplate,
  getTemplateTree,
  listTemplates,
  moveNode,
  updateComment,
  updateItem,
  updateSection,
} from "../src/lib/db/templates";
import { templateToXlsx } from "../src/lib/exporter";
import { parseSpectoraExport } from "../src/lib/importer/parse";
import type { TemplateTree } from "../src/lib/types";

const file = path.join(process.cwd(), "samples", "synthetic", "synthetic-clean.xlsx");
const parsed = parseSpectoraExport(readFileSync(file), "synthetic-clean.xlsx");

const shape = (tree: TemplateTree) =>
  tree.sectionNodes.map((s) => ({
    name: s.name,
    items: s.items.map((i) => ({
      name: i.name,
      comments: i.comments.map((c) => ({ name: c.name, body: c.bodyHtml, type: c.commentType, attributes: c.attributes })),
    })),
  }));

describe("persistence", () => {
  let db: Database;
  let dir: string;
  let templateId: string;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "templates-db-"));
    db = await createPglite(dir);
    templateId = await createFromImport(db, parsed);
  });

  afterAll(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores exactly what the parser produced", async () => {
    const tree = await getTemplateTree(db, templateId);
    expect(shape(tree)).toEqual(
      parsed.sections.map((s) => ({
        name: s.name,
        items: s.items.map((i) => ({
          name: i.name,
          comments: i.comments.map((c) => ({ name: c.name, body: c.bodyHtml, type: c.commentType, attributes: c.attributes })),
        })),
      }))
    );
    expect(tree.editedCount).toBe(0);
    expect(tree.importReport?.stats.comments).toBe(parsed.stats.comments);
  });

  it("round-trips: exporting the stored template and importing it again gives the same tree", async () => {
    const tree = await getTemplateTree(db, templateId);
    const again = parseSpectoraExport(templateToXlsx(tree), "roundtrip.xlsx");
    const secondId = await createFromImport(db, again, { name: "Round trip" });
    expect(shape(await getTemplateTree(db, secondId))).toEqual(shape(tree));
    await deleteTemplate(db, secondId);
  });

  it("saves edits and sanitises what is saved", async () => {
    const tree = await getTemplateTree(db, templateId);
    const section = tree.sectionNodes[1];
    const item = section.items[0];
    const comment = item.comments[0];
    await updateSection(db, section.id, { name: "Roofing" });
    await updateItem(db, item.id, { name: "Roof Coverings" });
    await updateComment(db, comment.id, {
      name: "How the roof was inspected",
      bodyHtml: '<p>Edited <strong>text</strong><script>alert(1)</script></p>',
    });
    const after = await getTemplateTree(db, templateId);
    expect(after.sectionNodes[1].name).toBe("Roofing");
    expect(after.sectionNodes[1].originalName).toBe("Roof");
    expect(after.sectionNodes[1].items[0].name).toBe("Roof Coverings");
    expect(after.sectionNodes[1].items[0].comments[0].bodyHtml).toBe("<p>Edited <strong>text</strong></p>");
    expect(after.sectionNodes[1].items[0].comments[0].originalBodyHtml).toBe(comment.bodyHtml);
    expect(after.editedCount).toBe(3);
  });

  it("rejects an empty name and leaves the stored value alone", async () => {
    const tree = await getTemplateTree(db, templateId);
    await expect(updateSection(db, tree.sectionNodes[0].id, { name: "   " })).rejects.toBeInstanceOf(ValidationError);
    expect((await getTemplateTree(db, templateId)).sectionNodes[0].name).toBe(tree.sectionNodes[0].name);
  });

  it("copies deeply: editing the copy never touches the original", async () => {
    const before = await getTemplateTree(db, templateId);
    const copyId = await copyTemplate(db, templateId);
    const copy = await getTemplateTree(db, copyId);
    expect(copy.name).toBe(`${before.name} (copy)`);
    expect(copy.copiedFromId).toBe(templateId);
    expect(shape(copy)).toEqual(shape(before));

    const originalIds = new Set(before.sectionNodes.flatMap((s) => [s.id, ...s.items.flatMap((i) => [i.id, ...i.comments.map((c) => c.id)])]));
    const copyIds = copy.sectionNodes.flatMap((s) => [s.id, ...s.items.flatMap((i) => [i.id, ...i.comments.map((c) => c.id)])]);
    expect(copyIds.some((id) => originalIds.has(id))).toBe(false);

    await updateSection(db, copy.sectionNodes[0].id, { name: "Changed only in the copy" });
    await updateComment(db, copy.sectionNodes[1].items[0].comments[1].id, { bodyHtml: "<p>Copy text</p>" });
    await deleteComment(db, copy.sectionNodes[1].items[0].comments[2].id);
    await addComment(db, copy.sectionNodes[1].items[1].id);
    await moveNode(db, "section", copy.sectionNodes[2].id, "up");

    expect(shape(await getTemplateTree(db, templateId))).toEqual(shape(before));
    const changed = await getTemplateTree(db, copyId);
    expect(changed.sectionNodes.map((s) => s.name)).toEqual(["Changed only in the copy", "Electrical", "Roofing"]);

    await deleteTemplate(db, copyId);
    expect(shape(await getTemplateTree(db, templateId))).toEqual(shape(before));
  });

  it("survives closing and reopening the database", async () => {
    const before = shape(await getTemplateTree(db, templateId));
    await db.close();
    db = await createPglite(dir);
    expect((await listTemplates(db)).map((t) => t.id)).toContain(templateId);
    expect(shape(await getTemplateTree(db, templateId))).toEqual(before);
  });

  it("rolls back a failed import completely", async () => {
    const count = (await listTemplates(db)).length;
    const broken = structuredClone(parsed);
    (broken.sections[0].items[0].comments[0] as { commentType: string }).commentType = "not-a-type";
    await expect(createFromImport(db, broken)).rejects.toThrow();
    expect((await listTemplates(db)).length).toBe(count);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from sections s left join templates t on t.id = s.template_id where t.id is null`
    );
    expect(rows[0].n).toBe(0);
  });
});
