import { normalizeText } from "./storeUtils";

export function buildAiCategoryMap(items, aiCategories) {
  if (!Array.isArray(aiCategories) || aiCategories.length === 0) return null;

  const byId = new Map();
  aiCategories.forEach((entry) => {
    const id = Number(entry?.id);
    if (!Number.isNaN(id)) {
      byId.set(id, entry);
    }
  });

  const byName = new Map();
  aiCategories.forEach((entry) => {
    const key = normalizeText(entry?.name);
    if (key && !byName.has(key)) {
      byName.set(key, entry);
    }
  });

  return new Map(
    items.map((item, idx) => [idx, byId.get(idx) || byName.get(normalizeText(item?.name)) || null]),
  );
}
