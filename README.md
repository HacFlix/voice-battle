# Voice Battle

Online party game: team members imitate meme clips, characters perform them on stage, the audience votes.

## Run locally

    npm run setup      # installs root, server and client deps
    npm run dev        # server :3001 + client :5173

Open http://localhost:5173 in several tabs (each tab is its own player): one creates the team,
the others join as teammates or audience.

Microphone recording needs https or localhost. To play with friends over the internet, deploy
(`npm run build && npm start` serves the built client from the server on `$PORT`) behind https,
e.g. Render or Railway.

## Tests

    npm test                                    # game rules (Vitest)
    TIME_SCALE=0.05 npm start                   # then, in another terminal:
    npm --prefix server run smoke               # full 3-round game end to end

## Assets

- Characters: Kenney Toon Characters (CC0) in `client/public/characters`.
- Clips: meme / movie dialogue clips in `server/clips` for private play only. Replace them with
  royalty-free or self-recorded clips before any public release. Regenerate with
  `node scripts/fetch-assets.mjs` (needs ffmpeg).
