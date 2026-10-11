/** An sRGB hex colour from OKLCH (lightness 0 to 1, chroma, hue in degrees), clipped to the gamut. */
export function oklch(l: number, c: number, hue: number): string {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
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

const channels = (c: string): [number, number, number] => [
  Number.parseInt(c.slice(1, 3), 16),
  Number.parseInt(c.slice(3, 5), 16),
  Number.parseInt(c.slice(5, 7), 16),
];

const blend = (x: number, y: number, t: number) =>
  Math.round(x * (1 - t) + y * t)
    .toString(16)
    .padStart(2, "0");

/** A blend of two hex colours: t = 0 is a, t = 1 is b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return `#${blend(ar, br, t)}${blend(ag, bg, t)}${blend(ab, bb, t)}`;
}

/** The sRGB channel's linear value, as WCAG defines it. */
const linear = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a hex colour. */
const luminance = (c: string) => {
  const [r, g, b] = channels(c);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
