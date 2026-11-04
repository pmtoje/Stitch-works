"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, clientIp } from "@/lib/auth/session";
import { safeAction, str, optStr, int, optInt, list, files, date } from "@/lib/action";
import { submitBulkOrder } from "@/lib/production/orders";
import { submitTailorApplication } from "@/lib/tailors/service";
import { submitStudentApplication } from "@/lib/academy/service";
import { saveUploads } from "@/lib/uploads";
import { createUser, issueToken } from "@/lib/auth/service";
import { enforceRateLimit } from "@/lib/ratelimit";
import { notify, notifyStaff, kickDispatch } from "@/lib/notifications";
import { makeReference } from "@/lib/references";
import { AppError } from "@/lib/errors";
import type { EnquiryCategory, OrganisationType } from "@prisma/client";

const phone = z.string().regex(/^\+?[0-9 ()-]{10,18}$/, "Enter a valid phone number.");

/** Signed-in user, or (for guests) a new account created from the form so they can track the request. */
async function resolveRequester(email: string, fullName: string, ph: string) {
  const u = await getCurrentUser();
  if (u) return { userId: u.id, created: false };
  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new AppError("An account already exists for this email. Please sign in first so the request is linked to your account.");
  const user = await createUser({ email, fullName, phone: ph });
  const token = await issueToken(user.id, "ACCOUNT_SETUP", 60 * 24 * 7);
  await notify({ userId: user.id, kind: "auth.setup", title: "Set up your StitchWorks account", body: "We've created a StitchWorks account so you can track your request, review quotations and make payments. Choose a password to get started.", link: `/reset-password?token=${token}`, channels: ["EMAIL"] });
  return { userId: user.id, created: true };
}

const bulkSchema = z.object({
  orgName: z.string().min(2, "Enter the organisation or business name.").max(160),
  orgType: z.string(),
  contactName: z.string().min(2, "Enter the contact person's name.").max(120),
  email: z.string().email("Enter a valid email address."),
  phone,
  address: z.string().min(3, "Enter the organisation address.").max(300),
  description: z.string().min(10, "Describe the garments you need.").max(4000),
  deliveryLocation: z.string().min(2, "Enter the delivery location.").max(300),
  sizes: z.string().min(1, "List the sizes required.").max(500),
});

export const bulkOrderAction = safeAction(async (_s: unknown, fd: FormData) => {
  await enforceRateLimit(`bulk:${await clientIp()}`, 10, 3600);
  const base = bulkSchema.parse({ orgName: str(fd, "orgName"), orgType: str(fd, "orgType"), contactName: str(fd, "contactName"), email: str(fd, "email"), phone: str(fd, "phone"), address: str(fd, "address"), description: str(fd, "description"), deliveryLocation: str(fd, "deliveryLocation"), sizes: str(fd, "sizes") });
  const garments = list(fd, "garmentType");
  const qtys = fd.getAll("quantity").map((q) => Number(String(q).replace(/,/g, "")));
  const items = garments.map((g, i) => ({ garmentType: g.slice(0, 80), quantity: Math.round(qtys[i]) })).filter((i) => i.garmentType);
  if (!items.length) throw new AppError("Add at least one garment type and quantity.");
  if (items.some((i) => !Number.isFinite(i.quantity) || i.quantity < 1)) throw new AppError("Enter a quantity for each garment type.");
  const fileList = files(fd, "files");
  const { userId } = await resolveRequester(base.email, base.contactName, base.phone);
  const uploads = await saveUploads(fileList, { ownerId: userId, purpose: "BULK_ORDER" }, 10);
  const order = await submitBulkOrder(userId, {
    ...base,
    orgType: (base.orgType || "OTHER") as OrganisationType,
    items,
    designsCount: Math.max(int(fd, "designsCount") || 1, 1),
    fabricRequirements: optStr(fd, "fabricRequirements"),
    colours: optStr(fd, "colours"),
    branding: optStr(fd, "branding"),
    embroidery: optStr(fd, "embroidery"),
    printing: optStr(fd, "printing"),
    requiredBy: date(fd, "requiredBy"),
    instructions: optStr(fd, "instructions"),
    budget: optInt(fd, "budget"),
    fabricSource: (["CUSTOMER", "STITCHWORKS"].includes(str(fd, "fabricSource")) ? str(fd, "fabricSource") : "UNDECIDED") as "CUSTOMER" | "STITCHWORKS" | "UNDECIDED",
    uploadIds: uploads.map((u) => u.id),
  });
  kickDispatch();
  redirect(`/bulk-production/submitted?ref=${order.reference}`);
});

