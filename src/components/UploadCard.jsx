export default function UploadCard({
  busy,
  file,
  previewUrl,
  onPickFile,
  onSend,
  onCaptureClick,
  onCaptureFile,
  cameraInputRef,
}) {
  return (
    <section className="card">
      <div className="row">
        <input type="file" accept="image/*" onChange={onPickFile} disabled={busy} />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onCaptureFile}
          disabled={busy}
          style={{ display: "none" }}
        />
        <button type="button" onClick={onCaptureClick} disabled={busy}>
          Odfotiť bloček
        </button>
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
  );
}
