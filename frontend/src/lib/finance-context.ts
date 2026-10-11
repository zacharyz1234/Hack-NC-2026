import { createContext, useContext } from "react";
import type { FinanceState } from "@/components/finance-provider";

export const FinanceContext = createContext<FinanceState | null>(null);
export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("FinanceProvider is required");
  return value;
}
