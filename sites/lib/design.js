/* FODO Website Builder — design system (v32). One source of truth for colours, fonts, style presets and motion levels.
   A website's theme stores TOKENS (not random colours); every section reads them as CSS variables, so changing the primary
   colour or the heading font updates the whole website. Shared by the editor (browser) and the server (validation, AI). */

/* ---------- typography: curated library (Google Fonts, self-explanatory keys) ---------- */
export const FONT_LIB = {
  Inter: { css: "Inter, system-ui, -apple-system, Segoe UI, sans-serif", gf: "Inter:wght@400;600;800", cat: "Modern sans" },
  Manrope: { css: "Manrope, system-ui, sans-serif", gf: "Manrope:wght@400;600;800", cat: "Modern sans" },
  Jakarta: { css: "'Plus Jakarta Sans', system-ui, sans-serif", gf: "Plus+Jakarta+Sans:wght@400;600;800", cat: "Modern sans", label: "Plus Jakarta Sans" },
  DM: { css: "'DM Sans', system-ui, sans-serif", gf: "DM+Sans:wght@400;600;800", cat: "Modern sans", label: "DM Sans" },
  Space: { css: "'Space Grotesk', system-ui, sans-serif", gf: "Space+Grotesk:wght@400;600;700", cat: "Modern sans", label: "Space Grotesk" },
  Geist: { css: "Geist, system-ui, sans-serif", gf: "Geist:wght@400;600;800", cat: "Modern sans" },
  Poppins: { css: "Poppins, system-ui, sans-serif", gf: "Poppins:wght@400;600;800", cat: "Modern sans" },
  Montserrat: { css: "Montserrat, system-ui, sans-serif", gf: "Montserrat:wght@400;600;800", cat: "Modern sans" },
  Playfair: { css: "'Playfair Display', Georgia, serif", gf: "Playfair+Display:wght@500;700;800", cat: "Editorial", label: "Playfair Display" },
  Cormorant: { css: "'Cormorant Garamond', Georgia, serif", gf: "Cormorant+Garamond:wght@500;600;700", cat: "Editorial", label: "Cormorant Garamond" },
  Baskerville: { css: "'Libre Baskerville', Georgia, serif", gf: "Libre+Baskerville:wght@400;700", cat: "Editorial", label: "Libre Baskerville" },
  Syne: { css: "Syne, system-ui, sans-serif", gf: "Syne:wght@500;700;800", cat: "Creative" },
  Sora: { css: "Sora, system-ui, sans-serif", gf: "Sora:wght@400;600;800", cat: "Creative" },
  Outfit: { css: "Outfit, system-ui, sans-serif", gf: "Outfit:wght@400;600;800", cat: "Creative" },
  Plex: { css: "'IBM Plex Sans', system-ui, sans-serif", gf: "IBM+Plex+Sans:wght@400;600;700", cat: "Corporate", label: "IBM Plex Sans" },
  Source: { css: "'Source Sans 3', system-ui, sans-serif", gf: "Source+Sans+3:wght@400;600;800", cat: "Corporate", label: "Source Sans 3" },
  Instrument: { css: "'Instrument Serif', Georgia, serif", gf: "Instrument+Serif", cat: "Elegant", label: "Instrument Serif" },
  Lora: { css: "Lora, Georgia, serif", gf: "Lora:wght@400;600;700", cat: "Elegant" },
  Mono: { css: "'JetBrains Mono', ui-monospace, monospace", gf: "JetBrains+Mono:wght@400;700", cat: "Mono", label: "JetBrains Mono" },
};
export const fontLabel = (k) => (FONT_LIB[k] && FONT_LIB[k].label) || k;
export const PAIRINGS = [
  { id: "classic-editorial", name: "Playfair Display + Inter", heading: "Playfair", body: "Inter" },
  { id: "tech-grotesk", name: "Space Grotesk + DM Sans", heading: "Space", body: "DM" },
  { id: "luxury-serif", name: "Cormorant Garamond + Manrope", heading: "Cormorant", body: "Manrope" },
  { id: "clean-modern", name: "Plus Jakarta Sans (all)", heading: "Jakarta", body: "Jakarta" },
  { id: "creative-syne", name: "Syne + Inter", heading: "Syne", body: "Inter" },
  { id: "friendly-outfit", name: "Outfit + DM Sans", heading: "Outfit", body: "DM" },
  { id: "corporate-plex", name: "IBM Plex Sans + Source Sans 3", heading: "Plex", body: "Source" },
  { id: "elegant-instrument", name: "Instrument Serif + Manrope", heading: "Instrument", body: "Manrope" },
  { id: "warm-lora", name: "Lora + DM Sans", heading: "Lora", body: "DM" },
  { id: "bold-sora", name: "Sora (all)", heading: "Sora", body: "Sora" },
  { id: "news-baskerville", name: "Libre Baskerville + Source Sans 3", heading: "Baskerville", body: "Source" },
  { id: "geist", name: "Geist (all)", heading: "Geist", body: "Geist" },
];