export const tailorApplicationAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await getCurrentUser();
  if (!u) throw new AppError("Please sign in or create an account to apply.");
  await enforceRateLimit(`tailor-app:${u.id}`, 5, 3600);
  const v = z.object({ fullName: z.string().min(2), phone, email: z.string().email(), address: z.string().min(3), state: z.string().min(2, "Select your state."), lga: z.string().min(2, "Enter your Local Government Area."), previousWork: z.string().min(10, "Tell us about your previous work."), workingArrangement: z.string().min(2) }).parse({
    fullName: str(fd, "fullName"), phone: str(fd, "phone"), email: str(fd, "email"), address: str(fd, "address"), state: str(fd, "state"), lga: str(fd, "lga"), previousWork: str(fd, "previousWork"), workingArrangement: str(fd, "workingArrangement"),
  });
  const years = int(fd, "yearsExperience");
  if (!Number.isFinite(years) || years < 0 || years > 70) throw new AppError("Enter your years of experience.");
  const portfolio = files(fd, "portfolio");
  if (!portfolio.length) throw new AppError("Upload at least one photo of your work.");
  const uploads = [
    ...(await saveUploads(portfolio, { ownerId: u.id, purpose: "PORTFOLIO" }, 10)),
    ...(await saveUploads(files(fd, "certificates"), { ownerId: u.id, purpose: "APPLICATION" }, 5)),
  ];
  await submitTailorApplication(u.actor, {
    ...v,
    dateOfBirth: date(fd, "dateOfBirth"),
    yearsExperience: years,
    specialisations: list(fd, "specialisations"),
    garmentTypes: str(fd, "garmentTypes").split(",").map((s) => s.trim()).filter(Boolean),
    machineSkills: list(fd, "machineSkills"),
    interests: list(fd, "interests"),
    references: optStr(fd, "references"),
    preferredFacilityId: optStr(fd, "facilityId") ?? null,
    uploadIds: uploads.map((x) => x.id),
  });
  kickDispatch();
  redirect("/dashboard/application");
});

export const studentApplicationAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await getCurrentUser();
  if (!u) throw new AppError("Please sign in or create an account to apply.");
  await enforceRateLimit(`student-app:${u.id}`, 10, 3600);
  const v = z.object({ fullName: z.string().min(2), phone, email: z.string().email(), address: z.string().min(3), education: z.string().min(2, "Tell us your highest level of education."), experience: z.string().min(1, "Tell us about any sewing experience (or 'None')."), motivation: z.string().min(10, "Tell us briefly why you want to take this course.") }).parse({
    fullName: str(fd, "fullName"), phone: str(fd, "phone"), email: str(fd, "email"), address: str(fd, "address"), education: str(fd, "education"), experience: str(fd, "experience"), motivation: str(fd, "motivation"),
  });
  const uploads = await saveUploads(files(fd, "documents"), { ownerId: u.id, purpose: "APPLICATION" }, 5);
  await submitStudentApplication(u.actor, str(fd, "sessionId"), { ...v, dateOfBirth: date(fd, "dateOfBirth"), uploadIds: uploads.map((x) => x.id) });
  kickDispatch();
  redirect("/dashboard/academy");
});

const CATS: EnquiryCategory[] = ["WORKSPACE_BOOKING", "BULK_PRODUCTION", "TAILOR_REGISTRATION", "ACADEMY", "PARTNERSHIP", "GENERAL"];
export const enquiryAction = safeAction(async (_s: unknown, fd: FormData) => {
  if (str(fd, "website")) return { message: "Thank you." }; // honeypot
  await enforceRateLimit(`enquiry:${await clientIp()}`, 5, 3600);
  const v = z.object({ name: z.string().min(2, "Enter your name.").max(120), email: z.string().email("Enter a valid email."), message: z.string().min(10, "Please write a little more.").max(4000) }).parse({ name: str(fd, "name"), email: str(fd, "email"), message: str(fd, "message") });
  const category = (CATS.includes(str(fd, "category") as EnquiryCategory) ? str(fd, "category") : "GENERAL") as EnquiryCategory;
  const e = await db.enquiry.create({ data: { ...v, category, phone: optStr(fd, "phone") ?? null, company: optStr(fd, "company") ?? null, reference: await makeReference("ENQ", db) } });
  await notify({ email: v.email, kind: "enquiry.received", title: `We've received your enquiry (${e.reference})`, body: `Thank you, ${v.name}. A member of the StitchWorks team will respond shortly.`, channels: ["EMAIL"] });
  await notifyStaff(category === "ACADEMY" ? ["ACADEMY_ADMIN"] : category === "BULK_PRODUCTION" ? ["PRODUCTION_MANAGER"] : ["FACILITY_MANAGER"], { kind: "enquiry.new", title: `New enquiry ${e.reference}`, body: `${v.name}: ${v.message.slice(0, 200)}`, link: "/admin/enquiries" });
  kickDispatch();
  return { message: `Thank you — your enquiry ${e.reference} has been received. We usually reply within one working day.` };
});
