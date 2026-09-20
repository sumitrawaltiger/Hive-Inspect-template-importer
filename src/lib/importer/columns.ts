export type StructuralField =
  | "section"
  | "item"
  | "commentName"
  | "commentText"
  | "commentType";

export const STRUCTURAL_COLUMNS: Record<string, StructuralField> = {
  sectionname: "section",
  section: "section",
  itemname: "item",
  item: "item",
  commentname: "commentName",
  commenttext: "commentText",
  commenttexthtml: "commentText",
  comment: "commentText",
  commenttype: "commentType",
};

export const ATTRIBUTE_COLUMNS: Record<string, string> = {
  category: "Category",
  multiplechoiceoptions: "Multiple Choice Options",
  unittypeoptions: "Unit Type Options",
  answertype: "Answer Type",
  defaultvalue: "Default Value",
  defaultvalue2: "Default Value 2",
  defaultunittype: "Default Unit Type",
  recommendation: "Recommendation",
  defaultlocation: "Default Location",
  defaultestimatemin: "Default Estimate Min",
  defaultestimatemax: "Default Estimate Max",
  order: "Order",
  locked: "Locked",
  simpleformat: "Simple Format",
  disablephotos: "Disable Photos",
  uses: "Uses",
  lastmodified: "Last Modified",
};

const PHOTO_COLUMN = /^defaultphoto(\d+)(caption)?$/;

export const REQUIRED_FIELDS: StructuralField[] = ["section", "item", "commentText"];

export const OPTIONAL_FIELDS: StructuralField[] = ["commentName", "commentType"];

export const FIELD_LABELS: Record<StructuralField, string> = {
  section: "Section Name",
  item: "Item Name",
  commentName: "Comment Name",
  commentText: "Comment Text",
  commentType: "Comment Type",
};

export function normalizeHeader(header: string): string {
  return header
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type ColumnMatch =
  | { kind: "structural"; field: StructuralField }
  | { kind: "attribute"; label: string; isPhoto: boolean }
  | { kind: "unknown" };

export function matchColumn(header: string): ColumnMatch {
  const key = normalizeHeader(header);
  if (!key) return { kind: "unknown" };
  const field = STRUCTURAL_COLUMNS[key];
  if (field) return { kind: "structural", field };
  const label = ATTRIBUTE_COLUMNS[key];
  if (label) return { kind: "attribute", label, isPhoto: false };
  const photo = key.match(PHOTO_COLUMN);
  if (photo) {
    return {
      kind: "attribute",
      label: `Default Photo ${photo[1]}${photo[2] ? " Caption" : ""}`,
      isPhoto: true,
    };
  }
  return { kind: "unknown" };
}
