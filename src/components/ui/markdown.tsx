import type { ReactNode } from "react";

/** Minimal, safe Markdown subset for CMS text (headings, lists, paragraphs). No raw HTML is rendered. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const out: ReactNode[] = [];
  blocks.forEach((b, i) => {
    const t = b.trim();
    if (!t) return;
    if (t.startsWith("### ")) out.push(<h3 key={i}>{t.slice(4)}</h3>);
    else if (t.startsWith("## ")) out.push(<h2 key={i}>{t.slice(3)}</h2>);
    else if (/^[-*] /.test(t)) out.push(<ul key={i}>{t.split("\n").map((l, j) => <li key={j}>{l.replace(/^[-*] /, "")}</li>)}</ul>);
    else {
      const lines = t.split("\n");
      if (lines[0].startsWith("## ")) {
        out.push(<h2 key={`${i}h`}>{lines[0].slice(3)}</h2>);
        out.push(<p key={i}>{lines.slice(1).join(" ")}</p>);
      } else out.push(<p key={i}>{lines.join(" ")}</p>);
    }
  });
  return <div className="prose-sw">{out}</div>;
}
