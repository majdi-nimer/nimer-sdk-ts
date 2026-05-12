/**
 * Basic example: chat completion + streaming. Run with:
 *
 *   NIMER_API_KEY=nm_… npx tsx examples/basic.ts
 */
import { NimerClient } from "../src/index.js";

const client = new NimerClient();

async function main() {
  console.log("→ Sync chat\n");
  const reply = await client.chat.createText([
    { role: "user", content: "Give me a one-sentence pitch for an AI gateway." },
  ]);
  console.log(reply);

  console.log("\n→ Streaming chat\n");
  for await (const chunk of client.chat.streamText({
    messages: [{ role: "user", content: "Write a haiku about MENA tech." }],
  })) {
    process.stdout.write(chunk);
  }
  process.stdout.write("\n");

  console.log("\n→ Account\n");
  const account = await client.account.get();
  console.log({
    plan: account.plan,
    halal: account.halal_mode,
    trial: account.trial_state?.status,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
