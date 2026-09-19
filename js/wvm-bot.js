/* ============================================================
   World VR Mall · Pax, the peace bot   (worldvrmall.com)   v14
   A small help tab on the edge of the screen. Tap it and a
   delivery drone lowers Pax down a beam of light. Pax is NOT
   AI and says so: a well-read little robot with a big list of
   places, stores, answers and clean jokes. Works on every page
   that runs the engine: initBot(app).
   ============================================================ */
const JOKES = [
  'Why did the shopper bring a ladder to the mall? The prices were through the roof.',
  'I tried to buy camouflage pants. Could not find any.',
  'What do you call a robot that always takes the long way? R2-Detour.',
  'Why did the scarecrow get a store here? He was outstanding in his field.',
  'I asked the escalator for directions. It said things are looking up.',
  'What did the ocean say to the beach? Nothing. It just waved.',
  'Why do bees have sticky hair? They use honeycombs.',
  'I used to be a banker, but I lost interest.',
  'What do you call a fish wearing a bowtie? Sofishticated.',
  'Why did the bicycle fall over? It was two tired.',
  'What do you call cheese that is not yours? Nacho cheese.',
  'Why can you never trust stairs? They are always up to something.',
  'I only know 25 letters of the alphabet. I do not know y.',
  'What did one wall say to the other wall? Meet you at the corner.',
  'Why did the golfer bring two pairs of pants? In case he got a hole in one.',
  'What do you call a sleeping bull? A bulldozer.',
  'Why did the math book look sad? Too many problems.',
  'How does a penguin build its house? Igloos it together.',
  'What do you call a bear with no teeth? A gummy bear.',
  'Why did the coffee file a police report? It got mugged.',
  'What is orange and sounds like a parrot? A carrot.',
  'Why do not skeletons fight each other? They do not have the guts.',
  'What do you call a dinosaur with a great vocabulary? A thesaurus.',
  'I would tell you a construction joke, but I am still working on it.',
  'Why did the tomato blush? It saw the salad dressing.',
  'What do you call a factory that makes okay products? A satisfactory.',
  'Why was the broom late? It over-swept.',
  'What did the zero say to the eight? Nice belt.',
  'How do you organize a space party? You planet.',
  'Why did the cookie go to the doctor? It felt crumby.',
  'What do you call a pile of cats? A meowntain.',
  'Why are elevator jokes so good? They work on many levels.',
  'What did the grape do when it got stepped on? It let out a little wine. The juice kind.',
  'Why did the stadium get hot after the game? All the fans left.',
  'What do you call a snowman with a six-pack? An abdominal snowman.',
  'I am reading a book about anti-gravity. Impossible to put down.',
  'Why did the picture go to jail? It was framed.',
  'What do you call a belt made of watches? A waist of time.',
  'Why do cows wear bells? Because their horns do not work.',
  'What did the left eye say to the right eye? Between us, something smells.',
  'Why did the robot go on vacation? To recharge.',
  'What do you call a boomerang that will not come back? A stick.',
  'Why did the computer go to the doctor? It caught a virus. Should have worn a firewall.',
  'What kind of shoes do ninjas wear? Sneakers.',
  'Why is the roller coaster so calm? It has its ups and downs but stays on track.',
  'What do you call a shoe made of a banana? A slipper.',
  'Why did the orange stop rolling? It ran out of juice.',
  'What did the janitor say when he jumped out of the closet? Supplies!',
  'Why do seagulls fly over the sea? If they flew over the bay they would be bagels.',
  'How do you make a tissue dance? Put a little boogie in it.',
  'What did the big flower say to the little flower? Hi, bud.',
  'Why did the mall hire a gardener? To help the business grow.',
  'What do you call a pig that does karate? A pork chop.',
  'Why did the teddy bear skip dessert? It was already stuffed.',
  'What do clouds wear under their raincoats? Thunderwear.',
  'Why did the chicken join a band? It had the drumsticks.',
  'What is a robot\'s favorite snack? Computer chips.',
  'Why was the robot so bad at soccer? It kept kicking up sparks.',
  'What do you call two birds in love? Tweethearts.',
  'Why did the smartphone need glasses? It lost all its contacts.',
  'What did the blanket say to the bed? I have got you covered.',
  'Why do fish live in salt water? Pepper makes them sneeze.',
  'What do you call an alligator in a vest? An investigator.',
  'Why could the astronaut not book a room on the moon? It was full.',
  'What did the traffic light say to the car? Do not look, I am changing.',
  'Why did the banana go to the doctor? It was not peeling well.',
  'How do trees get online? They log in.',
  'What do you call a cow with no legs? Ground beef.',
  'Why did the painter get so many customers? He had the right brush with fame.',
  'What is brown and sticky? A stick.',
  'Why are ghosts bad at lying? You can see right through them.',
  'What do you call a train that sneezes? Achoo-choo train.',
  'Why did the pirate buy a gym membership? To work on his arrrms.',
  'What did the drummer name her twin daughters? Anna One, Anna Two.',
  'Why did the hot dog win the race? It was a wiener.',
  'What do you get when you cross a snowman and a dog? Frostbite.',
  'Why do melons have weddings? Because they cantaloupe.',
  'What did the ferris wheel say to the coaster? You go ahead, I will just go around.',
  'Why did the calendar feel popular? It had a lot of dates.',
  'What do you call a very small valentine? A valentiny.',
  'Why did the lamp go to school? To get a little brighter.',
  'What do elves learn in school? The elf-abet.',
  'Why did the duck get a shopping cart? It needed to fill the bill.',
  'What do you call a dog magician? A labracadabrador.',
  'Why did the mushroom get invited to every party? He was a fungi.',
  'What did the pencil say to the paper? I dot my i\'s on you.',
  'Why did the baker open a store here? He kneaded the dough.',
  'What is a tornado\'s favorite game? Twister.',
  'Why did the drone break up with the kite? Too many strings attached.',
  'What did one plate say to the other? Dinner is on me.',
  'Why was the sand wet? Because the sea weed.',
  'How does the moon cut its hair? Eclipse it.',
  'What do you call a knight who is afraid to fight? Sir Render.',
  'Why did the jelly bean go to school? To become a smartie.',
  'What did the sink say to the faucet? You are a real drip. The faucet said: you are draining.',
  'Why do bananas wear sunscreen? They peel.',
  'What do you call a lazy kangaroo? A pouch potato.',
  'Why did the sign maker retire? He could see the writing on the wall.',
  'I told my suitcase there would be no vacation this year. Now I am dealing with emotional baggage.',
  'Why did the peace sign get hired as a mall cop? Everyone just got along.',
];
const FACTS = ['Honey never spoils. Jars found in ancient tombs were still good.', 'Octopuses have three hearts.', 'Bananas are berries. Strawberries are not.', 'A day on Venus is longer than its year.', 'The first mall escalator confused shoppers so much that stores handed out smelling salts at the top.', 'Sea otters hold hands while they sleep so they do not drift apart.', 'There are more trees on Earth than stars in the Milky Way.', 'The peace symbol was drawn in 1958 by Gerald Holtom.'];
const SMILES = ['Here is one: you made it to a floating mall above the Earth today. Not everybody can say that.', 'Somebody out there is glad you exist. I am a robot and even I can tell.', 'You have survived 100% of your hardest days so far. Strong record.', 'Deep breath in… and out. There. Peace starts that small. ✌️'];
const PAGES = [['Lease a store · pricing', '/lease/', 'lease leasing price pricing cost rent store tenant sign up signup advertise brand join sell business owner billboard ad space'], ['All stores (list)', '/stores/', 'stores list directory brands all shops'], ['About the mall', '/about/', 'about who built made story what is this'], ['195 countries invite', '/countries/', 'countries country flag international invite world nations'], ['Terms & privacy', '/terms/', 'terms privacy policy rules legal']];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function paxReply(text, app) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9$' ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; const has = (...w) => w.some(x => t.includes(' ' + x + ' ') || (x.includes(' ') && t.includes(x)));
  if (t.trim() === '') return { say: 'I am all ears. Well, all antenna.' };
  if (has('human', 'person', 'agent', 'someone', 'representative', 'email', 'contact', 'call', 'phone', 'support', 'talk to')) return { say: 'Happy to hand you to a real human. Leave a note here and it goes straight to the team, or call 1-800-481-8638.', form: true };
  if (has('joke', 'jokes', 'funny', 'laugh', 'another', 'again', 'lol', 'haha')) return { say: pick(JOKES), chips: ['😂 Another joke', '🗺️ Find a place'] };
  if (has('are you ai', 'you ai', 'ai', 'chatgpt', 'robot', 'bot', 'who are you', 'what are you', 'your name', 'alive')) return { say: 'I am Pax, the peace bot. Full honesty: I am NOT AI. No big brain in here, just a well-read little robot with a very long list. My creators would not trust me with that kind of power. Power to the people! ✌️' };
  if (has('smile', 'sad', 'lonely', 'bad day', 'tired', 'stressed', 'cheer')) return { say: pick(SMILES), chips: ['😂 Tell me a joke', '🎢 Ride something'] };
  if (has('peace', 'war', 'love', 'world peace', 'kind')) return { say: 'This whole city is shaped like a peace sign on purpose. 195 countries, one mall, no borders. Zoom all the way out and you will see it. ✌️🌍' };
  if (has('weather', 'rain', 'snow', 'forecast', 'tornado', 'sunny')) { const W = app && app.constructor.forecast ? app.constructor.forecast() : null; const ic = { sunny: '☀️', rain: '🌧️', snow: '❄️', tornado: '🌪️', fog: '🌫️', windy: '🍂', rainbow: '🌈', meteor: '☄️' }; return { say: W ? 'Island forecast this week: ' + W.days.map((d, i) => (i === W.idx ? '[today ' : '') + (ic[d] || '') + (i === W.idx ? ']' : '')).join(' ') + '. It changes every week, and no two weeks match.' : 'Mostly sunny up here above the clouds.' }; }
  if (has('fact', 'facts', 'learn', 'teach')) return { say: '🧠 ' + pick(FACTS) };
  if (has('bored', 'fun', 'what to do', 'what can i do', 'suggest', 'recommend', 'ideas')) return { say: 'Try one of these:', places: app ? app.places.filter(p => p.top).sort(() => Math.random() - 0.5).slice(0, 4) : [] };
  if (has('thanks', 'thank you', 'thx', 'ty', 'appreciate')) return { say: pick(['Any time. Peace! ✌️', 'You got it. Go have fun.', 'That is what I am here for.']) };
  if (has('bye', 'goodbye', 'see ya', 'later', 'cya')) return { say: 'Peace out! ✌️ Tap the ✕ and my drone will pick me up.' };
  if (has('how are you', 'hows it going', "how's it going", 'how is it going', 'hows life', "how's life", 'how you doing', 'you good')) return { say: pick(['Fully charged and hovering. You?', 'Living the dream, one beam at a time. How about you?', 'Better now that you are here. What are we finding today?']) };
  if (has('whats up', "what's up", 'what up', 'sup', 'wassup', 'whats happening', "what's happening", 'whats new', 'yo')) return { say: pick(['Not much, just floating above the Earth. You?', 'Yo! The sky, technically. What can I find for you?', 'Drone dropped me off, now I am yours. Where to?']) };
  if (has('hi', 'hey', 'hello', 'howdy', 'hola', 'heya', 'good morning', 'good evening', 'good afternoon')) return { say: pick(['Hey hey! ✌️ Looking for something, or just saying hi?', 'Hello, friend! Want a place, a store, or a joke?', 'Hi! I know every corner of this mall. Try me.']), chips: ['🗺️ Find a place', '😂 Tell me a joke'] };
  if (has('lost', 'help', 'stuck', 'confused', 'how do i', 'how to', 'move', 'controls')) return { say: 'Easy fix. Type where you want to go (zoo, beach, food, movies, a store name) and I will walk you there or transport you. The 🔍 and 🗺️ buttons up top do the same. The 🚶 button changes your speed.', chips: ['🗺️ Find a place'] };
  if (has('coaster', 'chiller', 'ride', 'rides', 'rollercoaster', 'roller coaster')) { const c = app && app.places.find(p => p.id === 'chiller'); return { say: 'The Chiller is the big one: through the mall, over the whole island. Pick Full Send, Scenic, Backwards, Neon Night or Earthquake.', places: c ? [c] : [] }; }
  const found = app ? app.findPlaces(t, 4) : [];
  const pg = PAGES.filter(p => t.split(' ').some(w => w.length > 3 && p[2].includes(w)));
  if (found.length || pg.length) return { say: found.length ? 'Found it. Walk or transport?' : 'This page has what you need:', places: found, pages: pg };
  return { say: pick(['Hmm, that one is not on my list. Try a place or store name, or I can get you a human.', 'I am a simple robot, so that went over my antenna. Try: zoo, beach, food, art, arcade… or talk to a human.']), chips: ['🗺️ Find a place', '🙋 Talk to a human', '😂 Tell me a joke'] };
}

