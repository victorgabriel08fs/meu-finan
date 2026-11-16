import { splashResponse } from "@/components/brand/splash";
import {
  parseSplashName,
  SPLASH_SIZES,
  splashName,
  splashPixels,
} from "@/lib/brand/splash";

/** Public, no session (the iOS fetches it without cookies): fixed images only. */
export function generateStaticParams() {
  return SPLASH_SIZES.map((size) => {
    const { pxW, pxH } = splashPixels(size);
    return { name: splashName(pxW, pxH) };
  });
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/splash/[name]">,
) {
  const { name } = await ctx.params;
  const px = parseSplashName(name);
  if (!px) return new Response("Not found", { status: 404 });
  return splashResponse(px.pxW, px.pxH);
}
