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

- Use domain components for XP windows, finance calculations, market simulation, and Gill chat; guests use the demo ledger in React state, signed-in students load their data from the FastAPI backend (`src/lib/api.ts`). Gill requires a signed-in student: the `/gill` route shows a sign-in desk to guests and the backend returns 401 for every `/assistant` call without a login.
- Accounts, money data, Gill's chat (Gemini agent with consent cards) and Gill's voice (ElevenLabs) all live in the FastAPI backend in `../backend`. Don't add Supabase, a Lovable AI gateway route, or any API keys to the frontend. The protocol is `../docs/GILL_GATES_FRONTEND_CONTRACT.md`.
- Compose chat with AI Elements; render only the allowlisted Gill cards in `src/components/gill-cards.tsx`, with props validated by `src/lib/gill-protocol.ts`.
- Apply retro audio processing in the browser to the backend's speech audio; microphone dictation uses browser speech recognition with an explicit unavailable state.

- Keep homepage scene placement in named CSS grid areas, with a transparent market-entry hit area over the wallpaper skyline and a collapsible money window; this separates scene composition from finance and transition behavior.
- Render Gill’s speaker artwork as a token-themed SVG domain component inside the existing Button; this preserves accessible mute controls without a raster background.
