import {
  SHORTCUT_GLYPHS,
  shortcutIconResponse,
} from "@/components/brand/app-icon";

/** Icon of the manifest shortcut (doc 02 §12.1). Prerendered at build. */
export function GET() {
  return shortcutIconResponse(SHORTCUT_GLYPHS.extrato);
}
