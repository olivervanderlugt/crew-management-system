"use client";

import { createContext, useContext, type ReactNode } from "react";
import { can as canFn, type AdminModule, type MyPerms } from "@/lib/admin/modules";

const PermsContext = createContext<MyPerms>({ isAdmin: false, isFull: false, perms: [] });

export function AdminPermsProvider({ value, children }: { value: MyPerms; children: ReactNode }) {
  return <PermsContext.Provider value={value}>{children}</PermsContext.Provider>;
}

export function usePerms(): MyPerms {
  return useContext(PermsContext);
}

export function useCan(module: AdminModule): boolean {
  return canFn(useContext(PermsContext), module);
}

export const NO_RIGHTS_TITLE = "Je hebt geen rechten voor deze actie";
