import {
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { Receipt } from "../models/receipt";
import { formatCurrency, formatDate } from "../utils/formatters";

interface ReceiptDetailDialogProps {
  receipt: Receipt | null;
  open: boolean;
  onClose: () => void;
}

export default function ReceiptDetailDialog({ receipt, open, onClose }: ReceiptDetailDialogProps) {
  if (!receipt) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{receipt.merchant}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Typography variant="subtitle2">Dátum: {formatDate(receipt.date)}</Typography>
            <Typography variant="subtitle2">Celkom: {formatCurrency(receipt.total, receipt.currency)}</Typography>
            <Chip label={receipt.source === "qr" ? "QR bloček" : "Manuálny záznam"} color="primary" />
          </Stack>
          <Divider />
          <Stack spacing={1}>
            {receipt.items.map((item) => (
              <Stack key={item.id} direction={{ xs: "column", sm: "row" }} justifyContent="space-between">
                <Typography fontWeight={600}>{item.name}</Typography>
                <Typography color="text.secondary">
                  {item.qty} × {formatCurrency(item.unitPrice, receipt.currency)}
                </Typography>
                <Typography>{formatCurrency(item.lineTotal, receipt.currency)}</Typography>
              </Stack>
            ))}
          </Stack>
          {receipt.note && (
            <>
              <Divider />
              <Typography variant="body2" color="text.secondary">
                Poznámka: {receipt.note}
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
