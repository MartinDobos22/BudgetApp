import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const RECEIPTS_PATH = path.join(DATA_DIR, "receipts.json");

export function readReceiptsFile() {
  if (!fs.existsSync(RECEIPTS_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(RECEIPTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeReceiptsFile(receipts) {
  const tempPath = `${RECEIPTS_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(receipts, null, 2));
  fs.renameSync(tempPath, RECEIPTS_PATH);
}

export function normalizeReceiptPayload(payload) {
  const now = new Date().toISOString();
  const id = payload?.id ? String(payload.id) : `${Date.now()}`;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return {
    id,
    createdAt: payload?.createdAt ? String(payload.createdAt) : now,
    issueDate: payload?.issueDate ? String(payload.issueDate) : null,
    storeName: payload?.storeName ? String(payload.storeName) : "Neznámy obchod",
    storeGroup: payload?.storeGroup ? String(payload.storeGroup) : null,
    totalPrice: Number(payload?.totalPrice) || 0,
    notes: payload?.notes ? String(payload.notes) : "",
    items,
  };
}
