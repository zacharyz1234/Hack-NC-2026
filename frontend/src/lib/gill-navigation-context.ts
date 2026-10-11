import { createContext, useContext } from "react";

export const returnDestinations = [
  "/",
  "/accounts",
  "/spending",
  "/purchases",
] as const;
export type ReturnDestination = (typeof returnDestinations)[number];
export function safeReturn(value: unknown): ReturnDestination {
  return returnDestinations.includes(value as ReturnDestination)
    ? (value as ReturnDestination)
    : "/";
}
type Navigation = {
  transitioning: boolean;
  transition: (commit: () => void | Promise<unknown>) => void;
  openGill: (returnTo: ReturnDestination, initialQuestion?: string) => void;
};
export const NavigationContext = createContext<Navigation | null>(null);
export function useGillNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("GillNavigationProvider is required");
  return value;
}
