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
// Clips longer than this are dropped rather than cut off mid-line.
const MAX_SECONDS = 6;

// [voicy sound file, title shown in the game, language]
const CLIPS = [
  ["/Content/Clips/Sound/7ed24f44-767c-4052-b132-fc7c1ff20eeb.mp3", "Padhaai likhaai mein dhyan do", "hi"],
  ["/Content/Clips/Sound/1098a8b8-1c49-4289-bb25-8d6b23c24357.mp3", "He Prabhu", "hi"],
  ["/Content/Clips/Sound/abc8af71-912a-48d6-8a24-a8ce6717fc8f.mp3", "Arey kehna kya chahte ho", "hi"],
  ["/Content/Clips/Sound/634ada7b-554e-4cff-81fa-e156262916d5.mp3", "Ye baburao ka style hai", "hi"],
  ["/Content/Clips/Sound/2ea6001c-0f51-4349-8765-6de797652d21.mp3", "Uthale re baba", "hi"],
  ["/Content/Clips/Sound/dcf99d8d-13c4-4879-a56a-24be650dd042.mp3", "Nonsense!", "hi"],
  ["/Content/Clips/Sound/b2b92514-6733-47b9-87fd-d554dbedb073.mp3", "Paisa hi paisa hoga", "hi"],
  ["/Content/Clips/Sound/4b0b9de7-69d5-4d4b-9ad6-c4a1465ea5bc.mp3", "Babuchak chup re", "hi"],
  ["/Content/Clips/Sound/3f68805c-53c3-4ccb-8b8b-649e6c2617d4.mp3", "Hey Maa Mataji", "hi"],
  ["/Content/Clips/Sound/72bc9bb0-1030-405a-a806-9d095cc5c290.mp3", "Abhi maza aayega na bhidu", "hi"],
  ["/Content/Clips/Sound/143284a0-5b1c-4423-ab5e-3063c565dd82.mp3", "Awaaz neeche", "hi"],
  ["/Content/Clips/Sound/55cb4c17-7962-47b4-af61-317fdeb1b1c3.mp3", "Mauj kardi", "hi"],
  ["/Content/Clips/Sound/8cce8c67-8d05-4f0e-bfaa-ae57bc5e6a29.mp3", "Golmaal hai bhai sab golmaal hai", "hi"],
  ["/Content/Clips/Sound/b5cde50d-a31d-401d-943c-70304ffedc0a.mp3", "Ata majhi satakli", "hi"],
  ["/Content/Clips/Sound/b447fa3d-cd57-4a8d-9107-a12ebb9501d4.mp3", "Bolo zubaan kesari", "hi"],
  ["/Content/Clips/Sound/45dab2c5-cbfb-4d65-9c4c-6aff5382da29.mp3", "Ji galti ho gayi", "hi"],
  ["/Content/Clips/Sound/790f914c-e345-405e-a810-d7c8e0f360b6.mp3", "Cheating karta hai tu", "hi"],
  ["/Content/Clips/Sound/839d3479-01dc-4f1b-81ec-8b405fc46947.mp3", "Haan maloom hai, tere baap ko mat sikha", "hi"],
  ["/Content/Clips/Sound/100247d7-1c6e-4605-91c7-a7b56a91a52d.mp3", "Chup chup chup bilkul chup", "hi"],
  ["/Content/Clips/Sound/b6ac5ba5-e5d7-41c0-ae8b-df1ceab4a988.mp3", "Matlab kuch bhi", "hi"],
  ["/Content/Clips/Sound/0b1a4b3c-99fe-41cb-9acd-3ea8820ba34f.mp3", "Thappad se dar nahi lagta", "hi"],
  ["/Content/Clips/Sound/e919e6c6-9a42-4cc6-abe7-114236f732cd.mp3", "Bhagwan ka diya sab kuch hai", "hi"],
  ["/Content/Clips/Sound/944a3374-f739-4dc8-b832-29f045f28ff2.mp3", "Tum log mujhe dhoondh rahe ho", "hi"],
  ["/Content/Clips/Sound/8842ab8f-beca-4258-b150-c621897b247f.mp3", "Kya re bhikmangya, kya dekh raha hai", "hi"],
  ["/Content/Clips/Sound/a98c6551-b5e3-4ea8-813c-1d0d613b36fc.mp3", "Shocking!", "hi"],
  ["/Content/Clips/Sound/ce170dea-ac06-4643-bc5a-681c59ff70f7.mp3", "Elvish bhai", "hi"],
  ["/Content/Clips/Sound/b6f0a6a3-f4f6-4927-a042-6e93a8d2109d.mp3", "Khopdi tod saale ka", "hi"],
  ["/Content/Clips/Sound/e91c27f5-857e-4f78-9c2a-e7b774773487.mp3", "Mast joke mara", "hi"],
  ["/Content/Clips/Sound/68019af0-ae8b-4154-bcd7-e8af3547e2b3.mp3", "Pakad mere ko, mere ko jaanta nahi", "hi"],
  ["/Content/Clips/Sound/fd9c9c3f-c108-4a8b-9422-b119984d1033.mp3", "Tere baap ki shaadi hai kya re", "hi"],
  ["/Content/Clips/Sound/7498d647-43e2-4cd9-9511-9de85bfb12fc.mp3", "Kachar kachar kachar", "hi"],
  ["/Content/Clips/Sound/22faee3b-d10c-4e68-b793-b081ce5bb97c.mp3", "Isko bilkul nahi aata", "hi"],
  ["/Content/Clips/Sound/6101e340-ff7c-4f12-8e31-a3ec1ef1b138.mp3", "Nahi nahi, ye nahi ho sakta", "hi"],
  ["/Content/Clips/Sound/24489843-adb7-4fd1-bbf4-82086b2de2ba.mp3", "Bahut accha lagega", "hi"],
  ["/Content/Clips/Sound/0a6c9816-4b70-4c84-b3b6-1718fab03e98.mp3", "Haath mat lagao mere bhai ko", "hi"],
  ["/Content/Clips/Sound/9e0236bc-27ce-4a87-87a5-800631f7e44f.mp3", "Mar ke dikha", "hi"],
  ["/Content/Clips/Sound/29695bb2-c6dc-4b40-8d57-63387ea2d730.mp3", "Munna hai Munna", "hi"],
  ["/Content/Clips/Sound/01d27084-2313-459b-9fcb-2d9f43434e68.mp3", "Bhai bhai, kya hua bhai", "hi"],
  ["/Content/Clips/Sound/5f47fcee-fc94-46dd-9e71-b792e6681d09.mp3", "25 din mein paisa double", "hi"],
  ["/Content/Clips/Sound/10d129d1-b3ec-4de2-a164-78e752559760.mp3", "Mere paas ek mast plan hai", "hi"],
  ["/Content/Clips/Sound/a3bb960d-a04e-42d0-b21d-aa233c0f2173.mp3", "Totally kangaal", "hi"],
  ["/Content/Clips/Sound/a29b3d8c-9deb-4080-9367-d112973204b6.mp3", "Paisa dena padega", "hi"],
  ["/Content/Clips/Sound/90739a21-3f0c-43e6-abc5-e8adacea91e9.mp3", "Kachra set kar, kachra nahi karne ka", "hi"],
  ["/Content/Clips/Sound/9d596a22-31f7-42f3-ada7-f9ca6fa6447d.mp3", "Kya bol raha hai", "hi"],
  ["/Content/Clips/Sound/7f23863d-7266-4191-a48b-7a7606a3ff53.mp3", "Phir Hera Pheri", "hi"],
  ["/Content/Clips/Sound/228d5bb8-add8-4839-9dc5-0ed86898fee8.mp3", "Iske liye badi oonchi pehchaan chahiye", "hi"],
  ["/Content/Clips/Sound/fb5a391c-e399-47ff-8cc3-619e5ca8cad4.mp3", "Maine nahi kiya tha ye", "hi"],
  ["/Content/Clips/Sound/937672e3-77ae-4f0b-98b2-537a00c2cf55.mp3", "Itna sannata kyun hai bhai", "hi"],
  ["/Content/Clips/Sound/af16f965-417f-467d-9c7e-1b34e1bcec44.mp3", "Elvish bhai ke aage koi bol sakta hai kya", "hi"],
  ["/Content/Clips/Sound/79e1ca24-15d3-4fef-be78-1e36d3ea395d.mp3", "Tum toh police wale ho na", "hi"],
  ["/Content/Clips/Sound/83a763ae-ed13-484b-8c41-299eab4a3a08.mp3", "FBI open up", "en"],
  ["/Content/Clips/Sound/5fa41a74-84cb-41f9-b54a-68415a53a96d.mp3", "Mission failed we'll get em next time", "en"],
  ["/Content/Clips/Sound/49d0a930-6796-4758-b2b7-72e3c532897e.mp3", "Emotional damage", "en"],
  ["/Content/Clips/Sound/5ba4f556-c0e9-449c-b83c-55bb4df3f27d.mp3", "That's sus", "en"],
  ["/Content/Clips/Sound/b9112bd6-285d-42b4-8972-6c4eac9a6723.mp3", "Say hello to my little friend", "en"],
  ["/Content/Clips/Sound/1d25df69-d612-4d11-9b68-fad04f7249df.mp3", "Why are you running", "en"],
  ["/Content/Clips/Sound/cb4a6e78-5cce-42e7-8f3f-02be467fa614.mp3", "What are those", "en"],
  ["/Content/Clips/Sound/2c168750-01bf-4c63-a36a-94183a61f453.mp3", "Somebody toucha my spaghet", "en"],
  ["/Content/Clips/Sound/73275a98-a629-4ea8-82ca-c9f869af0b69.mp3", "I see dead people", "en"],
  ["/Content/Clips/Sound/656b63c5-934e-4878-afe7-8bbc6085bba1.mp3", "Bond James Bond", "en"],
  ["/Content/Clips/Sound/1940e63a-a810-4d44-8cee-4eba01513feb.mp3", "This is Sparta", "en"],
  ["/Content/Clips/Sound/260a0093-c0ea-4261-a5b6-4536d8fcf921.mp3", "Hello there", "en"],
  ["/Content/Clips/Sound/680871a6-1f5c-443c-a1ad-68b046f9f0a7.mp3", "You're breathtaking", "en"],
  ["/Content/Clips/Sound/fce022b8-489d-48ef-9513-e1a5e54fe9cd.mp3", "May the force be with you", "en"],
  ["/Content/Clips/Sound/dc45e403-958d-48c1-8b96-629011e4cd99.mp3", "Show me the money", "en"],
  ["/Content/Clips/Sound/c13639fe-1a76-44e2-a706-bc1e4b9de853.mp3", "I'm gonna make him an offer he can't refuse", "en"],
  ["/Content/Clips/Sound/61cfabc7-7d9d-450e-8554-957b4715377f.mp3", "Speed. I am speed", "en"],
  ["/Content/Clips/Sound/6b1b6726-cb34-4bb5-9d58-f06bbe7b4f12.mp3", "I have the high ground", "en"],
  ["/Content/Clips/Sound/251fc007-f384-47d7-8e00-41ef3fcd5498.mp3", "To infinity and beyond", "en"],
  ["/Content/Clips/Sound/cf4ba072-7a94-446f-bcf6-a1daed9ca077.mp3", "Hasta la vista baby", "en"],
  ["/Content/Clips/Sound/3e8de472-9324-4fa7-b35e-5b62c169f1c3.mp3", "I am Iron Man", "en"],
  ["/Content/Clips/Sound/e27079e1-85c8-48d3-945a-8b2f33b52b4b.mp3", "It's a trap", "en"],
  ["/Content/Clips/Sound/24b352e3-ff3c-4d30-be97-b959a15e4d04.mp3", "Hello darkness my old friend", "en"],
  ["/Content/Clips/Sound/a071eabf-4e22-47af-9532-2e062d1b4417.mp3", "I am Groot", "en"],
  ["/Content/Clips/Sound/6052739e-57ef-4ae3-9076-4220dab28512.mp3", "ET phone home", "en"],
  ["/Content/Clips/Sound/9ab24ebb-88e3-4120-bb25-911c5c8bf632.mp3", "Winter is coming", "en"],
  ["/Content/Clips/Sound/41d4bcbe-4dcf-465f-ac88-f05f2d644042.mp3", "Run Forrest run", "en"],
  ["/Content/Clips/Sound/fcda6905-cd08-4323-9a8a-dac7fd7a96a9.mp3", "I'm Captain Jack Sparrow", "en"],
  ["/Content/Clips/Sound/4f655b15-1a3a-4971-ae5d-2acc33a2dcb5.mp3", "Wingardium leviosa", "en"],
  ["/Content/Clips/Sound/93d1fff1-d543-4e95-a376-dfb030de3c17.mp3", "Say my name", "en"],
  ["/Content/Clips/Sound/33e3b685-13f6-479e-a682-05234a4506cc.mp3", "Wubba lubba dub dub", "en"],
  ["/Content/Clips/Sound/a0c2052f-7478-4bd5-ae4b-530b9645e727.mp3", "Get to the choppa", "en"],
  ["/Content/Clips/Sound/3c482630-0437-4024-a389-9f92396ce57b.mp3", "Wakanda forever", "en"],
  ["/Content/Clips/Sound/812ad115-77ac-48a8-b9b3-959efc543ffd.mp3", "It's showtime", "en"],
  ["/Content/Clips/Sound/fa1d0286-4daa-45bf-be26-d02c88495521.mp3", "Houston we have a problem", "en"],
  ["/Content/Clips/Sound/b37b7028-5058-4a5d-910d-4f71978e9082.mp3", "General Kenobi", "en"],
  ["/Content/Clips/Sound/badaa649-25df-4205-8896-6eef31e060e6.mp3", "That's a lot of damage", "en"],
  ["/Content/Clips/Sound/5b29f589-4015-4b10-b0de-0c3473812fb5.mp3", "We're gonna need a bigger boat", "en"],
  ["/Content/Clips/Sound/69c4564f-40fa-4b43-af3f-237aa33f68cc.mp3", "I am inevitable", "en"],
  ["/Content/Clips/Sound/b31582ec-83b7-47ea-8368-7fa4d9d238bc.mp3", "Here's Johnny", "en"],
  ["/Content/Clips/Sound/9139a5c2-cfa2-4a61-98d0-81328f02312a.mp3", "It's over 9000", "en"],
  ["/Content/Clips/Sound/b88c8732-99b4-4854-b72b-11cabce7df70.mp3", "It's big brain time", "en"],
  ["/Content/Clips/Sound/4fa13f2f-036c-42e0-bd20-fd4996e50e90.mp3", "I'm in danger", "en"],
  ["/Content/Clips/Sound/ff0d7f14-1956-41f5-bb44-65316c6cb46c.mp3", "I feel the need for speed", "en"],
  ["/Content/Clips/Sound/15361a25-e346-4d7a-93c9-9fa350a2f3ff.mp3", "You want to play let's play", "en"],
  ["/Content/Clips/Sound/67e5f0c1-c881-4842-8f67-e37d937aeda8.mp3", "You're a wizard Harry", "en"],
  ["/Content/Clips/Sound/72091c7f-cb03-44d4-a3e0-b3e871f58205.mp3", "Leeroy Jenkins", "en"],
  ["/Content/Clips/Sound/763ca262-1a19-4d22-9369-d953d021a9ea.mp3", "Why you always lying", "en"],
  ["/Content/Clips/Sound/3321ec45-61ad-492e-aea3-a94d8fead4dc.mp3", "I'm the king of the world", "en"],
  ["/Content/Clips/Sound/091eae23-2e13-48d3-9eb1-4df2aad58f79.mp3", "Hakuna matata", "en"],
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
  for (const f of fs.readdirSync(CLIPS_OUT)) if (f.endsWith('.mp3')) fs.rmSync(path.join(CLIPS_OUT, f));
  const manifest = [];
  for (const [source, title, lang] of CLIPS) {
    try {
      const raw = path.join(tmp, `${slug(title)}.src`);
      await download(`https://files.voicy.network/public${source}`, raw);
      const file = `${slug(title)}.mp3`;
      const out = path.join(CLIPS_OUT, file);
      // Trim silence at both ends (reverse, trim, reverse back), then even out the loudness.
      const trim = 'silenceremove=start_periods=1:start_threshold=-45dB';
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vn',
        '-af', `${trim},areverse,${trim},areverse,loudnorm=I=-16:TP=-1.5`,
        '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
      const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
      if (!(duration >= 0.8 && duration <= MAX_SECONDS)) {
        fs.rmSync(out);
        throw new Error(`${duration.toFixed(1)}s is outside 0.8-${MAX_SECONDS}s`);
      }
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
