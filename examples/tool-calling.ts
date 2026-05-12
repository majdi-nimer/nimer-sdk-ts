/**
 * Function-calling example (F8). Run with:
 *   NIMER_API_KEY=nm_… npx tsx examples/tool-calling.ts
 *
 * Sends a tool definition in OpenAI shape and follows the model's tool call.
 */
import { NimerClient } from "../src/index.js";

const client = new NimerClient();

async function getWeather(city: string): Promise<string> {
  return `It's 35°C and sunny in ${city}.`;
}

async function main() {
  const first = await client.chat.create({
    messages: [
      { role: "user", content: "What's the weather in Riyadh right now?" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Returns the current weather for a city.",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });

  if (first.mode !== "auto" || !first.tool_calls?.length) {
    console.log(first.mode === "auto" ? first.content : "No tool calls.");
    return;
  }

  for (const call of first.tool_calls) {
    const name = call.function?.name;
    const args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    if (name === "get_weather" && typeof args.city === "string") {
      const result = await getWeather(args.city);
      console.log("tool result:", result);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