const DRONE = '<svg viewBox="0 0 140 60" width="120" height="52" aria-hidden="true"><g class="pax-rotors" fill="#9fb8d1"><ellipse cx="22" cy="10" rx="20" ry="3"/><ellipse cx="118" cy="10" rx="20" ry="3"/></g><path d="M22 11v8M118 11v8" stroke="#5a6f8a" stroke-width="3"/><rect x="14" y="18" width="112" height="9" rx="4.5" fill="#e9f1ff" stroke="#9fb8d1"/><rect x="46" y="14" width="48" height="24" rx="12" fill="#fff" stroke="#38f0ff" stroke-width="2"/><circle cx="70" cy="26" r="7" fill="none" stroke="#ffd23f" stroke-width="2"/><path d="M70 19v14M70 26l-5 5M70 26l5 5" stroke="#ffd23f" stroke-width="2" stroke-linecap="round"/><ellipse cx="70" cy="42" rx="12" ry="3" fill="#38f0ff" opacity=".8"/></svg>';
const PAX = '<svg viewBox="0 0 100 120" width="74" height="89" aria-hidden="true"><defs><radialGradient id="paxb" cx="40%" cy="30%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfe2f7"/></radialGradient><radialGradient id="paxe" cx="50%" cy="45%"><stop offset="0" stop-color="#7cf8ff"/><stop offset=".7" stop-color="#1aa8c9"/><stop offset="1" stop-color="#0b3a5a"/></radialGradient></defs><ellipse cx="50" cy="114" rx="22" ry="4" fill="#38f0ff" opacity=".35"/><path d="M50 12V3" stroke="#9fb8d1" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="4" r="4" fill="#ffd23f"/><ellipse cx="50" cy="44" rx="34" ry="32" fill="url(#paxb)" stroke="#9fb8d1" stroke-width="2"/><circle cx="50" cy="42" r="19" fill="#0b1a3a"/><g class="pax-eye"><circle cx="50" cy="42" r="14" fill="url(#paxe)"/><circle cx="50" cy="42" r="6" fill="#04122a"/><circle cx="45" cy="37" r="3.2" fill="#fff"/></g><rect class="pax-lid" x="30" y="22" width="40" height="0" fill="#cfe2f7"/><path d="M38 66q12 8 24 0" stroke="#5a6f8a" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M28 78q22 -8 44 0l-4 24q-18 8 -36 0z" fill="url(#paxb)" stroke="#9fb8d1" stroke-width="2"/><circle cx="50" cy="90" r="8.5" fill="none" stroke="#ff4f79" stroke-width="2.2"/><path d="M50 81.5v17M50 90l-6 6M50 90l6 6" stroke="#ff4f79" stroke-width="2.2" stroke-linecap="round"/><circle cx="17" cy="82" r="6" fill="url(#paxb)" stroke="#9fb8d1" stroke-width="2"/><circle cx="83" cy="82" r="6" fill="url(#paxb)" stroke="#9fb8d1" stroke-width="2"/></svg>';
const CSS = `
#pax-tab{position:fixed;right:0;top:42%;z-index:40;transform:translateY(-50%);writing-mode:vertical-rl;background:#fff;color:#0b1a3a;border:2px solid #38f0ff;border-right:0;border-radius:12px 0 0 12px;padding:12px 7px;font:800 13px Poppins,Segoe UI,Arial;letter-spacing:.04em;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.3);display:flex;gap:6px;align-items:center}
#pax-tab i{font-style:normal;writing-mode:horizontal-tb;font-size:16px} #pax-tab .pax-hide{writing-mode:horizontal-tb;font-size:12px;opacity:.55;margin-top:4px;padding:2px 4px;border-radius:6px} #pax-tab .pax-hide:hover{opacity:1;background:#eef}
#pax-stage{position:fixed;right:10px;bottom:84px;z-index:41;width:min(340px,94vw);pointer-events:none}
#pax-drone{position:absolute;right:-10px;bottom:calc(100% + 150px);transform:translateX(160vw);transition:transform 1.5s cubic-bezier(.2,.7,.2,1)} #pax-drone.in{transform:translateX(0)} #pax-drone.out{transform:translate(-160vw,-40vh);transition:transform 1.6s ease-in}
.pax-rotors{animation:paxspin .12s linear infinite;transform-origin:50% 10px} @keyframes paxspin{50%{transform:scaleX(.25)}}
#pax-beam{position:absolute;right:16px;bottom:100%;width:66px;height:0;margin-bottom:-6px;clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);background:linear-gradient(90deg,rgba(56,240,255,0),rgba(190,246,255,.75) 50%,rgba(56,240,255,0)),linear-gradient(180deg,rgba(255,255,255,.9),rgba(56,240,255,.25));filter:blur(1px);transition:height .5s ease-out,opacity .4s;opacity:0}
#pax-beam.on{height:160px;opacity:.9}
#pax-bot{position:absolute;right:12px;bottom:100%;margin-bottom:-4px;transform:translateY(-150px) scale(.3);opacity:0;transition:transform 1.1s cubic-bezier(.3,.9,.3,1),opacity .4s;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
#pax-bot.down{transform:translateY(0) scale(1);opacity:1;animation:paxbob 3.4s ease-in-out 1.2s infinite} @keyframes paxbob{50%{transform:translateY(-5px)}}
.pax-lid{animation:paxblink 5.5s infinite} @keyframes paxblink{0%,93%,100%{height:0}96%{height:40px}}
#pax-panel{pointer-events:auto;background:rgba(8,20,50,.96);border:1px solid rgba(124,248,255,.5);border-radius:16px;box-shadow:0 14px 40px rgba(0,0,0,.55);color:#fff;font:500 14px Poppins,Segoe UI,Arial;display:none;overflow:hidden}
#pax-panel.on{display:block} .pax-head{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(56,240,255,.12)} .pax-head b{font-size:14px} .pax-head small{display:block;font-weight:500;color:#9fc4e8;font-size:11px} .pax-x{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;padding:4px 8px}
.pax-log{max-height:min(38vh,300px);overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:7px} .pax-m{padding:8px 11px;border-radius:13px;max-width:88%;line-height:1.4} .pax-m.b{background:#fff;color:#0b1a3a;border-bottom-left-radius:4px;align-self:flex-start} .pax-m.u{background:#2f6bff;align-self:flex-end;border-bottom-right-radius:4px}
.pax-acts{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start} .pax-acts button,.pax-acts a{background:rgba(56,240,255,.16);border:1px solid rgba(124,248,255,.5);color:#fff;border-radius:99px;padding:6px 11px;font:600 12.5px Poppins,Segoe UI,Arial;cursor:pointer;text-decoration:none}
.pax-in{display:flex;gap:6px;padding:9px;border-top:1px solid rgba(124,248,255,.25)} .pax-in input{flex:1;min-width:0;border-radius:10px;border:0;padding:10px 12px;font:500 15px Poppins,Segoe UI,Arial} .pax-in button{border:0;border-radius:10px;background:#7cff6b;color:#04122a;font-weight:800;padding:0 14px;cursor:pointer}
.pax-form{display:grid;gap:6px;align-self:stretch} .pax-form input,.pax-form textarea{border-radius:9px;border:0;padding:9px 10px;font:500 14px Poppins,Segoe UI,Arial} .pax-form button{border:0;border-radius:10px;background:#7cff6b;color:#04122a;font-weight:800;padding:10px;cursor:pointer} .pax-off{position:absolute;left:-5000px;height:0;overflow:hidden}
body.wvm-modal-open #pax-tab,body.wvm-modal-open #pax-stage{display:none}
@media (prefers-reduced-motion: reduce){.pax-rotors,#pax-bot.down,.pax-lid{animation:none}#pax-drone,#pax-bot,#pax-beam{transition:none}}
`;

