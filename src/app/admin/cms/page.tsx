import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getContent } from "@/lib/cms";
import { Checkbox, Field, Input, PageHeader, Panel, Select, Textarea, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { announcementAction, blogAction, contentAction, faqAction, imageSlotAction, policyAction, testimonialAction } from "../actions";

const TABS = ["homepage", "images", "stats", "contact", "testimonials", "faqs", "blog", "announcements", "policies"];
const SLOTS: [string, string][] = [
  ["home-hero", "Homepage hero — production floor"], ["service-workspace", "Service: workspace & machines"], ["service-bulk", "Service: bulk production"], ["service-membership", "Service: membership"], ["service-partnerships", "Service: partnerships"], ["service-skills", "Service: skills development"], ["service-academy", "Service: Academy"],
  ["home-bulk", "Homepage: bulk production"], ["home-academy", "Homepage: Academy"], ["home-cta", "Homepage: final CTA"], ["about-wide", "About: facility wide shot"], ["bulk-hero", "Bulk production hero"], ["tailors-hero", "Become a tailor hero"], ["academy-hero", "Academy hero"], ["auth-panel", "Sign-in panel"],
  ["services-machines", "Services: machines"], ["services-bulk", "Services: bulk"], ["services-membership", "Services: membership"], ["services-partnerships", "Services: partnerships"], ["services-academy", "Services: Academy"],
];

export default async function CMS({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { tab = "homepage" } = await searchParams;
  await requirePermission("cms.manage");
  const [hero, intro, contact, stats, images] = await Promise.all([getContent("home.hero"), getContent("home.intro"), getContent("contact"), getContent("stats"), getContent("images")]);
  return (
    <>
      <PageHeader title="Website content" description="Everything on the public website, editable without code. Changes publish immediately and are audit-logged." />
      <nav className="mb-6 flex flex-wrap gap-1.5">{TABS.map((t) => <Link key={t} href={`?tab=${t}`} className={cx("border px-3 py-1.5 text-sm capitalize", tab === t ? "border-charcoal-900 bg-charcoal-900 text-cream-50" : "border-charcoal-900/15 bg-white")}>{t}</Link>)}</nav>

      {tab === "homepage" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Hero"><ActionForm action={contentAction} className="space-y-3"><input type="hidden" name="key" value="home.hero" />{["eyebrow", "headline", "sub"].map((f) => <input key={f} type="hidden" name="fields" value={f} />)}<Field label="Eyebrow"><Input name="eyebrow" defaultValue={hero.eyebrow} /></Field><Field label="Headline" hint="The last two words are set in italic gold."><Input name="headline" defaultValue={hero.headline} /></Field><Field label="Supporting text"><Textarea name="sub" defaultValue={hero.sub} /></Field><SubmitButton>Publish</SubmitButton></ActionForm></Panel>
          <Panel title="Introduction"><ActionForm action={contentAction} className="space-y-3"><input type="hidden" name="key" value="home.intro" /><input type="hidden" name="fields" value="title" /><input type="hidden" name="fields" value="body" /><Field label="Title"><Input name="title" defaultValue={intro.title} /></Field><Field label="Body"><Textarea name="body" rows={6} defaultValue={intro.body} /></Field><SubmitButton>Publish</SubmitButton></ActionForm></Panel>
        </div>
      ) : null}

      {tab === "images" ? (
        <>
          <p className="mb-4 text-sm text-charcoal-600">Upload real StitchWorks photography for each slot. Until a photo is uploaded, the site shows a clearly labelled placeholder — never a stock image presented as the facility.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SLOTS.map(([slot, label]) => (
              <Panel key={slot} title={label}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {images[slot] ? <img src={`/api/files/${images[slot]}`} alt="" className="mb-3 aspect-video w-full object-cover" /> : <div className="mb-3 flex aspect-video items-center justify-center bg-cream-200 font-mono text-xs text-stone-500">placeholder · {slot}</div>}
                <ActionForm action={imageSlotAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="slot" value={slot} /><Input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="py-1.5 text-xs" /><SubmitButton size="sm">Upload</SubmitButton>{images[slot] ? <SubmitButton size="sm" variant="ghost" name="clear" value="1">Remove</SubmitButton> : null}</ActionForm>
              </Panel>
            ))}
          </div>
        </>
      ) : null}

      {tab === "stats" ? (
        <Panel title="Impact statistics">
          <p className="mb-4 text-sm text-charcoal-600">“Live” figures are counted from the platform. “Verified figure” lets management enter an audited number (e.g. including pre-platform history). Hidden figures don’t appear. Never enter unverified numbers.</p>
          <ActionForm action={contentAction} className="space-y-3">
            <input type="hidden" name="key" value="stats" />
            {stats.map((s) => (
              <div key={s.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.5fr_1fr_1fr_80px]">
                <input type="hidden" name="statKey" value={s.key} />
                <Field label="Label"><Input name={`label_${s.key}`} defaultValue={s.label} /></Field>
                <Field label="Source"><Select name={`mode_${s.key}`} defaultValue={s.mode}><option value="auto">Live from platform</option><option value="manual">Verified figure</option><option value="hidden">Hidden</option></Select></Field>
                <Field label="Verified figure"><Input name={`value_${s.key}`} defaultValue={s.value ?? ""} /></Field>
                <Field label="Suffix"><Input name={`suffix_${s.key}`} defaultValue={s.suffix ?? ""} placeholder="+" /></Field>
              </div>
            ))}
            <SubmitButton>Publish</SubmitButton>
          </ActionForm>
        </Panel>
      ) : null}

      {tab === "contact" ? (
        <Panel title="Contact information"><ActionForm action={contentAction} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="key" value="contact" />{(["phone", "whatsapp", "email", "address", "hours", "mapQuery"] as const).map((f) => <div key={f}><input type="hidden" name="fields" value={f} /><Field label={f === "mapQuery" ? "Map location (address or place name)" : f === "whatsapp" ? "WhatsApp number (international, e.g. +234…)" : f[0].toUpperCase() + f.slice(1)}><Input name={f} defaultValue={contact[f]} /></Field></div>)}<div><SubmitButton>Publish</SubmitButton></div></ActionForm></Panel>
      ) : null}

      {tab === "testimonials" ? <Testimonials /> : null}
      {tab === "faqs" ? <Faqs /> : null}
      {tab === "blog" ? <Blog /> : null}
      {tab === "announcements" ? <Announcements /> : null}
      {tab === "policies" ? <Policies /> : null}
    </>
  );
}

async function Testimonials() {
  const list = await db.testimonial.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <p className="text-sm text-charcoal-600 xl:col-span-2">Only publish genuine testimonials with the person’s consent.</p>
      {[...list, null].map((t) => (
        <Panel key={t?.id ?? "new"} title={t ? t.author : "New testimonial"}>
          <ActionForm action={testimonialAction} className="space-y-2" resetOnSuccess={!t}>
            {t ? <input type="hidden" name="id" value={t.id} /> : null}
            <Textarea name="quote" rows={3} defaultValue={t?.quote} placeholder="Quote" required />
            <div className="grid grid-cols-3 gap-2"><Input name="author" defaultValue={t?.author} placeholder="Name" required /><Input name="role" defaultValue={t?.role ?? ""} placeholder="Role / organisation" /><Input name="sortOrder" defaultValue={t?.sortOrder ?? 0} /></div>
            <div className="flex items-center gap-3"><Checkbox name="published" defaultChecked={t?.published ?? true} label="Published" /><SubmitButton size="sm">Save</SubmitButton>{t ? <SubmitButton size="sm" variant="ghost" name="delete" value="1">Delete</SubmitButton> : null}</div>
          </ActionForm>
        </Panel>
      ))}
    </div>
  );
}

