import { useEffect, useState } from "react";
import type { StoredFile } from "../../types";
import { fileKind, formatBytes, formatDate, isPreviewable } from "../../utils/format";
import { CloseIcon, FileIcon } from "./icons";

interface PreviewPaneProps {
  file: StoredFile;
  downloadUrl: string | null;
  loading: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export function PreviewPane({ file, downloadUrl, loading, onClose, onDownload }: PreviewPaneProps) {
  const kind = isPreviewable(file.mime_type);
  const [textPreview, setTextPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!downloadUrl || kind !== "text") {
      setTextPreview(null);
      return;
    }
    let cancelled = false;
    void fetch(downloadUrl)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setTextPreview(t.slice(0, 8000));
      })
      .catch(() => {
        if (!cancelled) setTextPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [downloadUrl, kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="finder-peek-backdrop" role="presentation" onClick={onClose}>
      <div
        className="finder-peek"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${file.filename}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="finder-peek-header">
          <div className="finder-peek-title">
            <FileIcon size={18} />
            <strong>{file.filename}</strong>
          </div>
          <div className="finder-peek-actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={onDownload}>
              Download
            </button>
            <button type="button" className="icon-btn" aria-label="Close preview" onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>
        </header>

        <div className="finder-peek-body">
          {loading && <p className="finder-muted">Loading preview…</p>}
          {!loading && downloadUrl && kind === "image" && (
            <img src={downloadUrl} alt={file.filename} className="finder-peek-media" />
          )}
          {!loading && downloadUrl && kind === "video" && (
            <video src={downloadUrl} controls className="finder-peek-media" />
          )}
          {!loading && downloadUrl && kind === "pdf" && (
            <iframe title={file.filename} src={downloadUrl} className="finder-peek-frame" />
          )}
          {!loading && kind === "text" && (
            <pre className="finder-peek-text">{textPreview ?? "Unable to load text preview."}</pre>
          )}
          {!loading && !kind && (
            <div className="finder-peek-fallback">
              <FileIcon size={64} />
              <p>No inline preview for this file type.</p>
              <button type="button" className="btn btn-primary" onClick={onDownload}>
                Open / Download
              </button>
            </div>
          )}
        </div>

        <footer className="finder-peek-meta">
          <span>{fileKind(file.mime_type, file.extension)}</span>
          <span>{formatBytes(file.size)}</span>
          <span>v{file.current_version}</span>
          <span>{formatDate(file.updated_at)}</span>
          {file.tags?.length > 0 && <span>Tags: {file.tags.join(", ")}</span>}
        </footer>
      </div>
    </div>
  );
}
