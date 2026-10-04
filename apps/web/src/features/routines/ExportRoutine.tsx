import { useState } from "react";
import { Download } from "lucide-react";
import type { RoutineDocument } from "@pulso/domain/routines";
import { DocumentPreview } from "../../components/DocumentPreview";
import { RoutinePrint } from "./RoutinePrint";

export function ExportRoutine({
  document,
  student,
  month,
}: {
  document: RoutineDocument;
  student: string;
  month?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        <Download size={18} />
        Exportar rutina
      </button>
      {open && (
        <DocumentPreview
          title={"Rutina · " + student}
          onClose={() => setOpen(false)}
        >
          <RoutinePrint
            document={document}
            student={student}
            month={month}
            preview
          />
        </DocumentPreview>
      )}
    </>
  );
}
