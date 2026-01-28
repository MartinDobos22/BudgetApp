const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Jimp = require("jimp");
const QrCode = require("qrcode-reader");

const app = express();
app.use(cors());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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

const CATEGORY_OPTIONS = [
  "Mliečne výrobky",
  "Sladké pečivo",
  "Slané pečivo",
  "Klasické pečivo",
  "Šunky",
  "Salámy",
  "Mäso",
  "Zelenina",
  "Ovocie",
  "Nápoje",
  "Domáce potreby",
  "Drogéria",
  "Trvanlivé potraviny",
  "Iné",
];

async function categorizeItemsWithOpenAI(items) {
  if (!OPENAI_API_KEY) return null;
  if (!Array.isArray(items) || items.length === 0) return [];

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Si pomocník na kategorizáciu položiek z pokladničných bločkov. " +
          "Dostaneš zoznam položiek a povolených kategórií. " +
          "Vráť iba JSON bez ďalšieho textu.",
      },
      {
        role: "user",
        content: JSON.stringify({
          categories: CATEGORY_OPTIONS,
          items: items.map((item, idx) => ({
            id: idx,
            name: item?.name || "",
          })),
          outputFormat: "Array<{id:number, category:string}>",
        }),
      },
    ],
  };

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
    return null;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return null;
    const byId = new Map(parsed.map((entry) => [entry?.id, entry?.category]));
    return items.map((item, idx) => ({
      name: item?.name || "",
      category: byId.get(idx) || "Iné",
    }));
  } catch (e) {
    console.warn("OpenAI categorize parse failed:", e?.message || e);
    return null;
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
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Chýba súbor. Pošli ho ako field 'image'." });
    }

    const qrText = await decodeQrFromBuffer(req.file.buffer);
    if (!qrText) {
      return res.status(422).json({
        ok: false,
        error: "Nepodarilo sa prečítať QR z fotky. Skús ostrejšiu fotku / viac svetla / priblížiť QR.",
      });
    }

    const lookup = buildLookupPayload(qrText);
    if (!lookup) {
      return res.status(422).json({ ok: false, error: "Neznámy formát QR (ani online O-..., ani offline s ':').", qrText });
    }

    // cache key: online id alebo offline zlepený payload
    const cacheKey =
      lookup.type === "online"
        ? `online:${lookup.payload.receiptId}`
        : `offline:${lookup.payload.okp}:${lookup.payload.cashRegisterCode}:${lookup.payload.issueDateFormatted}:${lookup.payload.receiptNumber}:${lookup.payload.totalAmount}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      const aiCategories = await categorizeItemsWithOpenAI(cached?.receipt?.items || []);
      return res.json({ ok: true, qrText, lookup, fsJson: cached, cached: true, aiCategories });
    }

    const fsJson = await fetchReceiptFromFS(lookup.payload);
    cacheSet(cacheKey, fsJson);

    const aiCategories = await categorizeItemsWithOpenAI(fsJson?.receipt?.items || []);
    res.json({ ok: true, qrText, lookup, fsJson, cached: false, aiCategories });
  } catch (e) {
    console.error(e);
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
