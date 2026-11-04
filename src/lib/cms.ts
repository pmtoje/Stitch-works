import { cache } from "react";
import { db } from "./db";

export type HeroContent = { eyebrow: string; headline: string; sub: string };
export type ContactContent = { phone: string; whatsapp: string; email: string; address: string; hours: string; mapQuery: string };
export type StatItem = { key: string; label: string; mode: "auto" | "manual" | "hidden"; value?: number | null; suffix?: string };
export type ImageSlots = Record<string, string | null>; // slot -> uploadId

export const DEFAULTS = {
  "home.hero": {
    eyebrow: "Common Facility Centre · Jos, Plateau State",
    headline: "Where Craftsmanship Meets Opportunity.",
    sub: "An integrated garment production ecosystem empowering tailors, connecting businesses to quality garment manufacturing, and equipping the next generation of fashion professionals.",
  } as HeroContent,
  "home.intro": {
    title: "A shared production floor for a whole industry.",
    body: "StitchWorks Collective operates a Common Facility Centre: an organised, professionally managed production environment where skilled tailors and garment makers access industrial equipment, dedicated workspace and real production contracts — without carrying the cost of a factory alone. Businesses get a dependable manufacturing partner. Tailors get infrastructure and income. Learners get a pathway into the trade.",
  },
  contact: {
    phone: "",
    whatsapp: "",
    email: "hello@stitchworks.ng",
    address: "StitchWorks Common Facility Centre, Jos, Plateau State, Nigeria",
    hours: "Monday – Friday 8:00–18:00 · Saturday 9:00–15:00",
    mapQuery: "Jos, Plateau State, Nigeria",
  } as ContactContent,
  stats: [
    { key: "tailors", label: "Registered tailors", mode: "auto" },
    { key: "machines", label: "Production machines", mode: "auto" },
    { key: "orders", label: "Orders completed", mode: "auto" },
    { key: "trainees", label: "Academy trainees", mode: "auto" },
    { key: "clients", label: "Corporate clients", mode: "auto" },
  ] as StatItem[],
  images: {} as ImageSlots,
};

type Key = keyof typeof DEFAULTS;

export const getContent = cache(async <K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> => {
  const row = await db.siteContent.findUnique({ where: { key } }).catch(() => null);
  if (!row) return DEFAULTS[key];
  const def = DEFAULTS[key];
  return (Array.isArray(def) ? row.value : { ...(def as object), ...(row.value as object) }) as (typeof DEFAULTS)[K];
});

/** Live figures from the database; manual figures must be entered by management. */
export const resolveStats = cache(async () => {
  const items = await getContent("stats");
  const auto: Record<string, () => Promise<number>> = {
    tailors: () => db.tailor.count({ where: { verification: "VERIFIED" } }),
    machines: () => db.equipment.count({ where: { status: { not: "RETIRED" } } }),
    orders: () => db.bulkOrder.count({ where: { status: "COMPLETED" } }),
    trainees: () => db.enrolment.count(),
    clients: () => db.organisation.count({ where: { bulkOrders: { some: { status: { notIn: ["ENQUIRY_RECEIVED", "DECLINED", "CANCELLED"] } } } } }),
  };
  const out: { key: string; label: string; value: number | null; suffix?: string }[] = [];
  for (const s of items) {
    if (s.mode === "hidden") continue;
    const value = s.mode === "auto" && auto[s.key] ? await auto[s.key]().catch(() => null) : (s.value ?? null);
    out.push({ key: s.key, label: s.label, value, suffix: s.suffix });
  }
  return out;
});

export const getImageSlot = cache(async (slot: string): Promise<string | null> => {
  const slots = await getContent("images");
  const id = slots[slot];
  return id ? `/api/files/${id}` : null;
});
