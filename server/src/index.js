import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { parseFile } from 'music-metadata';
import { Server } from 'socket.io';
import { Game } from './game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS_DIR = path.join(ROOT, 'clips');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const REC_DIR = path.join(UPLOADS_DIR, 'recordings');
const CUSTOM_DIR = path.join(UPLOADS_DIR, 'clips');
const CLIENT_DIST = path.resolve(ROOT, '..', 'client', 'dist');
const PORT = Number(process.env.PORT || 3001);
const RECONNECT_GRACE_MS = 5000;
// Comma-separated list of site origins allowed to talk to this server (e.g. the Vercel URL).
// Unset means allow any origin, which is fine for local dev.
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const originAllowed = origin => !origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
const MAX_CUSTOM_CLIP_SECONDS = 15;

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}
emptyDir(REC_DIR);
emptyDir(CUSTOM_DIR);

const clips = JSON.parse(fs.readFileSync(path.join(CLIPS_DIR, 'clips.json'), 'utf8'))
  .map(c => ({ id: c.id, title: c.title, url: `/clips/${c.file}`, duration: c.duration }));

const app = express();
app.use((req, res, next) => {
  const { origin } = req.headers;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) },
});

const game = new Game({
  clips,
  config: { timeScale: Number(process.env.TIME_SCALE || 1) },
  onChange: () => io.emit('state', game.publicState()),
  onEvent: (type, data) => {
    if (type === 'reaction') io.emit('reaction', data);
    if (type === 'clearRecordings') emptyDir(REC_DIR);
    if (type === 'reset') {
      emptyDir(REC_DIR);
      emptyDir(CUSTOM_DIR);
    }
  },
});

function withUpload(dir, handler) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.webm';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
  }).single('audio');

  return (req, res) => upload(req, res, async err => {
    if (err) return res.status(400).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)' : 'Upload failed' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'No audio file' });
    const result = await handler(req).catch(() => ({ ok: false, error: 'Could not read that audio file' }));
    if (!result.ok) fs.rmSync(req.file.path, { force: true });
    res.status(result.ok ? 200 : 400).json(result);
  });
}

app.post('/api/recording', withUpload(REC_DIR, async req =>
  game.submitRecording(String(req.body.playerId), {
    url: `/uploads/recordings/${req.file.filename}`,
    duration: Number(req.body.duration),
  })));

app.post('/api/clip', withUpload(CUSTOM_DIR, async req => {
  const title = String(req.body.title || '').trim().slice(0, 60);
  if (!title) return { ok: false, error: 'Give the clip a title' };
  const { format } = await parseFile(req.file.path, { duration: true });
  if (!format.duration || format.duration > MAX_CUSTOM_CLIP_SECONDS) {
    return { ok: false, error: `Clip must be audio up to ${MAX_CUSTOM_CLIP_SECONDS} seconds` };
  }
  return game.addClip(String(req.body.playerId), {
    id: req.file.filename,
    title,
    url: `/uploads/clips/${req.file.filename}`,
    duration: format.duration,
  });
}));

// Audio filenames never change content (uploads get unique names), so let browsers keep them.
app.use('/clips', express.static(CLIPS_DIR, { maxAge: '1d' }));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1y', immutable: true }));
if (fs.existsSync(CLIENT_DIST)) app.use(express.static(CLIENT_DIST));

const pendingDisconnects = new Map();

io.on('connection', socket => {
  const playerId = String(socket.handshake.auth?.playerId || '').slice(0, 64);
  if (!playerId) {
    socket.disconnect(true);
    return;
  }
  clearTimeout(pendingDisconnects.get(playerId));
  pendingDisconnects.delete(playerId);
  game.reconnect(playerId);
  socket.emit('state', game.publicState());

  const actions = {
    create: p => game.createTeam(playerId, p.name, p.teamName),
    join: p => game.join(playerId, p.name, p.role),
    setRounds: p => game.setRounds(playerId, Number(p.rounds)),
    start: () => game.start(playerId),
    recording: p => game.setRecording(playerId, p.on),
    vote: p => game.vote(playerId, p.value),
    react: p => game.react(playerId, p.emoji),
    end: () => game.end(playerId),
  };
  for (const [event, action] of Object.entries(actions)) {
    socket.on(event, (payload, ack) => {
      const result = action(payload && typeof payload === 'object' ? payload : {});
      if (typeof ack === 'function') ack(result);
    });
  }

  socket.on('disconnect', () => {
    pendingDisconnects.set(playerId, setTimeout(async () => {
      pendingDisconnects.delete(playerId);
      const sockets = await io.fetchSockets();
      if (!sockets.some(s => s.handshake.auth?.playerId === playerId)) game.disconnect(playerId);
    }, RECONNECT_GRACE_MS));
  });
});

server.listen(PORT, () => console.log(`Voice Battle server on http://localhost:${PORT}`));
