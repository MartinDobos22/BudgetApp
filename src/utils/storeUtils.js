import { STORE_GROUPS } from "../constants/app";

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function guessStoreGroup(name) {
  const text = normalizeText(name);
  if (!text) return "";
  const match = STORE_GROUPS.find((store) =>
    store.keywords.some((keyword) => text.includes(normalizeText(keyword)))
  );
  return match?.label || "";
}
