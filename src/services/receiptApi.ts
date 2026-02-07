import { CATEGORY_TREE } from "../utils/categories";
import { AiCategory, Receipt, ReceiptItem } from "../models/receipt";

const receiptCache = new Map<string, Receipt>();

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseIssueDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = match;
  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss || "0"),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const buildFileSignature = (file: File): string =>
  [file.name, file.size, file.type, file.lastModified].filter(Boolean).join("|");

const buildReceiptItem = (item: Record<string, unknown>, idx: number, fallbackId: string): ReceiptItem => {
  const name = String(item?.name ?? item?.text ?? `Položka ${idx + 1}`).trim();
  const qty = parseNumber(item?.quantity) ?? parseNumber(item?.qty) ?? 1;
  const lineTotal =
    parseNumber(item?.lineTotal) ?? parseNumber(item?.totalPrice) ?? parseNumber(item?.price) ?? 0;
  const unitPrice =
    parseNumber(item?.unitPrice) ??
    (qty ? Number((lineTotal / qty).toFixed(2)) : lineTotal) ??
    0;
  return {
    id: String(item?.id ?? `${fallbackId}-${idx}`),
    name,
    qty,
    unitPrice,
    lineTotal,
    categoryMain: undefined,
    categorySub: undefined,
  };
};

const normalizeText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getDefaultSub = (main?: string): string => (main ? CATEGORY_TREE[main]?.[0] ?? "" : "");

const findCategoryForLabel = (label: string): { main: string; sub: string } | null => {
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) return null;
  if (normalizedLabel === "ine" || normalizedLabel === "other") {
    return { main: "Iné", sub: getDefaultSub("Iné") };
  }

  for (const [main, subs] of Object.entries(CATEGORY_TREE)) {
    for (const sub of subs) {
      const parts = sub.split("/").map((part) => normalizeText(part));
      if (parts.some((part) => part && normalizedLabel.includes(part))) {
        return { main, sub };
      }
    }
  }

  return null;
};

const mapAiCategoriesToItems = (items: ReceiptItem[], aiCategories: AiCategory[] | null | undefined): ReceiptItem[] => {
  if (!Array.isArray(aiCategories) || aiCategories.length === 0) return items;
  const byId = new Map(aiCategories.map((entry) => [entry.id, entry]));
  return items.map((item, idx) => {
    const match = byId.get(idx);
    if (!match) return item;
    const mapped = findCategoryForLabel(match.category);
    if (!mapped) return item;
    return {
      ...item,
      categoryMain: mapped.main,
      categorySub: mapped.sub,
    };
  });
};

const mapReceiptResponse = (data: Record<string, any>, file: File, durationMs: number): Receipt => {
  const receipt = data?.fsJson?.receipt ?? {};
  const receiptId = receipt?.receiptId ?? data?.lookup?.payload?.receiptId ?? `${file.name}-${file.size}`;
  const issueDate =
    parseIssueDate(receipt?.issueDate) ??
    parseIssueDate(receipt?.issueDateFormatted) ??
    parseIssueDate(data?.lookup?.payload?.issueDateFormatted) ??
    null;
  const items = Array.isArray(receipt?.items)
    ? receipt.items.map((item: Record<string, unknown>, idx: number) =>
        buildReceiptItem(item, idx, String(receiptId)),
      )
    : [];
  const aiCategories = Array.isArray(data?.aiCategories) ? (data.aiCategories as AiCategory[]) : undefined;
  const categorizedItems = mapAiCategoriesToItems(items, aiCategories);
  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total =
    parseNumber(receipt?.totalPrice) ??
    parseNumber(receipt?.totalAmount) ??
    parseNumber(data?.lookup?.payload?.totalAmount) ??
    Number(itemsTotal.toFixed(2));
  const merchant =
    receipt?.storeName ||
    receipt?.organizationName ||
    receipt?.organization?.name ||
    receipt?.companyName ||
    "Neznámy obchod";
  const unit =
    receipt?.cashRegisterCode ||
    receipt?.storeId ||
    receipt?.operationId ||
    receipt?.unit ||
    "Prevádzka";
  return {
    id: String(receiptId),
    merchant: String(merchant),
    date: issueDate ?? new Date().toISOString(),
    unit: String(unit),
    currency: String(receipt?.currency || "EUR"),
    total,
    items: categorizedItems,
    merchantGroup: undefined,
    note: "",
    source: "qr",
    aiCategories,
    raw: data?.fsJson ?? {},
    qrMeta: {
      source: data?.qrMeta?.source ?? "QR bloček",
      parseTimeMs: Math.max(0, Math.round(durationMs)),
      warnings: data?.lookupDebug?.extracted ? ["QR text bol čiastočne doplnený z OCR"] : undefined,
    },
  };
};

export const parseReceipt = async (file: File): Promise<Receipt> => {
  const signature = buildFileSignature(file);
  const cached = receiptCache.get(signature);
  if (cached) {
    return cached;
  }
  const form = new FormData();
  form.append("image", file, file.name);
  const startedAt = performance.now();
  const resp = await fetch("/api/receipt", {
    method: "POST",
    body: form,
  });
  let data: Record<string, any> = {};
  try {
    data = (await resp.json()) as Record<string, any>;
  } catch {
    data = {};
  }
  if (!resp.ok || !data?.ok) {
    const message =
      data?.error ||
      (resp.status === 0 ? "Backend nie je dostupný." : `Spracovanie zlyhalo (HTTP ${resp.status}).`);
    throw new Error(message);
  }
  const receipt = mapReceiptResponse(data, file, performance.now() - startedAt);
  receiptCache.set(signature, receipt);
  return receipt;
};

export const categorizeItems = async (
  items: ReceiptItem[],
  aiCategories?: AiCategory[] | null,
): Promise<ReceiptItem[]> => {
  const withAi = mapAiCategoriesToItems(items, aiCategories);
  const updated = withAi.map((item) => {
    const normalized = item.name.toLowerCase();
    const matched = Object.entries(CATEGORY_TREE).find(([_, subs]) =>
      subs.some((sub) => normalized.includes(sub.toLowerCase().split("/")[0])),
    );
    const fallbackMain = item.categoryMain || matched?.[0] || "Iné";
    const fallbackSub = item.categorySub || matched?.[1]?.[0] || getDefaultSub(fallbackMain);
    return {
      ...item,
      categoryMain: fallbackMain,
      categorySub: fallbackSub,
    };
  });
  return Promise.resolve(updated);
};
