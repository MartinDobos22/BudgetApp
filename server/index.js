import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import multer from "multer";
import Jimp from "jimp";
import QrCode from "qrcode-reader";
import jsQR from "jsqr";

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

function applyOtsuThreshold(jimpImage) {
  const { data, width, height } = jimpImage.bitmap;
  const histogram = new Array(256).fill(0);

  for (let idx = 0; idx < data.length; idx += 4) {
    const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    histogram[Math.round(v)] += 1;
  }

  const total = width * height;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) {
    sumAll += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let i = 0; i < 256; i += 1) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);

    if (betweenVar > maxVariance) {
      maxVariance = betweenVar;
      threshold = i;
    }
  }

  return applyThreshold(jimpImage, threshold);
}

function applyAdaptiveThreshold(jimpImage, windowSize = 25, c = 6) {
  const { data, width, height } = jimpImage.bitmap;
  const size = Math.max(3, windowSize | 0);
  const window = size % 2 === 0 ? size + 1 : size;
  const half = Math.floor(window / 2);
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      const idx = ((y - 1) * width + (x - 1)) * 4;
      const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      rowSum += v;
      const integralIndex = y * (width + 1) + x;
      integral[integralIndex] = integral[integralIndex - (width + 1)] + rowSum;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    const y1i = y1;
    const y2i = y2 + 1;

    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const x1i = x1;
      const x2i = x2 + 1;
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[y2i * (width + 1) + x2i] -
        integral[y1i * (width + 1) + x2i] -
        integral[y2i * (width + 1) + x1i] +
        integral[y1i * (width + 1) + x1i];
      const mean = sum / area;
      const idx = (y * width + x) * 4;
      const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const t = v >= mean - c ? 255 : 0;
      data[idx] = t;
      data[idx + 1] = t;
      data[idx + 2] = t;
    }
  }

  return jimpImage;
}

function applyAutoLevels(jimpImage, lowPercent = 0.01, highPercent = 0.99) {
  const { data, width, height } = jimpImage.bitmap;
  const histogram = new Array(256).fill(0);

  for (let idx = 0; idx < data.length; idx += 4) {
    const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    histogram[Math.round(v)] += 1;
  }

  const total = width * height;
  const lowTarget = total * lowPercent;
  const highTarget = total * highPercent;
  let cumulative = 0;
  let low = 0;

  for (let i = 0; i < 256; i += 1) {
    cumulative += histogram[i];
    if (cumulative >= lowTarget) {
      low = i;
      break;
    }
  }

  cumulative = 0;
  let high = 255;
  for (let i = 255; i >= 0; i -= 1) {
    cumulative += histogram[i];
    if (cumulative >= total - highTarget) {
      high = i;
      break;
    }
  }

  if (high <= low) return jimpImage;

  const scale = 255 / (high - low);
  jimpImage.scan(0, 0, width, height, (x, y, idx) => {
    const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    const stretched = Math.max(0, Math.min(255, Math.round((v - low) * scale)));
    data[idx] = stretched;
    data[idx + 1] = stretched;
    data[idx + 2] = stretched;
  });

  return jimpImage;
}

function applySharpen(jimpImage) {
  return jimpImage.convolute([
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0],
  ]);
}

function applyMedianFilter(jimpImage, radius = 1) {
  const { data, width, height } = jimpImage.bitmap;
  const source = new Uint8ClampedArray(data);
  const size = Math.max(1, radius | 0);
  const window = size * 2 + 1;
  const windowArea = window * window;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const samples = new Array(windowArea);
      let i = 0;

      for (let dy = -size; dy <= size; dy += 1) {
        const yy = Math.max(0, Math.min(height - 1, y + dy));
        for (let dx = -size; dx <= size; dx += 1) {
          const xx = Math.max(0, Math.min(width - 1, x + dx));
          const idx = (yy * width + xx) * 4;
          const v = (source[idx] + source[idx + 1] + source[idx + 2]) / 3;
          samples[i] = v;
          i += 1;
        }
      }

      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];
      const idx = (y * width + x) * 4;
      data[idx] = median;
      data[idx + 1] = median;
      data[idx + 2] = median;
    }
  }

  return jimpImage;
}

