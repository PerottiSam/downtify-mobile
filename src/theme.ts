export const colors = {
  bg: "#0b0c0e",
  surface: "#15171b",
  raised: "#1d2026",
  line: "#262a31",
  text: "#eceef2",
  dim: "#9aa1ad",
  faint: "#6b7280",
  accent: "rgb(97, 205, 106)",
  onAccent: "#1a1204",
  ok: "rgb(97, 205, 106)",
  danger: "#ff7a7a",
};

export const radius = { sm: 8, md: 12, lg: 20 };

export const font = {
  h1: { fontSize: 30, fontWeight: "700", letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: "500" },
  small: { fontSize: 13, fontWeight: "400" },
} as const;
