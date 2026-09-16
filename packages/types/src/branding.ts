import { z } from "zod";

export const socialLinksSchema = z.object({
  twitter: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  facebook: z.string().url().optional(),
  instagram: z.string().url().optional(),
});
export type SocialLinks = z.infer<typeof socialLinksSchema>;

export const updateBrandingSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  supportEmail: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(300).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  footerText: z.string().trim().max(500).optional(),
  socialLinks: socialLinksSchema.optional(),
  logoAssetId: z.string().cuid().optional().nullable(),
});
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

export const createSignatureSchema = z.object({
  name: z.string().trim().min(1).max(200),
  jobTitle: z.string().trim().max(150).optional(),
  department: z.string().trim().max(150).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
  socialLinks: socialLinksSchema.optional(),
  profileImageAssetId: z.string().cuid().optional().nullable(),
  isDefault: z.boolean().default(false),
});
export type CreateSignatureInput = z.infer<typeof createSignatureSchema>;

export const updateSignatureSchema = createSignatureSchema.partial();
export type UpdateSignatureInput = z.infer<typeof updateSignatureSchema>;
