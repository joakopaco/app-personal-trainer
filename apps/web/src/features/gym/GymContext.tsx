import { createContext, useContext } from "react";
import type { GymAccess } from "./api";

export const GymContext = createContext<{
  access: GymAccess;
  refresh: () => Promise<void>;
} | null>(null);

export function useGym() {
  const value = useContext(GymContext);
  if (!value) throw Error("Gym access required");
  return value;
}
