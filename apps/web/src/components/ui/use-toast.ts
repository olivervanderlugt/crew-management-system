"use client";

// Minimal toast store (shadcn-style): a tiny external store so any component
// can call toast({...}) without prop-drilling a provider. The <Toaster/>
// subscribes and renders the active toasts.

import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = Omit<ToastProps, "title"> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function setState(next: State) {
  memoryState = next;
  listeners.forEach((l) => l(memoryState));
}

function scheduleRemove(id: string) {
  if (timeouts.has(id)) return;
  const t = setTimeout(() => {
    timeouts.delete(id);
    setState({ toasts: memoryState.toasts.filter((x) => x.id !== id) });
  }, TOAST_REMOVE_DELAY);
  timeouts.set(id, t);
}

export type ToastInput = Omit<ToasterToast, "id">;

export function toast(props: ToastInput) {
  const id = genId();
  const newToast: ToasterToast = { ...props, id, open: true };
  setState({ toasts: [newToast, ...memoryState.toasts].slice(0, TOAST_LIMIT) });
  scheduleRemove(id);
  return id;
}

/** Convenience helpers. */
toast.success = (title: React.ReactNode, description?: React.ReactNode) =>
  toast({ title, description, variant: "success" });
toast.error = (title: React.ReactNode, description?: React.ReactNode) =>
  toast({ title, description, variant: "destructive" });

export function useToast() {
  const [state, setLocal] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setLocal);
    return () => {
      const i = listeners.indexOf(setLocal);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  return {
    toasts: state.toasts,
    toast,
    dismiss: (id: string) =>
      setState({ toasts: memoryState.toasts.filter((x) => x.id !== id) }),
  };
}
