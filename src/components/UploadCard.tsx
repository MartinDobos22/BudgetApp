import { DragEvent, useCallback, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import UploadFile from "@mui/icons-material/UploadFile";

interface UploadCardProps {
  file: File | null;
  previewUrl: string | null;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onCapture: (file: File | null) => void;
  onProcess: () => void;
}

export default function UploadCard({ file, previewUrl, busy, onFileChange, onCapture, onProcess }: UploadCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const captureRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (selected: File | null) => {
    if (selected) {
      console.info("[upload] File selected", {
        name: selected.name,
        size: selected.size,
        type: selected.type,
        lastModified: selected.lastModified,
      });
      onFileChange(selected);
    } else {
      console.warn("[upload] No file selected");
    }
  };

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      console.info("[upload] File dropped", {
        name: dropped?.name,
        size: dropped?.size,
        type: dropped?.type,
      });
      handleFile(dropped ?? null);
    },
    [onFileChange],
  );

  return (
    <Card>
      <CardHeader title="Nahraj QR bloček" subheader="Podporujeme PNG/JPG z galérie alebo fotoaparátu." />
      {busy && <LinearProgress />}
      <CardContent>
        <Stack spacing={2}>
          <Box
            onDragOver={(event) => {
              event.preventDefault();
              if (!isDragging) {
                console.info("[upload] Drag over");
              }
              setIsDragging(true);
            }}
            onDragLeave={() => {
              console.info("[upload] Drag leave");
              setIsDragging(false);
            }}
            onDrop={handleDrop}
            sx={{
              border: "2px dashed",
              borderColor: isDragging ? "primary.main" : "divider",
              borderRadius: 4,
              p: 3,
              textAlign: "center",
              bgcolor: isDragging ? "primary.50" : "transparent",
              transition: "0.2s ease",
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Potiahni sem súbor alebo klikni na výber
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Maximálne 10 MB, ideálne ostrý QR kód.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center" mt={2}>
              <Button
                variant="contained"
                startIcon={<UploadFile />}
                onClick={() => {
                  console.info("[upload] Click select file");
                  inputRef.current?.click();
                }}
                disabled={busy}
              >
                Vybrať súbor
              </Button>
              <Button
                variant="outlined"
                startIcon={<PhotoCamera />}
                onClick={() => {
                  console.info("[upload] Click capture");
                  captureRef.current?.click();
                }}
                disabled={busy}
              >
                Použiť kameru
              </Button>
            </Stack>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                console.info("[upload] File input changed");
                handleFile(event.target.files?.[0] ?? null);
              }}
            />
            <input
              ref={captureRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                console.info("[upload] Capture input changed");
                onCapture(event.target.files?.[0] ?? null);
              }}
            />
          </Box>

          {previewUrl ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box
                component="img"
                src={previewUrl}
                alt={file?.name ?? "Náhľad bločku"}
                sx={{ width: 120, height: 120, borderRadius: 3, objectFit: "cover", border: "1px solid", borderColor: "divider" }}
              />
              <Box>
                <Typography variant="subtitle1">{file?.name ?? "Vybraný súbor"}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Bez súboru"}
                </Typography>
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Zatiaľ nebol vybraný žiadny súbor.
            </Typography>
          )}
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 3, pb: 3 }}>
        <Button variant="contained" onClick={onProcess} disabled={!file || busy} fullWidth>
          Spracovať
        </Button>
      </CardActions>
    </Card>
  );
}
