import type { Course } from "@prisma/client";
import { Checkbox, Field, Input, Select, Textarea } from "../ui";
import { ActionForm, SubmitButton } from "../ui/action-form";
import { courseAction } from "@/app/admin/actions";

export function CourseForm({ c, instructors }: { c?: Course; instructors: { id: string; name: string }[] }) {
  const outline = ((c?.outline ?? []) as { title: string; topics: string[] }[]).map((m) => `${m.title}: ${m.topics.join(", ")}`).join("\n");
  return (
    <ActionForm action={courseAction} className="grid gap-4 sm:grid-cols-2">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Field label="Course title" required><Input name="title" defaultValue={c?.title} required /></Field>
      {c ? <Field label="URL slug"><Input value={c.slug} disabled /></Field> : <Field label="URL slug (optional)"><Input name="slug" /></Field>}
      <Field label="Level"><Select name="level" defaultValue={c?.level ?? "Foundation"}>{["Foundation", "Intermediate", "Advanced", "Professional"].map((l) => <option key={l}>{l}</option>)}</Select></Field>
      <Field label="Duration (weeks)" required><Input name="durationWeeks" defaultValue={c?.durationWeeks ?? ""} required /></Field>
      <Field label="Tuition fee (₦)" required><Input name="fee" defaultValue={c?.fee ?? ""} required /></Field>
      <Field label="Application fee (₦)"><Input name="applicationFee" defaultValue={c?.applicationFee ?? 0} /></Field>
      <Field label="Training format"><Input name="format" defaultValue={c?.format ?? "In-person"} /></Field>
      <Field label="Instructor"><Select name="instructorId" defaultValue={c?.instructorId ?? ""}><option value="">—</option>{instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
      <Field label="Summary" className="sm:col-span-2"><Input name="summary" defaultValue={c?.summary} required /></Field>
      <Field label="Description" className="sm:col-span-2"><Textarea name="description" rows={4} defaultValue={c?.description} required /></Field>
      <Field label="Learning objectives (one per line)"><Textarea name="objectives" rows={4} defaultValue={c?.objectives.join("\n")} /></Field>
      <Field label="Entry requirements (one per line)"><Textarea name="requirements" rows={4} defaultValue={c?.requirements.join("\n")} /></Field>
      <Field label="Course outline — one module per line: Title: topic, topic" className="sm:col-span-2"><Textarea name="outline" rows={5} defaultValue={outline} /></Field>
      <Field label="Certification information" className="sm:col-span-2"><Input name="certification" defaultValue={c?.certification ?? "StitchWorks Academy Certificate with online verification ID."} /></Field>
      <Field label="Course image"><Input type="file" name="image" accept="image/*" /></Field>
      <Field label="Sort order"><Input name="sortOrder" defaultValue={c?.sortOrder ?? 0} /></Field>
      <Checkbox name="published" defaultChecked={c?.published} label="Published on the website" />
      <div className="sm:col-span-2"><SubmitButton>{c ? "Save course" : "Create course"}</SubmitButton></div>
    </ActionForm>
  );
}
