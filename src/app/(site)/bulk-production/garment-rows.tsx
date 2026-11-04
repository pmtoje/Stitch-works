"use client";
import { useState } from "react";
import { Input } from "@/components/ui";

export function GarmentRows() {
  const [rows, setRows] = useState([0]);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r} className="grid grid-cols-[1fr_120px_auto] gap-2">
          <Input name="garmentType" placeholder="e.g. Short-sleeve shirt" aria-label={`Garment type ${i + 1}`} required={i === 0} list="garment-suggestions" />
          <Input name="quantity" type="number" min={1} placeholder="Qty" aria-label={`Quantity ${i + 1}`} required={i === 0} />
          <button type="button" className="h-11 w-11 border border-charcoal-900/15 text-stone-500 hover:text-red-700 disabled:opacity-30" disabled={rows.length === 1} onClick={() => setRows(rows.filter((x) => x !== r))} aria-label="Remove garment">×</button>
        </div>
      ))}
      <datalist id="garment-suggestions">
        {["Shirt", "Trousers", "Skirt", "Pinafore", "Blazer", "Polo shirt", "T-shirt", "Coverall", "Lab coat", "Chef jacket", "Apron", "Security uniform", "Scrubs", "Kaftan", "Gown"].map((g) => <option key={g} value={g} />)}
      </datalist>
      <button type="button" onClick={() => setRows([...rows, Math.max(...rows) + 1])} className="text-sm font-medium text-forest-700 hover:underline">+ Add another garment type</button>
    </div>
  );
}