async function Faqs() {
  const list = await db.faq.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  return (
    <div className="space-y-3">
      {[...list, null].map((f) => (
        <ActionForm key={f?.id ?? "new"} action={faqAction} className="grid gap-2 border border-charcoal-900/10 bg-white p-4 md:grid-cols-[160px_1fr_60px]" resetOnSuccess={!f}>
          {f ? <input type="hidden" name="id" value={f.id} /> : null}
          <Input name="category" defaultValue={f?.category} placeholder="Category" required />
          <Input name="question" defaultValue={f?.question} placeholder="Question" required />
          <Input name="sortOrder" defaultValue={f?.sortOrder ?? 0} />
          <Textarea name="answer" rows={2} defaultValue={f?.answer} placeholder="Answer" className="md:col-span-3" required />
          <div className="flex items-center gap-3 md:col-span-3"><Checkbox name="published" defaultChecked={f?.published ?? true} label="Published" /><SubmitButton size="sm">{f ? "Save" : "Add FAQ"}</SubmitButton>{f ? <SubmitButton size="sm" variant="ghost" name="delete" value="1">Delete</SubmitButton> : null}</div>
        </ActionForm>
      ))}
    </div>
  );
}

async function Blog() {
  const posts = await db.blogPost.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-4">
      {[null, ...posts].map((p) => (
        <Panel key={p?.id ?? "new"} title={p ? p.title : "New post"}>
          <ActionForm action={blogAction} className="grid gap-3 md:grid-cols-2">
            {p ? <input type="hidden" name="id" value={p.id} /> : null}
            <Field label="Title"><Input name="title" defaultValue={p?.title} required /></Field>
            <Field label="Slug"><Input name="slug" defaultValue={p?.slug} required /></Field>
            <Field label="Category"><Input name="category" defaultValue={p?.category ?? "Garment manufacturing"} /></Field>
            <Field label="Author"><Input name="authorName" defaultValue={p?.authorName ?? "StitchWorks Collective"} /></Field>
            <Field label="Excerpt (meta description)" className="md:col-span-2"><Input name="excerpt" defaultValue={p?.excerpt} required /></Field>
            <Field label="Body (## headings, - lists, blank line between paragraphs)" className="md:col-span-2"><Textarea name="body" rows={8} defaultValue={p?.body} required /></Field>
            <Checkbox name="published" defaultChecked={p?.published} label="Published" />
            <div><SubmitButton size="sm">Save post</SubmitButton></div>
          </ActionForm>
        </Panel>
      ))}
    </div>
  );
}