/* ---------- colour palettes: full token sets for light AND dark (dark is designed, never just inverted) ---------- */
const P = (id, name, light, dark, tags) => ({ id, name, light, dark, tags: tags || [] });
export const PALETTES = [
  P("midnight-purple", "Midnight + Electric Purple", { primary: "#6D4AFF", secondary: "#1E1B4B", accent: "#22D3EE", bg: "#FFFFFF", surface: "#F6F5FF", text: "#14112B" }, { primary: "#8B6CFF", secondary: "#C4B5FD", accent: "#22D3EE", bg: "#0B0A16", surface: "#15132A", text: "#F1EFFF" }, ["tech", "ai", "saas", "agency"]),
  P("mono-red", "Black + White + Red", { primary: "#E11D2E", secondary: "#111111", accent: "#111111", bg: "#FFFFFF", surface: "#F5F5F5", text: "#111111" }, { primary: "#FF3B4A", secondary: "#FFFFFF", accent: "#FF3B4A", bg: "#0A0A0A", surface: "#161616", text: "#F5F5F5" }, ["bold", "agency", "fitness", "fashion"]),
  P("navy-cyan", "Navy + Cyan", { primary: "#0B4A8B", secondary: "#0A2540", accent: "#06B6D4", bg: "#FFFFFF", surface: "#F2F7FC", text: "#0A2540" }, { primary: "#38A3F5", secondary: "#9AD2FF", accent: "#22D3EE", bg: "#06111F", surface: "#0E1D31", text: "#E8F2FC" }, ["corporate", "finance", "medical", "tech"]),
  P("cream-burgundy", "Cream + Burgundy", { primary: "#7A1F2B", secondary: "#3B1E1E", accent: "#C8A97E", bg: "#FBF7F0", surface: "#F3EBDD", text: "#2A1A16" }, { primary: "#C0505F", secondary: "#E9D8C4", accent: "#C8A97E", bg: "#160E0D", surface: "#221615", text: "#F4EADF" }, ["luxury", "restaurant", "fashion", "wedding"]),
  P("forest", "White + Forest Green", { primary: "#1F6B47", secondary: "#123524", accent: "#A3C585", bg: "#FFFFFF", surface: "#F1F7F3", text: "#14261C" }, { primary: "#4FB37F", secondary: "#BFE3CC", accent: "#A3C585", bg: "#08130D", surface: "#102018", text: "#E7F4EC" }, ["wellness", "nonprofit", "yoga", "organic"]),
  P("charcoal-gold", "Charcoal + Gold", { primary: "#B8912F", secondary: "#2B2B2B", accent: "#E5C76B", bg: "#FFFFFF", surface: "#F7F4EC", text: "#1F1F1F" }, { primary: "#D4AF37", secondary: "#E9E1C8", accent: "#F2D27A", bg: "#0E0E0E", surface: "#1A1A18", text: "#F3EFE4" }, ["luxury", "jewellery", "realestate", "legal"]),
  P("beige-brown", "Soft Beige + Brown", { primary: "#8B5E3C", secondary: "#4A3222", accent: "#D9A066", bg: "#FAF6F1", surface: "#F1E8DD", text: "#2E2118" }, { primary: "#C99367", secondary: "#E9D6C2", accent: "#D9A066", bg: "#15100C", surface: "#211A14", text: "#F3E9DE" }, ["cafe", "bakery", "interior", "warm"]),
  P("blue-white", "Blue + White", { primary: "#2563EB", secondary: "#1E3A8A", accent: "#F59E0B", bg: "#FFFFFF", surface: "#F3F6FD", text: "#0F172A" }, { primary: "#5B8CFF", secondary: "#BFD3FF", accent: "#FBBF24", bg: "#070C18", surface: "#101829", text: "#EAF0FF" }, ["corporate", "education", "medical", "it"]),
  P("black-lime", "Black + Lime", { primary: "#4D7C0F", secondary: "#111111", accent: "#A3E635", bg: "#FFFFFF", surface: "#F4F7EE", text: "#111111" }, { primary: "#A3E635", secondary: "#ECFCCB", accent: "#A3E635", bg: "#0A0A0A", surface: "#151515", text: "#F4F4F0" }, ["startup", "fitness", "tech", "creative"]),
  P("purple-pink", "Purple + Pink", { primary: "#9333EA", secondary: "#4C1D95", accent: "#EC4899", bg: "#FFFFFF", surface: "#FAF5FF", text: "#1E1033" }, { primary: "#B67BFF", secondary: "#F5D0FE", accent: "#F472B6", bg: "#0F0718", surface: "#1C1029", text: "#F7EEFF" }, ["beauty", "creative", "events", "playful"]),
  P("orange-black", "Orange + Black", { primary: "#EA580C", secondary: "#111111", accent: "#FDBA74", bg: "#FFFFFF", surface: "#FFF7F0", text: "#111111" }, { primary: "#FB7A2E", secondary: "#FFE4D2", accent: "#FDBA74", bg: "#0B0806", surface: "#191311", text: "#FBF2EC" }, ["food", "construction", "fitness", "bold"]),
  P("teal-soft", "Teal + Soft Neutral", { primary: "#0E7490", secondary: "#134E4A", accent: "#22C55E", bg: "#FFFFFF", surface: "#F0F7F7", text: "#0F2A2E" }, { primary: "#2CB5C9", secondary: "#CCF1F2", accent: "#4ADE80", bg: "#061416", surface: "#0E2124", text: "#E6F6F7" }, ["medical", "dental", "clinic", "calm"]),
];
export const paletteById = (id) => PALETTES.find((p) => p.id === id) || null;
/* ---------- style presets (a whole design language, applied to any template or website) ---------- */
export const STYLES = {
  minimal: { name: "Minimal", desc: "Clean, lots of white space, elegant", pairing: "clean-modern", radius: 10, button: "rounded", shadow: "none", density: "airy", motion: "subtle", mode: "light", palette: "blue-white", hero: "theme" },
  luxury: { name: "Luxury", desc: "Large serif type, premium spacing, editorial", pairing: "luxury-serif", radius: 2, button: "square", shadow: "soft", density: "airy", motion: "modern", mode: "dark", palette: "charcoal-gold", hero: "dark" },
  modern: { name: "Modern", desc: "Bold type, cards, soft gradients", pairing: "clean-modern", radius: 16, button: "rounded", shadow: "soft", density: "normal", motion: "modern", mode: "light", palette: "midnight-purple", hero: "gradient" },
  corporate: { name: "Corporate", desc: "Professional, structured, trust-focused", pairing: "corporate-plex", radius: 8, button: "rounded", shadow: "soft", density: "normal", motion: "subtle", mode: "light", palette: "navy-cyan", hero: "theme" },
  creative: { name: "Creative", desc: "Experimental layouts, big type, motion", pairing: "creative-syne", radius: 22, button: "pill", shadow: "strong", density: "normal", motion: "experimental", mode: "dark", palette: "purple-pink", hero: "gradient" },
  playful: { name: "Playful", desc: "Bright colours, rounded components", pairing: "friendly-outfit", radius: 26, button: "pill", shadow: "soft", density: "normal", motion: "dynamic", mode: "light", palette: "orange-black", hero: "gradient" },
  dark: { name: "Dark", desc: "Dark UI with glowing accents", pairing: "tech-grotesk", radius: 14, button: "rounded", shadow: "glow", density: "normal", motion: "dynamic", mode: "dark", palette: "midnight-purple", hero: "dark" },
  editorial: { name: "Editorial", desc: "Magazine-style typography", pairing: "news-baskerville", radius: 0, button: "square", shadow: "none", density: "airy", motion: "subtle", mode: "light", palette: "cream-burgundy", hero: "theme" },
  glass: { name: "Glass", desc: "Glassmorphism, blur, light layers", pairing: "clean-modern", radius: 20, button: "pill", shadow: "glass", density: "normal", motion: "modern", mode: "dark", palette: "navy-cyan", hero: "gradient" },
  futuristic: { name: "Futuristic", desc: "AI / technology visual language", pairing: "tech-grotesk", radius: 12, button: "rounded", shadow: "glow", density: "normal", motion: "experimental", mode: "dark", palette: "black-lime", hero: "dark" },
};
export const MOTION_LEVELS = ["none", "subtle", "modern", "dynamic", "experimental"];
export const motionLevel = (m) => (m === "lively" ? "dynamic" : MOTION_LEVELS.indexOf(m) > -1 ? m : "modern");   // default: Modern (v31 "lively" = dynamic)
export const ENTRANCES = ["auto", "fade", "fade-up", "fade-down", "slide-left", "slide-right", "scale", "blur", "none"];
export const HOVERS = ["lift", "scale", "glow", "none"];
export const BUTTONS = ["rounded", "pill", "square"], SHADOWS = ["none", "soft", "strong", "glow", "glass"], DENSITY = ["compact", "normal", "airy"], CONTAINERS = ["1080", "1200", "1280", "1440", "full"];

