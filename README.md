# QR bloček → OPD JSON (frontend)

Moderné UI pre spracovanie QR bločkov, kategorizáciu a prehľady s lokálnou históriou.

## Tech stack

- React + TypeScript + Vite
- Material UI (MUI) v5 (Material Design 3 look & feel)
- React Router
- Recharts

## Spustenie

```bash
npm install
npm run dev
```

App beží na `http://localhost:5173`.

## Poznámky

- Mock API je implementované v `src/services/mockApi.ts` (simulované oneskorenia a error stavy).
- História sa ukladá do `localStorage` (`budget_app_receipts`).
