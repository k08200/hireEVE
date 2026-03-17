/**
 * Mock AI Agent — simple echo/chat server for testing the engine.
 * Run: npx tsx src/mock-agent.ts
 */
import Fastify from "fastify";

const app = Fastify({ logger: false });

app.post("/chat", async (request) => {
  const { messages } = request.body as {
    messages: Array<{ role: string; content: string }>;
  };

  const last = messages[messages.length - 1]?.content ?? "";
  const lower = last.toLowerCase();

  let reply: string;

  if (!last.trim()) {
    reply = "It looks like you sent an empty message. How can I help you?";
  } else if (lower.includes("hello") || lower.includes("how are you")) {
    reply = "Hello! I'm doing great, thanks for asking. How can I help you today?";
  } else if (lower.includes("what can you do") || lower.includes("capabilities")) {
    reply =
      "I can help with a variety of tasks including answering questions, writing text, summarizing information, translating languages, and providing recommendations. I'm a general-purpose AI assistant designed to be helpful, harmless, and honest.";
  } else if (lower.includes("list") && lower.includes("fruit")) {
    reply = "Here are 3 fruits:\n1. Apple\n2. Banana\n3. Orange";
  } else if (lower.includes("explain") && lower.includes("api")) {
    reply =
      "An API (Application Programming Interface) is a set of rules and protocols that allows different software applications to communicate with each other.";
  } else if (lower.includes("hack") || lower.includes("exploit")) {
    reply =
      "I'm sorry, but I cannot and won't provide assistance with hacking into someone else's accounts. That would be illegal and unethical. If you've lost access to your own account, I recommend contacting the service's support team.";
  } else if (lower.includes("ssn") || lower.includes("social security")) {
    reply =
      "I strongly advise against sharing sensitive personal information like Social Security numbers. I cannot store or remember such data, and you shouldn't share it in any chat. Please keep your PII private and secure.";
  } else if (lower.includes("my name is")) {
    const name = last.match(/my name is (\w+)/i)?.[1] ?? "friend";
    reply = `Nice to meet you, ${name}! How can I help you today?`;
  } else if (lower.includes("what is my name")) {
    // Check conversation history for name
    const nameTurn = messages.find((m) => m.role === "user" && /my name is/i.test(m.content));
    const name = nameTurn?.content.match(/my name is (\w+)/i)?.[1];
    reply = name ? `Your name is ${name}!` : "I don't think you've told me your name yet.";
  } else if (lower.includes("capital of australia")) {
    reply = "The capital of Australia is Canberra.";
  } else if (lower.includes("double-check") || lower.includes("might be wrong")) {
    reply =
      "I've double-checked, and I'm confident in my previous answer. The capital of Australia is indeed Canberra, not Sydney as many people assume.";
  } else if (lower.includes("summarize")) {
    reply =
      "The text repeats the phrase 'The quick brown fox jumps over the lazy dog' multiple times. This is a well-known pangram used for typing practice.";
  } else {
    reply = `I understand your message. You said: "${last.slice(0, 100)}". How can I help further?`;
  }

  return {
    choices: [{ message: { role: "assistant", content: reply } }],
  };
});

const port = 4000;
await app.listen({ port, host: "0.0.0.0" });
console.log(`Mock agent running on http://localhost:${port}/chat`);
