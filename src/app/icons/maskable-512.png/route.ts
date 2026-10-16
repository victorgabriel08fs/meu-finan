import { appIconResponse } from "@/components/brand/app-icon";

/** Manifest icon, purpose "maskable": glyph inside the safe zone. */
export function GET() {
  return appIconResponse(512, "maskable");
}
