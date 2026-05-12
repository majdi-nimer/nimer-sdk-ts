/**
 * Minimal Node webhook receiver. Verifies the HMAC-SHA256 signature Nimer
 * attaches in `X-Nimer-Signature` before processing the event.
 *
 * Run with:
 *   NIMER_WEBHOOK_SECRET=whsec_… npx tsx examples/webhook-server.ts
 */
import { createServer } from "node:http";
import { verifyWebhookSignature } from "../src/index.js";

const secret = process.env.NIMER_WEBHOOK_SECRET;
if (!secret) throw new Error("Set NIMER_WEBHOOK_SECRET in the environment");

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/nimer-events") {
    res.statusCode = 404;
    return res.end();
  }
  let body = "";
  for await (const chunk of req) body += chunk;

  const ok = await verifyWebhookSignature({
    payload: body,
    header: req.headers["x-nimer-signature"],
    secret,
  });
  if (!ok) {
    res.statusCode = 401;
    return res.end("invalid signature");
  }
  const event = JSON.parse(body);
  console.log("[event]", event.type ?? event.event, event);

  res.statusCode = 204;
  res.end();
});

server.listen(3030, () => {
  console.log("Listening on http://localhost:3030/nimer-events");
});
