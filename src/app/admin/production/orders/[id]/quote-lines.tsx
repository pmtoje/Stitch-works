"use client";
import { useState } from "react";
import { Input } from "@/components/ui";

export function QuoteLines({ initial }: { initial: { garmentType: string; quantity: number }[] }) {
  const [rows, setRows] = useState(initial.map((r, i) => ({ ...r, id: i, unitPrice: 0 })));
  const total = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
  const set = (id: number, k: "garmentType" | "quantity" | "unitPrice", v: string) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: k === "garmentType" ? v : Number(v) || 0 } : r)));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_90px_120px_110px] gap-2 text-xs text-stone-500"><span>Garment</span><span>Qty</span><span>Unit price ₦</span><span className="text-right">Line total</span></div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_90px_120px_110px] items-center gap-2">
          <Input name="lineGarment" value={r.garmentType} onChange={(e) => set(r.id, "garmentType", e.target.value)} className="py-1.5" />
          <Input name="lineQty" value={r.quantity} onChange={(e) => set(r.id, "quantity", e.target.value)} className="py-1.5" />
          <Input name="linePrice" value={r.unitPrice || ""} onChange={(e) => set(r.id, "unitPrice", e.target.value)} className="py-1.5" required />
          <span className="text-right text-sm tabular-nums">₦{(r.quantity * r.unitPrice).toLocaleString()}</span>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" className="text-sm text-forest-700" onClick={() => setRows([...rows, { id: Date.now(), garmentType: "", quantity: 1, unitPrice: 0 }])}>+ Add line</button>
        <span className="text-sm">Garments total: <strong className="tabular-nums">₦{total.toLocaleString()}</strong></span>
      </div>
    </div>
  );
}
