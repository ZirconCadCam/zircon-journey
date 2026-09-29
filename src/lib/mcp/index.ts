import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { listCasesTool, getCaseTool } from "./tools/cases";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "zircon-flow",
  title: "Zircon Flow",
  version: "0.1.0",
  instructions:
    "Read-only tools for the Zircon CAD/CAM lab. Use `list_cases` to browse recent cases and `get_case` for one case by code. Only admin accounts can use them.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCasesTool, getCaseTool],
});
