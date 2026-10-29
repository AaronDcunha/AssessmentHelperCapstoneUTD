/** Compact plain-text preview; full content remains in Notifications. */
export function activityPreview(message: string) {
  const characters = Array.from(message.replace(/\s+/g, " ").trim());
  return characters.length > 180 ? `${characters.slice(0, 180).join("").trimEnd()}…` : characters.join("");
}
