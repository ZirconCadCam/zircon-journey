import type { ReactNode } from "react";
import { useToolEnabled } from "@/lib/usage-tracker";

/** Renders children only while the given consumption tool is switched on. */
export function ToolGate({ id, children }: { id: string; children: ReactNode }) {
  const on = useToolEnabled(id);
  return on ? <>{children}</> : null;
}
