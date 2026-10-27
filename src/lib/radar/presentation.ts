export function formatCountryCodes(countryCodes: string[]) {
  const uniqueCodes = [...new Set(
    countryCodes
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  )];

  return uniqueCodes.length ? uniqueCodes.join(", ") : "Não indicados";
}
