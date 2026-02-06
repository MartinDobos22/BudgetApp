import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import { useMemo, useState } from "react";
import { Receipt } from "../models/receipt";
import { CATEGORY_TREE } from "../utils/categories";
import { sumByCategory, sumByMerchant, sumByTime, TimeBucket } from "../utils/aggregations";
import { formatCurrency, formatDate } from "../utils/formatters";
import ReceiptDetailDialog from "./ReceiptDetailDialog";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistorySectionProps {
  history: Receipt[];
  onDelete: (id: string) => void;
  onClear: () => void;
}

const timeOptions = [
  { label: "7 dní", value: 7 },
  { label: "30 dní", value: 30 },
  { label: "90 dní", value: 90 },
];

const chartColors = ["#2f5da9", "#57b3ae", "#f59f00", "#f77f7f", "#9d7be1", "#49a6e9"];

export default function HistorySection({ history, onDelete, onClear }: HistorySectionProps) {
  const [mainCategory, setMainCategory] = useState("Všetko");
  const [subCategory, setSubCategory] = useState("Všetko");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState(30);
  const [timeBucket, setTimeBucket] = useState<TimeBucket>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailReceipt, setDetailReceipt] = useState<Receipt | null>(null);

  const filteredHistory = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeRange);
    return history.filter((receipt) => {
      const matchesRange = new Date(receipt.date) >= cutoff;
      const matchesSearch =
        !search ||
        receipt.merchant.toLowerCase().includes(search.toLowerCase()) ||
        receipt.items.some((item) => item.name.toLowerCase().includes(search.toLowerCase()));
      const matchesMain = mainCategory === "Všetko" || receipt.items.some((item) => item.categoryMain === mainCategory);
      const matchesSub =
        subCategory === "Všetko" || receipt.items.some((item) => item.categorySub === subCategory);
      return matchesRange && matchesSearch && matchesMain && matchesSub;
    });
  }, [history, mainCategory, search, subCategory, timeRange]);

  const categoryData = useMemo(() => sumByCategory(filteredHistory), [filteredHistory]);
  const merchantData = useMemo(() => sumByMerchant(filteredHistory), [filteredHistory]);
  const timeData = useMemo(() => sumByTime(filteredHistory, timeBucket), [filteredHistory, timeBucket]);

  const subCategories = mainCategory === "Všetko" ? [] : CATEGORY_TREE[mainCategory] ?? [];

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Filtre a prehľady" />
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Hlavná kategória</InputLabel>
                <Select
                  label="Hlavná kategória"
                  value={mainCategory}
                  onChange={(event) => {
                    setMainCategory(event.target.value);
                    setSubCategory("Všetko");
                  }}
                >
                  <MenuItem value="Všetko">Všetko</MenuItem>
                  {Object.keys(CATEGORY_TREE).map((main) => (
                    <MenuItem key={main} value={main}>
                      {main}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth disabled={mainCategory === "Všetko"}>
                <InputLabel>Podkategória</InputLabel>
                <Select
                  label="Podkategória"
                  value={subCategory}
                  onChange={(event) => setSubCategory(event.target.value)}
                >
                  <MenuItem value="Všetko">Všetko</MenuItem>
                  {subCategories.map((sub) => (
                    <MenuItem key={sub} value={sub}>
                      {sub}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Vyhľadávanie"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Obchod alebo položka"
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Rozsah</InputLabel>
                <Select label="Rozsah" value={timeRange} onChange={(event) => setTimeRange(Number(event.target.value))}>
                  {timeOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      Posledných {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Podľa kategórií
                  </Typography>
                  {categoryData.length === 0 ? (
                    <Alert severity="info">V tomto období nemáte dáta.</Alert>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={categoryData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" hide />
                        <YAxis />
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        <Legend />
                        <Bar dataKey="total" fill="#2f5da9" name="Suma" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Podľa obchodov
                  </Typography>
                  {merchantData.length === 0 ? (
                    <Alert severity="info">V tomto období nemáte dáta.</Alert>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={merchantData} dataKey="total" nameKey="name" outerRadius={80} label>
                          {merchantData.map((_, index) => (
                            <Cell key={index} fill={chartColors[index % chartColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </Stack>

            <Card variant="outlined">
              <CardContent>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2} mb={2}>
                  <Typography variant="subtitle1">Podľa času</Typography>
                  <ToggleButtonGroup
                    value={timeBucket}
                    exclusive
                    onChange={(_, value) => value && setTimeBucket(value)}
                    size="small"
                  >
                    <ToggleButton value="day">Deň</ToggleButton>
                    <ToggleButton value="week">Týždeň</ToggleButton>
                    <ToggleButton value="month">Mesiac</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {timeData.length === 0 ? (
                  <Alert severity="info">V tomto období nemáte dáta.</Alert>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={timeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Line type="monotone" dataKey="total" stroke="#57b3ae" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Uložené bločky" />
        <CardContent>
          {filteredHistory.length === 0 ? (
            <Alert severity="info">Zatiaľ nemáte uložené bločky.</Alert>
          ) : (
            <Stack spacing={2}>
              {filteredHistory.map((receipt) => (
                <Box
                  key={receipt.id}
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                  }}
                >
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
                    <Box>
                      <Typography variant="h6">{receipt.merchant}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(receipt.date)} • {receipt.items.length} položiek
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Skupina: {receipt.merchantGroup ?? "Neuvedené"}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Typography variant="h6">{formatCurrency(receipt.total, receipt.currency)}</Typography>
                      <Button
                        variant="outlined"
                        startIcon={<ReceiptLong />}
                        onClick={() => setDetailReceipt(receipt)}
                      >
                        Detail
                      </Button>
                      <Button
                        variant="text"
                        color="error"
                        startIcon={<DeleteOutline />}
                        onClick={() => onDelete(receipt.id)}
                        aria-label={`Zmazať ${receipt.merchant}`}
                      >
                        Zmazať
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
        <Divider />
        <CardActions sx={{ px: 3, pb: 3 }}>
          <Button color="error" onClick={() => setDialogOpen(true)}>
            Vymazať históriu
          </Button>
        </CardActions>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Vymazať históriu</DialogTitle>
        <DialogContent>
          <DialogContentText>Ste si istí, že chcete vymazať všetky uložené bločky?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Zrušiť</Button>
          <Button
            color="error"
            onClick={() => {
              onClear();
              setDialogOpen(false);
            }}
          >
            Vymazať
          </Button>
        </DialogActions>
      </Dialog>

      <ReceiptDetailDialog receipt={detailReceipt} open={Boolean(detailReceipt)} onClose={() => setDetailReceipt(null)} />
    </Stack>
  );
}