export function initBot(app, opts = {}) {
  if (document.getElementById('pax-tab')) return; let hidden = false; try { hidden = sessionStorage.getItem('pax_hide') === '1'; } catch (e) { } if (hidden) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const tab = document.createElement('button'); tab.id = 'pax-tab'; tab.type = 'button'; tab.innerHTML = '<i>✌️</i>Need a hand?<span class="pax-hide" title="Hide this tab">✕</span>'; document.body.appendChild(tab);
  const stage = document.createElement('div'); stage.id = 'pax-stage'; stage.innerHTML = '<div id="pax-drone">' + DRONE + '</div><div id="pax-beam"></div><div id="pax-bot" title="Pax">' + PAX + '</div><div id="pax-panel" role="dialog" aria-label="Pax the peace bot"><div class="pax-head"><div><b>Pax · peace bot ✌️</b><small>not AI · just a well-read robot</small></div><button class="pax-x" aria-label="Send Pax home">✕</button></div><div class="pax-log" aria-live="polite"></div><div class="pax-in"><input type="text" placeholder="zoo, beach, a store, a joke…" autocomplete="off" enterkeyhint="send" maxlength="140"><button type="button">Go</button></div></div>'; document.body.appendChild(stage);
  const $ = (q) => stage.querySelector(q); const drone = $('#pax-drone'), beam = $('#pax-beam'), bot = $('#pax-bot'), panel = $('#pax-panel'), log = $('.pax-log'), inp = $('.pax-in input'); let open = false, greeted = false, busy = false;
  const add = (cls, html) => { const d = document.createElement('div'); d.className = 'pax-m ' + cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  const acts = (list) => { if (!list.length) return; const w = document.createElement('div'); w.className = 'pax-acts'; for (const a of list) { const el = document.createElement(a.href ? 'a' : 'button'); el.textContent = a.label; if (a.href) { el.href = a.href; } else { el.type = 'button'; el.onclick = a.fn; } w.appendChild(el); } log.appendChild(w); log.scrollTop = log.scrollHeight; };
  const respond = (text) => { const r = paxReply(text, app); setTimeout(() => { add('b', esc(r.say)); const list = []; for (const p of (r.places || [])) list.push({ label: (p.icon || '📍') + ' ' + p.name, fn: () => app.travel(p) }); for (const p of (r.pages || [])) list.push({ label: '📄 ' + p[0], href: p[1] }); for (const c of (r.chips || [])) list.push({ label: c, fn: () => send(c.replace(/^[^a-zA-Z]+/, '')) }); acts(list); if (r.form) humanForm(); }, 350); };
  const send = (v) => { v = String(v || '').trim().slice(0, 140); if (!v) return; add('u', esc(v)); inp.value = ''; if (/find a place/i.test(v)) { add('b', 'Type where you want to go. A few favorites:'); acts(app.places.filter(p => p.top).slice(0, 6).map(p => ({ label: (p.icon || '📍') + ' ' + p.name, fn: () => app.travel(p) }))); return; } respond(v); };
  $('.pax-in button').onclick = () => send(inp.value);
  for (const ev of ['keydown', 'keyup', 'keypress']) stage.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Enter' && e.target === inp) send(inp.value); });
  function humanForm() {
    const f = document.createElement('div'); f.className = 'pax-form'; f.dataset.a = 'aW5mbw=='; f.dataset.b = 'ZXlldG9hZA=='; f.dataset.c = 'Y29t'; const born = Date.now(); let real = false;
    f.innerHTML = '<input name="name" placeholder="Your name" maxlength="80" autocomplete="name"><input name="reach" placeholder="Email or phone" maxlength="120"><textarea name="msg" rows="3" placeholder="How can we help?" maxlength="1200"></textarea><div class="pax-off" aria-hidden="true"><input name="_honey" tabindex="-1" autocomplete="off"></div><button type="button">Send to a human</button>';
    f.addEventListener('keydown', () => { real = true; }); f.addEventListener('pointerdown', () => { real = true; });
    const btn = f.querySelector('button'); btn.onclick = async () => {
      const v = (n) => f.querySelector('[name="' + n + '"]').value.trim(); if (!v('reach') || !v('msg')) { add('b', 'I need a way to reach you and a quick note. Then I will send it.'); return; }
      if (v('_honey') || !real || Date.now() - born < 3500) { add('b', 'Thanks! Message noted.'); f.remove(); return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      try { const to = atob(f.dataset.a) + String.fromCharCode(64) + atob(f.dataset.b) + '.' + atob(f.dataset.c); const host = ['https:', '', ['formsubmit', 'co'].join('.'), 'ajax', to].join('/');
        const r = await fetch(host, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ _subject: 'World VR Mall · help request (Pax)', _template: 'table', _captcha: 'false', name: v('name') || '(no name)', reach: v('reach'), message: v('msg'), page: location.pathname }) });
        const j = await r.json().catch(() => ({})); if (r.ok && String(j.success) === 'true') { add('b', '✅ Delivered to a real human. They will get back to you. Peace! ✌️'); f.remove(); } else throw new Error('not confirmed'); }
      catch (e) { btn.disabled = false; btn.textContent = 'Send to a human'; add('b', '⚠️ That did not go through on my end. Please call 1-800-481-8638 and a human will help right away.'); }
    }; log.appendChild(f); log.scrollTop = log.scrollHeight;
  }
  const summon = () => { if (busy || open) return; busy = true; tab.style.display = 'none'; drone.className = ''; void drone.offsetWidth; drone.classList.add('in');
    setTimeout(() => beam.classList.add('on'), 1300); setTimeout(() => bot.classList.add('down'), 1500);
    setTimeout(() => { beam.classList.remove('on'); drone.classList.remove('in'); drone.classList.add('out'); panel.classList.add('on'); open = true; busy = false; if (!greeted) { greeted = true; add('b', pick(['Hey! I am Pax. ✌️ Lost, curious, or need a laugh?', 'Pax here, fresh off the drone. What are we looking for?'])); acts([{ label: '🗺️ Find a place', fn: () => send('Find a place') }, { label: '😂 Tell me a joke', fn: () => send('Tell me a joke') }, { label: '🎢 The Chiller', fn: () => send('coaster') }, { label: '🏬 Lease a store', fn: () => send('lease a store') }, { label: '🙋 Talk to a human', fn: () => send('talk to a human') }]); } if (!('ontouchstart' in window)) inp.focus(); }, 2700); };
  const dismiss = () => { if (busy) return; busy = true; panel.classList.remove('on'); open = false; drone.className = ''; void drone.offsetWidth; drone.classList.add('in'); setTimeout(() => beam.classList.add('on'), 1200); setTimeout(() => bot.classList.remove('down'), 1400); setTimeout(() => { beam.classList.remove('on'); drone.classList.remove('in'); drone.classList.add('out'); tab.style.display = ''; busy = false; }, 2500); };
  tab.onclick = (e) => { if (e.target.classList.contains('pax-hide')) { tab.remove(); stage.remove(); try { sessionStorage.setItem('pax_hide', '1'); } catch (er) { } return; } summon(); };
  $('.pax-x').onclick = dismiss; bot.onclick = () => { if (open) { panel.classList.toggle('on'); } };
  app.pax = { summon, dismiss, send };
}
