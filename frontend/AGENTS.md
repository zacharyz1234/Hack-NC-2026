<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use domain components for XP windows, finance calculations, market simulation, and Gill chat; keep the demo ledger in React state to separate fictional accounts from future banking integrations.
- Persist the single Gill conversation per authenticated user in the account-owned conversation table; enforce ownership with RLS and server session verification.
- Stream Gill replies through the AI SDK Responses endpoint and compose chat with AI Elements; keep prompts and provider credentials server-only.
- Apply retro audio processing in the browser to authenticated ElevenLabs narration; microphone dictation uses browser speech recognition with an explicit unavailable state.

- Keep homepage scene placement in named CSS grid areas, with a transparent market-entry hit area over the wallpaper skyline and a collapsible money window; this separates scene composition from finance and transition behavior.
- Render Gill’s speaker artwork as a token-themed SVG domain component inside the existing Button; this preserves accessible mute controls without a raster background.
