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
import { parseReceipt, categorizeItems } from "../services/mockApi";
import { MERCHANT_GROUPS } from "../utils/categories";
import { formatCurrency, formatDate } from "../utils/formatters";

interface ProcessReceiptPageProps {
  history: Receipt[];
  onSaveReceipt: (receipt: Receipt) => void;
}

export default function ProcessReceiptPage({ history, onSaveReceipt }: ProcessReceiptPageProps) {
  const [file, setFile] = useState<File | null>(null);
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
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (nextFile: File | null) => {
    console.info("[process] File change", {
      name: nextFile?.name,
      size: nextFile?.size,
      type: nextFile?.type,
      lastModified: nextFile?.lastModified,
    });
    setFile(nextFile);
    setError(null);
    setReceipt(null);
    setDuplicateReceipt(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreview = nextFile ? URL.createObjectURL(nextFile) : null;
    console.info("[process] Preview URL updated", { hasPreview: Boolean(nextPreview) });
    setPreviewUrl(nextPreview);
  };

  const handleCapture = (nextFile: File | null) => {
    console.info("[process] Capture input", { captured: Boolean(nextFile) });
    handleFileChange(nextFile);
    if (nextFile) {
      void handleProcess(nextFile);
    }
  };

  const handleProcess = async (selectedFile = file) => {
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
      const updated = await categorizeItems(items);
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
    setSnackbar({ message: "Uložené do histórie.", severity: "success" });
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
        file={file}
        previewUrl={previewUrl}
        busy={busy}
        onFileChange={handleFileChange}
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
