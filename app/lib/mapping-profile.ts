const mappingKey = /^(?:income|balance|cashflow|sheet):[A-Za-z][A-Za-z0-9]*$/;

export function sanitizeMappingProfile(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Mappings must be an object.");
  const entries = Object.entries(value);
  if (entries.length > 60) throw new Error("A mapping profile cannot contain more than 60 assignments.");
  const clean: Record<string, string> = {};
  for (const [key, source] of entries) {
    if (!mappingKey.test(key)) throw new Error(`Invalid mapping key: ${key}.`);
    if (typeof source !== "string" || !source.trim() || source.length > 200) throw new Error(`Invalid source account for ${key}.`);
    clean[key] = source.trim();
  }
  if (JSON.stringify(clean).length > 20_000) throw new Error("The mapping profile is too large.");
  return clean;
}
