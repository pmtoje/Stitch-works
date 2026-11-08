import type { InvoicePurpose, Prisma } from "@prisma/client";
import { type Tx } from "../db";
import { makeReference } from "../references";

export async function createInvoice(
  tx: Tx,
  data: { userId: string; purpose: InvoicePurpose; description: string; amount: number; dueDate?: Date | null } & Partial<
    Pick<Prisma.InvoiceUncheckedCreateInput, "bookingId" | "membershipId" | "bulkOrderId" | "enrolmentId" | "studentApplicationId">
  >,
) {
  const number = await makeReference("INV", tx);
  return tx.invoice.create({ data: { ...data, number, status: data.amount === 0 ? "PAID" : "ISSUED" } });
}

export const outstanding = (inv: { amount: number; amountPaid: number }) => Math.max(inv.amount - inv.amountPaid, 0);
