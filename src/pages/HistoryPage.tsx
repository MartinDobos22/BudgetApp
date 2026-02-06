import { Snackbar, Alert, Stack, Typography } from "@mui/material";
import { useState } from "react";
import HistorySection from "../components/HistorySection";
import { Receipt } from "../models/receipt";

interface HistoryPageProps {
  history: Receipt[];
  onDeleteReceipt: (id: string) => void;
  onClear: () => void;
}

export default function HistoryPage({ history, onDeleteReceipt, onClear }: HistoryPageProps) {
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    onDeleteReceipt(id);
    setSnackbar("Záznam bol vymazaný.");
  };

  const handleClear = () => {
    onClear();
    setSnackbar("História bola vymazaná.");
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">História</Typography>
        <Typography color="text.secondary">Prezrite si uložené bločky a prehľady.</Typography>
      </Stack>
      <HistorySection history={history} onDelete={handleDelete} onClear={handleClear} />
      <Snackbar open={Boolean(snackbar)} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        <Alert severity="success" onClose={() => setSnackbar(null)}>
          {snackbar}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
