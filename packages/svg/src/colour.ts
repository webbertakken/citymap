/** An sRGB hex colour from OKLCH (lightness 0 to 1, chroma, hue in degrees), clipped to the gamut. */
export function oklch(l: number, c: number, hue: number): string {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${linear
    .map((x) => {
      const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

const channels = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16)) as [number, number, number];

/** A blend of two hex colours: t = 0 is a, t = 1 is b. */
export function mix(a: string, b: string, t: number): string {
  const x = channels(a);
  const y = channels(b);
  return `#${x
    .map((v, i) =>
      Math.round(v * (1 - t) + (y[i] as number) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** WCAG relative luminance and contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = channels(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
