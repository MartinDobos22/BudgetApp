import { Snackbar, Alert, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import ManualEntryForm, { ManualItemInput } from "../components/ManualEntryForm";
import { Receipt, ReceiptItem } from "../models/receipt";
import { MERCHANT_GROUPS } from "../utils/categories";

interface ManualEntryPageProps {
  onSaveReceipt: (receipt: Receipt) => void;
}

const createItem = (): ManualItemInput => ({
  tempId: Math.random().toString(36).slice(2, 10),
  id: Math.random().toString(36).slice(2, 10),
  name: "",
  qty: 1,
  unitPrice: 0,
  lineTotal: 0,
  categoryMain: "",
  categorySub: "",
});

export default function ManualEntryPage({ onSaveReceipt }: ManualEntryPageProps) {
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [merchantGroup, setMerchantGroup] = useState(MERCHANT_GROUPS[0] ?? "");
  const [items, setItems] = useState<ManualItemInput[]>([createItem()]);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const handleChange = (field: "merchant" | "date" | "note" | "merchantGroup", value: string) => {
    if (field === "merchant") setMerchant(value);
    if (field === "date") setDate(value);
    if (field === "note") setNote(value);
    if (field === "merchantGroup") setMerchantGroup(value);
  };

  const handleItemChange = (id: string, field: keyof ReceiptItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== id) return item;
        const next = { ...item, [field]: value };
        if (field === "qty" || field === "unitPrice") {
          const qty = Number(field === "qty" ? value : item.qty);
          const unitPrice = Number(field === "unitPrice" ? value : item.unitPrice);
          next.lineTotal = Number((qty * unitPrice).toFixed(2));
        }
        return next;
      }),
    );
  };

  const handleAddItem = () => setItems((prev) => [...prev, createItem()]);

  const handleRemoveItem = (id: string) => setItems((prev) => prev.filter((item) => item.tempId !== id));

  const total = useMemo(() => items.reduce((sum, item) => sum + item.lineTotal, 0), [items]);

  const handleSave = () => {
    if (!merchant.trim()) {
      setSnackbar("Zadajte názov obchodu.");
      return;
    }
    if (items.length === 0) {
      setSnackbar("Pridajte aspoň jednu položku.");
      return;
    }
    const receipt: Receipt = {
      id: `${Date.now()}`,
      merchant: merchant.trim(),
      date: new Date(date).toISOString(),
      unit: "Manuálny záznam",
      currency: "EUR",
      total: Number(total.toFixed(2)),
      items: items.map((item) => ({
        ...item,
        id: item.id,
        qty: Number(item.qty) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        lineTotal: Number(item.lineTotal) || 0,
      })),
      note: note.trim(),
      merchantGroup,
      source: "manual",
    };
    onSaveReceipt(receipt);
    setSnackbar("Manuálny záznam bol uložený.");
    setMerchant("");
    setNote("");
    setItems([createItem()]);
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">Manuálny záznam</Typography>
        <Typography color="text.secondary">Vytvorte záznam bez QR kódu.</Typography>
      </Stack>

      <ManualEntryForm
        merchant={merchant}
        date={date}
        note={note}
        merchantGroup={merchantGroup}
        items={items}
        currency="EUR"
        onChange={handleChange}
        onItemChange={handleItemChange}
        onAddItem={handleAddItem}
        onRemoveItem={handleRemoveItem}
        onSave={handleSave}
      />

      <Snackbar open={Boolean(snackbar)} autoHideDuration={3500} onClose={() => setSnackbar(null)}>
        <Alert severity="info" onClose={() => setSnackbar(null)}>
          {snackbar}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
