import { monochromeIconResponse } from "@/components/brand/app-icon";

/** Monochrome icon (monochrome-512), flat white symbol on transparency. Prerendered at build. */
export function GET() {
  return monochromeIconResponse(512);
}
