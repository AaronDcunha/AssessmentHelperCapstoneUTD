import { ObservationTemplateEditor } from "./template-editor";
import { requireAcPage } from "@/server/ac-access";

export default async function ObservationTemplatePage() {
  await requireAcPage("ac.template");
  return <ObservationTemplateEditor />;
}
