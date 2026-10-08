# Voice Battle — Design Spec

Date: 2026-10-08

## Goal

An online party game played in the browser. One team plays at a time. Team
members imitate meme / dialogue clips by recording their voice; characters
perform the recordings on a stage; the audience votes on how close each
imitation is. Built first with a 2D stage to validate all functionality, then
the stage is upgraded to 3D (same day).

Success: a full game (lobby → 3–4 rounds → final scorecard) can be played by
several people on separate devices over the internet, with every screen showing
the same stage moment.

## Roles

- **Host** — the team member who created the team. Picks round count, uploads
  extra clips, starts the game, can Play Again / End.
- **Team member** — records imitations, performs on stage. Never votes.
- **Audience** — watches and votes. Only the audience votes.

## Rules

- Only one game exists at a time. While a team exists, nobody can create another.
- Team: 2–6 members (host included). Audience: at least 1, unlimited.
- Rounds: 3 or 4 (host chooses). All rounds use the same rules.
- Each round uses one clip shared by every member (each does their own take on it);
  no clip repeats until the pack runs out.
- Recording: 60 s timer, up to 3 takes, submit one. No submission → 0 for that
  round and skipped on stage.
- Voting: 10 s window per performance, 0–100 slider. Score = average of votes
  received; no votes → 0.
- Emoji reactions (👏 😂 🔥 🍅) can be sent any time during voting; they float
  across every screen with a sound effect.

## Game flow

1. **Home** — "Create Team" (enter name → become host) if no game exists;
   otherwise "Game in progress" with Join options while in lobby, and a
   "Game running" notice once started.
2. **Lobby** — join as Team Member or Audience. Shows members and audience
   count. Host picks rounds, uploads clips, presses Start (enabled at ≥2
   members and ≥1 audience).
3. **Record** — members see their clip, can replay the original, record up to
   3 takes, submit. Audience sees a waiting screen with progress.
4. **Stage show** — for each member in order:
   0. Once per round, before the first performer: the original clip plays (title shown).
   1. The member's character walks to the mic; their recording auto-plays.
   3. Voting opens for 10 s (audience phones show slider + emoji buttons).
      Reactions float across all screens with sounds.
   4. Score is revealed (cheer if ≥70, groan if <40). Character walks back.
5. **Round leaderboard** — running totals, then next round.
6. **Final scorecard** — podium + confetti, totals and per-round scores.
   Awards: Crowd Favourite (most reactions received), Closest Match (highest
   single round score), Consistent Performer (smallest spread between round
   scores). Host: Play Again (back to lobby, same people) or End (game closed).

### Disconnects

- Member disconnects → skipped on stage, keeps earned points. Can rejoin with
  the same name while the game exists.
- Host disconnects → next member becomes host.
- A dropped connection gets a 5 s grace period (page refresh) before the player
  counts as disconnected.
- If no team members remain connected, the game is closed.

## Architecture

```
client (React + Vite)                      server (Node + Express + Socket.IO)
 ├─ screens: Home, Lobby, Record,          ├─ game state machine (single game)
 │  Show, Leaderboard, Final               ├─ timers (record, vote, stage steps)
 ├─ Stage component (2D: DOM + CSS        ├─ REST: upload recording / clip
 │  sprites; later 3D: react-three-fiber)  └─ static: clip pack, uploads
 └─ socket client ← "state" broadcasts
```

- **Server is authoritative.** It owns phase, timers, the current performer and
  the current stage step. It broadcasts a full `state` object on every change.
  Clients render from that state only; they send intents (`join`, `start`,
  `vote`, `react`, ...).
- **Stage is one component** that takes `state` (performers, current performer,
  stage step, reactions) and renders it. The 2D → 3D upgrade replaces only this
  component.
- **Audio:** recordings are captured with MediaRecorder (webm/opus), uploaded
  via HTTP POST, stored on disk under `server/uploads/` for the game's
  lifetime, served as static files. Every client plays the original/recording
  when the server's stage step says so.
- **Browser autoplay:** each client must click once ("Enter the stage") before
  the show so audio can play automatically.
- **Clip pack:** ~15–20 short Bollywood + English meme clips in
  `server/clips/` with a `clips.json` manifest (title, file). Personal/private
  use only — copyrighted clips must be replaced before any public release.
- **Assets:** Kenney.nl (CC0) characters/stage art; sound effects CC0.

### Stage step timeline (per performer)

`original` (clip length + 0.5 s) → `walkIn` (1.5 s) → `perform` (recording
length + 0.5 s) → `vote` (10 s) → `reveal` (3 s) → `walkOut` (1.5 s).

## Testing

- Unit tests (Vitest) for the server game state machine: joining rules, single
  game lock, start conditions, round progression, scoring/averaging, awards,
  disconnect/host handover. Timers are injectable so tests run instantly.
- Manual end-to-end: multiple browser windows (1 host, 1 member, 1 audience).

## Out of scope

AI/pitch match scoring, replays, special round types, multiple simultaneous
games, accounts/persistence, team-vs-team.
