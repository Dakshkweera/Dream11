/**
 * Strip internal markers that must never reach the fan: fact ids like [f-0026] (for the fact checker),
 * and markdown links the model sometimes writes even when told not to (sources are shown separately).
 */
export const stripFactIds = (text: string): string =>
  text
    .replace(/\s*\[f-\d{3,5}\]/g, "")
    .replace(/\s*\[f-\d{0,4}$/, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]*\)/g, "$1");
