import { getDb } from "./client";
import { NotFoundError, getTemplateTree } from "./templates";

export async function loadTemplateOrNull(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  try {
    return await getTemplateTree(await getDb(), id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