/* apply a palette (+ mode) to a theme: writes the tokens, keeps everything else */
export function applyPalette(theme, paletteId, mode) {
  const p = paletteById(paletteId); if (!p) return theme; const m = mode || theme.mode || "light", t = Object.assign({}, theme, { palette: p.id, mode: m });
  const tok = m === "dark" ? p.dark : p.light; ["primary", "secondary", "accent", "bg", "surface", "text"].forEach((k) => { t[k] = tok[k]; });
  return t;
}
/* apply a whole style preset (fonts, radius, buttons, shadow, spacing, motion, colours) — "switch Modern → Luxury without rebuilding" */
export function applyStyle(theme, styleId, keepColors) {
  const s = STYLES[styleId]; if (!s) return theme; const pr = PAIRINGS.find((x) => x.id === s.pairing) || PAIRINGS[0];
  let t = Object.assign({}, theme, { style: styleId, font: pr.body, headingFont: pr.heading, radius: s.radius, button: s.button, shadow: s.shadow, density: s.density, motion: s.motion });
  if (!keepColors) t = applyPalette(t, s.palette, s.mode);
  return t;
}
export function applyPairing(theme, pairingId) { const pr = PAIRINGS.find((x) => x.id === pairingId); return pr ? Object.assign({}, theme, { font: pr.body, headingFont: pr.heading, pairing: pr.id }) : theme; }

/* ---------- WCAG contrast (used by the audit and the "fix contrast" auto-fix) ---------- */
export function hexRgb(h) { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h.slice(0, 6), 16); return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0]; }
const lum = (rgb) => { const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
export function contrast(a, b) { const x = lum(hexRgb(a)), y = lum(hexRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function shade(hex, f) { const [r, g, b] = hexRgb(hex), m = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return "#" + [m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, "0")).join(""); }
/* darken/lighten a colour until it reaches the target contrast against another (keeps the hue) */
export function fixContrast(fg, bg, target) { let c = fg, i = 0; const dark = lum(hexRgb(bg)) > 0.4; while (contrast(c, bg) < (target || 4.5) && i++ < 30) c = shade(c, dark ? -0.08 : 0.08); return c; }
