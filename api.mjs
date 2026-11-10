import { getStore } from "@netlify/blobs";

const BAD=["fuck","shit","bitch","cunt","dick","cock","piss","bastard","whore","slut","nigg","faggot","retard","twat","wank","porn","rape","nazi","hitler","pussy","penis","vagina","dildo","asshole","bollock","kkk","cum"];
const BADW=["ass","tit","tits","sex","fag","fags","nig","hoe","dyke","paki","coon","kike","spic","anal","arse"];
const sq=s=>s.replace(/(.)\1+/g,"$1");
const leet=s=>String(s).toLowerCase().replace(/0/g,"o").replace(/[@4]/g,"a").replace(/[1!|]/g,"i").replace(/3/g,"e").replace(/[5$]/g,"s").replace(/7/g,"t").replace(/8/g,"b");
const nkey=s=>leet(s).replace(/[^a-z]/g,"");
const badName=s=>{const n=leet(s),j=n.replace(/[^a-z]/g,""),js=sq(j),toks=n.split(/[^a-z]+/).filter(Boolean);
  return BAD.some(w=>j.includes(w)||(sq(w).length>=4&&js.includes(sq(w))))||toks.some(t=>BADW.includes(t)||BADW.includes(sq(t)))};
const badText=s=>String(s).toLowerCase().split(/[^a-z0-9@$!]+/).filter(Boolean).some(t=>{const n=nkey(t);return BAD.includes(n)||BADW.includes(n)||BAD.includes(sq(n))||BADW.includes(sq(n))});
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,"0")).join("");
const DAY=864e5, WEEK=6048e5;

export default async (req) => {
  const route = new URL(req.url).pathname.replace(/^\/api\//,"").replace(/\/$/,"");
  const tk = req.headers.get("x-token") || "";
  const id = tk.length >= 32 ? await sha(tk) : null;
  const store = getStore({ name: "sp", consistency: "strong" });
  const S = (await store.get("state", { type: "json" })) || {};
  for (const k of ["players","scores","skips","feedback"]) S[k] = S[k] || {};
  const save = () => store.setJSON("state", S);
  const J = (o, s = 200) => Response.json(o, { status: s });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  const ranked = () => Object.entries(S.scores)
    .filter(([h, r]) => S.players[h] && Number.isInteger(r.score) && Number.isInteger(r.total) && r.total >= 10 && r.score >= 0 && r.score <= r.total)
    .map(([h, r]) => ({ h, name: S.players[h].name, ...r }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total || a.ts - b.ts);

  const meInfo = () => {
    const top = ranked()[0], sk = (id && S.skips[id]) || {};
    const o = { name: id && S.players[id] ? S.players[id].name : null, skip: !!(sk.claimed && !sk.used), claimable: false,
      note: "Hold #1 for 24 hours to win a free skip (max 1 per week)." };
    if (o.skip) o.note = "⭐ You have a free skip ready. Use it on any question!";
    else if (id && top && top.h === id) {
      const held = Date.now() - top.ts, wk = !sk.claimed || Date.now() - sk.claimed >= WEEK;
      if (held < DAY) o.note = "👑 You’re #1! Hold it for 24 hours to win a free skip.";
      else if (wk) o.claimable = true;
      else o.note = "👑 You’ve already had this week’s free skip.";
    }
    return o;
  };

  if (route === "board") {
    return J({
      rows: ranked().slice(0, 10).map(({ name, score, total, pct }) => ({ name, score, total, pct })),
      feedback: Object.values(S.feedback).filter(f => !badText(f.text || "")).sort((a, b) => b.ts - a.ts).slice(0, 50)
        .map(({ rating, text, score, total }) => ({ rating, text, score, total })),
      me: meInfo(),
    });
  }
  if (!id) return J({ error: "Your browser blocked saving a device ID, so you can’t compete." }, 400);

  if (route === "join") {
    if (S.players[id]) return J({ name: S.players[id].name });
    const name = String(body.name || "").trim().slice(0, 20), key = nkey(name);
    if (name.length < 2 || key.length < 2) return J({ error: "Enter a name (2–20 characters) to compete." }, 400);
    if (badName(name)) return J({ error: "That name isn’t allowed. Please pick a different one." }, 400);
    if (Object.values(S.players).some(p => p.key === key)) return J({ error: "That name is already taken. Pick your own name." }, 400);
    S.players[id] = { name, key, ts: Date.now() };
    await save();
    return J({ name });
  }
  if (route === "score") {
    const sc = body.score, t = body.total;
    if (!S.players[id] || !Number.isInteger(sc) || !Number.isInteger(t) || t < 10 || sc < 0 || sc > t) return J({ glitch: true });
    const pct = Math.round(sc / t * 100), c = S.scores[id];
    if (c && (c.pct > pct || (c.pct === pct && c.total >= t))) return J({ msg: `Your best (${c.pct}% of ${c.total}) stays on the leaderboard.` });
    S.scores[id] = { score: sc, total: t, pct, ts: Date.now() };
    await save();
    return J({ msg: "New best! Score saved to the leaderboard." });
  }
  if (route === "claim") {
    if (!meInfo().claimable) return J({ error: "No free skip to claim right now." }, 400);
    S.skips[id] = { claimed: Date.now(), used: false };
    await save();
    return J({ ok: true });
  }
  if (route === "useskip") {
    const sk = S.skips[id];
    if (!sk || !sk.claimed || sk.used) return J({ error: "You don’t have a free skip." }, 400);
    sk.used = true; sk.usedAt = Date.now();
    await save();
    return J({ ok: true });
  }
  if (route === "feedback") {
    const text = String(body.text || "").trim().slice(0, 500), rating = Number.isInteger(body.rating) ? Math.min(5, Math.max(0, body.rating)) : 0;
    if (!text && !rating) return J({ error: "Add a rating or a comment first." }, 400);
    if (badText(text)) return J({ error: "Please keep feedback clean (no bad language), everyone can see it." }, 400);
    S.feedback[id] = { rating, text, score: Number.isInteger(body.score) ? body.score : 0, total: Number.isInteger(body.total) ? body.total : 0, ts: Date.now() };
    await save();
    return J({ ok: true });
  }
  return J({ error: "Not found" }, 404);
};

export const config = { path: "/api/*" };
