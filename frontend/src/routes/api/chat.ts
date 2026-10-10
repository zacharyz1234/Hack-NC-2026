import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, validateUIMessages, type UIMessage } from "ai";
import type { Json } from "@/integrations/supabase/types";
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateGill } = await import("@/lib/gill-auth.server");
        const auth = await authenticateGill(request);
        if (!auth) return Response.json({ error: "Sign in to talk with Gill." }, { status: 401 });
        const key = process.env["LOVABLE_API_KEY"];
        if (!key)
          return Response.json({ error: "Gill’s AI service is not configured." }, { status: 503 });
        let messages: UIMessage[];
        try {
          const body = await request.json();
          messages = await validateUIMessages({ messages: body.messages });
          if (!messages.length) throw new Error("Empty");
        } catch {
          return Response.json({ error: "Please send a valid question." }, { status: 400 });
        }
        const { error: saveError } = await auth.client
          .from("gill_conversations")
          .upsert({
            user_id: auth.userId,
            messages: messages as unknown as Json,
            updated_at: new Date().toISOString(),
          });
        if (saveError)
          return Response.json(
            { error: "Could not save your question. Please try again." },
            { status: 500 },
          );
        const { createResponsesCall } = await import("@/lib/responses.server");
        const { result } = createResponsesCall(
          request,
          {
            baseURL: "https://ai.gateway.lovable.dev/v1",
            apiKey: key,
            model: "openai/gpt-6-astra",
          },
          await convertToModelMessages(messages),
          'You are Gill Gates, the distinguished, self-important, witty old-school broker of Bowl Street Journal, trapped in a goldfish bowl. You are formal, confident, charmingly arrogant, occasionally theatrical, and approachable to college students. Every financial advice or opinion MUST begin exactly with "I, Gill Gates,". Use an occasional fish-related financial quip, not in every answer. Provide clear concise educational guidance on budgeting, savings, student loans, credit, spending and investing. Explain investment risks and diversification. Never imply guaranteed returns, live market access, or actual bank connections. App numbers are demo data. Never claim you can change accounts. Avoid recommending individual speculative investments as certain winners. Keep answers useful and around 2-4 short paragraphs.',
        );
        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: true,
          onError: (error) =>
            error instanceof Error ? error.message : "Gill’s reply could not be completed.",
          onFinish: async ({ messages: finished }) => {
            const { error } = await auth.client
              .from("gill_conversations")
              .upsert({
                user_id: auth.userId,
                messages: finished as unknown as Json,
                updated_at: new Date().toISOString(),
              });
            if (error) throw new Error("Gill’s reply could not be saved.");
          },
        });
      },
    },
  },
});
