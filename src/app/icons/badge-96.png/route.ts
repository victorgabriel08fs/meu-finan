import { monochromeIconResponse } from "@/components/brand/app-icon";

/** Monochrome icon (badge-96), flat white symbol on transparency. Prerendered at build. */
export function GET() {
  return monochromeIconResponse(96);
}
