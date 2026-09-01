#!/usr/bin/env node
/**
 * Sends the daily digest by poking the running app.
 *
 * Cron (weekdays at 7:15am):
 *   15 7 * * 1-5  cd "/path/to/stem hub" && /usr/bin/env node scripts/digest.mjs >> data/digest.log 2>&1
 */
const url = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.DIGEST_SECRET;

const res = await fetch(`${url}/api/digest`, {
  method: "POST",
  headers: secret ? { "x-digest-secret": secret } : {},
});

const body = await res.text();
console.log(`[${new Date().toISOString()}] ${res.status} ${body}`);
process.exit(res.ok ? 0 : 1);
