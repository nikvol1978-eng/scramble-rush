#!/usr/bin/env node
// Two real authenticated players, ten real production rounds, one report.
//
//   node tools/two-player-verify.mjs                # 10 rounds
//   SR_RUNS=3 node tools/two-player-verify.mjs      # fewer, while iterating
//   SR_KEEP_GRANT=1 node tools/two-player-verify.mjs   # skip the revoke at the end
//
// WHY THIS EXISTS. The joiner's course preparation could only ever be proved
// by a second real account against the real server: the defect it replaces --
// a call to a function nothing defined -- was invisible to every local check
// because every local check drove the HOST's path. Doing that by hand means
// two windows, two consoles and a paste per round, and the first manual
// attempt produced two captures that looked identical and a readiness count of
// 0/1 with nothing able to say which window either came from.
//
// ---- the three things that made the manual run unreadable ----------------
//
// TELEMETRY INSTALLED TOO LATE. hostRoom() registers mp.peer.on('connection')
// when the room is made (base.html:422), so a capture pasted after that never
// wraps the host's connection and the host looks like it sent nothing. Here
// the capture goes in through evaluateOnNewDocument -- before one line of page
// script runs -- so there is no window in which it can be late.
//
// NOTHING SAID WHICH WINDOW A REPORT CAME FROM. Every report now carries the
// player id it was taken from, and the runner refuses a pair whose ids match.
//
// START PRESSED BEFORE THE PEER WAS IN THE ROOM. #startMpBtn is un-hidden the
// moment the host creates the room -- it does not wait for anybody -- and
// `expect` is computed as open connections + 1 at the instant START is
// pressed. Press it alone and the host declares a one-player match and skips
// the broadcast entirely, which is exactly the 0/1 the manual run recorded.
// The runner waits for the host's own roster to show both players.
//
// ---- and one thing that is deliberately NOT headful ----------------------
// rAF does not fire in a window the OS considers hidden, and two headful
// windows cannot both be in front. A headless page always counts as visible,
// so both sides get frames. Headful is used only for the one-time sign-in.
import { mkdirSync, existsSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ORIGIN = process.env.SR_ORIGIN || 'https://nikcade.win';
const GAME = ORIGIN + '/play/scramble-rush';
const RUNS = Number(process.env.SR_RUNS || 10);
const PROFILES = process.env.SR_PROFILES || 'C:/Users/nikvo/sr-verify-profiles';
const KEEP_GRANT = process.env.SR_KEEP_GRANT === '1';
const LOGIN_TIMEOUT = Number(process.env.SR_LOGIN_TIMEOUT || 1800000);
const DROP = 'scramble-rush';
const HOME_DIR = process.env.SR_HOME || 'C:/Users/nikvo';
// The two accounts this verification is about, by id prefix. They are asserted
// rather than assumed: a run that quietly used some other pair of sessions
// would produce a table that looks exactly as convincing and means nothing.
const EXPECT_A = process.env.SR_EXPECT_A || '70af44bb';
const EXPECT_B = process.env.SR_EXPECT_B || '83d901b3';

const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
              '--mute-audio', '--window-size=1280,860'];
const VIEW = { width: 1280, height: 860 };

