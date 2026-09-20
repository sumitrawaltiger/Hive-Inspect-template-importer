import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { htmlToText, extractLinks } from "../src/lib/html";
import { ImportError, parseSpectoraExport } from "../src/lib/importer/parse";
import { normalizeHeader } from "../src/lib/importer/columns";

const synthetic = (name: string) => path.join(process.cwd(), "samples", "synthetic", name);
const load = (file: string) => parseSpectoraExport(readFileSync(file), path.basename(file));

function independentRows(file: string) {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer" });
  for (const sheetName of workbook.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const headerIndex = grid.findIndex((row) => row.some((cell) => normalizeHeader(String(cell)) === "sectionname"));
    if (headerIndex < 0) continue;
    const header = grid[headerIndex].map((cell) => normalizeHeader(String(cell)));
    const col = (key: string) => header.indexOf(key);
    return grid
      .slice(headerIndex + 1)
      .filter((row) => row.some((cell) => String(cell).trim()))
      .map((row) => ({
        section: String(row[col("sectionname")] ?? "").trim(),
        item: String(row[col("itemname")] ?? "").trim(),
        name: String(row[col("commentname")] ?? "").trim(),
        text: String(row[col("commenttext")] ?? ""),
      }));
  }
  throw new Error("no header");
}

describe("clean export", () => {
  const result = load(synthetic("synthetic-clean.xlsx"));

  it("preserves hierarchy and order", () => {
    expect(result.sections.map((s) => s.name)).toEqual(["Inspection Details", "Roof", "Electrical"]);
    expect(result.sections[1].items.map((i) => i.name)).toEqual([
      "Coverings",
      "Flashings",
      "Skylights, Chimneys & Other Roof Penetrations",
    ]);
    expect(result.sections[1].items[0].comments.map((c) => c.name)).toEqual([
      "Roof inspection method",
      "Walking the roof was unsafe",
      "Damaged shingles",
    ]);
  });

  it("keeps an item that has no comments", () => {
    expect(result.sections[1].items[2].comments).toHaveLength(0);
  });

  it("imports without warnings", () => {
    expect(result.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(result.stats.skippedRows).toBe(0);
    expect(result.stats.sourceTextChars).toBe(result.stats.importedTextChars);
  });

  it("keeps links, formatting, entities and attributes", () => {
    const shingles = result.sections[1].items[0].comments[2];
    expect(extractLinks(shingles.bodyHtml)).toEqual(["https://www.nachi.org/certified-inspectors"]);
    expect(shingles.bodyHtml).toContain("<ul>");
    expect(shingles.commentType).toBe("defect");
    expect(shingles.attributes["Recommendation"]).toBe("Roofing professional");
    expect(shingles.attributes["Default Estimate Max"]).toBe("1200");
    const flashing = result.sections[1].items[1].comments[0];
    expect(htmlToText(flashing.bodyHtml)).toBe('Flashing at the chimney was loose. Clearance was < 1" in places.');
    const styled = result.sections[2].items[0].comments[1];
    expect(styled.bodyHtml).toContain("color:#c0392b");
  });

  it("turns a plain text cell into paragraphs without losing line breaks", () => {
    const plain = result.sections[2].items[0].comments[0];
    expect(plain.bodyHtml).toBe("<p>Plain text comment with no markup.<br />Second line of the same comment.</p>");
  });
});

describe("messy export", () => {
  const result = load(synthetic("synthetic-messy.xlsx"));
  const codes = result.issues.map((i) => i.code);
  const all = result.sections.flatMap((s) => s.items.flatMap((i) => i.comments));

  it("finds the header below preamble rows and reports them", () => {
    expect(result.stats.headerRow).toBe(3);
    expect(codes).toContain("preamble_rows");
    expect(codes).toContain("extra_sheets");
  });

  it("removes scripts, handlers and javascript links but keeps the text", () => {
    const scripted = all.find((c) => c.name === "Scripted comment")!;
    expect(scripted.bodyHtml).not.toMatch(/script|onclick|javascript:/i);
    expect(htmlToText(scripted.bodyHtml)).toContain("Moss growth observed.");
    expect(scripted.sourceBodyHtml).toContain("<script>");
    expect(codes).toContain("html_unsafe_removed");
  });

  it("reports embeds, external images and default photos", () => {
    expect(codes).toContain("html_embed_removed");
    expect(codes).toContain("html_external_image");
    expect(codes).toContain("default_photos_not_imported");
    const photo = all.find((c) => c.name === "Reference photo")!;
    expect(photo.attributes["Default Photo 1 Caption"]).toBe("Hail strike on ridge");
  });

  it("fills down blank section and item names and says so", () => {
    expect(codes).toContain("section_inherited");
    expect(codes).toContain("item_inherited");
    const gutters = result.sections[0].items.find((i) => i.name === "Gutters")!;
    expect(gutters.comments.map((c) => c.name)).toEqual([
      "Gutters full of debris",
      "Orphan comment under previous item",
      "Odd type",
    ]);
  });

  it("keeps unknown comment types and unknown columns", () => {
    const odd = all.find((c) => c.name === "Odd type")!;
    expect(odd.commentType).toBe("unknown");
    expect(odd.rawCommentType).toBe("maintenance");
    const tpr = all.find((c) => c.name === "TPR valve")!;
    expect(tpr.commentType).toBe("defect");
    expect(tpr.attributes["Unrecognised: Inspector Notes"]).toBe("custom column value");
    expect(codes).toContain("unknown_column");
  });

  it("keeps a repeated section separate to preserve file order", () => {
    expect(result.sections.map((s) => s.name)).toEqual(["Roof", "Plumbing", "Roof"]);
    expect(codes).toContain("repeated_section_name");
  });

  it("accounts for every row", () => {
    const { dataRows, importedRows, skippedRows, blankRows } = result.stats;
    expect(importedRows + skippedRows).toBe(dataRows);
    expect(blankRows).toBe(1);
  });
});

describe("failure cases", () => {
  const expectCode = (file: string, code: string) => {
    try {
      load(file);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ImportError);
      expect((error as ImportError).code).toBe(code);
    }
  };

  it("rejects a non-spreadsheet", () => expectCode(synthetic("failure-not-a-spreadsheet.xlsx"), "not_a_spreadsheet"));
  it("rejects a spreadsheet that is not a template", () => expectCode(synthetic("failure-not-a-template.xlsx"), "no_header_row"));
  it("names the missing required column", () => expectCode(synthetic("failure-missing-columns.xlsx"), "missing_required_columns"));
  it("rejects an empty upload", () => {
    expect(() => parseSpectoraExport(Buffer.alloc(0), "x.xlsx")).toThrowError(/empty/);
  });
});

