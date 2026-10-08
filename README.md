# Voice Battle

Online party game: team members imitate meme clips, characters perform them on stage, the audience votes.

## Run locally

    npm run setup      # installs root, server and client deps
    npm run dev        # server :3001 + client :5173

Open http://localhost:5173 in several tabs (each tab is its own player): one creates the team,
the others join as teammates or audience.

Microphone recording needs https or localhost.

## Deploy (site on Vercel, game server on Render)

The game server keeps live socket connections, timers and in-memory state, so it can't run as
Vercel serverless functions; it runs on Render instead.

1. **Server → Render:** New → Blueprint → pick this repo (uses `render.yaml`). Set `CLIENT_ORIGIN`
   to the Vercel site URL once you have it. Health check: `/health`.
   The free plan sleeps after ~15 min idle; the first visit then takes ~30-60 s to wake it.
2. **Site → Vercel:** import the repo, Root Directory `client`, framework Vite, and set
   `VITE_API_URL` to the Render URL (e.g. `https://voice-battle-api.onrender.com`).
3. Redeploy Render after setting `CLIENT_ORIGIN` so the server accepts the site.

Recordings live on the server's disk only for the current game (Render's disk is temporary).

## Tests

    npm test                                    # game rules (Vitest)
    TIME_SCALE=0.05 npm start                   # then, in another terminal:
    npm --prefix server run smoke               # full 3-round game end to end

## Assets

- Characters: Kenney Toon Characters (CC0) in `client/public/characters`.
- Clips: meme / movie dialogue clips in `server/clips` for private play only. Replace them with
  royalty-free or self-recorded clips before any public release. Regenerate with
  `node scripts/fetch-assets.mjs` (needs ffmpeg).