async function Announcements() {
  const list = await db.announcement.findMany({ orderBy: { startsAt: "desc" } });
  return (
    <Panel title="Site-wide announcement bar">
      <ul className="mb-4 space-y-2">{list.map((a) => <li key={a.id}><ActionForm action={announcementAction} className="flex items-center gap-3 text-sm"><input type="hidden" name="id" value={a.id} /><Checkbox name="active" defaultChecked={a.active} label={a.message} /><SubmitButton size="sm" variant="ghost">Save</SubmitButton></ActionForm></li>)}</ul>
      <ActionForm action={announcementAction} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" resetOnSuccess><Field label="Message"><Input name="message" required /></Field><Field label="Link"><Input name="link" placeholder="/academy" /></Field><Field label="Ends"><Input type="date" name="endsAt" /></Field><SubmitButton size="sm">Add</SubmitButton></ActionForm>
    </Panel>
  );
}

async function Policies() {
  const list = await db.policy.findMany();
  return (
    <div className="space-y-4">
      {[...list, null].map((p) => (
        <Panel key={p?.slug ?? "new"} title={p?.title ?? "New policy"}>
          <ActionForm action={policyAction} className="space-y-2">
            <div className="grid grid-cols-2 gap-2"><Input name="slug" defaultValue={p?.slug} placeholder="slug" readOnly={!!p} required /><Input name="title" defaultValue={p?.title} placeholder="Title" required /></div>
            <Textarea name="body" rows={6} defaultValue={p?.body} required />
            <SubmitButton size="sm">Publish</SubmitButton>
          </ActionForm>
        </Panel>
      ))}
    </div>
  );
}
