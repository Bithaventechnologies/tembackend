import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Organization",
      slug: "default",
    },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!@#";

  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: "Admin User",
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_adminUserId: { organizationId: org.id, adminUserId: admin.id } },
    update: {},
    create: {
      organizationId: org.id,
      adminUserId: admin.id,
      role: "OWNER",
    },
  });

  const categories = [
    {
      slug: "business-mail",
      name: "Business Mail",
      description: "Professional business communication.",
    },
    {
      slug: "complaint-mail",
      name: "Complaint Mail",
      description: "Customer and client complaint responses.",
    },
    {
      slug: "request-mail",
      name: "Request Mail",
      description: "Formal requests and acknowledgements.",
    },
  ];

  const categoryRecords: Record<string, string> = {};
  for (const cat of categories) {
    const record = await prisma.emailCategory.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: cat.slug } },
      update: {},
      create: {
        organizationId: org.id,
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
      },
    });
    categoryRecords[cat.slug] = record.id;
  }

  await prisma.emailBranding.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      companyName: "Acme Corporation",
      websiteUrl: "https://acme.example.com",
      supportEmail: "support@acme.example.com",
      primaryColor: "#4F46E5",
      secondaryColor: "#111827",
      footerText: "This email was sent by Acme Corporation.",
    },
  });

  const defaultSignature = await prisma.emailSignature.upsert({
    where: { id: "seed-default-signature" },
    update: {},
    create: {
      id: "seed-default-signature",
      organizationId: org.id,
      name: "Default Signature",
      jobTitle: "Customer Success",
      department: "Support",
      email: "support@acme.example.com",
      website: "https://acme.example.com",
      isDefault: true,
    },
  });

  const signatureVersion = await prisma.emailSignatureVersion.create({
    data: {
      signatureId: defaultSignature.id,
      snapshotJson: {
        name: "Default Signature",
        jobTitle: "Customer Success",
        department: "Support",
        email: "support@acme.example.com",
        website: "https://acme.example.com",
      },
      renderedHtml: `<div>Best regards,<br/><strong>Customer Success</strong><br/>Acme Corporation<br/>support@acme.example.com</div>`,
    },
  });

  await prisma.emailSignature.update({
    where: { id: defaultSignature.id },
    data: { currentVersionId: signatureVersion.id },
  });

  const businessTemplate = await prisma.emailTemplate.upsert({
    where: { id: "seed-business-introduction" },
    update: {},
    create: {
      id: "seed-business-introduction",
      organizationId: org.id,
      categoryId: categoryRecords["business-mail"],
      name: "Business Introduction",
      classification: "TRANSACTIONAL",
      status: "ACTIVE",
      createdById: admin.id,
    },
  });

  const businessBlocks = {
    blocks: [
      { type: "heading", id: "h1", level: "h1", text: "Hello {{firstName}}", align: "left" },
      {
        type: "paragraph",
        id: "p1",
        html: "Thank you for connecting with {{company}}. We are excited to work with you.",
        align: "left",
      },
      { type: "button", id: "b1", text: "Get Started", url: "https://acme.example.com", align: "center" },
    ],
  };

  const businessVersion = await prisma.templateVersion.create({
    data: {
      templateId: businessTemplate.id,
      versionNumber: 1,
      subject: "Welcome, {{firstName}}!",
      previewText: "A quick note from Acme Corporation",
      bodyBlocksJson: businessBlocks,
      bodyHtml: "<p>Rendered on demand via the email rendering pipeline.</p>",
      bodyText: "Rendered on demand via the email rendering pipeline.",
    },
  });

  await prisma.emailTemplate.update({
    where: { id: businessTemplate.id },
    data: { currentVersionId: businessVersion.id },
  });

  await prisma.templateVariable.createMany({
    data: [
      { templateId: businessTemplate.id, key: "firstName", label: "First Name", isRequired: true, source: "RECIPIENT" },
      { templateId: businessTemplate.id, key: "company", label: "Company", isRequired: false, source: "RECIPIENT" },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete.");
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
