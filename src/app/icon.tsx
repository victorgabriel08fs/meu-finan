import { appIconResponse } from "@/components/brand/app-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: the Prumo symbol (replaces create-next-app's favicon.ico). */
export default function Icon() {
  return appIconResponse(size.width, "rounded");
}
