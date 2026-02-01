import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import multer from "multer";
import Jimp from "jimp";
import QrCode from "qrcode-reader";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile(path.resolve(process.cwd(), ".env"));

const app = express();
app.use(cors());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

function logStep(scope, message, meta = {}) {
  const payload = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${scope}] ${message}${payload}`);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ----- QR decode helpers -----

function decodeWithQrReader(jimpImage) {
  return new Promise((resolve, reject) => {
    const qr = new QrCode();
    qr.callback = (err, value) => {
      if (err) return reject(err);
      resolve(value?.result || null);
    };
    qr.decode(jimpImage.bitmap);
  });
}

function applyThreshold(jimpImage, threshold = 170) {
  const { data, width, height } = jimpImage.bitmap;
  jimpImage.scan(0, 0, width, height, (x, y, idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const v = (r + g + b) / 3;
    const t = v >= threshold ? 255 : 0;
    data[idx] = t;
    data[idx + 1] = t;
    data[idx + 2] = t;
  });
  return jimpImage;
}

async function decodeWithGoogleVision(buffer) {
  if (!GOOGLE_VISION_API_KEY) return null;

  try {
    const resp = await fetchWithTimeout(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: buffer.toString("base64") },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        }),
      },
      12000,
    );

    if (!resp.ok) {
      return null;
    }

    const payload = await resp.json();
    const annotation = payload?.responses?.[0]?.textAnnotations?.[0]?.description;
    if (!annotation) return null;
    return String(annotation).trim();
  } catch (err) {
    return null;
  }
}

/**
 * Skúša viac preprocessing variantov, aby to fungovalo aj na horších fotkách.
 * Vracia dekódovaný text alebo null.
 */
function replaceDigitishCharacters(value) {
  return String(value || "").replace(/[OIlSBE]/gi, (char) => {
    const normalized = char.toLowerCase();
    if (normalized === "o") return "0";
    if (normalized === "i" || normalized === "l") return "1";
    if (normalized === "s") return "5";
    if (normalized === "b") return "8";
    if (normalized === "e") return "6";
    return char;
  });
}

async function decodeQrFromBuffer(buffer) {
  const img = await Jimp.read(buffer);

  const variants = [
    { label: "orig", make: () => img.clone() },
    { label: "gray-contrast", make: () => img.clone().greyscale().contrast(0.4).normalize() },
    { label: "gray-invert", make: () => img.clone().greyscale().invert().contrast(0.4).normalize() },
    { label: "resize-900", make: () => img.clone().greyscale().resize(900, Jimp.AUTO).contrast(0.4).normalize() },
    { label: "resize-1400", make: () => img.clone().greyscale().resize(1400, Jimp.AUTO).contrast(0.6).normalize() },
    { label: "resize-1800", make: () => img.clone().greyscale().resize(1800, Jimp.AUTO).contrast(0.8).normalize() },
    { label: "resize-2400", make: () => img.clone().greyscale().resize(2400, Jimp.AUTO).contrast(0.8).normalize() },
    { label: "threshold-160", make: () => applyThreshold(img.clone().greyscale().normalize(), 160) },
    { label: "threshold-200", make: () => applyThreshold(img.clone().greyscale().normalize(), 200) },
    { label: "threshold-1600", make: () => applyThreshold(img.clone().greyscale().resize(1600, Jimp.AUTO).normalize(), 170) },
    { label: "threshold-2000", make: () => applyThreshold(img.clone().greyscale().resize(2000, Jimp.AUTO).normalize(), 190) },
    { label: "rotate-90", make: () => img.clone().rotate(90).greyscale().contrast(0.4).normalize() },
    { label: "rotate-180", make: () => img.clone().rotate(180).greyscale().contrast(0.4).normalize() },
    { label: "rotate-270", make: () => img.clone().rotate(270).greyscale().contrast(0.4).normalize() },
  ];

  for (const variant of variants) {
    try {
      const text = await decodeWithQrReader(variant.make());
      if (text) return { text, source: "qr", variant: variant.label };
    } catch {}
  }

  if (GOOGLE_VISION_API_KEY) {
    const text = await decodeWithGoogleVision(buffer);
    if (text) return { text, source: "ocr", variant: "google_vision" };
  }

  return null;
}

// ----- OPD lookup helpers -----

const OPD_URL = "https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find";

function stripControlChars(s, { preserveNewlines = false } = {}) {
  const pattern = preserveNewlines
    ? /[\u0000-\u0009\u000B-\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  return String(s || "").replace(pattern, "").trim();
}

function normalizeOkpCandidate(raw) {
  const normalized = replaceDigitishCharacters(raw).toUpperCase();
  const match = normalized.match(/[A-F0-9]{8}(?:[-:][A-F0-9]{8}){4}/);
  if (match) return match[0].replace(/:/g, "-");

  const packed = normalized.replace(/[^A-F0-9]/g, "");
  if (packed.length >= 40) {
    const parts = packed.slice(0, 40).match(/.{1,8}/g) || [];
    if (parts.length === 5) return parts.join("-");
  }
  return null;
}

function extractOnlineReceiptIdFromAnything(raw) {
  const s = stripControlChars(raw);
  const re = /O-[A-F0-9]{32}/i;

  // 1) priamo "O-..."
  const direct = s.match(new RegExp("^" + re.source + "$", "i"));
  if (direct) return direct[0].toUpperCase();

  // 2) vnútri textu (napr. URL)
  const inside = s.match(re);
  if (inside) return inside[0].toUpperCase();

  // 3) skúsiť URL parametre
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const keys = ["receiptId", "receiptID", "id", "rid"];
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (v && re.test(v)) return v.match(re)[0].toUpperCase();
      }
      // ak je v path segmente
      const pathMatch = u.pathname.match(re);
      if (pathMatch) return pathMatch[0].toUpperCase();
    }
  } catch {}

  return null;
}

function formatCompactDate(compact) {
  // napr. "250101000000" => "01.01.2025 00:00:00"
  if (!/^\d{12}$/.test(compact)) return null;

  const yy = Number(compact.slice(0, 2));
  const mm = compact.slice(2, 4);
  const dd = compact.slice(4, 6);
  const hh = compact.slice(6, 8);
  const mi = compact.slice(8, 10);
  const ss = compact.slice(10, 12);

  const year = (yy >= 70 ? 1900 : 2000) + yy; // heuristika
  return `${dd}.${mm}.${year} ${hh}:${mi}:${ss}`;
}

function parseNumberStrict(x) {
  // podporí "15.99", "15,99", " 15.99 "
  const s = String(x ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

console.log("OPD URL:", OPD_URL);
/**
 * Rozpozná, či QR je online (O-...) alebo offline (5 častí oddelených ':')
 * a vráti payload pre OPD endpoint.
 */
function parseOfflinePayloadFromColonText(qrText) {
  const parts = qrText.split(":").map((p) => p.trim());
  if (parts.length !== 5) return null;

  const [okp, cashRegisterCode, compactDate, receiptNumber, totalAmount] = parts;
  const issueDateFormatted = formatCompactDate(compactDate);
  if (!issueDateFormatted) return null;

  const rn = parseNumberStrict(receiptNumber);
  const ta = parseNumberStrict(totalAmount);
  if (!okp || !cashRegisterCode || rn === null || ta === null) return null;

  return {
    okp,
    cashRegisterCode,
    issueDateFormatted,
    receiptNumber: rn,
    totalAmount: ta,
  };
}

function extractOfflinePayloadFromText(qrText) {
  const cleanedText = stripControlChars(qrText, { preserveNewlines: true });
  const lines = cleanedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const okp = normalizeOkpCandidate(cleanedText);

  const cashLine =
    lines.find((line) => /pokladn|pokladnic|pokladna|cash register/i.test(line)) ||
    lines.find((line) => /\d{6,}/.test(line));
  const cashMatch = cashLine?.match(/[0-9 ]{6,}/);
  const cashRegisterCode = cashMatch ? cashMatch[0].replace(/\s+/g, "") : null;

  const normalizedText = replaceDigitishCharacters(cleanedText);
  const dateMatch = normalizedText.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  const issueDateFormatted = dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : null;

  let receiptNumber = null;
  const receiptLine = lines.find((line) => /doklad|blocek|blok|receipt|cislo|č\./i.test(line));
  if (receiptLine) {
    const receiptMatch = replaceDigitishCharacters(receiptLine).match(/\d{1,}/);
    receiptNumber = receiptMatch ? Number(receiptMatch[0]) : null;
  }

  let totalAmount = null;
  const totalIndex = lines.findIndex((line) => /suma|celkom|spolu|total/i.test(line));
  const candidateLines =
    totalIndex >= 0 ? lines.slice(totalIndex, totalIndex + 4) : lines.length ? lines : [cleanedText];
  const numbers = candidateLines
    .flatMap((line) => (replaceDigitishCharacters(line).match(/\d+(?:[.,]\d{1,2})/g) || []))
    .map(parseNumberStrict)
    .filter((value) => value !== null);
  if (numbers.length) {
    totalAmount = numbers[numbers.length - 1];
  }

  if (!okp || !cashRegisterCode || !issueDateFormatted || receiptNumber === null || totalAmount === null) {
    return {
      payload: null,
      debug: {
        okp,
        cashRegisterCode,
        issueDateFormatted,
        receiptNumber,
        totalAmount,
        linesSample: lines.slice(0, 8),
      },
    };
  }

  return {
    payload: {
      okp,
      cashRegisterCode,
      issueDateFormatted,
      receiptNumber,
      totalAmount,
    },
    debug: null,
  };
}

function buildLookupPayload(qrTextRaw) {
  const qrText = stripControlChars(qrTextRaw, { preserveNewlines: true });
  const debug = {
    normalizedPreview: qrText.replace(/\s+/g, " ").slice(0, 160),
  };

  // ONLINE
  const receiptId = extractOnlineReceiptIdFromAnything(qrText);
  if (receiptId) {
    return { lookup: { type: "online", payload: { receiptId } }, debug: { ...debug, strategy: "online" } };
  }

  // OFFLINE: okp:cashRegisterCode:YYMMDDhhmmss:receiptNumber:totalAmount
  const offline = parseOfflinePayloadFromColonText(qrText);
  if (offline) {
    return { lookup: { type: "offline", payload: offline }, debug: { ...debug, strategy: "offline_colon" } };
  }

  const extracted = extractOfflinePayloadFromText(qrText);
  if (extracted?.payload) {
    return { lookup: { type: "offline", payload: extracted.payload }, debug: { ...debug, strategy: "offline_text" } };
  }

  return { lookup: null, debug: { ...debug, strategy: "unsupported", extracted: extracted?.debug || null } };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

async function fetchReceiptFromFS(lookupPayload) {
  // Zámerne pridávame browser-like hlavičky, lebo v praxi to býva stabilnejšie.
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://ekasa.financnasprava.sk",
    "Referer": "https://ekasa.financnasprava.sk/mdu/opd/",
  };

  const resp = await fetchWithTimeout(OPD_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(lookupPayload),
  });

  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    const msg = data?.errorDescription || data?.message || text || `HTTP ${resp.status}`;
    const err = new Error(`FS OPD failed: ${msg}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ----- Simple in-memory cache (aby si nespamoval FS) -----
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const cache = new Map(); // key -> {ts, value}

