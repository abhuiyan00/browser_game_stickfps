const COLOR_NAMES = [
  "Crimson",
  "Azure",
  "Emerald",
  "Amber",
  "Violet",
  "Coral",
  "Cobalt",
  "Jade",
  "Scarlet",
  "Indigo",
  "Saffron",
  "Teal",
  "Magenta",
  "Onyx",
  "Ivory",
  "Bronze",
  "Slate",
  "Ruby",
  "Sapphire",
  "Olive",
  "Maroon",
  "Turquoise",
  "Lavender",
  "Charcoal",
] as const;

/** Picks a color name unused within the room; falls back to a numbered suffix once the palette is exhausted. */
export function assignColorName(usedNames: ReadonlySet<string>): string {
  const available = COLOR_NAMES.filter((name) => !usedNames.has(name));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }

  let suffix = 2;
  let candidate = `${COLOR_NAMES[0]}${suffix}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${COLOR_NAMES[suffix % COLOR_NAMES.length]}${suffix}`;
  }
  return candidate;
}
