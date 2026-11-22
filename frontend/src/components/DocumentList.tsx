import type { UploadedDocument } from "../types";

interface Props {
  documents: UploadedDocument[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentList({ documents, selected, onToggle }: Props) {
  if (documents.length === 0) {
    return <p className="muted">No documents uploaded yet.</p>;
  }
  return (
    <ul className="doc-list">
      {documents.map((doc) => {
        const isSelectable = doc.extractionStatus === "ok";
        return (
          <li key={doc.id} className={`doc-row ${!isSelectable ? "doc-row--failed" : ""}`}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(doc.id)}
                onChange={() => onToggle(doc.id)}
                disabled={!isSelectable}
              />
              <span className="doc-name">{doc.originalName}</span>
              <span className="doc-meta">
                {doc.format.toUpperCase()} · {formatSize(doc.sizeBytes)}
              </span>
              {doc.extractionStatus === "failed" && (
                <span className="doc-error">{doc.extractionError ?? "Could not be read"}</span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
