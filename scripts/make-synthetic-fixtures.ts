import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const HEADERS = [
  "Section Name",
  "Item Name",
  "Comment Name",
  "Comment Text",
  "Comment Type (info, limit, defect)",
  "Category (-1 Low, 0 Med, 1 High)",
  "Multiple Choice Options",
  "Unit Type Options",
  "Answer Type",
  "Default Value",
  "Default Value 2",
  "Default Unit Type",
  "Recommendation",
  "Default Location",
  "Default Estimate Min",
  "Default Estimate Max",
  "Order (w/i item)",
  "Locked",
  "Simple Format",
  "Disable Photos",
  "Uses",
  ...Array.from({ length: 10 }, (_, i) => [`Default Photo ${i + 1}`, `Default Photo ${i + 1} Caption`]).flat(),
  "Last Modified",
];

type Row = Partial<Record<string, string | number>>;

function row(section: string, item: string, name: string, text: string, type: string, extra: Row = {}): Row {
  return {
    "Section Name": section,
    "Item Name": item,
    "Comment Name": name,
    "Comment Text": text,
    "Comment Type (info, limit, defect)": type,
    ...extra,
  };
}

const clean: Row[] = [
  row("Inspection Details", "In Attendance", "In Attendance", "", "info", {
    "Answer Type": "checkbox",
    "Multiple Choice Options": "Client, Client's Agent, Listing Agent, Seller",
    "Order (w/i item)": 1,
  }),
  row("Inspection Details", "Temperature (approximate)", "Temperature", "", "info", {
    "Answer Type": "number",
    "Unit Type Options": "Fahrenheit (F), Celsius (C)",
    "Default Unit Type": "Fahrenheit (F)",
    "Order (w/i item)": 1,
  }),
  row(
    "Roof",
    "Coverings",
    "Roof inspection method",
    "<p>The roof was inspected from <strong>ground level with binoculars</strong> &amp; from a ladder at the eaves.</p>",
    "info",
    { "Order (w/i item)": 1 }
  ),
  row(
    "Roof",
    "Coverings",
    "Walking the roof was unsafe",
    "<p>The roof was not walked because it was <em>wet and steeply pitched</em>. This is a limitation of the inspection.</p>",
    "limit",
    { "Order (w/i item)": 1 }
  ),
  row(
    "Roof",
    "Coverings",
    "Damaged shingles",
    '<p>Several shingles were cracked or missing.</p><ul><li>Water can enter at these points.</li><li>Recommend repair by a <a href="https://www.nachi.org/certified-inspectors" target="_blank">qualified roofing contractor</a>.</li></ul>',
    "defect",
    { "Category (-1 Low, 0 Med, 1 High)": 0, Recommendation: "Roofing professional", "Default Estimate Min": 400, "Default Estimate Max": 1200, "Order (w/i item)": 1 }
  ),
  row(
    "Roof",
    "Flashings",
    "Loose flashing",
    "<p>Flashing at the chimney was loose.<br>Clearance was &lt; 1&quot; in places.</p>",
    "defect",
    { "Category (-1 Low, 0 Med, 1 High)": 1, "Default Location": "Chimney", "Order (w/i item)": 1 }
  ),
  row("Roof", "Skylights, Chimneys & Other Roof Penetrations", "", "", ""),
  row(
    "Electrical",
    "Main Service Panel",
    "Panel manufacturer",
    "Plain text comment with no markup.\nSecond line of the same comment.",
    "info",
    { "Answer Type": "text", "Default Value": "Square D", "Order (w/i item)": 1 }
  ),
  row(
    "Electrical",
    "Main Service Panel",
    "Double tapped breaker",
    '<p><span style="color: #c0392b;"><b>Safety hazard:</b></span> two conductors were connected to a single-pole breaker. See <a href="https://www.nachi.org/double-taps.htm">this article</a>.</p>',
    "defect",
    { "Category (-1 Low, 0 Med, 1 High)": 1, Recommendation: "Licensed electrician", Locked: "true", "Order (w/i item)": 2 }
  ),
];

const messy: Row[] = [
  ...clean.slice(2, 5),
  row(
    "Roof",
    "Coverings",
    "Video walkthrough",
    '<p>Watch how roofs are inspected:</p><iframe src="https://www.youtube.com/embed/abc123" width="560" height="315"></iframe>',
    "info"
  ),
  row(
    "Roof",
    "Coverings",
    "Scripted comment",
    '<p onclick="steal()">Moss growth observed.</p><script>alert("x")</script><p><a href="javascript:alert(1)">bad link</a></p>',
    "defect"
  ),
  row(
    "Roof",
    "Coverings",
    "Reference photo",
    '<p>Typical hail damage:</p><img src="https://spectora-uploads.example.com/hail.jpg" alt="Hail damage">',
    "info",
    { "Default Photo 1": "hail-1.jpg", "Default Photo 1 Caption": "Hail strike on ridge" }
  ),
  row("", "Gutters", "Gutters full of debris", "<p>Gutters need cleaning.</p>", "defect"),
  row("Roof", "", "Orphan comment under previous item", "<p>Downspout discharges at the foundation.</p>", "defect"),
  row("Roof", "Gutters", "Odd type", "<p>Comment with a type this importer has never seen.</p>", "maintenance"),
  {},
  row("Plumbing", "Water Heater", "TPR valve", "<p>The TPR discharge pipe was missing.</p>", "Defect", {
    "Inspector Notes": "custom column value",
  }),
  row("Roof", "Coverings", "Late roof comment", "<p>This Roof section reappears after Plumbing.</p>", "info"),
];

function toSheet(rows: Row[], headers: string[], preamble: string[][] = []) {
  const grid: (string | number)[][] = [...preamble, headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
  return XLSX.utils.aoa_to_sheet(grid);
}

function write(file: string, sheets: Record<string, XLSX.WorkSheet>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, sheet] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, sheet, name);
  XLSX.writeFile(workbook, file);
  console.log("wrote", file);
}

const out = path.join(process.cwd(), "samples", "synthetic");
mkdirSync(out, { recursive: true });

write(path.join(out, "synthetic-clean.xlsx"), { Template: toSheet(clean, HEADERS) });

write(path.join(out, "synthetic-messy.xlsx"), {
  Template: toSheet(messy, [...HEADERS, "Inspector Notes"], [["Exported from a spreadsheet tool"], []]),
  Notes: XLSX.utils.aoa_to_sheet([["This second sheet is ignored by the importer"]]),
});

write(path.join(out, "failure-missing-columns.xlsx"), {
  Sheet1: XLSX.utils.aoa_to_sheet([
    ["Section Name", "Item Name", "Notes"],
    ["Roof", "Coverings", "No Comment Text column here"],
  ]),
});

write(path.join(out, "failure-not-a-template.xlsx"), {
  Sheet1: XLSX.utils.aoa_to_sheet([
    ["Invoice", "Amount"],
    ["A-100", 250],
  ]),
});

writeFileSync(path.join(out, "failure-not-a-spreadsheet.xlsx"), "this is a text file renamed to .xlsx\n");
console.log("wrote failure-not-a-spreadsheet.xlsx");
