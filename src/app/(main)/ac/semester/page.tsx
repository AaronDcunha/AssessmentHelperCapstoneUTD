import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";

const dateFields = [
  { label: "Semester", defaultValue: "Fall 2026" },
  { label: "Signup Deadline", placeholder: "MM / DD / YYYY" },
  { label: "Semester Start", placeholder: "MM / DD / YYYY" },
  { label: "Observation Deadline", placeholder: "MM / DD / YYYY" },
  { label: "Semester End", placeholder: "MM / DD / YYYY" },
  { label: "Feedback Deadline", placeholder: "MM / DD / YYYY" },
] as const;

export default function SemesterSettingsPage() {
  return (
    <form className="space-y-ah-24">
      <div className="min-h-[346px] rounded-ah-8 border border-border bg-surface p-ah-24">
        <div className="grid max-w-[984px] grid-cols-2 gap-x-ah-24 gap-y-ah-16">
          {dateFields.map((field) => (
            <Input key={field.label} label={field.label} name={field.label.toLowerCase().replaceAll(" ", "-")}
              defaultValue={"defaultValue" in field ? field.defaultValue : undefined}
              placeholder={"placeholder" in field ? field.placeholder : undefined}
              className="h-control-56" wrapperClassName="min-h-[88px]" />
          ))}
        </div>
      </div>
      <div className="flex gap-ah-16">
        <Button variant="secondary" className="w-[260px]">Cancel</Button>
        <Button className="w-[260px]">Save Settings</Button>
      </div>
    </form>
  );
}
