export const TEMPLATE_SECTIONS = ["scale", "long-responses", "comments-signatures"] as const;

export type TemplateSection = typeof TEMPLATE_SECTIONS[number];

export function nextTemplateSection(section: TemplateSection): TemplateSection {
  const index = TEMPLATE_SECTIONS.indexOf(section);
  return TEMPLATE_SECTIONS[Math.min(index + 1, TEMPLATE_SECTIONS.length - 1)];
}

export function previousTemplateSection(section: TemplateSection): TemplateSection {
  const index = TEMPLATE_SECTIONS.indexOf(section);
  return TEMPLATE_SECTIONS[Math.max(index - 1, 0)];
}
