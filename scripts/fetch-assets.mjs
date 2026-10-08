// One-off asset fetch: meme clip pack (voicy.network) + Kenney Toon Characters (CC0).
// Clips are copyrighted material for private play only; replace before a public release.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS_OUT = path.join(ROOT, 'server', 'clips');
const CHARS_OUT = path.join(ROOT, 'client', 'public', 'characters');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const MAX_SECONDS = 8;

const CLIPS = [
  ['1MjuoJyfYkWDabEbfwttYA', 'Padhaai likhaai mein dhyan do', 'hi'],
  ['7gKsIlltmUWZ2em-4JZthw', 'Arey kehna kya chahte ho', 'hi'],
  ['IQyrIWMsgkqlZjqrONjjjQ', 'Tareekh pe tareekh', 'hi'],
  ['U-xO2BJrykmtqXkWiPizjg', 'Abhi maza aayega na bhidu', 'hi'],
  ['UR-zPtsHokSErAtP7I8ajA', 'Jo main nahi bolta, woh main definitely karta hoon', 'hi'],
  ['h58gCnhjU0GUhTLN6ECTzA', 'Matlab kuch bhi', 'hi'],
  ['qbN65_ts9kONPktmHNcZ9w', 'Control Uday, control', 'hi'],
  ['riZmGaSy106qMLuU4eLoMQ', 'Golmaal hai bhai sab golmaal hai', 'hi'],
  ['Jm3yA4sFu0itHSr45HfHeA', 'Dhai kilo ka haath', 'hi'],
  ['1V9zV295Vkyey32Du_vq-A', 'Babuchak, chup re', 'hi'],
  ['Nwmx4aGwE06M3qGwiVRAIA', 'Emotional damage', 'en'],
  ['uWyzGQImvE6D-DuJBYfsrA', 'Bing chilling', 'en'],
  ['-TIxxuuockqkRtuqpsJzBg', "I'm Captain Jack Sparrow", 'en'],
  ['SIhT3aEDv0KrTlEb6YPGJw', 'Say hello to my little friend', 'en'],
  ['tkw1j3gzQEmO9eNyCL4MRw', "I'll be back", 'en'],
  ['BDohaLn9lEect2pt-_WIDg', 'I feel the need, the need for speed', 'en'],
  ['MY20nos99kOZ-cZRWI9RLQ', "You want to play? Let's play", 'en'],
  ['y6OqTHj9WE2-G6NkVCFnRg', 'We have a Hulk', 'en'],
  ['NVurE6hoEeihTtSuUqiQGg', 'The power of the dark side', 'en'],
  ['b1QL4gfJYEKxWN4S4lZ0tA', 'I thought we were friends', 'en'],
];

const CHARACTERS = {
  malePerson: 'Male person',
  femalePerson: 'Female person',
  maleAdventurer: 'Male adventurer',
  femaleAdventurer: 'Female adventurer',
  robot: 'Robot',
  zombie: 'Zombie',
};
const POSES = ['idle', 'talk', 'think', 'hurt', 'cheer0', 'cheer1', ...Array.from({ length: 8 }, (_, i) => `walk${i}`)];
const KENNEY_ZIP = 'https://kenney.nl/media/pages/assets/toon-characters/4e8a6e4e53-1774770819/kenney_toon-characters.zip';

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function fetchClips() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-clips-'));
  fs.mkdirSync(CLIPS_OUT, { recursive: true });
  const manifest = [];
  for (const [voicyId, title, lang] of CLIPS) {
    try {
      const api = await fetch(`https://server.voicy.network/api/clips/${voicyId}?premium=false`, { headers: { 'User-Agent': UA } }).then(r => r.json());
      const raw = path.join(tmp, `${voicyId}.mp3`);
      await download(`https://files.voicy.network/public${api.data.source}`, raw);
      const file = `${slug(title)}.mp3`;
      const out = path.join(CLIPS_OUT, file);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw,
        '-af', `silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-1.5,atrim=0:${MAX_SECONDS},afade=t=out:st=${MAX_SECONDS - 0.4}:d=0.4`,
        '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
      const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
      if (!(duration >= 0.8)) throw new Error('too short');
      manifest.push({ id: slug(title), title, lang, file, duration: Math.round(duration * 100) / 100 });
      console.log(`ok   ${title} (${duration.toFixed(1)}s)`);
    } catch (err) {
      console.warn(`skip ${title}: ${err.message}`);
    }
  }
  fs.writeFileSync(path.join(CLIPS_OUT, 'clips.json'), JSON.stringify(manifest, null, 2));
  console.log(`${manifest.length} clips written`);
}

async function fetchCharacters() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-kenney-'));
  const zip = path.join(tmp, 'toon.zip');
  await download(KENNEY_ZIP, zip);
  // Git Bash's GNU tar treats "C:" as a remote host; use the Windows bsdtar there.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', zip, '-C', tmp]);
  for (const [key, folder] of Object.entries(CHARACTERS)) {
    const outDir = path.join(CHARS_OUT, key);
    fs.mkdirSync(outDir, { recursive: true });
    for (const pose of POSES) {
      fs.copyFileSync(path.join(tmp, folder, 'PNG', 'Poses HD', `character_${key}_${pose}.png`), path.join(outDir, `${pose}.png`));
    }
  }
  fs.copyFileSync(path.join(tmp, 'License.txt'), path.join(CHARS_OUT, 'LICENSE-kenney.txt'));
  console.log('characters written');
}

if (!process.argv.includes('--characters-only')) await fetchClips();
await fetchCharacters();
