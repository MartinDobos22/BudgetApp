import { useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutline from "@mui/icons-material/RemoveCircleOutline";
import Save from "@mui/icons-material/Save";
import { ReceiptItem } from "../models/receipt";
import { CATEGORY_TREE, MERCHANT_GROUPS } from "../utils/categories";
import { formatCurrency } from "../utils/formatters";

export interface ManualItemInput extends ReceiptItem {
  tempId: string;
}

interface ManualEntryFormProps {
  merchant: string;
  date: string;
  note: string;
  merchantGroup: string;
  items: ManualItemInput[];
  currency: string;
  onChange: (field: "merchant" | "date" | "note" | "merchantGroup", value: string) => void;
  onItemChange: (id: string, field: keyof ReceiptItem, value: string | number) => void;
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onSave: () => void;
}

export default function ManualEntryForm({
  merchant,
  date,
  note,
  merchantGroup,
  items,
  currency,
  onChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onSave,
}: ManualEntryFormProps) {
  const total = useMemo(() => items.reduce((sum, item) => sum + item.lineTotal, 0), [items]);

  return (
    <Card>
      <CardHeader title="Manuálny záznam" subheader="Vyplňte údaje a pridajte položky manuálne." />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Obchod"
              value={merchant}
              onChange={(event) => onChange("merchant", event.target.value)}
              fullWidth
            />
            <TextField
              label="Dátum"
              type="date"
              value={date}
              onChange={(event) => onChange("date", event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Skupina obchodu</InputLabel>
              <Select
                label="Skupina obchodu"
                value={merchantGroup}
                onChange={(event) => onChange("merchantGroup", event.target.value)}
              >
                {MERCHANT_GROUPS.map((group) => (
                  <MenuItem key={group} value={group}>
                    {group}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <TextField
            label="Poznámka"
            value={note}
            onChange={(event) => onChange("note", event.target.value)}
            fullWidth
            multiline
            minRows={3}
          />

          <Stack spacing={2}>
            <Typography variant="h6">Položky</Typography>
            {items.length === 0 ? <Alert severity="info">Pridajte aspoň jednu položku.</Alert> : null}
            {items.map((item, index) => (
              <Box key={item.tempId} sx={{ p: 2, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                <Stack spacing={2}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="Názov"
                      value={item.name}
                      onChange={(event) => onItemChange(item.tempId, "name", event.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Množstvo"
                      type="number"
                      value={item.qty}
                      onChange={(event) => onItemChange(item.tempId, "qty", Number(event.target.value))}
                      inputProps={{ min: 0, step: 0.1 }}
                      fullWidth
                    />
                    <TextField
                      label="Jednotková cena"
                      type="number"
                      value={item.unitPrice}
                      onChange={(event) => onItemChange(item.tempId, "unitPrice", Number(event.target.value))}
                      inputProps={{ min: 0, step: 0.01 }}
                      fullWidth
                    />
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
                    <FormControl fullWidth>
                      <InputLabel>Hlavná kategória</InputLabel>
                      <Select
                        label="Hlavná kategória"
                        value={item.categoryMain ?? ""}
                        onChange={(event) => onItemChange(item.tempId, "categoryMain", event.target.value)}
                      >
                        {Object.keys(CATEGORY_TREE).map((main) => (
                          <MenuItem key={main} value={main}>
                            {main}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth disabled={!item.categoryMain}>
                      <InputLabel>Podkategória</InputLabel>
                      <Select
                        label="Podkategória"
                        value={item.categorySub ?? ""}
                        onChange={(event) => onItemChange(item.tempId, "categorySub", event.target.value)}
                      >
                        {(item.categoryMain ? CATEGORY_TREE[item.categoryMain] : []).map((sub) => (
                          <MenuItem key={sub} value={sub}>
                            {sub}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography variant="subtitle1" fontWeight={600} minWidth={140}>
                      {formatCurrency(item.lineTotal, currency)}
                    </Typography>
                    <IconButton
                      color="error"
                      onClick={() => onRemoveItem(item.tempId)}
                      aria-label={`Odstrániť položku ${index + 1}`}
                    >
                      <RemoveCircleOutline />
                    </IconButton>
                  </Stack>
                </Stack>
              </Box>
            ))}
            <Button startIcon={<AddCircleOutline />} onClick={onAddItem}>
              Pridať položku
            </Button>
          </Stack>

          <Typography variant="h6">Celková suma: {formatCurrency(total, currency)}</Typography>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 3, pb: 3 }}>
        <Button variant="contained" startIcon={<Save />} onClick={onSave}>
          Uložiť do histórie
        </Button>
      </CardActions>
    </Card>
  );
}
