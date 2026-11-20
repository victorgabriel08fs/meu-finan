/** iOS startup images (apple-touch-startup-image): iPhones, portrait, dark only. */
export type SplashSize = {
  /** CSS pixels. */
  w: number;
  h: number;
  /** Device pixel ratio. */
  dpr: number;
  /** Devices that use it (documentation only). */
  devices: string;
};

export const SPLASH_SIZES: readonly SplashSize[] = [
  { w: 375, h: 667, dpr: 2, devices: "iPhone SE, 8" },
  { w: 375, h: 812, dpr: 3, devices: "iPhone X, XS, 11 Pro, 12/13 mini" },
  { w: 414, h: 896, dpr: 2, devices: "iPhone XR, 11" },
  { w: 414, h: 896, dpr: 3, devices: "iPhone XS Max, 11 Pro Max" },
  { w: 390, h: 844, dpr: 3, devices: "iPhone 12, 13, 14" },
  { w: 428, h: 926, dpr: 3, devices: "iPhone 12/13 Pro Max, 14 Plus" },
  { w: 393, h: 852, dpr: 3, devices: "iPhone 14 Pro, 15, 16" },
  { w: 430, h: 932, dpr: 3, devices: "iPhone 14 Pro Max, 15 Plus, 16 Plus" },
  { w: 402, h: 874, dpr: 3, devices: "iPhone 16 Pro, 17, 17 Pro" },
  { w: 420, h: 912, dpr: 3, devices: "iPhone Air" },
  { w: 440, h: 956, dpr: 3, devices: "iPhone 16 Pro Max, 17 Pro Max" },
];

export function splashPixels(size: SplashSize) {
  return { pxW: size.w * size.dpr, pxH: size.h * size.dpr };
}

/** Public path of a size's image (`/splash/dark-1170x2532.png`). */
export function splashPath(size: SplashSize): string {
  const { pxW, pxH } = splashPixels(size);
  return `/splash/${splashName(pxW, pxH)}`;
}

export function splashName(pxW: number, pxH: number): string {
  return `dark-${pxW}x${pxH}.png`;
}

export function splashMedia(size: SplashSize): string {
  return `(device-width: ${size.w}px) and (device-height: ${size.h}px) and (-webkit-device-pixel-ratio: ${size.dpr}) and (orientation: portrait)`;
}

/** Pixel size behind a file name, only for the listed sizes. */
export function parseSplashName(
  name: string,
): { pxW: number; pxH: number } | null {
  for (const size of SPLASH_SIZES) {
    const px = splashPixels(size);
    if (name === splashName(px.pxW, px.pxH)) return px;
  }
  return null;
}