// ---------------------------------------------------------------- capture
// Injected before any page script. It observes and forwards; it changes no
// behaviour and no value the game reads.
const CAPTURE = `(()=>{
if(window.__c) return;
const t0=performance.now(), n=()=>Math.round(performance.now()-t0);
const c={pr:[],ps:[],out:[],inn:[],err:[],ui:[],acks:[],wsUrls:[],wsClose:[],wsNew:0,wsErr:0,wrapped:0,dcSends:0,who:null,sr:null};
window.__c=c;
const fp=o=>{const s=JSON.stringify(o===undefined?null:o);let h=5381;for(let i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;return h.toString(16)+':'+s.length};
const d=o=>(!o||o.type!=='roundStart')?{t:o&&o.type,at:n()}:{t:'roundStart',at:n(),round:o.round,map:o.mapDef&&o.mapDef.key,name:o.mapDef&&o.mapDef.name,path:o.mapDef&&o.mapDef.path,len:o.trackLength,obs:Array.isArray(o.obstacles)?o.obstacles.length:'BAD',scr:Array.isArray(o.courseScript)?o.courseScript.length:(o.courseScript===null?'null':'MISSING'),sfp:fp(o.courseScript||null),ofp:fp(o.obstacles||null),keys:Object.keys(o).sort().join(',')};
const wc=(x,b)=>{if(!x||x.__c)return x;x.__c=1;c.wrapped++;try{x.on('data',v=>{try{b.push(d(v))}catch(e){}});const s=x.send.bind(x);x.send=v=>{try{c.ps.push(d(v))}catch(e){}return s(v)}}catch(e){}return x};
const wp=P=>{if(!P||P.__c)return P;P.__c=1;const p=P.prototype,cn=p.connect,on=p.on;
 if(cn)p.connect=function(){return wc(cn.apply(this,arguments),c.pr)};
 if(on)p.on=function(e,f){return(e==='connection'&&typeof f==='function')?on.call(this,e,function(k){wc(k,c.pr);return f.apply(this,arguments)}):on.apply(this,arguments)};
 return P};
let P=window.Peer; if(P) wp(P);
try{Object.defineProperty(window,'Peer',{configurable:true,get:()=>P,set:v=>{P=wp(v)}})}catch(e){}
try{const ds=RTCDataChannel.prototype.send;RTCDataChannel.prototype.send=function(){c.dcSends++;return ds.apply(this,arguments)}}catch(e){}
const R=/^\\d+\\["(sr:[^"]+)"/;
/* ACKS, TOO. An emit with a callback comes back as 43<id>[payload] with no
   event name in it, so the event regex below cannot see it -- and the reply to
   sr:join is the single most informative frame in the whole exchange: it
   carries the matchId, or an error, or never arrives at all. Without it, a
   client that asked to join and was refused looks exactly like one that
   joined and heard nothing. */
const ACK=/^43\\d*\\[/;
const nt=(r,o)=>{if(typeof r!=='string')return;
 if(ACK.test(r)){let p=null;try{p=JSON.parse(r.slice(r.indexOf('[')))[0]}catch(e){}
  c.acks.push({at:n(),keys:(p&&typeof p==='object')?Object.keys(p).join(','):String(p),
   matchId:!!(p&&p.matchId),error:(p&&p.error)||null,late:(p&&p.late)||false});return}
 const m=r.match(R);if(!m)return;let p=null;try{p=JSON.parse(r.slice(r.indexOf('[')))[1]}catch(e){}
 const x={ev:m[1],at:n()};if(p&&typeof p==='object')for(const k of ['phase','readyCount','requiredCount','raceStartAt','serverNow','code','expect'])if(p[k]!==undefined)x[k]=p[k];o.push(x)};
/* The socket itself: how many were opened, to where, and whether any closed.
   A join that was never answered because the transport never came up is a
   different fault from one the server refused. */
try{const OW=window.WebSocket;window.WebSocket=new Proxy(OW,{construct(T,a){
 c.wsNew++;c.wsUrls.push(String(a[0]).slice(0,100));const s=new T(...a);
 try{s.addEventListener('close',(e)=>c.wsClose.push({at:n(),code:e.code}));
     s.addEventListener('error',()=>c.wsErr++)}catch(q){}
 return s}})}catch(e){}
const ws=WebSocket.prototype.send;WebSocket.prototype.send=function(v){try{nt(v,c.out)}catch(e){}return ws.apply(this,arguments)};
const wa=WebSocket.prototype.addEventListener;WebSocket.prototype.addEventListener=function(e,f,o){return(e==='message'&&typeof f==='function')?wa.call(this,e,function(k){try{nt(k.data,c.inn)}catch(q){}return f.apply(this,arguments)},o):wa.apply(this,arguments)};
/* THE ONMESSAGE PROPERTY, WHICH IS THE ONE THAT MATTERED.
   engine.io opens on XHR polling and then upgrades to a websocket, and its
   websocket transport assigns ws.onmessage = fn rather than calling
   addEventListener. Hooking only addEventListener therefore captured the
   frames before the upgrade and nothing after it -- which looked exactly like
   a match that stopped at 0/1 and never counted down, on a round that had in
   fact reached GO on both screens. A measurement that goes quiet halfway is
   worse than one that fails, because it reads as evidence. */
try{const D=Object.getOwnPropertyDescriptor(WebSocket.prototype,'onmessage');
 if(D&&D.set)Object.defineProperty(WebSocket.prototype,'onmessage',{configurable:true,enumerable:D.enumerable,
  get(){return D.get?D.get.call(this):undefined},
  set(f){D.set.call(this,typeof f==='function'?function(e){try{nt(e.data,c.inn)}catch(q){}return f.apply(this,arguments)}:f)}})}catch(e){}
const xs=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(b){try{if(typeof b==='string')b.split('\\u001e').forEach(f=>nt(f,c.out))}catch(e){}
 this.addEventListener('load',()=>{try{String(this.responseText).split('\\u001e').forEach(f=>nt(f,c.inn))}catch(e){}});return xs.apply(this,arguments)};
const ce=console.error;console.error=function(){try{c.err.push({at:n(),s:[...arguments].map(String).join(' ').slice(0,400)})}catch(e){}return ce.apply(console,arguments)};
let L=null;setInterval(()=>{try{const b=document.getElementById('matchLoader');if(!b||b.classList.contains('hidden'))return;
 const g=i=>(document.getElementById(i)||{}).textContent||'';
 const s=[g('mlMsg'),g('mlName'),g('mlNote'),g('mlCountNum'),b.classList.contains('failed')?'FAILED':'',g('mlFailMsg')].join('|');
 if(s!==L){L=s;c.ui.push({at:n(),s})}}catch(e){}},100);
window.__r=()=>{const rs=c.pr.filter(x=>x.t==='roundStart'),ss=c.ps.filter(x=>x.t==='roundStart'),
 cd=c.inn.filter(x=>x.phase==='countdown'&&x.raceStartAt!=null),ga=c.inn.filter(x=>x.phase==='gathering'),
 f=cd[0]||null,lg=ga.length?ga[ga.length-1]:null,jo=c.out.filter(x=>x.ev==='sr:join')[0]||null;
 return{who:c.who,srAccess:c.sr,wrappedConns:c.wrapped,dcSends:c.dcSends,
  acks:c.acks,wsNew:c.wsNew,wsUrls:c.wsUrls,wsClose:c.wsClose,wsErr:c.wsErr,
  /* THE CONTRACT, MEASURED OFF THE COUNTDOWN FRAME ITSELF. The gathering
     frame before it is whenever the server last ticked, not the instant
     readiness completed, so raceStartAt minus THAT reads a few tens of ms
     over and understates nothing but my own sampling. Every state carries
     serverNow beside raceStartAt precisely so the remaining time can be read
     without a shared clock. */
  countdownGap:f?(f.raceStartAt-f.serverNow):null,
  roleByPeer:ss.length?'host':(rs.length?'joiner':'?'),
  roleBySocket:jo?(jo.expect!==undefined?'host':'joiner'):'no sr:join',expect:jo?jo.expect:null,
  matchCode:jo?jo.code:null,sent:ss[ss.length-1]||null,recv:rs[rs.length-1]||null,
  join:c.out.some(x=>x.ev==='sr:join'),ready:c.out.some(x=>x.ev==='sr:ready'),
  readySeq:ga.map(x=>x.readyCount+'/'+x.requiredCount),
  raceStartAt:f?f.raceStartAt:null,allReady:lg?lg.serverNow:null,
  gap:(f&&lg)?f.raceStartAt-lg.serverNow:null,
  counted:[...new Set(c.ui.map(x=>x.s.split('|')[3]).filter(v=>/^\\d+$/.test(v)))],
  failed:c.ui.filter(x=>x.s.indexOf('FAILED')>=0).map(x=>x.s),
  errs:c.err.filter(x=>/scramble-rush|prepare|Could not/i.test(x.s))}};
})()`;

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function launch(profile, headless) {
  const dir = join(PROFILES, profile);
  mkdirSync(dir, { recursive: true });
  return puppeteer.launch({
    headless, userDataDir: dir, args: ARGS, defaultViewport: VIEW, protocolTimeout: 300000,
  });
}