function findQrRoi(jimpImage) {
  const { data, width, height } = jimpImage.bitmap;
  const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const result = jsQR(clamped, width, height);
  if (!result?.location) return null;

  const points = [
    result.location.topLeftCorner,
    result.location.topRightCorner,
    result.location.bottomRightCorner,
    result.location.bottomLeftCorner,
  ];

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(height, Math.ceil(Math.max(...ys)));

  let x = minX;
  let y = minY;
  let w = maxX - minX;
  let h = maxY - minY;

  if (w <= 0 || h <= 0) return null;

  const padX = Math.round(w * 0.12);
  const padY = Math.round(h * 0.12);

  x = Math.max(0, x - padX);
  y = Math.max(0, y - padY);
  w = Math.min(width - x, w + padX * 2);
  h = Math.min(height - y, h + padY * 2);

  if (w <= 0 || h <= 0) return null;

  return { x, y, w, h };
}

async function buildOcrVariants(buffer) {
  const img = await Jimp.read(buffer);
  const width = img.bitmap.width;
  const height = img.bitmap.height;

  const variants = [
    { label: "orig", image: img.clone() },
    { label: "denoise", image: applyMedianFilter(img.clone().greyscale()) },
    {
      label: "upscale",
      image: applyMedianFilter(img.clone().greyscale()).resize(width * 2, height * 2, Jimp.RESIZE_BICUBIC),
    },
  ];

  const buffers = [];
  for (const variant of variants) {
    const content = await variant.image.getBufferAsync(Jimp.MIME_PNG);
    buffers.push({ label: variant.label, buffer: content });
  }

  return buffers;
}