const realDir = path.join(process.cwd(), "samples", "spectora");
const realFiles = existsSync(realDir) ? readdirSync(realDir).filter((f) => /\.(xlsx|xls)$/i.test(f)) : [];

describe.skipIf(realFiles.length === 0)("real Spectora export", () => {
  for (const file of realFiles) {
    const full = path.join(realDir, file);

    it(`${file}: every source row is accounted for, in order, with identical text and links`, () => {
      const result = load(full);
      const source = independentRows(full);
      expect(result.stats.dataRows).toBe(source.length);
      expect(result.stats.importedRows + result.stats.skippedRows).toBe(source.length);

      const imported = result.sections.flatMap((s) =>
        s.items.flatMap((i) => i.comments.map((c) => ({ section: s.name, item: i.name, comment: c })))
      );
      const sourceComments = source.filter((row) => row.name || row.text.trim());
      expect(imported.length).toBe(sourceComments.length - result.stats.skippedRows);

      if (result.stats.skippedRows === 0) {
        imported.forEach((entry, index) => {
          const row = sourceComments[index];
          expect(entry.comment.name).toBe(row.name);
          if (row.section) expect(entry.section).toBe(row.section);
          if (row.item) expect(entry.item).toBe(row.item);
          if (!result.issues.some((i) => i.sourceRow === entry.comment.sourceRow && i.code.startsWith("html_"))) {
            expect(htmlToText(entry.comment.bodyHtml)).toBe(htmlToText(row.text));
            expect(extractLinks(entry.comment.bodyHtml)).toEqual(extractLinks(row.text));
          }
        });
      }
    });
  }
});
