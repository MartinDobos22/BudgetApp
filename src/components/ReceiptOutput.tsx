import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import Edit from "@mui/icons-material/Edit";
import Save from "@mui/icons-material/Save";
import { Receipt, ReceiptItem } from "../models/receipt";
import { CATEGORY_TREE, MERCHANT_GROUPS } from "../utils/categories";
import { formatCurrency } from "../utils/formatters";

interface ReceiptOutputProps {
  receipt: Receipt | null;
  items: ReceiptItem[];
  busy: boolean;
  categorizeBusy: boolean;
  error: string | null;
  note: string;
  merchantGroup: string;
  onNoteChange: (value: string) => void;
  onMerchantGroupChange: (value: string) => void;
  onItemCategoryChange: (id: string, main: string, sub: string) => void;
  onApplyCategorization: () => void;
  onSave: () => void;
}

export default function ReceiptOutput({
  receipt,
  items,
  busy,
  categorizeBusy,
  error,
  note,
  merchantGroup,
  onNoteChange,
  onMerchantGroupChange,
  onItemCategoryChange,
  onApplyCategorization,
  onSave,
}: ReceiptOutputProps) {
  if (busy && !receipt) {
    return (
      <Card>
        <CardHeader title="Výstup z bločku" subheader="Načítavam údaje z QR." />
        <CardContent>
          <Stack spacing={2}>
            <Skeleton variant="rectangular" height={120} />
            <Skeleton variant="rectangular" height={260} />
            <Skeleton variant="rectangular" height={120} />
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (!receipt && !error) {
    return (
      <Card>
        <CardHeader title="Výstup z bločku" subheader="Po spracovaní sa tu objavia detailné údaje." />
        <CardContent>
          <Alert severity="info">Nahrajte QR bloček a kliknite na „Spracovať“.</Alert>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="Výstup z bločku" subheader="Nepodarilo sa spracovať QR kód." />
        <CardContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Typography variant="subtitle2" gutterBottom>
            Tipy:
          </Typography>
          <ul>
            <li>Skúste lepšie osvetlenie a stabilnú ruku.</li>
            <li>QR kód musí byť celý v zábere.</li>
            <li>Skontrolujte, či je foto ostré.</li>
          </ul>
        </CardContent>
      </Card>
    );
  }

  if (!receipt) return null;

  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const mismatch = Math.abs(itemsTotal - receipt.total) > 0.05;

  return (
    <Card>
      <CardHeader
        title="Výstup z bločku"
        subheader={`${receipt.merchant} • ${new Date(receipt.date).toLocaleString("sk-SK")}`}
        action={
          <Button variant="outlined" startIcon={<AutoAwesome />} onClick={onApplyCategorization} disabled={categorizeBusy}>
            {categorizeBusy ? "Kategorizujem..." : "AI kategorizácia"}
          </Button>
        }
      />
      <CardContent>
        <Stack spacing={3}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Box flex={1}>
              <Typography variant="subtitle2" color="text.secondary">
                Prevádzka
              </Typography>
              <Typography variant="h6">{receipt.unit ?? "Neuvedené"}</Typography>
            </Box>
            <Box flex={1}>
              <Typography variant="subtitle2" color="text.secondary">
                Mena
              </Typography>
              <Typography variant="h6">{receipt.currency}</Typography>
            </Box>
            <Box flex={1}>
              <Typography variant="subtitle2" color="text.secondary">
                Celkom
              </Typography>
              <Typography variant="h6">{formatCurrency(receipt.total, receipt.currency)}</Typography>
            </Box>
          </Stack>

          <Divider />

          <Stack spacing={2}>
            <Typography variant="h6">Položky bločku</Typography>
            {items.length === 0 ? (
              <Alert severity="warning">Bloček neobsahuje žiadne položky.</Alert>
            ) : (
              <Stack spacing={2}>
                {items.map((item) => (
                  <Box key={item.id} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                      <Box flex={1}>
                        <Typography fontWeight={600}>{item.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.qty} × {formatCurrency(item.unitPrice, receipt.currency)} ={" "}
                          {formatCurrency(item.lineTotal, receipt.currency)}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={`${item.categoryMain ?? "Nezaradené"} / ${item.categorySub ?? "Bez podkategórie"}`}
                          color={item.categoryMain ? "primary" : "default"}
                          icon={<Edit />}
                        />
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: 260 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Hlavná</InputLabel>
                          <Select
                            label="Hlavná"
                            value={item.categoryMain ?? ""}
                            onChange={(event) => {
                              const value = event.target.value as string;
                              onItemCategoryChange(item.id, value, CATEGORY_TREE[value]?.[0] ?? "");
                            }}
                          >
                            {Object.keys(CATEGORY_TREE).map((main) => (
                              <MenuItem key={main} value={main}>
                                {main}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                          <InputLabel>Pod</InputLabel>
                          <Select
                            label="Pod"
                            value={
                              item.categoryMain && CATEGORY_TREE[item.categoryMain]?.includes(item.categorySub ?? "")
                                ? (item.categorySub ?? "")
                                : ""
                            }
                            onChange={(event) =>
                              onItemCategoryChange(item.id, item.categoryMain ?? "", event.target.value)
                            }
                          >
                            {(item.categoryMain ? CATEGORY_TREE[item.categoryMain] : [])?.map((sub) => (
                              <MenuItem key={sub} value={sub}>
                                {sub}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>

          <Divider />

          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
            <Box flex={1}>
              <Typography variant="subtitle2" color="text.secondary">
                Súčet položiek
              </Typography>
              <Typography variant="h6">{formatCurrency(itemsTotal, receipt.currency)}</Typography>
            </Box>
            <Box flex={1}>
              <Typography variant="subtitle2" color="text.secondary">
                Celková suma z dokladu
              </Typography>
              <Typography variant="h6">{formatCurrency(receipt.total, receipt.currency)}</Typography>
            </Box>
          </Stack>
          {mismatch && (
            <Alert severity="warning">
              Súčet položiek nesedí s celkovou sumou. Skontrolujte množstvá alebo cenu jednotlivých položiek.
            </Alert>
          )}

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Skupina obchodu</InputLabel>
              <Select
                label="Skupina obchodu"
                value={merchantGroup}
                onChange={(event) => onMerchantGroupChange(event.target.value)}
              >
                {MERCHANT_GROUPS.map((group) => (
                  <MenuItem key={group} value={group}>
                    {group}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Poznámka"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography>Diagnostika</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="subtitle2" gutterBottom>
                Raw JSON
              </Typography>
              <Box component="pre" sx={{ fontSize: 12, p: 2, bgcolor: "grey.100", borderRadius: 2, overflow: "auto" }}>
                {JSON.stringify(receipt.raw ?? {}, null, 2)}
              </Box>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                QR metadáta
              </Typography>
              <Box component="pre" sx={{ fontSize: 12, p: 2, bgcolor: "grey.100", borderRadius: 2, overflow: "auto" }}>
                {JSON.stringify(receipt.qrMeta ?? {}, null, 2)}
              </Box>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 3, pb: 3 }}>
        <Button variant="contained" startIcon={<Save />} onClick={onSave} disabled={busy}>
          Uložiť do histórie
        </Button>
      </CardActions>
    </Card>
  );
}