function cacheGet(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return v.value;
}

function cacheSet(key, value) {
  cache.set(key, { ts: Date.now(), value });
  // jednoduché upratovanie veľkosti
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

// ----- AI kategorizácia -----


// aiCategorize.js
import {CATEGORY_TAXONOMY} from "../shared/categories.js";

function extractJsonFromOpenAI(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("```")) {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return match ? match[1].trim() : trimmed.replace(/```/g, "").trim();
  }
  return trimmed;
}

function normalizeText(s) {
  return String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
}

const ALLOWED_KEYS = new Set(CATEGORY_TAXONOMY.map((c) => c.key));
const LABEL_BY_KEY = new Map(CATEGORY_TAXONOMY.map((c) => [c.key, c.label]));

function sanitizeKey(key) {
  const k = String(key || "").trim();
  return ALLOWED_KEYS.has(k) ? k : "other";
}

// 100% pravidlá – krátke a presné
function hardRuleKey(item) {
  const name = normalizeText(item?.name);
  const itemType = item?.itemType;

  if (itemType === "Z" || name.includes("zlava")) return "special.discount";
  if (name.includes("zaloha") || name.includes("pet")) return "special.deposit";

  if (name.includes("sunka") || name.includes("ham")) return "meat.processed.ham";
  if (name.includes("salama") || name.includes("salami") || name.includes("sal.")) return "meat.processed.salami";

  // kuk / kukur -> konzervovaná zelenina (kukurica)
  if (name.includes("kukur") || name.includes("kuk")) return "pantry.canned.veg";

  return "";
}

const SYSTEM_PROMPT = `
Si pomocník na kategorizáciu položiek z pokladničných bločkov (Slovensko).

Dostaneš JSON s:
- items: [{id, name, itemType, quantity, price}]
- allowedCategories: [{key, label, parent}]

ÚLOHA:
Pre každý item vyber PRESNE jednu kategóriu z allowedCategories.key.

TVRDÉ PRAVIDLÁ:
- Vráť iba JSON (bez textu, bez markdown).
- Musíš vrátiť výsledok pre každý item v rovnakom poradí.
- categoryKey musí byť iba z allowedCategories.key.
- itemType="Z" alebo "ZĽAVA/ZLAVA" -> "special.discount"
- "ZÁLOHA/ZALOHA" alebo "PET" -> "special.deposit"
- "šunka/sunka/ham" -> "meat.processed.ham" (aj keď je v názve "tost.")
- "sal./saláma/salama/salami" -> "meat.processed.salami"
- "kuk./kukurica" -> "pantry.canned.veg" (nie nápoj)
- Nápoje dávaj len ak je jasný nápoj (voda/limonáda/džús/energy/izotonické/sirup), často s L.

FORMÁT VÝSTUPU:
{ "results": [ { "id": number, "categoryKey": string } ] }
`.trim();

export async function categorizeItemsWithOpenAI(fsJson, { OPENAI_API_KEY, OPENAI_MODEL, logStep } = {}) {
  if (!OPENAI_API_KEY) return { categories: null, debug: { skipped: true, reason: "missing_api_key" } };

  const items = fsJson?.receipt?.items || [];
  if (!Array.isArray(items) || items.length === 0) return { categories: [], debug: { skipped: true, reason: "no_items" } };

  const userPayload = {
    allowedCategories: CATEGORY_TAXONOMY,
    items: items.map((it, idx) => ({
      id: idx,
      name: String(it?.name || "").trim(),
      itemType: it?.itemType ?? null,
      quantity: it?.quantity ?? null,
      price: it?.price ?? null,
    })),
  };

  const responseFormat = {
    type: "json_schema",
    json_schema: {
      name: "receipt_item_categories",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          results: {
            type: "array",
            minItems: items.length,
            maxItems: items.length,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "integer" },
                categoryKey: { type: "string" },
              },
              required: ["id", "categoryKey"],
            },
          },
        },
        required: ["results"],
      },
    },
  };

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0,
    max_completion_tokens: 900,
    response_format: responseFormat,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  };

  logStep?.("ai", "Sending categorize request", { items: items.length, model: OPENAI_MODEL });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { categories: null, debug: { status: resp.status, error: data?.error || data, requestPayload: payload } };
  }

  const content = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(extractJsonFromOpenAI(content));
  const list = parsed?.results;
  if (!Array.isArray(list)) return { categories: null, debug: { error: "invalid_format", raw: parsed } };

  const byId = new Map(list.map((x) => [x.id, sanitizeKey(x.categoryKey)]));

  const categories = items.map((item, idx) => {
    const forced = hardRuleKey(item);
    const key = sanitizeKey(forced || byId.get(idx) || "other");
    return {
      id: idx,
      name: String(item?.name || "").trim(),
      categoryKey: key,
      category: LABEL_BY_KEY.get(key) || "Iné",
    };
  });

  return { categories, debug: { rawResponse: content, parsedModelOutput: parsed } };
}


// ----- Routes -----

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "qr-blocek-opd-backend" });
});

/**
 * POST /api/receipt
 * multipart/form-data field: image
 * Return: { ok:true, qrText, lookup, fsJson }
 */
app.post("/api/receipt", upload.single("image"), async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  logStep("receipt", "Incoming request", { requestId });
  try {
    if (!req.file) {
      logStep("receipt", "Missing file", { requestId });
      return res.status(400).json({ ok: false, error: "Chýba súbor. Pošli ho ako field 'image'." });
    }

    logStep("receipt", "Decoding QR", { requestId, fileSize: req.file.size, fileType: req.file.mimetype });
    const qrResult = await decodeQrFromBuffer(req.file.buffer);
    if (!qrResult?.text) {
      logStep("receipt", "QR decode failed", { requestId });
      return res.status(422).json({
        ok: false,
        error: "Nepodarilo sa prečítať QR z fotky. Skús ostrejšiu fotku / viac svetla / priblížiť QR.",
      });
    }

    const qrText = qrResult.text;
    logStep("receipt", "QR decoded", {
      requestId,
      source: qrResult.source,
      variant: qrResult.variant,
      textLength: qrText.length,
      preview: qrText.slice(0, 120),
    });
    const { lookup, debug: lookupDebug } = buildLookupPayload(qrText);
    if (!lookup) {
      logStep("receipt", "Unsupported QR format", { requestId, lookupDebug });
      return res.status(422).json({
        ok: false,
        error:
          qrResult.source === "ocr"
            ? "QR sa nepodarilo dekódovať. OCR našlo len text, ale nenašli sa údaje pre OPD."
            : "Neznámy formát QR (ani online O-..., ani offline s ':').",
        qrText,
        qrMeta: { source: qrResult.source, variant: qrResult.variant },
        lookupDebug,
      });
    }

    logStep("receipt", "Lookup payload ready", { requestId, type: lookup.type, strategy: lookupDebug?.strategy });
    // cache key: online id alebo offline zlepený payload
    const cacheKey =
      lookup.type === "online"
        ? `online:${lookup.payload.receiptId}`
        : `offline:${lookup.payload.okp}:${lookup.payload.cashRegisterCode}:${lookup.payload.issueDateFormatted}:${lookup.payload.receiptNumber}:${lookup.payload.totalAmount}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      logStep("receipt", "Cache hit", { requestId });
      const aiResult = await categorizeItemsWithOpenAI(cached, { OPENAI_API_KEY, OPENAI_MODEL, logStep });
      logStep("receipt", "Returning cached response", { requestId });
      return res.json({
        ok: true,
        qrText,
        qrMeta: { source: qrResult.source, variant: qrResult.variant },
        lookup,
        lookupDebug,
        fsJson: cached,
        cached: true,
        aiCategories: aiResult?.categories || null,
        aiDebug: aiResult?.debug || null,
      });
    }

    logStep("receipt", "Fetching receipt from FS", { requestId });
    const fsJson = await fetchReceiptFromFS(lookup.payload);
    logStep("receipt", "FS response received", { requestId });
    cacheSet(cacheKey, fsJson);

    const aiResult = await categorizeItemsWithOpenAI(fsJson, { OPENAI_API_KEY, OPENAI_MODEL, logStep });
    logStep("receipt", "Returning response", { requestId, aiCategories: aiResult?.categories?.length || 0 });
    res.json({
      ok: true,
      qrText,
      qrMeta: { source: qrResult.source, variant: qrResult.variant },
      lookup,
      lookupDebug,
      fsJson,
      cached: false,
      aiCategories: aiResult?.categories || null,
      aiDebug: aiResult?.debug || null,
    });
  } catch (e) {
    console.error(e);
    logStep("receipt", "Unhandled error", { requestId, error: e?.message || String(e) });
    res.status(e.status || 500).json({
      ok: false,
      error: e?.message || String(e),
      details: e?.data || null,
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Backend beží na http://localhost:${PORT}`);
});
