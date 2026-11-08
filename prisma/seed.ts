/**
 * Seed data.
 *   - Always: equipment categories, CMS defaults, policies, FAQs, the super admin.
 *   - SEED_DEMO=true (default in development): a sample Jos facility, inventory, rate cards,
 *     membership plans, Academy programmes and one demo account per role so every workflow
 *     can be exercised. All demo prices are placeholders for management to replace in the admin.
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DEMO = (process.env.SEED_DEMO ?? (process.env.NODE_ENV === "production" ? "false" : "true")) === "true";
// Locally a known default is convenient; on hosted/production builds a password must be supplied.
const HOSTED = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? (HOSTED ? null : "StitchWorks2026!");

const CATEGORIES = [
  ["industrial-straight-stitch", "Industrial straight-stitch machines", "Lockstitch machines for seams and topstitching."],
  ["overlock", "Overlocking machines", "3/4/5-thread overlockers for seam finishing."],
  ["coverstitch", "Coverstitch machines", "Hems and stretch-fabric finishing."],
  ["buttonhole", "Buttonhole machines", "Automatic buttonhole sewing."],
  ["button-attaching", "Button-attaching machines", "Automatic button sewing."],
  ["cutting-machine", "Industrial cutting machines", "Straight-knife and band cutting machines."],
  ["embroidery", "Embroidery machines", "Computerised embroidery for logos and branding."],
  ["pressing", "Steam irons and pressing equipment", "Industrial steam irons, vacuum tables and presses."],
  ["cutting-table", "Cutting tables", "Large-format tables for laying and cutting fabric."],
];

async function user(email: string, fullName: string, roles: Role[], phone?: string, facilityId?: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  return db.user.create({
    data: {
      email,
      fullName,
      phone,
      emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash(DEMO_PASSWORD!, 12),
      roles: { create: roles.map((role) => ({ role, facilityId: role === "FACILITY_MANAGER" ? facilityId ?? null : null })) },
    },
  });
}

async function main() {
  for (const [i, [slug, name, description]] of CATEGORIES.entries()) {
    await db.equipmentCategory.upsert({ where: { slug }, create: { slug, name, description, sortOrder: i }, update: {} });
  }

  const policies = [
    ["terms", "Terms of Use", "These terms govern use of the StitchWorks Collective platform and facilities.\n\nManagement should replace this text with the approved terms of use."],
    ["privacy", "Privacy Policy", "StitchWorks Collective collects only the personal information needed to provide bookings, production services, memberships and training, and processes it in line with the Nigeria Data Protection Act 2023.\n\nWe never store payment card details; card payments are processed by our licensed payment partner.\n\nManagement should replace this text with the approved privacy policy."],
    ["booking", "Booking & Cancellation Policy", "Bookings are confirmed once the required payment is received or the booking is approved by the facility manager.\n\nUnpaid reservations are held for a limited time and then released.\n\nCancellations made before the facility's free-cancellation window are refunded in full. Late cancellations are refunded the security deposit only.\n\nRescheduling is available online up to the same window before the start time."],
    ["refunds", "Refund Policy", "Approved refunds are processed by the finance team to the original payment method or by bank transfer, typically within 10 working days."],
  ];
  for (const [slug, title, body] of policies) await db.policy.upsert({ where: { slug }, create: { slug, title, body }, update: {} });

  const faqs = [
    ["Workspace booking", "Can I book more than one machine at once?", "Yes. A single reservation can include several workstations and machines — for example two straight-stitch machines, an overlocker and a cutting table — for the same time period."],
    ["Workspace booking", "Can I book for a full day or several days?", "Yes. Choose hourly, half day, full day or multi-day when booking. Multi-day bookings cover consecutive operating days."],
    ["Workspace booking", "When is my booking confirmed?", "As soon as your payment is verified (or, where the facility requires it, once the manager approves the booking). You will receive a confirmation email."],
    ["Bulk production", "What is the minimum order for bulk production?", "We accept production contracts of different sizes. Submit your request and we will advise on the best approach and price."],
    ["Bulk production", "Can I supply my own fabric?", "Yes. Tell us in your request whether you will provide fabric or would like StitchWorks to source it."],
    ["Tailors", "Who can join the StitchWorks tailor network?", "Experienced tailors, garment makers and fashion designers. Every applicant completes a practical assessment before approval."],
    ["Academy", "Do Academy programmes include certificates?", "Yes. Students who complete and pass their programme receive a certificate with a unique verification ID that anyone can check on our website."],
  ];
  if ((await db.faq.count()) === 0) for (const [i, [category, question, answer]] of faqs.entries()) await db.faq.create({ data: { category, question, answer, sortOrder: i } });

  if (DEMO_PASSWORD) await user(process.env.SEED_ADMIN_EMAIL ?? "admin@stitchworks.ng", "StitchWorks Administrator", ["SUPER_ADMIN"]);
  else console.warn("! SEED_DEMO_PASSWORD not set: the administrator account was not created. Set it and redeploy to create it.");

  if (!DEMO) return console.log("Seeded base data (SEED_DEMO=false).");

  const operatingHours = { mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["08:00", "18:00"], thu: ["08:00", "18:00"], fri: ["08:00", "18:00"], sat: ["09:00", "15:00"], sun: null };
  const jos = await db.facility.upsert({
    where: { slug: "jos-cfc" },
    create: { slug: "jos-cfc", name: "Jos Common Facility Centre", address: "Address to be confirmed by management", city: "Jos", state: "Plateau", operatingHours, cancellationHours: 24, paymentHoldMinutes: 30, maxConsecutiveDays: 7, maxAdvanceDays: 60 },
    update: {},
  });

  const cats = await db.equipmentCategory.findMany();
  const cat = (slug: string) => cats.find((c) => c.slug === slug)!;
  // Placeholder rates (₦) — replace in Admin → Facilities → Rate cards.
  const rates: Record<string, [number, number, number, number, number]> = {
    "industrial-straight-stitch": [800, 3000, 5500, 5000, 0],
    overlock: [900, 3500, 6500, 6000, 0],
    coverstitch: [1000, 4000, 7000, 6500, 0],
    buttonhole: [1200, 4500, 8000, 7500, 5000],
    "button-attaching": [1000, 4000, 7000, 6500, 5000],
    "cutting-machine": [1500, 5500, 10000, 9000, 10000],
    embroidery: [3000, 11000, 20000, 18000, 20000],
    pressing: [500, 1800, 3200, 3000, 0],
    "cutting-table": [500, 1800, 3200, 3000, 0],
  };
  for (const [slug, [h, hd, fd, md, dep]] of Object.entries(rates)) {
    await db.rateCard.upsert({ where: { facilityId_categoryId: { facilityId: jos.id, categoryId: cat(slug).id } }, create: { facilityId: jos.id, categoryId: cat(slug).id, hourlyRate: h, halfDayRate: hd, fullDayRate: fd, multiDayRate: md, securityDeposit: dep }, update: {} });
  }
  const singular: Record<string, string> = { "industrial-straight-stitch": "Straight-stitch", overlock: "Overlocker", coverstitch: "Coverstitch", buttonhole: "Buttonholer", "button-attaching": "Button attacher", "cutting-machine": "Straight-knife cutter", pressing: "Steam press", "cutting-table": "Cutting table" };
  const inventory: [string, string, number, string?][] = [
    ["industrial-straight-stitch", "SS", 6, "Juki DDL-8700"],
    ["overlock", "OL", 3, "Juki MO-6814S"],
    ["coverstitch", "CS", 1],
    ["buttonhole", "BH", 1],
    ["button-attaching", "BA", 1],
    ["cutting-machine", "CM", 1],
    ["pressing", "PR", 2],
    ["cutting-table", "CT", 2],
  ];
  for (const [slug, code, n, model] of inventory) {
    for (let i = 1; i <= n; i++) {
      const assetTag = `SW-JOS-${code}-${String(i).padStart(3, "0")}`;
      await db.equipment.upsert({ where: { assetTag }, create: { assetTag, name: `${singular[slug]} ${String(i).padStart(2, "0")}`, categoryId: cat(slug).id, facilityId: jos.id, model: model ?? null, condition: "GOOD" }, update: {} });
    }
  }
  for (let i = 1; i <= 4; i++) {
    await db.workstation.upsert({ where: { facilityId_code: { facilityId: jos.id, code: `WS-${String(i).padStart(2, "0")}` } }, create: { facilityId: jos.id, code: `WS-${String(i).padStart(2, "0")}`, name: `Workstation ${i}`, description: "Bench with task lighting, storage and power", hourlyRate: 500, halfDayRate: 1800, fullDayRate: 3000, multiDayRate: 2700 }, update: {} });
  }

  const plans = [
    { slug: "individual", name: "Individual Tailor", description: "For independent tailors who use the facility regularly.", fee: 10000, validityDays: 30, benefits: ["Member rates on all equipment", "Locker access", "Monthly skills clinic"], workspaceAccess: "Book any workstation during operating hours", machineAccess: "All standard machines", bookingDiscountPct: 10, productionEligible: false, audience: "TAILOR", sortOrder: 1 },
    { slug: "professional", name: "Professional", description: "For established tailors who want production contracts.", fee: 25000, validityDays: 30, benefits: ["Everything in Individual", "Eligible for paid production jobs", "Priority booking", "Profile in the tailor directory"], workspaceAccess: "Priority booking of workstations", machineAccess: "All machines including specialist equipment", bookingDiscountPct: 20, productionEligible: true, audience: "TAILOR", sortOrder: 2 },
    { slug: "business", name: "Business / Production Partner", description: "For small fashion businesses and production teams.", fee: 75000, validityDays: 30, benefits: ["Up to 5 team members", "Production line reservations", "Dedicated account manager"], workspaceAccess: "Reserved line booking", machineAccess: "All machines", bookingDiscountPct: 25, productionEligible: true, audience: "BUSINESS", sortOrder: 3 },
    { slug: "student", name: "Student", description: "Practice time for current Academy students.", fee: 5000, validityDays: 30, benefits: ["Discounted practice sessions", "Access to learning resources"], workspaceAccess: "Off-peak practice sessions", machineAccess: "Standard machines", bookingDiscountPct: 30, productionEligible: false, audience: "STUDENT", sortOrder: 4 },
  ];
  for (const p of plans) await db.membershipPlan.upsert({ where: { slug: p.slug }, create: p, update: {} });

  const fm = await user("facility@stitchworks.ng", "Facility Manager (Demo)", ["FACILITY_MANAGER"], "+2348000000001", jos.id);
  await user("production@stitchworks.ng", "Production Manager (Demo)", ["PRODUCTION_MANAGER"], "+2348000000002");
  await user("finance@stitchworks.ng", "Finance Officer (Demo)", ["FINANCE_OFFICER"]);
  await user("qc@stitchworks.ng", "QC Officer (Demo)", ["QC_OFFICER"]);
  await user("academy@stitchworks.ng", "Academy Administrator (Demo)", ["ACADEMY_ADMIN"]);
  const instructorUser = await user("instructor@stitchworks.ng", "Instructor (Demo)", ["INSTRUCTOR"]);
  await user("customer@example.com", "Demo Customer", ["CUSTOMER"], "+2348000000010");
  const tailorUser = await user("tailor@example.com", "Demo Tailor", ["CUSTOMER", "TAILOR"], "+2348000000011");
  await user("student@example.com", "Demo Student", ["CUSTOMER", "STUDENT"]);
  void fm;

  if (!(await db.tailor.findUnique({ where: { userId: tailorUser.id } }))) {
    await db.counter.upsert({ where: { key: "TAILOR" }, create: { key: "TAILOR", value: 1 }, update: { value: { increment: 1 } } });
    const n = (await db.counter.findUnique({ where: { key: "TAILOR" } }))!.value;
    await db.tailor.create({ data: { code: `SW-T-${String(n).padStart(4, "0")}`, userId: tailorUser.id, facilityId: jos.id, yearsExperience: 8, specialisations: ["Shirts", "Uniforms"], machineSkills: ["Industrial straight-stitch", "Overlock"], verification: "VERIFIED", bio: "Demo tailor account for testing workflows." } });
  }

  const instructor = await db.instructor.upsert({ where: { userId: instructorUser.id }, create: { userId: instructorUser.id, title: "Lead Instructor", specialisms: ["Garment construction", "Pattern drafting"] }, update: {} });

  const courses = [
    ["introduction-to-tailoring", "Introduction to Tailoring", "Foundation", 4, 60000, "Hand stitches, machine threading, measurements and your first simple garment."],
    ["basic-garment-construction", "Basic Garment Construction", "Foundation", 8, 120000, "Construct skirts, trousers and shirts from commercial patterns with clean seams and finishes."],
    ["advanced-garment-construction", "Advanced Garment Construction", "Advanced", 10, 180000, "Tailored jackets, linings, structured collars and complex closures."],
    ["pattern-drafting-and-cutting", "Pattern Drafting and Cutting", "Intermediate", 8, 150000, "Draft blocks from measurements, grade sizes and lay out efficient cutting plans."],
    ["industrial-sewing-machine-operation", "Industrial Sewing Machine Operation", "Foundation", 4, 80000, "Safe, fast and accurate operation of straight-stitch, overlock and coverstitch machines."],
    ["fashion-design-and-illustration", "Fashion Design and Illustration", "Intermediate", 8, 140000, "Develop a collection from research to technical flats and presentation boards."],
    ["garment-finishing", "Garment Finishing", "Intermediate", 4, 70000, "Pressing, buttonholes, hems, trims and finishing to commercial standard."],
    ["fashion-entrepreneurship", "Fashion Entrepreneurship", "Professional", 6, 90000, "Costing, pricing, customer acquisition, records and growing a tailoring business."],
    ["commercial-garment-production", "Commercial Garment Production", "Professional", 8, 160000, "Line balancing, bundle systems, piece-rate work and meeting production deadlines."],
    ["quality-control-and-production-management", "Quality Control and Production Management", "Professional", 6, 130000, "Inspection standards, defect classification, rework flow and production planning."],
  ] as const;
  for (const [i, [slug, title, level, weeks, fee, summary]] of courses.entries()) {
    const c = await db.course.upsert({
      where: { slug },
      create: {
        slug,
        title,
        summary,
        description: `${summary} This programme is delivered in person at the StitchWorks Common Facility Centre, combining instructor demonstrations with supervised practice on industrial equipment. Course details are sample content for management to review.`,
        level,
        durationWeeks: weeks,
        objectives: ["Work safely and confidently on industrial equipment", "Apply professional construction and finishing standards", "Complete a practical portfolio piece assessed by an instructor"],
        requirements: ["Minimum age 16", "Basic literacy and numeracy", level === "Foundation" ? "No prior experience required" : "Completion of a foundation course or equivalent experience"],
        outline: Array.from({ length: Math.min(weeks, 6) }, (_, w) => ({ title: `Module ${w + 1}`, topics: ["Demonstration", "Supervised practice", "Review"] })),
        format: "In-person · weekday mornings",
        fee,
        applicationFee: 5000,
        certification: "StitchWorks Academy Certificate with a unique online verification ID.",
        instructorId: instructor.id,
        published: true,
        sortOrder: i,
      },
      update: {},
    });
    if ((await db.courseSession.count({ where: { courseId: c.id } })) === 0) {
      const start = new Date(Date.UTC(2027, 0, 11 + i));
      await db.courseSession.create({
        data: { courseId: c.id, facilityId: jos.id, name: "January 2027 cohort", startsOn: start, endsOn: new Date(start.getTime() + weeks * 7 * 86_400_000), schedule: "Mon · Wed · Fri, 9:00–13:00", applicationDeadline: new Date(start.getTime() - 7 * 86_400_000), capacity: 16, instructorId: instructor.id },
      });
    }
  }

  if ((await db.blogPost.count()) === 0) {
    await db.blogPost.create({
      data: {
        slug: "what-is-a-common-facility-centre",
        title: "What is a Common Facility Centre — and why does it matter for Nigerian tailors?",
        excerpt: "Shared infrastructure lets skilled artisans access industrial equipment and production work without the cost of running a factory alone.",
        body: "A Common Facility Centre (CFC) is a shared production space equipped with machinery that individual artisans could rarely afford on their own.\n\n## Shared equipment, lower costs\nInstead of each tailor buying an industrial overlocker or buttonhole machine, members book time on professionally maintained equipment.\n\n## Access to larger contracts\nBy pooling capacity, a CFC can accept bulk orders — school uniforms, corporate wear — and allocate the work across many tailors, with quality control at every stage.\n\n## A pathway into the trade\nTraining delivered inside a working facility means learners practise on the same machines used in production.",
        category: "Garment manufacturing",
        authorName: "StitchWorks Collective",
        published: true,
        publishedAt: new Date(),
      },
    });
  }
  console.log(process.env.SEED_DEMO_PASSWORD ? "Seeded demo data (accounts use SEED_DEMO_PASSWORD)." : `Seeded demo data. Demo accounts use password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
