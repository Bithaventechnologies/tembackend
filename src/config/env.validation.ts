import { z } from "zod";

// Validates presence/shape of required env vars at boot. Placeholder values
// (e.g. re_xxx from .env.example) are accepted here — this only guards
// against missing/malformed config, not against using dev credentials.
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  SESSION_SECRET: z.string().min(1),
  COOKIE_DOMAIN: z.string().min(1).default("localhost"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),

  RESEND_API_KEY: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  RESEND_FROM_NAME: z.string().min(1),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().min(1).default("./storage"),
  STORAGE_PUBLIC_URL: z.string().min(1),
  STORAGE_ENDPOINT: z.string().optional().default(""),
  STORAGE_REGION: z.string().optional().default(""),
  STORAGE_BUCKET: z.string().optional().default(""),
  STORAGE_ACCESS_KEY: z.string().optional().default(""),
  STORAGE_SECRET_KEY: z.string().optional().default(""),

  API_PORT: z.coerce.number().int().positive().optional(),
  API_CORS_ORIGIN: z.string().min(1),

  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  LOGIN_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(10),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(30),

  EMAIL_SEND_CONCURRENCY: z.coerce.number().int().positive().default(5),
  EMAIL_SEND_RATE_PER_SECOND: z.coerce.number().int().positive().default(10),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
