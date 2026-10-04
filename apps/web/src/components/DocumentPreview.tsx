import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download } from "lucide-react";
import "./documents.css";

export function DocumentPreview({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const previous = document.title;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    document.title = title + " · Pulso";
    document.body.classList.add("document-preview-open");
    return () => {
      document.title = previous;
      document.body.classList.remove("document-preview-open");
      if (root) root.inert = wasInert;
    };
  }, [title]);
  return createPortal(
    <div
      className="document-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="document-toolbar">
        <button className="button secondary" onClick={onClose}>
          <ArrowLeft size={18} />
          Volver
        </button>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>
            Elegí «Guardar como PDF» en las opciones de impresión de tu
            dispositivo.
          </p>
        </div>
        <div className="row">
          {actions}
          <button className="button" onClick={() => window.print()}>
            <Download size={18} />
            Guardar PDF / imprimir
          </button>
        </div>
      </header>
      <div className="document-paper">{children}</div>
    </div>,
    document.body,
  );
}
