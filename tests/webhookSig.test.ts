import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "../src/webhookSig.js";

const SECRET = "whsec_test_super_secret";
const PAYLOAD = JSON.stringify({ event: "anomaly.detected", id: 42 });

describe("verifyWebhookSignature", () => {
  it("accepts a freshly signed payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload(PAYLOAD, SECRET, now);
    const ok = await verifyWebhookSignature({
      payload: PAYLOAD,
      header,
      secret: SECRET,
      now: () => now * 1000,
    });
    expect(ok).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload(PAYLOAD, SECRET, now);
    const ok = await verifyWebhookSignature({
      payload: PAYLOAD + "x",
      header,
      secret: SECRET,
      now: () => now * 1000,
    });
    expect(ok).toBe(false);
  });

  it("rejects when the secret differs", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload(PAYLOAD, SECRET, now);
    const ok = await verifyWebhookSignature({
      payload: PAYLOAD,
      header,
      secret: "whsec_wrong",
      now: () => now * 1000,
    });
    expect(ok).toBe(false);
  });

  it("rejects timestamps outside the tolerance window", async () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const header = await signWebhookPayload(PAYLOAD, SECRET, tenMinutesAgo);
    const ok = await verifyWebhookSignature({
      payload: PAYLOAD,
      header,
      secret: SECRET,
      toleranceSeconds: 300,
    });
    expect(ok).toBe(false);
  });

  it("accepts old timestamps when tolerance is Infinity", async () => {
    const oneYearAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 365;
    const header = await signWebhookPayload(PAYLOAD, SECRET, oneYearAgo);
    const ok = await verifyWebhookSignature({
      payload: PAYLOAD,
      header,
      secret: SECRET,
      toleranceSeconds: Infinity,
    });
    expect(ok).toBe(true);
  });

  it("rejects malformed header values", async () => {
    for (const bad of ["", "not-a-sig", "t=foo,v1=bar", "v1=onlysig"]) {
      const ok = await verifyWebhookSignature({
        payload: PAYLOAD,
        header: bad,
        secret: SECRET,
      });
      expect(ok).toBe(false);
    }
  });

  it("rejects null/undefined headers", async () => {
    expect(
      await verifyWebhookSignature({ payload: PAYLOAD, header: null, secret: SECRET })
    ).toBe(false);
    expect(
      await verifyWebhookSignature({ payload: PAYLOAD, header: undefined, secret: SECRET })
    ).toBe(false);
  });

  it("accepts Uint8Array payloads", async () => {
    const now = Math.floor(Date.now() / 1000);
    const bytes = new TextEncoder().encode(PAYLOAD);
    const header = await signWebhookPayload(bytes, SECRET, now);
    const ok = await verifyWebhookSignature({
      payload: bytes,
      header,
      secret: SECRET,
      now: () => now * 1000,
    });
    expect(ok).toBe(true);
  });

  it("takes the first value if header is an array (Node.js req.headers shape)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload(PAYLOAD, SECRET, now);
    const ok = await verifyWebhookSignature({
      payload: PAYLOAD,
      header: [header, "extra"],
      secret: SECRET,
      now: () => now * 1000,
    });
    expect(ok).toBe(true);
  });
});

describe("signWebhookPayload", () => {
  it("produces deterministic output for the same inputs", async () => {
    const ts = 1715600000;
    const a = await signWebhookPayload(PAYLOAD, SECRET, ts);
    const b = await signWebhookPayload(PAYLOAD, SECRET, ts);
    expect(a).toBe(b);
    expect(a.startsWith(`t=${ts},v1=`)).toBe(true);
  });

  it("produces different signatures for different payloads", async () => {
    const ts = 1715600000;
    const a = await signWebhookPayload(PAYLOAD, SECRET, ts);
    const b = await signWebhookPayload(PAYLOAD + "x", SECRET, ts);
    expect(a).not.toBe(b);
  });
});