async function newPage(browser) {
  const page = await browser.newPage();
  page.__errs = [];                       // before the handler that writes to it
  await page.evaluateOnNewDocument(CAPTURE);
  page.on('pageerror', (e) => page.__errs.push('pageerror: ' + String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') page.__errs.push('console: ' + m.text()); });
  return page;
}

// Whose session is this profile holding? Answered from the server, never from
// anything cached in the page.
async function whoami(page) {
  await page.goto(ORIGIN + '/auth/me', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page.evaluate(() => {
    try {
      const j = JSON.parse(document.body.innerText);
      return {
        id: j.player ? j.player.id : null,
        nickname: j.player ? j.player.nickname : null,
        accountRole: j.player ? j.player.role : null,
        role: j.role ? j.role.name : null,
        hasDrop: j.drops ? ('scramble-rush' in j.drops) : false,
        dropFlag: j.drops ? (j.drops['scramble-rush'] ?? null) : null,
      };
    } catch (e) { return { id: null, parseError: String(e.message) }; }
  });
}

// ---- sessions come from profiles that are ALREADY signed in --------------
//
// NOT BY LOGGING IN HERE. Google refuses OAuth inside an automation-controlled
// browser -- "this browser or app may not be secure" -- and it is right to:
// driving somebody's sign-in through CDP is exactly what that check exists to
// stop. The session already exists on this machine, so the session is what
// gets reused.
//
// WHAT IS COPIED, AND WHY IT IS ENOUGH. A Chromium profile keeps its cookies
// in an encrypted database whose key lives in the user-data root's `Local
// State`, bound to the Windows account. Copy both into a fresh user-data dir
// belonging to the same Windows user and the session comes with them. Nothing
// is decrypted here, no value is read, and no cookie ever leaves this machine
// or appears in any output.
//
// COPIES, NEVER THE ORIGINALS. The source profiles are read and duplicated, so
// a browser the person is using cannot be disturbed, cannot be modified, and
// cannot be locked out by this process holding its profile open.
//
// AND THE SOURCE IS IDENTIFIED BY WHO IT IS, NOT BY WHAT IT IS CALLED. On this
// machine `nikcade-playerB-profile` holds player A and `nikcade-lh-profile`
// holds player B. Assigning by directory name would have swapped the two
// players and then verified, in detail and with confidence, the wrong thing.
// Each candidate is seeded, asked `/auth/me`, and placed by the id it answers.
const SOURCES = (process.env.SR_SOURCES || [
  join(HOME_DIR, 'nikcade-playerB-profile') + '|Default',
  join(HOME_DIR, 'nikcade-lh-profile') + '|Default',
  join(HOME_DIR, 'AppData/Local/Google/Chrome/User Data') + '|Profile 1',
  join(HOME_DIR, 'AppData/Local/Google/Chrome/User Data') + '|Default',
].join(',')).split(',').filter(Boolean);

function seedFrom(root, profile, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, 'Default/Network'), { recursive: true });
  let copied = 0;
  for (const [from, to] of [
    [join(root, 'Local State'), join(dest, 'Local State')],
    [join(root, profile, 'Network/Cookies'), join(dest, 'Default/Network/Cookies')],
    [join(root, profile, 'Preferences'), join(dest, 'Default/Preferences')],
  ]) {
    if (!existsSync(from)) continue;
    try { copyFileSync(from, to); copied++; } catch { /* locked: the rest may still be enough */ }
  }
  return copied;
}

async function idOfProfile(dir) {
  let b;
  try {
    b = await puppeteer.launch({ headless: true, userDataDir: dir, args: ARGS, defaultViewport: VIEW });
    const p = await b.newPage();
    return await whoami(p);
  } catch { return { id: null }; } finally { if (b) await b.close(); }
}

// Seed both verifier profiles from whichever local profiles hold the two
// accounts. Returns what each verifier profile ended up holding.
async function seedProfiles() {
  log('-- sessions --');
  const found = [];
  for (const spec of SOURCES) {
    const [root, profile] = spec.split('|');
    if (!existsSync(join(root, profile))) continue;
    const probe = join(PROFILES, '_probe');
    if (!seedFrom(root, profile, probe)) continue;
    const who = await idOfProfile(probe);
    const shown = root.replace(HOME_DIR, '~') + '/' + profile;
    log(`  ${shown.padEnd(56)} ${who.id ? who.id.slice(0, 8) + '…  role=' + who.role : 'signed out'}`);
    if (who.id) found.push({ root, profile, who });
    rmSync(probe, { recursive: true, force: true });
  }
  const pick = (prefix) => found.find((f) => f.who.id.startsWith(prefix));
  const srcA = pick(EXPECT_A), srcB = pick(EXPECT_B);
  if (!srcA) throw new Error(`no local profile holds player ${EXPECT_A}… (Player A). Sign in as A in a normal Chrome window, then run this again.`);
  if (!srcB) throw new Error(`no local profile holds player ${EXPECT_B}… (Player B). Sign in as B in a normal Chrome window, then run this again.`);
  if (srcA.who.id === srcB.who.id) throw new Error('both sources resolve to the same account');
  seedFrom(srcA.root, srcA.profile, join(PROFILES, 'A'));
  seedFrom(srcB.root, srcB.profile, join(PROFILES, 'B'));
  log(`  -> A from ${(srcA.root.replace(HOME_DIR, '~') + '/' + srcA.profile)}`);
  log(`  -> B from ${(srcB.root.replace(HOME_DIR, '~') + '/' + srcB.profile)}`);
  return { A: await idOfProfile(join(PROFILES, 'A')), B: await idOfProfile(join(PROFILES, 'B')) };
}

// ---- the OAuth path, kept only to say why it is not taken ----------------
async function ensureSignedIn(profile, label) {
  let b = await launch(profile, true);
  let page = await b.newPage();
  let who = await whoami(page);
  if (who.id) { await b.close(); return who; }
  await b.close();

  log(`\n  ==================================================================`);
  log(`  ${label}: NOT SIGNED IN. A Chrome window is opening now.`);
  log(`  Sign in as ${label} in the FIRST tab, then leave it alone.`);
  log(`  Waiting up to ${Math.round(LOGIN_TIMEOUT / 60000)} minutes...`);
  log(`  ==================================================================`);
  b = await launch(profile, false);
  page = await b.newPage();
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try { await page.bringToFront(); } catch { /* best effort */ }

  // THE POLL TOUCHES NO TAB AT ALL.
  //
  // Two earlier shapes of this were both wrong. Asking the SIGN-IN tab failed
  // for Player A specifically: a Google sign-in takes that tab to
  // accounts.google.com, and a fetch of nikcade.win from that origin is
  // cross-origin and refused, so the poll saw "not signed in" for as long as
  // the tab sat on the provider. Player B signs in by email and never leaves
  // the origin, so the same code would have worked for B and hung for A.
  //
  // A second TAB fixed the origin problem and introduced a worse one: it
  // reloads every few seconds in a window somebody is trying to type into.
  //
  // So the session is read from the profile's COOKIES and the request is made
  // from node. One tab, nothing navigating underneath the person, and the
  // answer comes from the server either way.
  const t0 = Date.now();
  let beat = 0;
  while (Date.now() - t0 < LOGIN_TIMEOUT) {
    await sleep(3000);
    let got = null;
    try {
      const jar = await page.cookies(ORIGIN);
      if (jar.length) {
        const cookie = jar.map((c) => `${c.name}=${c.value}`).join('; ');
        const r = await fetch(ORIGIN + '/auth/me', { headers: { Cookie: cookie } });
        const j = await r.json();
        got = j.player ? j.player.id : null;
      }
    } catch { /* mid-navigation, or the network blinked; ask again shortly */ }
    if (got) {
      log(`\n  ${label}: SIGNED IN as ${got.slice(0, 8)}… — closing this window.`);
      await b.close();
      const b2 = await launch(profile, true);
      const p2 = await b2.newPage();
      const w = await whoami(p2);
      await b2.close();
      return w;
    }
    if (++beat % 10 === 0) log(`  ...still waiting for ${label} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  await b.close();
  throw new Error(`${label} did not sign in within ${Math.round(LOGIN_TIMEOUT / 1000)}s`);
}

// ---------------------------------------------------------------- the grant
// Looked up BY PLAYER ID. The email stays inside the browser process: it is
// what the route wants, and it is not something this run needs to print,
// store or carry anywhere.
async function setGrant(pageA, targetId, on) {
  return pageA.evaluate(async (id, key, want) => {
    const st = await (await fetch('/auth/admin', { credentials: 'include' })).json();
    if (!st || !Array.isArray(st.accounts)) return { error: 'admin state unavailable' };
    const acc = st.accounts.find((a) => a.id === id);
    if (!acc) return { error: 'target account not in the admin listing' };
    const r = await fetch('/auth/admin/grant', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: acc.email, key, on: want }),
    });
    const j = await r.json();
    if (j.error) return { error: j.error };
    const after = (j.accounts || []).find((a) => a.id === id);
    return { ok: true, grants: after ? after.grants : null, role: after ? after.role : null };
  }, targetId, DROP, on);
}

// ---------------------------------------------------------------- the round
const sel = {
  modeSelect: '#modeSelect',
  card: '#modeGrid .modeCard',
  go: '#modeGo',
  mpHome: '#mpHome',
  host: '#hostRoomBtn',
  code: '#lobbyCode',
  joinInput: '#joinCodeInput',
  joinBtn: '#joinRoomBtn',
  start: '#startMpBtn',
  roster: '#rosterList .rosterRow',
  loader: '#matchLoader',
  hud: '#hud',
};
const visible = (s) => `(()=>{const e=document.querySelector(${JSON.stringify(s)});return !!e && !e.classList.contains('hidden')})()`;

async function bootToModeSelect(page) {
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // A 403 is the access gate answering, not a slow boot -- say so immediately
  // rather than spending ninety seconds waiting for a screen that is not coming.
  const gated = await page.evaluate(() => document.body.innerText.slice(0, 200));
  if (/not authorised|forbidden|403/i.test(gated) && gated.length < 200) {
    throw new Error('the game route refused this session: ' + gated.trim());
  }
  await page.waitForFunction(visible(sel.modeSelect), { timeout: 90000, polling: 500 });
  await page.evaluate(() => { try { window.__c.who = null; } catch (e) {} });
}

async function toMultiplayer(page) {
  await page.waitForFunction(`document.querySelectorAll('#modeGrid .modeCard').length >= 2`,
    { timeout: 30000, polling: 250 });
  await page.evaluate(() => document.querySelectorAll('#modeGrid .modeCard')[1].click());
  await page.evaluate(() => document.querySelector('#modeGo').click());
  await page.waitForFunction(visible(sel.mpHome), { timeout: 30000, polling: 250 });
}

async function stamp(page, id) { await page.evaluate((v) => { window.__c.who = v; }, id); }

async function report(page) { return page.evaluate(() => window.__r()); }

// ---------------------------------------------------------------- one run
async function runOnce(pageA, pageB, idA, idB, i) {
  const t0 = Date.now();
  // Per run, or run 7 inherits every console line runs 1-6 produced and the
  // verdict stops being about the round it names.
  pageA.__errs.length = 0; pageB.__errs.length = 0;
  await Promise.all([bootToModeSelect(pageA), bootToModeSelect(pageB)]);
  await stamp(pageA, idA); await stamp(pageB, idB);
  await Promise.all([toMultiplayer(pageA), toMultiplayer(pageB)]);

  await pageA.evaluate(() => document.querySelector('#hostRoomBtn').click());
  await pageA.waitForFunction(
    `(()=>{const e=document.querySelector('#lobbyCode');return !!e && /^[A-Z0-9]{4,6}$/.test(e.textContent.trim())})()`,
    { timeout: 45000, polling: 250 });
  const code = (await pageA.$eval(sel.code, (e) => e.textContent.trim()));

  await pageB.evaluate((c) => {
    const inp = document.querySelector('#joinCodeInput');
    inp.value = c;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#joinRoomBtn').click();
  }, code);

  // THE PEER MUST BE IN THE ROOM BEFORE START. #startMpBtn is un-hidden when
  // the room is made, not when anybody joins, and `expect` is counted at the
  // instant it is pressed -- so pressing it early declares a ONE player match
  // and skips the broadcast entirely. Waiting on the host's own roster is the
  // same thing a person does when they look at the screen before starting.
  await pageA.waitForFunction(
    `(()=>{const r=[...document.querySelectorAll('#rosterList .rosterRow')];
       return r.length>=2 && !r.some(x=>/Connecting/i.test(x.textContent))})()`,
    { timeout: 60000, polling: 250 });

  await pageA.evaluate(() => document.querySelector('#startMpBtn').click());

  // GO is the loader gone and the HUD up -- the same two facts a player sees.
  const reachedGo = async (p) => {
    try {
      await p.waitForFunction(
        `(()=>{const l=document.querySelector('#matchLoader'), h=document.querySelector('#hud');
           return !!l && l.classList.contains('hidden') && !!h && !h.classList.contains('hidden')})()`,
        { timeout: 60000, polling: 250 });
      return true;
    } catch { return false; }
  };
  const [goA, goB] = await Promise.all([reachedGo(pageA), reachedGo(pageB)]);

  const [rA, rB] = await Promise.all([report(pageA), report(pageB)]);
  return { i, code, goA, goB, A: rA, B: rB, ms: Date.now() - t0,
           pageErrsA: [...pageA.__errs], pageErrsB: [...pageB.__errs] };
}

// ---------------------------------------------------------------- verdict
function judge(r) {
  const bad = [];
  const { A, B } = r;
  if (!A.who || !B.who) bad.push('a report carries no player id');
  else if (A.who === B.who) bad.push('both reports came from the same account ' + A.who);
  if (A.roleBySocket !== 'host') bad.push('A is ' + A.roleBySocket + ' (expect=' + A.expect + '), wanted host');
  if (B.roleBySocket !== 'joiner') bad.push('B is ' + B.roleBySocket + ', wanted joiner');
  if (A.expect !== 2) bad.push('the host declared a ' + A.expect + '-player match');
  if (!A.matchCode || A.matchCode !== B.matchCode) bad.push('different matches: A ' + A.matchCode + ' vs B ' + B.matchCode);
  if (!A.sent) bad.push('the host broadcast no roundStart');
  if (!B.recv) bad.push('the joiner received no roundStart');
  if (A.sent && B.recv) {
    if (A.sent.map !== B.recv.map) bad.push('map: A ' + A.sent.map + ' vs B ' + B.recv.map);
    if (A.sent.len !== B.recv.len) bad.push('trackLength: A ' + A.sent.len + ' vs B ' + B.recv.len);
    if (A.sent.obs !== B.recv.obs) bad.push('obstacles: A ' + A.sent.obs + ' vs B ' + B.recv.obs);
    if (A.sent.ofp !== B.recv.ofp) bad.push('obstacle fingerprint differs');
    if (A.sent.sfp !== B.recv.sfp) bad.push('course-script fingerprint differs: A ' + A.sent.sfp + ' vs B ' + B.recv.sfp);
    if (B.recv.scr === 'MISSING') bad.push('the joiner got no courseScript at all');
  }
  if (!B.join) bad.push('B never emitted sr:join');
  if (!B.ready) bad.push('B never emitted sr:ready');
  if (!A.join) bad.push('A never emitted sr:join');
  if (!B.readySeq.some((s) => s.endsWith('/2'))) bad.push('the match never required 2 players: ' + B.readySeq.join(' '));
  if (B.failed.length) bad.push('B saw a failure panel: ' + B.failed.join(' ; '));
  if (A.failed.length) bad.push('A saw a failure panel: ' + A.failed.join(' ; '));
  if (B.errs.length) bad.push('B logged ' + B.errs.length + ' pre-match error(s): ' + B.errs.map((e) => e.s).join(' | ').slice(0, 300));
  if (A.errs.length) bad.push('A logged ' + A.errs.length + ' pre-match error(s)');
  if (!r.goA) bad.push('A never reached GO');
  if (!r.goB) bad.push('B never reached GO');
  if (A.raceStartAt == null || B.raceStartAt == null) bad.push('a side never saw a countdown state');
  else if (A.raceStartAt !== B.raceStartAt) bad.push('raceStartAt differs by ' + (B.raceStartAt - A.raceStartAt) + 'ms');
  // THE CONTRACT, measured off the countdown frame's own serverNow rather than
  // the gathering frame before it -- that one is whenever the server last
  // ticked, so it reads a few tens of ms over and is a property of my sampling
  // rather than of the promise. A frame emitted on the transition tick gives
  // exactly COUNTDOWN_MS; a later one gives less, never more.
  for (const [w, s] of [['A', A], ['B', B]]) {
    if (s.countdownGap == null) continue;
    if (s.countdownGap > 10000) bad.push(w + ' was promised ' + s.countdownGap + 'ms, longer than the contract');
    if (s.countdownGap < 9000) bad.push(w + ' was promised only ' + s.countdownGap + 'ms');
  }
  const ge = [...r.pageErrsA, ...r.pageErrsB].filter((e) => !/404|favicon/i.test(e));
  if (ge.length) bad.push('page errors: ' + ge.slice(0, 3).join(' | '));
  return bad;
}

// ---------------------------------------------------------------- main
// SIGN-IN IS ITS OWN COMMAND, one profile at a time.
//
// Doing both inside the verification run meant a window opening, a window
// closing and a second window opening while somebody was still reading the
// first -- and if anything downstream threw, every window went with the
// process. `--login A` opens exactly one window, waits for that one session,
// says so, and stops. Nothing else happens in that invocation.
async function login(which) {
  const label = which === 'A' ? 'Player A (owner)' : 'Player B (ordinary)';
  const who = await ensureSignedIn(which, label);
  log('\n-- session --');
  log(`  ${which}  ${who.id}  role=${who.role}  accountRole=${who.accountRole}  ` +
      `${DROP}=${who.hasDrop ? who.dropFlag : 'NO ACCESS'}`);
  log(`\nOK — profile ${which} is signed in and saved in ${join(PROFILES, which)}.`);
  process.exit(0);
}

async function main() {
  const wantLogin = (process.argv.find((a) => a.startsWith('--login')) || '').split('=')[1]
    || (process.argv[process.argv.indexOf('--login') + 1] || '').toUpperCase();
  if (process.argv.includes('--login')) {
    if (wantLogin !== 'A' && wantLogin !== 'B') { log('usage: --login A   |   --login B'); process.exit(2); }
    return login(wantLogin);
  }

  log('Scramble Rush — two-player production verification');
  log(`origin ${ORIGIN}   runs ${RUNS}   profiles ${PROFILES}\n`);

  const seeded = await seedProfiles();
  const whoA = seeded.A, whoB = seeded.B;

  log('\n-- preconditions --');
  log(`  A  ${whoA.id}  role=${whoA.role}  accountRole=${whoA.accountRole}  ${DROP}=${whoA.hasDrop ? whoA.dropFlag : 'NO ACCESS'}`);
  log(`  B  ${whoB.id}  role=${whoB.role}  accountRole=${whoB.accountRole}  ${DROP}=${whoB.hasDrop ? whoB.dropFlag : 'NO ACCESS'}`);
  const pre = [];
  if (!whoA.id || !whoA.id.startsWith(EXPECT_A)) pre.push(`A is ${whoA.id}, wanted ${EXPECT_A}…`);
  if (!whoB.id || !whoB.id.startsWith(EXPECT_B)) pre.push(`B is ${whoB.id}, wanted ${EXPECT_B}…`);
  if (!whoA.id || !whoB.id) pre.push('a profile is not signed in');
  if (whoA.id === whoB.id) pre.push('both profiles hold the SAME account');
  if (whoA.role !== 'owner') pre.push('A is ' + whoA.role + ', wanted owner');
  if (whoB.role !== null) pre.push('B is ' + whoB.role + ', wanted an ordinary account');
  if (!whoA.hasDrop) pre.push('A has no scramble-rush access');
  if (pre.length) { log('\nPRECONDITIONS FAILED:\n  ' + pre.join('\n  ')); process.exit(1); }

  const bA = await launch('A', true); const bB = await launch('B', true);
  const pageA = await newPage(bA); const pageB = await newPage(bB);
  let granted = false;
  const rows = [];
  try {
    if (!whoB.hasDrop) {
      await pageA.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const g = await setGrant(pageA, whoB.id, true);
      if (g.error) { log('\nGRANT FAILED: ' + g.error); process.exit(1); }
      granted = true;
      const after = await whoami(pageB);
      log(`\n  granted ${DROP} to B -> ${after.hasDrop ? after.dropFlag : 'STILL NO ACCESS'}  role=${after.role}`);
      if (!after.hasDrop) { log('GRANT DID NOT TAKE EFFECT'); process.exit(1); }
      if (after.role !== null) { log('THE GRANT CHANGED B\u2019S ROLE — backing out'); await setGrant(pageA, whoB.id, false); process.exit(1); }
    } else {
      // B ALREADY HOLDS IT, AND IT STILL COMES OFF AT THE END. This run did not
      // put it there, but a temporary grant for a verification is exactly what
      // it is, and leaving it because of an accident of ordering would leave an
      // ordinary account holding a gated game indefinitely. Said out loud so
      // the report does not imply this run granted it.
      granted = true;
      log(`\n  B already holds ${DROP} (${whoB.dropFlag}) — not re-granting; it WILL be revoked at the end`);
      if (whoB.dropFlag !== 'Invite only') {
        log(`  NOTE: the flag is "${whoB.dropFlag}", not "Invite only" — B may be inside the drop's`);
        log('        AUDIENCE rather than holding a personal grant. Revoking a personal grant would');
        log('        then change nothing, and the audience is not this run’s to touch.');
      }
    }

    log('\n-- runs --');
    for (let i = 1; i <= RUNS; i++) {
      let r, bad;
      try {
        r = await runOnce(pageA, pageB, whoA.id, whoB.id, i);
        bad = judge(r);
      } catch (e) {
        log(`  run ${i}  INVALID — ${e.message}`);
        rows.push({ i, invalid: e.message });
        break;
      }
      rows.push({ ...r, bad });
      const map = (r.A.sent && r.A.sent.name) || (r.B.recv && r.B.recv.name) || '?';
      log(`  run ${i}  ${bad.length ? 'FAIL' : 'PASS'}  ${map}  code=${r.code}  ` +
          `gap=${r.A.gap}ms  startA=${r.A.raceStartAt}  startB=${r.B.raceStartAt}  ${Math.round(r.ms / 1000)}s`);
      if (bad.length) { bad.forEach((b) => log('        ! ' + b)); break; }
    }
  } finally {
    const passed = rows.filter((r) => r.bad && r.bad.length === 0).length;
    // The revoke runs whatever happened, but only if THIS run granted it.
    if (granted && !KEEP_GRANT) {
      log('\n-- revoke --');
      try {
        await pageA.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const g = await setGrant(pageA, whoB.id, false);
        log('  revoke: ' + (g.error ? 'FAILED ' + g.error : 'ok, grants now ' + JSON.stringify(g.grants) + ' role=' + g.role));
        const afterB = await whoami(pageB);
        const afterA = await whoami(pageA);
        log(`  B  ${DROP}=${afterB.hasDrop ? 'STILL HAS ACCESS' : 'no access'}  role=${afterB.role}`);
        log(`  A  ${DROP}=${afterA.hasDrop ? 'still has access' : 'LOST ACCESS'}`);
        const anon = await fetch(GAME).then((r) => r.status).catch(() => 'ERR');
        log(`  anonymous ${GAME} -> ${anon}`);
      } catch (e) { log('  revoke step threw: ' + e.message); }
    }

    const out = join(ROOT, 'two-player-verification.json');
    writeFileSync(out, JSON.stringify({ whoA: whoA.id, whoB: whoB.id, rows }, null, 1));
    log(`\n-- report --  (full evidence: ${out})`);
    log('run | map              | prep | join | ready | shape | raceStartAt A  | raceStartAt B  | gap    | console');
    for (const r of rows) {
      if (r.invalid) { log(`${String(r.i).padStart(3)} | INVALID: ${r.invalid}`); continue; }
      const map = ((r.A.sent && r.A.sent.name) || (r.B.recv && r.B.recv.name) || '?').padEnd(16).slice(0, 16);
      const shape = (r.A.sent && r.B.recv && r.A.sent.sfp === r.B.recv.sfp && r.A.sent.len === r.B.recv.len) ? 'match' : 'DIFFER';
      const cons = (r.A.errs.length + r.B.errs.length) === 0 ? 'clean' : 'ERRORS';
      log(`${String(r.i).padStart(3)} | ${map} | ${r.B.failed.length ? 'FAIL' : ' ok '} | ${r.B.join ? ' yes' : ' NO '} | ` +
          `${r.B.ready ? ' yes ' : ' NO  '} | ${shape.padEnd(5)} | ${String(r.A.raceStartAt).padEnd(14)} | ` +
          `${String(r.B.raceStartAt).padEnd(14)} | ${String(r.A.countdownGap).padEnd(6)} | ${cons}`);
    }
    // AND AT LEAST ONE RUN HAS TO LAND THE CONTRACT EXACTLY. Every run is
    // checked for a promise no longer than ten seconds; this asks that one of
    // them was measured at the instant the server stamped it, which is the
    // number the approved contract is written in.
    const exact = rows.filter((r) => r.A && r.A.countdownGap === 10000 && r.B && r.B.countdownGap === 10000);
    log(`
raceStartAt - allReadyServerTime = 10000 exactly on ${exact.length}/${rows.length} run(s)`);
    const ok = rows.length === RUNS && rows.every((r) => r.bad && r.bad.length === 0) && exact.length >= 1;
    log(`\n${ok ? 'PASS' : 'FAIL'}  ${passed}/${RUNS} valid production rounds`);
    await bA.close(); await bB.close();
    process.exit(ok ? 0 : 1);
  }
}

main().catch(async (e) => { console.error(e); process.exit(1); });
