export const PERMANENTLY_EXCLUDED_FLAGS = ["AC"];

export const normalizeFlagCode = (code) =>
  String(code || "")
    .trim()
    .toUpperCase();
