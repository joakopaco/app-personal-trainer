import { useEffect, useRef, useState } from "react";
import { type NumericField as FieldName } from "@pulso/domain/numbers";
import {
  displayNumber,
  isRestField,
  parseDisplayedNumber,
} from "./rest-minutes";

export function RoutineNumberField({
  label,
  field,
  value,
  rawValue,
  onRaw,
  onChange,
}: {
  label: string;
  field: FieldName;
  value: number | null;
  rawValue?: string;
  onRaw: (raw: string) => void;
  onChange: (value: number | null) => void;
}) {
  const [raw, setRaw] = useState(rawValue ?? displayNumber(field, value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setRaw(rawValue ?? displayNumber(field, value));
  }, [rawValue, value, field]);
  const result = parseDisplayedNumber(field, raw);
  return (
    <label className="field">
      {label}
      <input
        aria-label={label}
        inputMode={
          field === "weight" || isRestField(field) ? "decimal" : "numeric"
        }
        value={raw}
        aria-invalid={raw !== "" && !result.ok}
        onFocus={(event) => {
          focused.current = true;
          event.target.select();
        }}
        onBlur={() => {
          focused.current = false;
        }}
        onChange={(event) => {
          const text = event.target.value;
          setRaw(text);
          onRaw(text);
          const parsed = parseDisplayedNumber(field, text);
          if (text === "") onChange(null);
          else if (parsed.ok) onChange(parsed.value);
        }}
      />
      <span className="field-hint">
        {raw !== "" && !result.ok ? "Revisá el valor" : ""}
      </span>
    </label>
  );
}
