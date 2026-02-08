import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import UploadCard from "../components/UploadCard";
import ReceiptOutput from "../components/ReceiptOutput";
import { Receipt, ReceiptItem } from "../models/receipt";
import { parseReceipt, categorizeItems } from "../services/receiptApi";
import { MERCHANT_GROUPS } from "../utils/categories";
import { formatCurrency, formatDate } from "../utils/formatters";

interface ProcessReceiptPageProps {
  history: Receipt[];
  onSaveReceipt: (receipt: Receipt) => void;
}

export default function ProcessReceiptPage({ history, onSaveReceipt }: ProcessReceiptPageProps) {
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [categorizeBusy, setCategorizeBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [merchantGroup, setMerchantGroup] = useState(MERCHANT_GROUPS[0] ?? "");
  const [snackbar, setSnackbar] = useState<{ message: string; severity: "success" | "error" } | null>(null);
  const [duplicateReceipt, setDuplicateReceipt] = useState<Receipt | null>(null);
  const currentFile = fileQueue[currentIndex] ?? null;

  const getRawSignature = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return null;
    const typed = raw as { fileName?: unknown; size?: unknown; mime?: unknown };
    if (typeof typed.fileName !== "string" || typeof typed.size !== "number") return null;
    return `${typed.fileName}-${typed.size}-${typeof typed.mime === "string" ? typed.mime : ""}`;
  };

  const findDuplicateReceipt = (candidate: Receipt) => {
    const candidateSignature = getRawSignature(candidate.raw);
    return history.find((existing) => {
      if (existing.id === candidate.id) return true;
      const existingSignature = getRawSignature(existing.raw);
      if (candidateSignature && existingSignature && candidateSignature === existingSignature) return true;
      return (
        existing.merchant === candidate.merchant &&
        existing.date === candidate.date &&
        existing.total === candidate.total
      );
    });
  };

  useEffect(() => {
    if (!receipt) return;
    setItems(receipt.items);
    setNote(receipt.note ?? "");
    setMerchantGroup(receipt.merchantGroup ?? MERCHANT_GROUPS[0] ?? "");
  }, [receipt]);

  useEffect(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return currentFile ? URL.createObjectURL(currentFile) : null;
    });
    setError(null);
    setReceipt(null);
    setDuplicateReceipt(null);
    setItems([]);
    setNote("");
    setMerchantGroup(MERCHANT_GROUPS[0] ?? "");
  }, [currentFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFilesChange = (nextFiles: File[]) => {
    console.info("[process] File change", {
      count: nextFiles.length,
      names: nextFiles.map((fileItem) => fileItem.name),
    });
    setFileQueue(nextFiles);
    setCurrentIndex(0);
  };

  const handleCapture = (nextFile: File | null) => {
    console.info("[process] Capture input", { captured: Boolean(nextFile) });
    if (nextFile) {
      setFileQueue([nextFile]);
      setCurrentIndex(0);
      void handleProcess(nextFile);
    }
  };

  const handleProcess = async (selectedFile = currentFile) => {
    if (!selectedFile) {
      console.warn("[process] Missing file for processing");
      return;
    }
    const startedAt = performance.now();
    console.info("[process] Starting receipt parsing", {
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
    });
    setBusy(true);
    setError(null);
    setReceipt(null);
    setDuplicateReceipt(null);
    try {
      const result = await parseReceipt(selectedFile);
      console.info("[process] Receipt parsed", {
        id: result.id,
        merchant: result.merchant,
        total: result.total,
        items: result.items.length,
        source: result.source,
        parseTimeMs: Math.round(performance.now() - startedAt),
        qrMeta: result.qrMeta,
      });
      const duplicate = findDuplicateReceipt(result);
      if (duplicate) {
        console.warn("[process] Duplicate receipt detected", { id: duplicate.id, merchant: duplicate.merchant });
        setDuplicateReceipt(duplicate);
        return;
      }
      setReceipt(result);
    } catch (err) {
      console.error("[process] Parsing failed", err);
      setError(err instanceof Error ? err.message : "Neznáma chyba pri spracovaní.");
    } finally {
      console.info("[process] Parsing finished", { busy: false });
      setBusy(false);
    }
  };

  const handleCategorize = async () => {
    console.info("[process] Categorization started", { items: items.length });
    setCategorizeBusy(true);
    try {
      const updated = await categorizeItems(items, receipt?.aiCategories);
      console.info("[process] Categorization done", { items: updated.length });
      setItems(updated);
      setSnackbar({ message: "Kategórie boli doplnené.", severity: "success" });
    } catch (err) {
      console.error("[process] Categorization failed", err);
      setSnackbar({
        message: err instanceof Error ? err.message : "Kategorizácia zlyhala.",
        severity: "error",
      });
    } finally {
      console.info("[process] Categorization finished", { busy: false });
      setCategorizeBusy(false);
    }
  };

  const handleItemCategoryChange = (id: string, main: string, sub: string) => {
    console.info("[process] Item category changed", { id, main, sub });
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, categoryMain: main, categorySub: sub } : item)),
    );
  };

  const handleSave = () => {
    if (!receipt) return;
    console.info("[process] Saving receipt", { id: receipt.id, items: items.length, merchantGroup, note });
    const updatedReceipt: Receipt = {
      ...receipt,
      items,
      note,
      merchantGroup,
      total: Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)),
    };
    onSaveReceipt(updatedReceipt);
    setFileQueue((prev) => {
      if (prev.length === 0) return prev;
      const nextQueue = prev.filter((_, index) => index !== currentIndex);
      if (nextQueue.length === 0) {
        setCurrentIndex(0);
      } else if (currentIndex >= nextQueue.length) {
        setCurrentIndex(nextQueue.length - 1);
      }
      return nextQueue;
    });
    const nextMessage =
      fileQueue.length > 1 ? "Uložené do histórie. Ďalší bloček je pripravený na spracovanie." : "Uložené do histórie.";
    setSnackbar({ message: nextMessage, severity: "success" });
  };

  const totalInHistory = useMemo(() => history.length, [history.length]);

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">Spracovať bloček</Typography>
        <Typography color="text.secondary">
          Nahraj QR bloček → spracujeme ho do OPD JSON. V histórii máte {totalInHistory} záznamov.
        </Typography>
      </Stack>

      <UploadCard
        file={currentFile}
        previewUrl={previewUrl}
        busy={busy}
        queuedFiles={fileQueue}
        currentIndex={currentIndex}
        onFilesChange={handleFilesChange}
        onCapture={handleCapture}
        onProcess={handleProcess}
      />

      <ReceiptOutput
        receipt={receipt}
        items={items}
        busy={busy}
        categorizeBusy={categorizeBusy}
        error={error}
        note={note}
        merchantGroup={merchantGroup}
        onNoteChange={setNote}
        onMerchantGroupChange={setMerchantGroup}
        onItemCategoryChange={handleItemCategoryChange}
        onApplyCategorization={handleCategorize}
        onSave={handleSave}
      />

      <Dialog open={Boolean(duplicateReceipt)} onClose={() => setDuplicateReceipt(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Bloček už máte uložený</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography>
              Tento QR bloček už máte v histórii. Skúste prosím naskenovať iný bloček.
            </Typography>
            {duplicateReceipt && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2">{duplicateReceipt.merchant}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatDate(duplicateReceipt.date)} • {formatCurrency(duplicateReceipt.total, duplicateReceipt.currency)}
                </Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setDuplicateReceipt(null)}>
            Rozumiem
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(snackbar)} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        <Alert severity={snackbar?.severity ?? "success"} onClose={() => setSnackbar(null)}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
