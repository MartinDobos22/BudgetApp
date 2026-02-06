import { useEffect, useMemo, useState } from "react";
import { Alert, Snackbar, Stack, Typography } from "@mui/material";
import UploadCard from "../components/UploadCard";
import ReceiptOutput from "../components/ReceiptOutput";
import { Receipt, ReceiptItem } from "../models/receipt";
import { parseReceipt, categorizeItems } from "../services/mockApi";
import { MERCHANT_GROUPS } from "../utils/categories";

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
    setFile(nextFile);
    setError(null);
    setReceipt(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
  };

  const handleCapture = (nextFile: File | null) => {
    handleFileChange(nextFile);
    if (nextFile) {
      void handleProcess(nextFile);
    }
  };

  const handleProcess = async (selectedFile = file) => {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const result = await parseReceipt(selectedFile);
      setReceipt(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznáma chyba pri spracovaní.");
    } finally {
      setBusy(false);
    }
  };

  const handleCategorize = async () => {
    setCategorizeBusy(true);
    try {
      const updated = await categorizeItems(items);
      setItems(updated);
      setSnackbar({ message: "Kategórie boli doplnené.", severity: "success" });
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : "Kategorizácia zlyhala.",
        severity: "error",
      });
    } finally {
      setCategorizeBusy(false);
    }
  };

  const handleItemCategoryChange = (id: string, main: string, sub: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, categoryMain: main, categorySub: sub } : item)),
    );
  };

  const handleSave = () => {
    if (!receipt) return;
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

      <Snackbar open={Boolean(snackbar)} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        <Alert severity={snackbar?.severity ?? "success"} onClose={() => setSnackbar(null)}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
