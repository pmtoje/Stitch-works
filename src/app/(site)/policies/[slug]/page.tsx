import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Eyebrow } from "@/components/ui";
import { Markdown } from "@/components/ui/markdown";
import { fmtDate } from "@/lib/format";

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await db.policy.findUnique({ where: { slug: (await params).slug } });
  if (!p) notFound();
  return (<article className="container max-w-3xl py-20"><Eyebrow>Policy</Eyebrow><h1 className="mt-4 text-5xl">{p.title}</h1><p className="mt-2 text-sm text-stone-500">Last updated {fmtDate(p.updatedAt)}</p><div className="mt-10"><Markdown text={p.body} /></div></article>);
}
