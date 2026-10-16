import { appIconResponse } from "@/components/brand/app-icon";

/** Manifest icon, purpose "any" (doc 02 §12.1). Prerendered at build. */
export function GET() {
  return appIconResponse(512, "rounded");
}
