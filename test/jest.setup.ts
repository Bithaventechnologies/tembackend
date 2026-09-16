// Ensure required env vars are present for unit tests that import ConfigModule
// validation indirectly. Kept minimal — tests should not need live infra.
process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/email_platform_test?schema=public";
process.env.REDIS_URL ||= "redis://localhost:6379";
process.env.SESSION_SECRET ||= "test-session-secret-not-for-prod-use-only";
process.env.RESEND_API_KEY ||= "re_test_key";
process.env.RESEND_WEBHOOK_SECRET ||= "whsec_test_secret";
process.env.RESEND_FROM_EMAIL ||= "no-reply@test.local";
process.env.RESEND_FROM_NAME ||= "Test Co";
process.env.STORAGE_DRIVER ||= "local";
process.env.STORAGE_LOCAL_DIR ||= "./storage-test";
process.env.STORAGE_PUBLIC_URL ||= "http://localhost:4000/uploads";
process.env.API_PORT ||= "4000";
process.env.API_CORS_ORIGIN ||= "http://localhost:3000";
process.env.COOKIE_DOMAIN ||= "localhost";
process.env.COOKIE_SECURE ||= "false";
process.env.LOGIN_RATE_LIMIT_MAX ||= "5";
process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS ||= "900";
process.env.LOGIN_LOCKOUT_THRESHOLD ||= "10";
process.env.LOGIN_LOCKOUT_MINUTES ||= "30";
process.env.EMAIL_SEND_CONCURRENCY ||= "5";
process.env.EMAIL_SEND_RATE_PER_SECOND ||= "10";
