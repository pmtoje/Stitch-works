import { getImageSlot } from "@/lib/cms";
import { cx } from "./index";

/**
 * Art-directed photo slot. Shows the photograph uploaded for `slot` in the CMS;
 * until StitchWorks uploads its own photography, renders a clearly-labelled
 * placeholder describing the intended shot (we never pass off stock as the facility).
 */
export async function ImageSlot({ slot, brief, className, tone = "forest", priority }: { slot: string; brief: string; className?: string; tone?: "forest" | "charcoal" | "ochre" | "cream"; priority?: boolean }) {
  const src = await getImageSlot(slot);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={brief} loading={priority ? "eager" : "lazy"} className={cx("h-full w-full object-cover", className)} />;
  }
  const bg = { forest: "bg-forest-800 text-forest-200", charcoal: "bg-charcoal-800 text-stone-400", ochre: "bg-ochre-600 text-ochre-300", cream: "bg-cream-200 text-stone-500" }[tone];
  return (
    <div role="img" aria-label={`Placeholder for photograph: ${brief}`} className={cx("relative h-full w-full overflow-hidden", bg, className)}>
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
        <defs>
          <pattern id={`weave-${slot}`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="18" stroke="currentColor" strokeWidth="1" strokeDasharray="5 4" />
            <line x1="9" y1="0" x2="9" y2="18" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#weave-${slot})`} />
      </svg>
      <svg className="absolute -right-10 -top-10 h-64 w-64 opacity-20" viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="6 5" />
        <circle cx="100" cy="100" r="56" fill="none" stroke="currentColor" strokeWidth="0.75" />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-4 p-4">
        <p className="max-w-[80%] font-mono text-[10px] uppercase leading-relaxed tracking-wider opacity-80">Photograph · {brief}</p>
        <span className="font-mono text-[10px] opacity-60">{slot}</span>
      </div>
    </div>
  );
}
