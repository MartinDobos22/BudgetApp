import { useMemo, useState } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState(null); // server response
  const [previewUrl, setPreviewUrl] = useState(null);

  const prettyJson = useMemo(() => {
    if (!resp) return "";
    try {
      return JSON.stringify(resp, null, 2);
    } catch {
      return String(resp);
    }
  }, [resp]);

  function onPickFile(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResp(null);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function onSend() {
    if (!file) return;
    setBusy(true);
    setResp(null);

    try {
      const fd = new FormData();
      fd.append("image", file);

      const r = await fetch("/api/receipt", {
        method: "POST",
        body: fd,
      });

      const data = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
      if (!r.ok) {
        setResp({ ok: false, ...data });
      } else {
        setResp(data);
      }
    } catch (e) {
      setResp({ ok: false, error: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <header className="header">
        <h1>QR bloček → OPD JSON</h1>
        <p>
          Nahraj fotku bločku (QR kód), backend prečíta QR a zavolá OPD endpoint.
          Výsledok (JSON) sa zobrazí nižšie.
        </p>
      </header>

      <section className="card">
        <div className="row">
          <input type="file" accept="image/*" onChange={onPickFile} disabled={busy} />
          <button onClick={onSend} disabled={!file || busy}>
            {busy ? "Spracúvam..." : "Odoslať fotku a získať JSON"}
          </button>
        </div>

        {previewUrl && (
          <div className="preview">
            <img src={previewUrl} alt="preview" />
          </div>
        )}

        <div className="hint muted">
          Tip: ak to nejde, sprav ostrejšiu fotku, viac svetla, alebo priblíž QR. HEIC z iPhonu
          prekonvertuj na JPG/PNG.
        </div>
      </section>

      <section className="card">
        <h2>JSON výstup</h2>

        {!resp && <p className="muted">Zatiaľ nič. Nahraj fotku a klikni na tlačidlo.</p>}

        {resp?.ok === false && (
          <div className="error">
            <div><strong>Chyba:</strong> {resp.error}</div>
            {resp.details && (
              <pre className="pre">{JSON.stringify(resp.details, null, 2)}</pre>
            )}
          </div>
        )}

        {resp && (
          <pre className="pre">{prettyJson}</pre>
        )}
      </section>

      <footer className="footer muted">
        Backend: <code>/api/receipt</code> (upload obrázka → decode QR → OPD <code>receipt/find</code>)
      </footer>
    </div>
  );
}
