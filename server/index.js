import express from "express";
import cors from "cors";
import multer from "multer";
import { categorizeItemsWithOpenAI } from "./ai/categorize.js";
import { cacheGet, cacheSet } from "./cache/index.js";
import { loadEnvFile } from "./config/env.js";
import { buildLookupPayload, fetchReceiptFromFS, logOpdUrl } from "./opd/lookup.js";
import { decodeQrFromBuffer } from "./qr/decoder.js";
import { normalizeReceiptPayload, readReceiptsFile, writeReceiptsFile } from "./storage/receipts.js";
import { logStep } from "./utils/logging.js";

loadEnvFile();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

logOpdUrl();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get("/api/health", (req, res) => {
  logStep("health", "Health check");
  res.json({ ok: true, service: "qr-blocek-opd-backend" });
});

app.get("/api/receipts", (req, res) => {
  try {
    const receipts = readReceiptsFile();
    logStep("receipts", "Listed receipts", { count: receipts.length });
    return res.json({ ok: true, receipts });
  } catch (error) {
    logStep("receipts", "Failed to list receipts", { error: error?.message || String(error) });
    return res.status(500).json({ ok: false, error: "Nepodarilo sa načítať históriu bločkov." });
  }
});

app.post("/api/receipts", (req, res) => {
  try {
    const payload = normalizeReceiptPayload(req.body || {});
    logStep("receipts", "Saving receipt", { id: payload.id, merchant: payload.merchant, total: payload.total });
    const receipts = readReceiptsFile();
    const filtered = receipts.filter((receipt) => receipt.id !== payload.id);
    const next = [payload, ...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    writeReceiptsFile(next);
    return res.json({ ok: true, receipt: payload });
  } catch (error) {
    logStep("receipts", "Failed to save receipt", { error: error?.message || String(error) });
    return res.status(500).json({ ok: false, error: "Nepodarilo sa uložiť bloček." });
  }
});

app.delete("/api/receipts", (req, res) => {
  try {
    writeReceiptsFile([]);
    logStep("receipts", "Cleared receipts");
    return res.json({ ok: true });
  } catch (error) {
    logStep("receipts", "Failed to clear receipts", { error: error?.message || String(error) });
    return res.status(500).json({ ok: false, error: "Nepodarilo sa vymazať históriu." });
  }
});

app.post("/api/receipt", upload.single("image"), async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = Date.now();
  logStep("receipt", "Incoming request", {
    requestId,
    contentType: req.headers["content-type"],
    userAgent: req.headers["user-agent"],
  });
  try {
    if (!req.file) {
      logStep("receipt", "Missing file", { requestId });
      return res.status(400).json({
        ok: false,
        errorCode: "missing_image",
        error: "Chýba súbor. Pošli ho ako field 'image'.",
      });
    }

    logStep("receipt", "Decoding QR", {
      requestId,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      originalName: req.file.originalname,
    });
    const qrResult = await decodeQrFromBuffer(req.file.buffer, {
      googleVisionApiKey: GOOGLE_VISION_API_KEY,
      logStep,
    });
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
      logStep,
      requestId,
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

    logStep("receipt", "Lookup payload ready", {
      requestId,
      type: lookup.type,
      strategy: lookupDebug?.strategy,
      extracted: lookupDebug?.extracted ?? null,
    });
    const cacheKey =
      lookup.type === "online"
        ? `online:${lookup.payload.receiptId}`
        : `offline:${lookup.payload.okp}:${lookup.payload.cashRegisterCode}:${lookup.payload.issueDateFormatted}:${lookup.payload.receiptNumber}:${lookup.payload.totalAmount}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      logStep("receipt", "Cache hit", { requestId });
      const aiResult = await categorizeItemsWithOpenAI(cached, { OPENAI_API_KEY, OPENAI_MODEL, logStep });
      logStep("receipt", "Returning cached response", {
        requestId,
        aiCategories: aiResult?.categories?.length || 0,
        elapsedMs: Date.now() - startedAt,
      });
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

    logStep("receipt", "Fetching receipt from FS", { requestId, lookupType: lookup.type });
    const fsJson = await fetchReceiptFromFS(lookup.payload, { logStep, requestId });
    logStep("receipt", "FS response received", { requestId, hasReceipt: Boolean(fsJson?.receipt) });
    cacheSet(cacheKey, fsJson);

    const aiResult = await categorizeItemsWithOpenAI(fsJson, { OPENAI_API_KEY, OPENAI_MODEL, logStep });
    logStep("receipt", "Returning response", {
      requestId,
      aiCategories: aiResult?.categories?.length || 0,
      elapsedMs: Date.now() - startedAt,
    });
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
