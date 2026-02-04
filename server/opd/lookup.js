import { fetchWithTimeout } from "../utils/http.js";

const OPD_URL = "https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find";

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
  const s = stripControlChars(raw, { preserveNewlines: true });
  const re = /O-[A-F0-9]{32}/i;

  const direct = s.match(new RegExp("^" + re.source + "$", "i"));
  if (direct) return direct[0].toUpperCase();

  const inside = s.match(re);
  if (inside) return inside[0].toUpperCase();

  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const keys = ["receiptId", "receiptID", "id", "rid"];
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (v && re.test(v)) return v.match(re)[0].toUpperCase();
      }
      const pathMatch = u.pathname.match(re);
      if (pathMatch) return pathMatch[0].toUpperCase();
    }
  } catch {}

  const looseMatch = s.match(/O\s*[-–]?\s*(?:[A-F0-9][\s:-]*){32}/i);
  if (looseMatch) {
    const hex = looseMatch[0].replace(/[^A-F0-9]/gi, "").toUpperCase();
    if (hex.length >= 32) return `O-${hex.slice(0, 32)}`;
  }

  const looseZeroMatch = s.match(/0\s*[-–]?\s*(?:[A-F0-9][\s:-]*){32}/i);
  if (looseZeroMatch) {
    const hex = looseZeroMatch[0].replace(/[^A-F0-9]/gi, "").toUpperCase();
    if (hex.length >= 32) return `O-${hex.slice(0, 32)}`;
  }

  return null;
}

function formatCompactDate(compact) {
  if (!/^\d{12}$/.test(compact)) return null;

  const yy = Number(compact.slice(0, 2));
  const mm = compact.slice(2, 4);
  const dd = compact.slice(4, 6);
  const hh = compact.slice(6, 8);
  const mi = compact.slice(8, 10);
  const ss = compact.slice(10, 12);

  const year = (yy >= 70 ? 1900 : 2000) + yy;
  return `${dd}.${mm}.${year} ${hh}:${mi}:${ss}`;
}

function parseNumberStrict(x) {
  const s = String(x ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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

export function buildLookupPayload(qrTextRaw, { includeExtracted = false } = {}) {
  const qrText = stripControlChars(qrTextRaw, { preserveNewlines: true });
  const extracted = includeExtracted ? extractOfflinePayloadFromText(qrText) : null;
  const debug = {
    normalizedPreview: qrText.replace(/\s+/g, " ").slice(0, 160),
    extracted: extracted?.debug || null,
  };

  const receiptId = extractOnlineReceiptIdFromAnything(qrText);
  if (receiptId) {
    return { lookup: { type: "online", payload: { receiptId } }, debug: { ...debug, strategy: "online" } };
  }

  const offline = parseOfflinePayloadFromColonText(qrText);
  if (offline) {
    return { lookup: { type: "offline", payload: offline }, debug: { ...debug, strategy: "offline_colon" } };
  }

  const extractedFromText = extracted || extractOfflinePayloadFromText(qrText);
  if (extractedFromText?.payload) {
    return {
      lookup: { type: "offline", payload: extractedFromText.payload },
      debug: { ...debug, strategy: "offline_text", extracted: extractedFromText?.debug || null },
    };
  }

  return {
    lookup: null,
    debug: { ...debug, strategy: "unsupported", extracted: extractedFromText?.debug || null },
  };
}

export async function fetchReceiptFromFS(lookupPayload) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0",
    Origin: "https://ekasa.financnasprava.sk",
    Referer: "https://ekasa.financnasprava.sk/mdu/opd/",
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

export function logOpdUrl() {
  console.log("OPD URL:", OPD_URL);
}
