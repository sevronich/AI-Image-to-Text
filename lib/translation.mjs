export const MAX_TRANSLATION_CHARACTERS = 5000;

export function googleTranslateUrl(text) {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_TRANSLATION_CHARACTERS) return null;
  const url = new URL("https://translate.google.com/");
  url.search = new URLSearchParams({ sl: "en", tl: "km", text, op: "translate" }).toString();
  return url.href;
}

export function descriptionText(result, prompt = result.prompt) {
  return [
    "Overview\n" + result.summary,
    ...Object.entries(result.sections).map(([key, value]) => key[0].toUpperCase() + key.slice(1) + "\n" + value),
    "Confirmed evidence\n" + result.evidence.confirmed.map(text => "• " + text).join("\n"),
    "Uncertainty\n" + (result.evidence.uncertain.join("\n") || "No material visual ambiguity noted."),
    "Prompt\n" + prompt,
  ].join("\n\n");
}