async function decodeWithGoogleVision(buffer) {
  if (!GOOGLE_VISION_API_KEY) return null;

  try {
    const variants = await buildOcrVariants(buffer);

    for (const variant of variants) {
      const resp = await fetchWithTimeout(
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { content: variant.buffer.toString("base64") },
                features: [{ type: "BARCODE_DETECTION" }, { type: "DOCUMENT_TEXT_DETECTION" }],
              },
            ],
          }),
        },
        12000,
      );

      if (!resp.ok) {
        continue;
      }

      const payload = await resp.json();
      const barcodeAnnotation = payload?.responses?.[0]?.barcodeAnnotations?.[0]?.rawValue;
      if (barcodeAnnotation) {
        logStep("ocr", "Google Vision OCR succeeded", { variant: variant.label, source: "barcode" });
        return { text: String(barcodeAnnotation).trim(), source: "barcode", variant: variant.label };
      }

      const textAnnotation = payload?.responses?.[0]?.textAnnotations?.[0]?.description;
      if (textAnnotation) {
        logStep("ocr", "Google Vision OCR succeeded", { variant: variant.label, source: "text" });
        return { text: String(textAnnotation).trim(), source: "text", variant: variant.label };
      }
    }

    return null;
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
  const roiDetectionImage = img.clone().greyscale().normalize();
  const roi = findQrRoi(roiDetectionImage);

  if (roi) {
    logStep("qr", "ROI detected for QR decode", roi);
    const roiImg = img.clone().crop(roi.x, roi.y, roi.w, roi.h);
    const roiVariants = [
      { label: "roi-orig", make: () => roiImg.clone() },
      { label: "roi-auto-levels", make: () => applyAutoLevels(roiImg.clone().greyscale()) },
      { label: "roi-otsu", make: () => applyOtsuThreshold(roiImg.clone().greyscale()) },
      { label: "roi-adaptive-mean-25", make: () => applyAdaptiveThreshold(roiImg.clone().greyscale(), 25, 6) },
      { label: "roi-gray-contrast", make: () => roiImg.clone().greyscale().contrast(0.4).normalize() },
      { label: "roi-gray-sharpen", make: () => applySharpen(roiImg.clone().greyscale().normalize()) },
      { label: "roi-threshold-170", make: () => applyThreshold(roiImg.clone().greyscale().normalize(), 170) },
    ];

    for (const variant of roiVariants) {
      try {
        const text = await decodeWithQrReader(variant.make());
        if (text) return { text, source: "qr", variant: variant.label };
      } catch {}
    }
  } else {
    logStep("qr", "ROI not found for QR decode");
  }

  const variants = [
    { label: "orig", make: () => img.clone() },
    { label: "gray-auto-levels", make: () => applyAutoLevels(img.clone().greyscale()) },
    { label: "gray-auto-levels-invert", make: () => applyAutoLevels(img.clone().greyscale().invert()) },
    { label: "gray-otsu", make: () => applyOtsuThreshold(img.clone().greyscale()) },
    { label: "gray-adaptive-mean-25", make: () => applyAdaptiveThreshold(img.clone().greyscale(), 25, 6) },
    { label: "gray-adaptive-mean-45", make: () => applyAdaptiveThreshold(img.clone().greyscale(), 45, 8) },
    { label: "gray-contrast", make: () => img.clone().greyscale().contrast(0.4).normalize() },
    { label: "gray-invert", make: () => img.clone().greyscale().invert().contrast(0.4).normalize() },
    { label: "gray-autocrop", make: () => img.clone().greyscale().normalize().autocrop({ tolerance: 0.2 }) },
    { label: "gray-autocrop-contrast", make: () => img.clone().greyscale().normalize().autocrop({ tolerance: 0.2 }).contrast(0.5) },
    { label: "gray-sharpen", make: () => applySharpen(img.clone().greyscale().normalize()) },
    { label: "threshold-140", make: () => applyThreshold(img.clone().greyscale().normalize(), 140) },
    { label: "threshold-160", make: () => applyThreshold(img.clone().greyscale().normalize(), 160) },
    { label: "threshold-200", make: () => applyThreshold(img.clone().greyscale().normalize(), 200) },
    { label: "threshold-1600", make: () => applyThreshold(img.clone().greyscale().resize(1600, Jimp.AUTO).normalize(), 170) },
    { label: "threshold-2000", make: () => applyThreshold(img.clone().greyscale().resize(2000, Jimp.AUTO).normalize(), 190) },
    { label: "threshold-2000-sharpen", make: () => applySharpen(applyThreshold(img.clone().greyscale().resize(2000, Jimp.AUTO).normalize(), 180)) },
    { label: "resize-600", make: () => img.clone().greyscale().resize(600, Jimp.AUTO).contrast(0.3).normalize() },
    { label: "resize-900", make: () => img.clone().greyscale().resize(900, Jimp.AUTO).contrast(0.4).normalize() },
    { label: "resize-1200", make: () => img.clone().greyscale().resize(1200, Jimp.AUTO).contrast(0.5).normalize() },
    { label: "resize-1400", make: () => img.clone().greyscale().resize(1400, Jimp.AUTO).contrast(0.6).normalize() },
    { label: "resize-1800", make: () => img.clone().greyscale().resize(1800, Jimp.AUTO).contrast(0.8).normalize() },
    { label: "resize-2400", make: () => img.clone().greyscale().resize(2400, Jimp.AUTO).contrast(0.8).normalize() },
    { label: "resize-2400-sharpen", make: () => applySharpen(img.clone().greyscale().resize(2400, Jimp.AUTO).contrast(0.8).normalize()) },
    { label: "rotate-5", make: () => img.clone().rotate(5).greyscale().contrast(0.4).normalize() },
    { label: "rotate--5", make: () => img.clone().rotate(-5).greyscale().contrast(0.4).normalize() },
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
    const ocrResult = await decodeWithGoogleVision(buffer);
    if (ocrResult?.text) {
      const source = ocrResult.source === "barcode" ? "ocr-barcode" : "ocr-text";
      return { text: ocrResult.text, source, variant: ocrResult.variant || "google_vision" };
    }
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

function buildLookupPayload(qrTextRaw, { includeExtracted = false } = {}) {
  const qrText = stripControlChars(qrTextRaw, { preserveNewlines: true });
  const extracted = includeExtracted ? extractOfflinePayloadFromText(qrText) : null;
  const debug = {
    normalizedPreview: qrText.replace(/\s+/g, " ").slice(0, 160),
    extracted: extracted?.debug || null,
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
      return res.status(400).json({
        ok: false,
        errorCode: "missing_image",
        error: "Chýba súbor. Pošli ho ako field 'image'.",
      });
    }

    logStep("receipt", "Decoding QR", { requestId, fileSize: req.file.size, fileType: req.file.mimetype });
    const qrResult = await decodeQrFromBuffer(req.file.buffer);
    if (!qrResult?.text) {
      logStep("receipt", "QR decode failed", { requestId });
      return res.status(422).json({
        ok: false,
        errorCode: "qr_decode_failed",
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
    const { lookup, debug: lookupDebug } = buildLookupPayload(qrText, {
      includeExtracted: qrResult.source?.startsWith("ocr"),
    });
    if (!lookup) {
      logStep("receipt", "Unsupported QR format", { requestId, lookupDebug });
      return res.status(422).json({
        ok: false,
        errorCode: qrResult.source?.startsWith("ocr") ? "ocr_text_no_payload" : "unsupported_qr_format",
        error:
          qrResult.source?.startsWith("ocr")
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
      errorCode: "server_error",
      error: e?.message || String(e),
      details: e?.data || null,
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Backend beží na http://localhost:${PORT}`);
});
