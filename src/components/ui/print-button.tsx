"use client";
import { buttonClass } from "./index";
export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className={buttonClass("secondary")}>{label}</button>;
}
