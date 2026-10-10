import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateGill } = await import("@/lib/gill-auth.server");
        if (!(await authenticateGill(request)))
          return Response.json({ error: "Sign in for voice playback." }, { status: 401 });
        const key = process.env["ELEVENLABS_API_KEY"];
        if (!key)
          return Response.json({ error: "Voice playback is not connected." }, { status: 503 });
        const { text } = await request.json();
        if (typeof text !== "string" || !text.trim() || text.length > 5000)
          return Response.json(
            { error: "Voice playback accepts up to 5,000 characters." },
            { status: 400 },
          );
        const response = await fetch(
          "https://api.elevenlabs.io/v1/text-to-speech/CwhRBWXzGAHq8TQ4Fs17?output_format=mp3_44100_128",
          {
            method: "POST",
            headers: { "xi-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 1,
                similarity_boost: 0.4,
                style: 0,
                use_speaker_boost: false,
                speed: 0.9,
              },
            }),
            signal: request.signal,
          },
        );
        if (!response.ok) {
          const body = await response.text();
          return Response.json({ error: `Voice service: ${body}` }, { status: response.status });
        }
        return new Response(response.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
