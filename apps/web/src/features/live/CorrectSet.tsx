import { useState } from "react";
import { useData } from "../../app/DataProvider";
import { parseNumber } from "@pulso/domain/numbers";
import type { SessionItem } from "@pulso/domain/contracts";
export function CorrectSet({
  studentId,
  sessionId,
  item,
  set,
}: {
  studentId: string;
  sessionId: string;
  item: SessionItem;
  set: SessionItem["sets"][number];
}) {
  const data = useData();
  const [open, setOpen] = useState(false),
    [field, setField] = useState<"weight" | "reps" | "durationSec">(
      item.type === "time"
        ? "durationSec"
        : item.type === "reps"
          ? "reps"
          : "weight",
    ),
    [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (set.state !== "done") return null;
  if (!open)
    return (
      <button
        className="link-button"
        onClick={() => {
          setValue(
            String(field === "durationSec" ? set.duration_sec : set[field]),
          );
          setOpen(true);
        }}
      >
        Corregir serie {set.ordinal}
      </button>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const n = parseNumber(field, value);
          if (!n.ok) throw Error("Revisá el valor.");
          const row = await data.db.read(studentId);
          await data.onlineCommand(
            studentId,
            "correct_result",
            {
              sessionId,
              itemId: item.id,
              setId: set.id,
              field,
              value: n.value,
              reason,
            },
            row!.confirmed.revision,
          );
          setOpen(false);
          setReason("");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Corregir una serie registrada conserva el valor anterior y el motivo en
        el historial.
      </p>
      <label className="field">
        Dato de la serie
        <select
          value={field}
          onChange={(e) => {
            const next = e.target.value as typeof field;
            setField(next);
            setValue(
              String(next === "durationSec" ? set.duration_sec : set[next]),
            );
          }}
        >
          {item.type === "load_reps" && <option value="weight">Peso kg</option>}
          {item.type !== "time" && <option value="reps">Repeticiones</option>}
          {item.type === "time" && (
            <option value="durationSec">Segundos</option>
          )}
        </select>
      </label>
      <label className="field">
        Valor corregido
        <input
          inputMode="decimal"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <label className="field">
        Motivo de la corrección
        <input
          minLength={3}
          maxLength={500}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <button className="button" disabled={busy}>
          Confirmar corrección
        </button>
        <button
          className="link-button"
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
