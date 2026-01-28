const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Jimp = require("jimp");
const QrCode = require("qrcode-reader");

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

/**
 * Skúša viac preprocessing variantov, aby to fungovalo aj na horších fotkách.
 * Vracia dekódovaný text alebo null.
 */
async function decodeQrFromBuffer(buffer) {
  const img = await Jimp.read(buffer);

  const variants = [
    () => img.clone(),
    () => img.clone().greyscale().contrast(0.4).normalize(),
    () => img.clone().greyscale().invert().contrast(0.4).normalize(),
    () => img.clone().greyscale().resize(900, Jimp.AUTO).contrast(0.4).normalize(),
    () => img.clone().greyscale().resize(1400, Jimp.AUTO).contrast(0.6).normalize(),
  ];

  for (const make of variants) {
    try {
      const text = await decodeWithQrReader(make());
      if (text) return text;
    } catch {}
  }
  return null;
}

// ----- OPD lookup helpers -----

const OPD_URL = "https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find";

function stripControlChars(s) {
  return String(s || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
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
function buildLookupPayload(qrTextRaw) {
  const qrText = stripControlChars(qrTextRaw);

  // ONLINE
  const receiptId = extractOnlineReceiptIdFromAnything(qrText);
  if (receiptId) {
    return { type: "online", payload: { receiptId } };
  }

  // OFFLINE: okp:cashRegisterCode:YYMMDDhhmmss:receiptNumber:totalAmount
  const parts = qrText.split(":").map((p) => p.trim());
  if (parts.length === 5) {
    const [okp, cashRegisterCode, compactDate, receiptNumber, totalAmount] = parts;

    const issueDateFormatted = formatCompactDate(compactDate);
    if (!issueDateFormatted) return null;

    const rn = parseNumberStrict(receiptNumber);
    const ta = parseNumberStrict(totalAmount);

    if (!okp || !cashRegisterCode || !issueDateFormatted || rn === null || ta === null) return null;

    return {
      type: "offline",
      payload: {
        okp,
        cashRegisterCode,
        issueDateFormatted,
        receiptNumber: rn,
        totalAmount: ta,
      },
    };
  }

  return null;
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

function extractJsonFromOpenAI(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("```")) {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return match ? match[1].trim() : trimmed.replace(/```/g, "").trim();
  }
  return trimmed;
}

async function categorizeItemsWithOpenAI(fsJson) {
  if (!OPENAI_API_KEY) {
    logStep("ai", "OPENAI_API_KEY missing, skipping categorization");
    return { categories: null, debug: { skipped: true, reason: "missing_api_key" } };
  }
  const items = fsJson?.receipt?.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    logStep("ai", "No items to categorize");
    return { categories: [], debug: { skipped: true, reason: "no_items" } };
  }

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Si pomocník na kategorizáciu položiek z pokladničných bločkov. " +
          "Dostaneš celý JSON bločku. " +
          "Vráť iba JSON bez ďalšieho textu.",
      },
      {
        role: "user",
        content: JSON.stringify({
          receiptJson: fsJson,
          outputFormat: "Array<{id:number, name:string, category:string}>",
        }),
      },
    ],
  };

  logStep("ai", "Sending categorize request", { items: items.length, model: OPENAI_MODEL });
  logStep("ai", "Request payload", { payload });
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.warn("OpenAI categorize failed:", data?.error || data);
    logStep("ai", "Categorize failed", { status: resp.status, error: data?.error || data });
    return { categories: null, debug: { error: data?.error || data, status: resp.status } };
  }

  const content = data?.choices?.[0]?.message?.content;
  logStep("ai", "Response content", { content });
  if (!content) return { categories: null, debug: { error: "empty_response" } };
  try {
    const parsed = JSON.parse(extractJsonFromOpenAI(content));
    const list = Array.isArray(parsed) ? parsed : parsed?.results;
    if (!Array.isArray(list)) return { categories: null, debug: { error: "invalid_format", raw: parsed } };
    const byId = new Map(list.map((entry) => [entry?.id, entry?.category]));
    logStep("ai", "Categorize success", { categories: list.length });
    const categories = items.map((item, idx) => ({
      name: item?.name || "",
      category: byId.get(idx) || "",
    }));
    logStep("ai", "Categories output", { categories });
    return { categories, debug: { requestPayload: payload, parsed: categories, rawResponse: content } };
  } catch (e) {
    console.warn("OpenAI categorize parse failed:", e?.message || e);
    logStep("ai", "Categorize parse failed", { error: e?.message || String(e) });
    return { categories: null, debug: { requestPayload: payload, error: e?.message || String(e), rawResponse: content } };
  }
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

    logStep("receipt", "Decoding QR", { requestId, fileSize: req.file.size });
    const qrText = await decodeQrFromBuffer(req.file.buffer);
    if (!qrText) {
      logStep("receipt", "QR decode failed", { requestId });
      return res.status(422).json({
        ok: false,
        error: "Nepodarilo sa prečítať QR z fotky. Skús ostrejšiu fotku / viac svetla / priblížiť QR.",
      });
    }

    logStep("receipt", "QR decoded", { requestId, qrText });
    const lookup = buildLookupPayload(qrText);
    if (!lookup) {
      logStep("receipt", "Unsupported QR format", { requestId, qrText });
      return res.status(422).json({ ok: false, error: "Neznámy formát QR (ani online O-..., ani offline s ':').", qrText });
    }

    logStep("receipt", "Lookup payload ready", { requestId, type: lookup.type });
    // cache key: online id alebo offline zlepený payload
    const cacheKey =
      lookup.type === "online"
        ? `online:${lookup.payload.receiptId}`
        : `offline:${lookup.payload.okp}:${lookup.payload.cashRegisterCode}:${lookup.payload.issueDateFormatted}:${lookup.payload.receiptNumber}:${lookup.payload.totalAmount}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      logStep("receipt", "Cache hit", { requestId });
      const aiResult = await categorizeItemsWithOpenAI(cached);
      logStep("receipt", "Returning cached response", { requestId });
      return res.json({
        ok: true,
        qrText,
        lookup,
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

    const aiResult = await categorizeItemsWithOpenAI(fsJson);
    logStep("receipt", "Returning response", { requestId, aiCategories: aiResult?.categories?.length || 0 });
    res.json({
      ok: true,
      qrText,
      lookup,
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
