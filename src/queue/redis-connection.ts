import type { RedisOptions } from "ioredis";

// BullMQ's `connection` option wants ioredis-style options rather than a
// bare URL, so we parse REDIS_URL once here for both the Nest module and the
// standalone worker process to share.
export function buildRedisConnectionOptions(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const options: RedisOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    maxRetriesPerRequest: null,
  };
  if (url.password) options.password = url.password;
  if (url.username) options.username = url.username;
  const dbPath = url.pathname.replace(/^\//, "");
  if (dbPath) options.db = Number(dbPath);
  if (url.protocol === "rediss:") options.tls = {};
  return options;
}
