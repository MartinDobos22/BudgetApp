import { useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  CssBaseline,
  Container,
  Tab,
  Tabs,
  ThemeProvider,
  Toolbar,
  Typography,
} from "@mui/material";
import { createTheme } from "@mui/material/styles";
import { useEffect } from "react";
import ManualEntryPage from "./pages/ManualEntryPage";
import HistoryPage from "./pages/HistoryPage";
import ProcessReceiptPage from "./pages/ProcessReceiptPage";
import { Receipt } from "./models/receipt";
import { loadReceipts, persistReceipts } from "./utils/storage";

const tabConfig = [
  { label: "Spracovať bloček", path: "/process" },
  { label: "História", path: "/history" },
  { label: "Manuálny záznam", path: "/manual" },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [history, setHistory] = useState<Receipt[]>([]);

  useEffect(() => {
    setHistory(loadReceipts());
  }, []);

  useEffect(() => {
    persistReceipts(history);
  }, [history]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "light",
          primary: { main: "#2f5da9" },
          secondary: { main: "#006a60" },
          background: { default: "#f5f6fb", paper: "#ffffff" },
        },
        shape: { borderRadius: 18 },
        typography: {
          fontFamily: "\"Inter\", \"Roboto\", \"Arial\", sans-serif",
          h5: { fontWeight: 700 },
          h6: { fontWeight: 600 },
          subtitle1: { fontWeight: 500 },
        },
        components: {
          MuiAppBar: {
            styleOverrides: {
              root: {
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24,
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 22,
                boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 14,
                textTransform: "none",
                fontWeight: 600,
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 10,
              },
            },
          },
        },
      }),
    [],
  );

  const activeTab = tabConfig.findIndex((tab) => location.pathname.startsWith(tab.path));

  const handleTabChange = (_: React.SyntheticEvent, value: number) => {
    navigate(tabConfig[value].path);
  };

  const handleAddReceipt = (receipt: Receipt) => {
    setHistory((prev) => [receipt, ...prev.filter((item) => item.id !== receipt.id)]);
  };

  const handleDeleteReceipt = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar position="sticky" color="primary" elevation={0}>
          <Toolbar sx={{ flexDirection: { xs: "column", sm: "row" }, alignItems: "flex-start", gap: 1, py: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5">QR bloček → OPD JSON</Typography>
              <Typography variant="subtitle1" sx={{ opacity: 0.8 }}>
                Moderné spracovanie, kategorizácia a prehľady výdavkov.
              </Typography>
            </Box>
            <Tabs
              value={activeTab === -1 ? 0 : activeTab}
              onChange={handleTabChange}
              textColor="inherit"
              indicatorColor="secondary"
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Hlavné sekcie"
              sx={{ alignSelf: { xs: "stretch", sm: "center" } }}
            >
              {tabConfig.map((tab) => (
                <Tab key={tab.path} label={tab.label} />
              ))}
            </Tabs>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
          <Routes>
            <Route path="/" element={<Navigate to="/process" replace />} />
            <Route
              path="/process"
              element={<ProcessReceiptPage history={history} onSaveReceipt={handleAddReceipt} />}
            />
            <Route
              path="/history"
              element={
                <HistoryPage history={history} onDeleteReceipt={handleDeleteReceipt} onClear={handleClearHistory} />
              }
            />
            <Route path="/manual" element={<ManualEntryPage onSaveReceipt={handleAddReceipt} />} />
          </Routes>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
