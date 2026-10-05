import type { InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";

// Keep the native picker and form semantics inside a consistently sized shell.
// iOS date controls have intrinsic sizing that differs from desktop WebKit.
export function DateInput(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">,
) {
  const value = typeof props.value === "string" ? props.value : "";
  const parts = value.split("-");
  const label = value ? `${parts[2]}/${parts[1]}/${parts[0]}` : "Elegir fecha";
  return (
    <span className={"date-control" + (props.disabled ? " is-disabled" : "")}>
      <span aria-hidden="true" className={value ? "" : "muted"}>
        {label}
      </span>
      <CalendarDays size={18} aria-hidden="true" />
      <input {...props} type="date" />
    </span>
  );
}
