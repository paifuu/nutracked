import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera, Plus, Droplet, User, Flame, Trash2, Check, X, RefreshCw, ImagePlus,
  ChevronLeft, ChevronRight, Sparkles, TrendingDown, TrendingUp, Info, Mic, Type,
  Star, Target, Download, Utensils, Loader2, Upload, Pill, AlertTriangle, HeartPulse,
  Eye, EyeOff, CheckCircle2, Circle
} from "lucide-react";
import {
  BarChart, Bar, XAxis, ResponsiveContainer, Cell, LineChart, Line, YAxis, Tooltip
} from "recharts";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;
const authState = { uid: null };

/* ================================================================== */
/*  Nutracked — food tracking + bloodwork insights                     */
/* ================================================================== */

const C = {
  paper: "#EEF1EA", card: "#FBFBF6", ink: "#1B241E", inkSoft: "#5C665C",
  line: "#DEE1D5", protein: "#C2512E", carbs: "#D89A24", fat: "#6B7FB3",
  good: "#3E7C5A", plum: "#8E6BA8", warn: "#B4462B", blood: "#A8324A",
};
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');`;

/* ---------- dates ---------- */
const dk = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lastNDays = (n) => { const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dk(d)); } return out; };
const dayLabel = (k) => new Date(k + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + Math.round(days)); return d; };
const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const isToday = (k) => k === dk();

/* ---------- units ---------- */
const lbToKg = (lb) => lb * 0.453592;
const kgToLb = (kg) => kg / 0.453592;
const inToCm = (i) => i * 2.54;
const cmToIn = (c) => c / 2.54;

/* ---------- energy ---------- */
const KCAL_PER_KG = 7700;
const ADJUST = { lose: { moderate: -500, aggressive: -1000 }, gain: { moderate: 300, aggressive: 500 }, maintain: { moderate: 0, aggressive: 0 } };
const ACTIVITY = {
  sedentary: { f: 1.2, label: "Sedentary", desc: "Little or no exercise" },
  light: { f: 1.375, label: "Lightly active", desc: "Exercise 1–3 days/week" },
  moderate: { f: 1.55, label: "Moderately active", desc: "Exercise 3–5 days/week" },
  active: { f: 1.725, label: "Very active", desc: "Exercise 6–7 days/week" },
  athlete: { f: 1.9, label: "Extra active", desc: "Hard daily training or physical job" },
};
function bmr({ sex, age, weightKg, heightCm }) {
  if (!age || !weightKg || !heightCm) return 0;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  return base - 78;
}
const activityFactor = (p) => (ACTIVITY[p.activity] || ACTIVITY.sedentary).f;
const maintenance = (p) => Math.round(bmr(p) * activityFactor(p));
function getAdjustment(p) {
  if (!p.ready) return 0;
  const dir = p.goalDir || "maintain";
  return dir === "maintain" ? 0 : ADJUST[dir][p.pace || "moderate"];
}
function macroTargets(p) {
  const kcal = maintenance(p) + getAdjustment(p);
  const wk = p.weightKg || 70;
  const protein = Math.round(wk * 1.6);
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  const fiber = Math.round((kcal / 1000) * 14);
  return { kcal, protein, carbs: Math.max(carbs, 0), fat: Math.max(fat, 0), fiber: Math.max(fiber, 0) };
}
function dayEnergy(p, day) {
  const eaten = round(sum(day.foods, (f) => f.calories));
  const maint = maintenance(p);
  const budget = round(maint + getAdjustment(p));
  return { eaten, maint, budget, remaining: round(budget - eaten) };
}
const currentWeightKg = (p, weights) => (weights?.length ? weights[weights.length - 1].kg : p.weightKg);
function avgNetOverDays(p, history) {
  const logged = history.filter((h) => h.day.foods.length > 0).slice(-7);
  if (!logged.length) return null;
  const nets = logged.map((h) => sum(h.day.foods, (f) => f.calories) - maintenance(p));
  return nets.reduce((a, b) => a + b, 0) / nets.length;
}
function projection(p, curKg, avgNet) {
  if (!p.ready || !p.targetWeightKg || (p.goalDir || "maintain") === "maintain") return null;
  const dir = p.goalDir;
  const diffKg = curKg - p.targetWeightKg;
  const reached = (dir === "lose" && diffKg <= 0) || (dir === "gain" && diffKg >= 0);
  const totalKcal = Math.abs(diffKg) * KCAL_PER_KG;
  const adj = Math.abs(getAdjustment(p)) || 1;
  const actualRate = dir === "lose" ? -avgNet : avgNet;
  const actualDays = avgNet != null && actualRate > 0 ? totalKcal / actualRate : null;
  const weeklyKg = (adj * 7 / KCAL_PER_KG) * (dir === "lose" ? -1 : 1);
  return {
    diffKg, reached, dir, plannedDate: addDays(new Date(), totalKcal / adj),
    actualDate: actualDays != null ? addDays(new Date(), actualDays) : null,
    weeklyKg, offTrack: avgNet != null && actualRate <= 0,
  };
}

/* ---------- storage: window.storage inside Claude, localStorage when deployed ---------- */
const hasStore = () => typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
const withTimeout = (promise, ms = 2500) => Promise.race([promise, new Promise((res) => setTimeout(() => res(null), ms))]);
const store = {
  async get(key) {
    if (supabase && authState.uid) {
      const { data } = await supabase.from("user_data").select("value").eq("user_id", authState.uid).eq("key", key).maybeSingle();
      return data ? { value: JSON.stringify(data.value) } : null;
    }
    if (hasStore()) return withTimeout(window.storage.get(key));
    try { const v = localStorage.getItem(key); return v == null ? null : { value: v }; } catch { return null; }
  },
  async set(key, value) {
    if (supabase && authState.uid) {
      await supabase.from("user_data").upsert({ user_id: authState.uid, key, value: JSON.parse(value) }, { onConflict: "user_id,key" });
      return;
    }
    if (hasStore()) return withTimeout(window.storage.set(key, value));
    try { localStorage.setItem(key, value); } catch {}
  },
  async list(prefix) {
    if (supabase && authState.uid) {
      const { data } = await supabase.from("user_data").select("key").eq("user_id", authState.uid).like("key", prefix + "%");
      return { keys: (data || []).map((r) => r.key) };
    }
    if (hasStore()) { try { return (await withTimeout(window.storage.list(prefix))) || { keys: [] }; } catch { return { keys: [] }; } }
    try { return { keys: Object.keys(localStorage).filter((k) => k.startsWith(prefix)) }; } catch { return { keys: [] }; }
  },
};
async function sGet(key) { try { const r = await store.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function sSet(key, val) { try { await store.set(key, JSON.stringify(val)); } catch (e) { console.error(e); } }
const emptyDay = () => ({ foods: [] });

/* ---------- misc ---------- */
const round = (n, p = 0) => { const f = Math.pow(10, p); return Math.round((Number(n) || 0) * f) / f; };
const sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
function extractJSON(text) {
  let t = (text || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  return JSON.parse(t);
}
const template = (f) => ({ name: f.name, serving: f.serving, calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fiber_g: f.fiber_g, sugar_g: f.sugar_g, sodium_mg: f.sodium_mg, micros: f.micros || [] });
const fromTemplate = (t) => ({ ...t, id: crypto.randomUUID(), time: Date.now(), photo: null });
const fileToImg = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result);
    const img = new Image();
    img.onload = () => {
      const max = 1400; let w = img.width, h = img.height;
      if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      try {
        const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ b64: out.split(",")[1], mt: "image/jpeg", url: out });
      } catch { resolve({ b64: dataUrl.split(",")[1], mt: file.type || "image/jpeg", url: dataUrl }); }
    };
    img.onerror = () => resolve({ b64: dataUrl.split(",")[1], mt: file.type || "image/jpeg", url: dataUrl });
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
});

/* ---------- AI: nutrition ---------- */
async function callClaude(content) {
  const url = hasStore() ? "https://api.anthropic.com/v1/messages" : "/api/claude";
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content }] }),
  });
  const data = await res.json();
  return (data.content || []).filter((i) => i.type === "text").map((i) => i.text).join("\n");
}
async function estimateNutrition({ imageB64, mediaType, text }) {
  const schema = `Respond with ONLY valid JSON, no markdown:
{"name":"short dish name","serving":"portion estimate","confidence":"low|medium|high","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number,"sugar_g":number,"sodium_mg":number,"micros":[{"name":"Vitamin C","amount":"45 mg","pct_dv":50}]}
Include 4-6 notable vitamins/minerals in "micros" with pct_dv as integer percent of daily value.`;
  const content = imageB64
    ? [{ type: "image", source: { type: "base64", media_type: mediaType, data: imageB64 } }, { type: "text", text: `Estimate nutrition for the food in this image; aggregate the whole plate. ${schema} If no food, return {"name":"","error":"no food"}.` }]
    : [{ type: "text", text: `Estimate nutrition for this meal: "${text}". Aggregate everything into one entry. ${schema} If not food, return {"name":"","error":"no food"}.` }];
  const parsed = extractJSON(await callClaude(content));
  if (parsed.error || !parsed.name) throw new Error("no-food");
  return {
    id: crypto.randomUUID(), name: parsed.name, serving: parsed.serving || "", confidence: parsed.confidence || "medium",
    calories: round(parsed.calories), protein_g: round(parsed.protein_g), carbs_g: round(parsed.carbs_g), fat_g: round(parsed.fat_g),
    fiber_g: round(parsed.fiber_g), sugar_g: round(parsed.sugar_g), sodium_mg: round(parsed.sodium_mg),
    micros: Array.isArray(parsed.micros) ? parsed.micros : [], time: Date.now(),
  };
}
async function suggestMeals({ remaining, gaps }) {
  const txt = await callClaude([{ type: "text", text: `The user has about ${remaining} calories left and is low on: ${gaps || "nothing in particular"}. Suggest 2-3 realistic foods that fit the calories and close those gaps. JSON only: {"suggestions":[{"name":"...","why":"one short reason","approx_calories":number}]}` }]);
  return extractJSON(txt).suggestions || [];
}

/* ---------- AI: bloodwork ---------- */
async function analyzeBloodwork({ images, profile }) {
  const demo = `Person: ${profile.sex || "unspecified"} sex, age ${profile.age || "unknown"}.`;
  const prompt = `You are a health-EDUCATION assistant, not a doctor. Read the blood test values in the image(s) and explain them simply. ${demo}
Respond with ONLY valid JSON, no markdown:
{"health_score":integer 0-100,"score_label":"needs attention"|"fair"|"good"|"excellent","summary":"2-3 plain-language sentences","markers":[{"name":"...","value":"...","unit":"...","status":"low"|"borderline_low"|"optimal"|"borderline_high"|"high","optimal_range":"e.g. 500-900 ng/dL","percentile":integer 0-100,"explanation":"under 25 words","supplements":[{"name":"...","reason":"short","risk":"short caution/side-effect","food_sources":"short"}],"foods":["short","short"]}],"flags":["any value needing prompt medical attention, else empty"]}
Rules: at most 6 markers, prioritise out-of-range ones. percentile is a ROUGH estimate for this age/sex. Only add "supplements" for non-optimal markers, and EVERY supplement MUST include a "risk". Only suggest food, lifestyle, or common over-the-counter vitamins/minerals — never prescription drugs or specific doses. Never state a diagnosis. Keep all text short. If no lab values are visible, return {"health_score":0,"error":"no labs"}.`;
  const content = [...images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mt, data: img.b64 } })), { type: "text", text: prompt }];
  const parsed = extractJSON(await callClaude(content));
  if (parsed.error || !parsed.markers) throw new Error("no-labs");
  return { ...parsed, analyzedAt: Date.now() };
}
async function buildBloodDiet({ markers, profile }) {
  const flagged = markers.filter((m) => m.status !== "optimal").map((m) => `${m.name} (${m.status})`).join(", ") || "general wellness";
  const txt = await callClaude([{ type: "text", text: `Build a concise, personalized diet plan for a ${profile.sex || ""} aged ${profile.age || "?"} whose bloodwork flagged: ${flagged}. JSON only: {"focus":"one sentence","eat_more":["4-6 foods"],"eat_less":["3-4 foods"],"sample_day":{"breakfast":"short","lunch":"short","dinner":"short","snack":"short"}}` }]);
  return extractJSON(txt);
}

/* ---------- voice ---------- */
function useSpeech(onText) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const start = () => {
    if (!SR) return;
    try {
      const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => onText(e.results[0][0].transcript);
      rec.onend = () => setListening(false); rec.onerror = () => setListening(false);
      recRef.current = rec; rec.start(); setListening(true);
    } catch { setListening(false); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch {} setListening(false); };
  return { supported: !!SR, listening, start, stop };
}

/* ================================================================== */
/*  Atoms                                                              */
/* ================================================================== */
const Bar2 = ({ value, target, color }) => {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = target > 0 && value > target;
  return <div style={{ height: 8, background: C.line, borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: over ? C.warn : color, borderRadius: 999, transition: "width .6s cubic-bezier(.22,1,.36,1)" }} /></div>;
};
const Card = ({ children, style }) => <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 18, ...style }}>{children}</div>;
const Eyebrow = ({ children }) => <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 600, marginBottom: 10 }}>{children}</div>;
const btnDark = { background: C.ink, color: C.paper, border: "none", borderRadius: 12, padding: "13px", cursor: "pointer", fontWeight: 700 };
const inputStyle = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px", fontSize: 15, color: C.ink, outline: "none", background: C.paper };

const Logo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ display: "block" }}>
    <defs>
      <linearGradient id="nt-badge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4C9169" />
        <stop offset="1" stopColor="#33684B" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#nt-badge)" />
    {/* leaf */}
    <path d="M8.6 19.2 C 7.9 12.5 11 7.7 16.9 6.4 C 20.6 12.7 15.2 18.4 8.6 19.2 Z" fill="#FBFBF6" />
    {/* vein rising like a tracked trend line */}
    <path d="M10 17.9 C 12.2 14.8 14.1 11.4 16 7.7" stroke="#33684B" strokeWidth="1.4" strokeLinecap="round" />
    {/* tracked data point */}
    <circle cx="16" cy="7.7" r="1.7" fill="#F4A93B" stroke="#FBFBF6" strokeWidth="1" />
  </svg>
);

/* ================================================================== */
/*  ReviewCard (food)                                                  */
/* ================================================================== */
function ReviewCard({ initial, onSave, onBack, backLabel }) {
  const [r, setR] = useState(initial);
  const [fav, setFav] = useState(false);
  const edit = (k, v) => setR((p) => ({ ...p, [k]: v }));
  const num = (v) => (v === "" ? "" : Number(v));
  const cc = { low: C.warn, medium: C.carbs, high: C.good };
  return (
    <div>
      {r.photo && <img src={r.photo} alt="" style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 16, marginBottom: 14 }} />}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
          <input value={r.name} onChange={(e) => edit("name", e.target.value)} style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: C.ink, border: "none", background: "transparent", flex: 1, outline: "none" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: cc[r.confidence], textTransform: "uppercase" }}>{r.confidence}</span>
        </div>
        <input value={r.serving} onChange={(e) => edit("serving", e.target.value)} placeholder="Serving size" style={{ ...inputStyle, fontSize: 13, color: C.inkSoft, marginBottom: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["Calories", "calories", "kcal"], ["Protein", "protein_g", "g"], ["Carbs", "carbs_g", "g"], ["Fat", "fat_g", "g"], ["Fiber", "fiber_g", "g"], ["Sugar", "sugar_g", "g"]].map(([label, key, unit]) => (
            <label key={key}>
              <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 4, fontWeight: 600 }}>{label}</div>
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 10, background: C.paper, padding: "0 10px" }}>
                <input type="number" value={r[key]} onChange={(e) => edit(key, num(e.target.value))} style={{ width: "100%", border: "none", background: "transparent", padding: "9px 0", fontSize: 15, color: C.ink, outline: "none" }} />
                <span style={{ fontSize: 12, color: C.inkSoft }}>{unit}</span>
              </div>
            </label>
          ))}
        </div>
        {r.micros?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600, marginBottom: 8 }}>KEY MICRONUTRIENTS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{r.micros.map((m, i) => <span key={i} style={{ fontSize: 12, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 10px", color: C.ink }}>{m.name} · {m.pct_dv}% DV</span>)}</div>
          </div>
        )}
        <button onClick={() => setFav((v) => !v)} style={{ marginTop: 14, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: fav ? C.carbs : C.inkSoft, fontWeight: 600, fontSize: 13, padding: 0 }}>
          <Star size={16} fill={fav ? C.carbs : "none"} /> {fav ? "Saved to favorites" : "Save to favorites"}
        </button>
      </Card>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={onBack} style={{ flex: 1, background: C.card, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px", cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "center", gap: 6, alignItems: "center" }}><RefreshCw size={16} /> {backLabel || "Back"}</button>
        <button onClick={() => onSave(r, fav)} style={{ ...btnDark, flex: 2, borderRadius: 14, display: "flex", justifyContent: "center", gap: 6, alignItems: "center" }}><Check size={18} /> Log it</button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  AddFlow                                                            */
/* ================================================================== */
function AddFlow({ onSave, onCancel, favorites, recents, onQuickAdd, dateLabel }) {
  const [stage, setStage] = useState("home");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [photo, setPhoto] = useState(null);
  const fileRef = useRef(null);
  const speech = useSpeech((t) => setText((prev) => (prev ? prev + " " + t : t)));

  const runPhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const img = await fileToImg(file); setPhoto(img.url); setStage("analyzing"); setErr("");
    try { const r = await estimateNutrition({ imageB64: img.b64, mediaType: img.mt }); setResult({ ...r, photo: img.url }); setStage("review"); }
    catch { setErr("Couldn't spot food in that photo. Try a clearer, closer shot."); setStage("error"); }
  };
  const runText = async () => {
    if (!text.trim()) return; setStage("analyzing"); setErr("");
    try { const r = await estimateNutrition({ text: text.trim() }); setResult({ ...r, photo: null }); setStage("review"); }
    catch { setErr("That didn't look like food I could estimate. Add a little more detail."); setStage("error"); }
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: C.ink, padding: 4 }}><ChevronLeft size={22} /></button>
        <div><div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, color: C.ink }}>Add a meal</div><div style={{ fontSize: 12, color: C.inkSoft }}>{dateLabel}</div></div>
      </div>
      {stage === "home" && (
        <>
          {(favorites.length > 0 || recents.length > 0) && (
            <div style={{ marginBottom: 18 }}>
              <Eyebrow>Quick add</Eyebrow>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {favorites.map((t, i) => <button key={"f" + i} onClick={() => onQuickAdd(t)} style={{ display: "flex", alignItems: "center", gap: 5, background: C.card, border: `1px solid ${C.carbs}66`, borderRadius: 999, padding: "7px 12px", cursor: "pointer", fontSize: 13, color: C.ink }}><Star size={12} fill={C.carbs} color={C.carbs} /> {t.name} · {round(t.calories)}</button>)}
                {recents.filter((r) => !favorites.some((f) => f.name === r.name)).map((t, i) => <button key={"r" + i} onClick={() => onQuickAdd(t)} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 12px", cursor: "pointer", fontSize: 13, color: C.ink }}>{t.name} · {round(t.calories)}</button>)}
              </div>
            </div>
          )}
          <div style={{ display: "grid", gap: 12 }}>
            <button onClick={() => fileRef.current?.click()} style={{ cursor: "pointer", borderRadius: 18, border: `1.5px solid ${C.line}`, background: C.card, padding: "22px 20px", textAlign: "left", display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: C.paper, display: "grid", placeItems: "center", color: C.protein }}><Camera size={22} /></div>
              <div><div style={{ color: C.ink, fontWeight: 600, fontSize: 16 }}>Snap a photo</div><div style={{ fontSize: 13, color: C.inkSoft }}>Claude reads the plate.</div></div>
            </button>
            <button onClick={() => setStage("describe")} style={{ cursor: "pointer", borderRadius: 18, border: `1.5px solid ${C.line}`, background: C.card, padding: "22px 20px", textAlign: "left", display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: C.paper, display: "grid", placeItems: "center", color: C.fat }}><Type size={22} /></div>
              <div><div style={{ color: C.ink, fontWeight: 600, fontSize: 16 }}>Describe it</div><div style={{ fontSize: 13, color: C.inkSoft }}>Type or speak what you ate.</div></div>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={runPhoto} style={{ display: "none" }} />
        </>
      )}
      {stage === "describe" && (
        <Card>
          <Eyebrow>What did you eat?</Eyebrow>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. two scrambled eggs, sourdough, and a flat white" rows={3} style={{ ...inputStyle, resize: "none", fontFamily: "Inter, sans-serif" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {speech.supported && <button onClick={() => (speech.listening ? speech.stop() : speech.start())} style={{ flex: "0 0 auto", background: speech.listening ? C.protein : C.paper, color: speech.listening ? "#fff" : C.ink, border: `1px solid ${C.line}`, borderRadius: 12, padding: "0 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}><Mic size={16} /> {speech.listening ? "Listening…" : "Speak"}</button>}
            <button onClick={runText} disabled={!text.trim()} style={{ ...btnDark, flex: 1, opacity: text.trim() ? 1 : 0.5 }}>Estimate</button>
          </div>
          {!speech.supported && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8 }}>Voice isn't available in this browser — typing works everywhere.</div>}
        </Card>
      )}
      {stage === "analyzing" && (
        <Card style={{ textAlign: "center", padding: 40 }}>
          {photo && <img src={photo} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 16, margin: "0 auto 18px" }} />}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.ink, fontWeight: 600 }}><Sparkles size={18} style={{ color: C.protein }} className="spin-slow" /> Estimating…</div>
          <div style={{ color: C.inkSoft, fontSize: 13, marginTop: 6 }}>Calories, macros and key micros.</div>
        </Card>
      )}
      {stage === "error" && <Card style={{ textAlign: "center", padding: 32 }}><div style={{ color: C.ink, fontWeight: 600, marginBottom: 12 }}>{err}</div><button onClick={() => setStage("home")} style={{ ...btnDark, padding: "10px 18px" }}>Try again</button></Card>}
      {stage === "review" && result && <ReviewCard initial={result} onSave={onSave} onBack={() => setStage("home")} backLabel="Redo" />}
    </div>
  );
}

/* ================================================================== */
/*  Meal suggestion sheet                                              */
/* ================================================================== */
function SuggestSheet({ remaining, gaps, onClose }) {
  const [loading, setLoading] = useState(true), [items, setItems] = useState([]), [error, setError] = useState(false);
  useEffect(() => { (async () => { try { setItems(await suggestMeals({ remaining, gaps })); } catch { setError(true); } finally { setLoading(false); } })(); }, [remaining, gaps]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(27,36,30,.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.paper, width: "100%", maxWidth: 460, borderRadius: "22px 22px 0 0", padding: 22, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Utensils size={18} style={{ color: C.protein }} /><span style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: C.ink }}>What to eat next</span></div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkSoft }}><X size={20} /></button>
        </div>
        {loading && <div style={{ textAlign: "center", padding: 30, color: C.inkSoft }}><Loader2 size={22} className="spin-slow" style={{ color: C.protein }} /><div style={{ marginTop: 8 }}>Finding good options…</div></div>}
        {error && <div style={{ textAlign: "center", padding: 20, color: C.inkSoft }}>Couldn't load suggestions right now.</div>}
        {!loading && !error && items.map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontWeight: 600, color: C.ink }}>{s.name}</span><span style={{ fontSize: 12, color: C.protein, fontWeight: 600 }}>~{round(s.approx_calories)} kcal</span></div>
            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>{s.why}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  TODAY                                                              */
/* ================================================================== */
function Today({ profile, day, dateKey, onPrev, onNext, onDelete, onFav, onAdd, streak, proj }) {
  const [suggest, setSuggest] = useState(false);
  const e = dayEnergy(profile, day);
  const t = macroTargets(profile);
  const p = round(sum(day.foods, (f) => f.protein_g)), c = round(sum(day.foods, (f) => f.carbs_g)), fat = round(sum(day.foods, (f) => f.fat_g)), fiber = round(sum(day.foods, (f) => f.fiber_g));
  const adj = getAdjustment(profile);
  const gaps = [];
  if (profile.ready) { if (p < t.protein * 0.8) gaps.push(`protein (${round(t.protein - p)}g short)`); if (fiber < t.fiber * 0.8) gaps.push(`fiber (${round(t.fiber - fiber)}g short)`); }
  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={onPrev} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkSoft, padding: 4 }}><ChevronLeft size={20} /></button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: C.ink }}>{isToday(dateKey) ? "Today" : new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" })}</div>
          <div style={{ color: C.inkSoft, fontSize: 12 }}>{new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}</div>
        </div>
        <button onClick={onNext} disabled={isToday(dateKey)} style={{ background: "none", border: "none", cursor: isToday(dateKey) ? "default" : "pointer", color: isToday(dateKey) ? C.line : C.inkSoft, padding: 4 }}><ChevronRight size={20} /></button>
      </div>
      {streak > 1 && isToday(dateKey) && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 12px", fontSize: 13, color: C.ink, marginBottom: 12 }}><Flame size={14} style={{ color: C.protein }} /> {streak}-day streak</div>}
      <Card style={{ padding: 22 }}>
        {profile.ready ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 54, fontWeight: 600, lineHeight: 1, color: e.remaining < 0 ? C.warn : C.ink }}>{Math.abs(e.remaining)}</div>
              <div style={{ color: C.inkSoft, fontSize: 14 }}>kcal {e.remaining < 0 ? "over" : "left"}<div style={{ fontSize: 12 }}>{e.eaten} eaten of {e.budget} budget</div></div>
            </div>
            <div style={{ marginTop: 16 }}><Bar2 value={e.eaten} target={e.budget} color={C.good} /></div>
            <div style={{ marginTop: 8, fontSize: 12, color: C.inkSoft }}><Flame size={12} style={{ display: "inline", verticalAlign: -2 }} /> {e.maint} maintenance{adj ? ` ${adj > 0 ? "+" + adj : adj} goal` : ""}</div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><div style={{ fontFamily: "Fraunces, serif", fontSize: 54, fontWeight: 600, lineHeight: 1, color: C.ink }}>{e.eaten}</div><div style={{ color: C.inkSoft, fontSize: 14 }}>kcal eaten<div style={{ fontSize: 12 }}>set up profile in You for targets</div></div></div>
        )}
      </Card>
      {proj && (
        <Card style={{ marginTop: 14, borderColor: C.good + "55" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><Target size={16} style={{ color: C.good }} /><span style={{ fontWeight: 600, color: C.ink }}>Goal: {profile.goalDir} to {round(profile.units === "imperial" ? kgToLb(profile.targetWeightKg) : profile.targetWeightKg, 1)} {profile.units === "imperial" ? "lb" : "kg"}</span></div>
          {proj.reached ? <div style={{ color: C.good, fontWeight: 600 }}>You've reached your target weight — nice work.</div> : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}><span style={{ color: C.inkSoft }}>On your chosen pace</span><span style={{ color: C.ink, fontWeight: 600 }}>{fmtDate(proj.plannedDate)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span style={{ color: C.inkSoft }}>At your logged pace</span><span style={{ fontWeight: 600, color: proj.offTrack ? C.warn : C.plum }}>{proj.offTrack ? "not on track" : proj.actualDate ? fmtDate(proj.actualDate) : "log meals to see"}</span></div>
              <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10 }}>{proj.offTrack ? "Recent logging is on the wrong side of maintenance — adjust intake." : "Updates as you log. Target ~" + Math.abs(round(proj.weeklyKg * (profile.units === "imperial" ? kgToLb(1) : 1), 2)) + (profile.units === "imperial" ? " lb" : " kg") + "/week."}</div>
            </>
          )}
        </Card>
      )}
      <Card style={{ marginTop: 14 }}>
        <Eyebrow>Macros</Eyebrow>
        {[{ label: "Protein", v: p, t: t.protein, color: C.protein }, { label: "Carbs", v: c, t: t.carbs, color: C.carbs }, { label: "Fat", v: fat, t: t.fat, color: C.fat }].map((m) => (
          <div key={m.label} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: C.ink }}><span style={{ fontWeight: 600 }}>{m.label}</span><span style={{ color: C.inkSoft }}>{round(m.v)}{profile.ready ? ` / ${m.t}g` : "g"}</span></div>
            <Bar2 value={m.v} target={profile.ready ? m.t : m.v || 1} color={m.color} />
          </div>
        ))}
      </Card>
      {profile.ready && isToday(dateKey) && day.foods.length > 0 && <button onClick={() => setSuggest(true)} style={{ width: "100%", marginTop: 14, background: C.card, border: `1px solid ${C.protein}55`, borderRadius: 14, padding: "13px", cursor: "pointer", color: C.protein, fontWeight: 600, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}><Utensils size={16} /> What should I eat next?</button>}
      <div style={{ marginTop: 18 }}><Eyebrow>Logged{day.foods.length ? ` · ${day.foods.length}` : ""}</Eyebrow></div>
      {day.foods.length === 0 ? (
        <button onClick={onAdd} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: C.card, border: `1px dashed ${C.line}`, borderRadius: 16, padding: 20, color: C.inkSoft, display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.paper, display: "grid", placeItems: "center", color: C.protein }}><Plus size={20} /></div>
          <div><div style={{ color: C.ink, fontWeight: 600 }}>Nothing logged</div><div style={{ fontSize: 13 }}>Snap, describe, or speak your meal.</div></div>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {day.foods.map((f) => (
            <div key={f.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: f.photo ? `center/cover url(${f.photo})` : C.paper, display: "grid", placeItems: "center", color: C.inkSoft }}>{!f.photo && <ImagePlus size={18} />}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div><div style={{ fontSize: 12, color: C.inkSoft }}>{round(f.calories)} kcal · P{round(f.protein_g)} C{round(f.carbs_g)} F{round(f.fat_g)}</div></div>
              <button onClick={() => onFav(f)} aria-label="Favorite" style={{ background: "none", border: "none", cursor: "pointer", color: C.carbs, padding: 6 }}><Star size={16} /></button>
              <button onClick={() => onDelete(f.id)} aria-label="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: C.inkSoft, padding: 6 }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {suggest && <SuggestSheet remaining={Math.max(e.remaining, 0)} gaps={gaps.join(", ")} onClose={() => setSuggest(false)} />}
    </div>
  );
}

/* ================================================================== */
/*  LABS (bloodwork)                                                   */
/* ================================================================== */
const Disclaimer = ({ compact }) => (
  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fff7f0", border: `1px solid ${C.carbs}55`, borderRadius: 12, padding: "10px 12px", fontSize: 12, color: C.ink }}>
    <Info size={compact ? 14 : 16} style={{ flexShrink: 0, marginTop: 1, color: C.carbs }} />
    <span>Educational estimates from a photo — <b>not a diagnosis or medical advice</b>. Suggestions are possibilities to discuss with a doctor, not facts. Always confirm before changing supplements or diet.</span>
  </div>
);
const statusColor = (s) => (s === "optimal" ? C.good : s === "low" || s === "high" ? C.warn : C.carbs);
const statusText = (s) => ({ low: "Low", borderline_low: "Borderline low", optimal: "Optimal", borderline_high: "Borderline high", high: "High" }[s] || s);
const scoreColor = (l) => ({ "needs attention": C.warn, fair: C.carbs, good: C.good, excellent: C.good }[l] || C.inkSoft);

function MarkerCard({ m }) {
  const [open, setOpen] = useState(m.status !== "optimal");
  const col = statusColor(m.status);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, color: C.ink }}>{m.name}</div>
          <div style={{ fontSize: 13, color: C.inkSoft }}>{m.value} {m.unit} · optimal {m.optimal_range}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: col, borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>{statusText(m.status)}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{m.explanation}</div>
          {typeof m.percentile === "number" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkSoft, marginBottom: 4 }}><span>~{m.percentile}th percentile</span><span>rough, for your age & sex</span></div>
              <Bar2 value={m.percentile} target={100} color={C.plum} />
            </div>
          )}
          {m.supplements?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600, marginBottom: 8, letterSpacing: ".06em" }}>MIGHT HELP TO CONSIDER</div>
              {m.supplements.map((s, i) => (
                <div key={i} style={{ background: C.paper, borderRadius: 12, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: C.ink }}><Pill size={15} style={{ color: C.plum }} /> {s.name}</div>
                  <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>{s.reason}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 8, fontSize: 12, color: C.warn }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /><span><b>Caution:</b> {s.risk}</span></div>
                  {s.food_sources && <div style={{ fontSize: 12, color: C.good, marginTop: 6 }}>From food: {s.food_sources}</div>}
                </div>
              ))}
            </div>
          )}
          {m.foods?.length > 0 && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10 }}><b style={{ color: C.ink }}>Eat more:</b> {m.foods.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

function Labs({ profile, blood, onSave, onClear }) {
  const [view, setView] = useState(blood ? "result" : "upload");
  const [imgs, setImgs] = useState([]);
  const [err, setErr] = useState("");
  const [dietLoading, setDietLoading] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { if (blood && view !== "analyzing") setView("result"); }, [blood]);

  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    const loaded = await Promise.all(files.map(fileToImg));
    setImgs((prev) => [...prev, ...loaded].slice(0, 4));
  };
  const analyze = async () => {
    if (!imgs.length) return; setView("analyzing"); setErr("");
    try { const r = await analyzeBloodwork({ images: imgs, profile }); await onSave(r); setImgs([]); setView("result"); }
    catch { setErr("Couldn't read lab values from those images. Try clearer, well-lit photos of the results table."); setView("error"); }
  };
  const makeDiet = async () => {
    setDietLoading(true);
    try { const diet = await buildBloodDiet({ markers: blood.markers, profile }); await onSave({ ...blood, diet }); } catch {} finally { setDietLoading(false); }
  };
  const reset = () => { setImgs([]); setErr(""); setView("upload"); };

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Droplet size={22} style={{ color: C.blood }} />
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: C.ink }}>Labs</div>
      </div>
      <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14 }}>Understand your bloodwork in plain language.</div>
      <div style={{ marginBottom: 16 }}><Disclaimer /></div>

      {(view === "upload" || (view !== "result" && view !== "analyzing" && view !== "error" && !blood)) && (
        <>
          <div onClick={() => fileRef.current?.click()} style={{ cursor: "pointer", borderRadius: 20, border: `1.5px dashed ${C.line}`, background: C.card, padding: "40px 20px", textAlign: "center", color: C.inkSoft }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: C.paper, display: "grid", placeItems: "center", margin: "0 auto 14px", color: C.blood }}><Upload size={26} /></div>
            <div style={{ color: C.ink, fontWeight: 600, fontSize: 16 }}>Upload your blood test</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Add up to 4 photos of the results table.</div>
          </div>
          {imgs.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {imgs.map((im, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={im.url} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 10 }} />
                    <button onClick={() => setImgs((p) => p.filter((_, x) => x !== i))} style={{ position: "absolute", top: -6, right: -6, background: C.ink, color: "#fff", border: "none", borderRadius: 999, width: 20, height: 20, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={12} /></button>
                  </div>
                ))}
              </div>
              <button onClick={analyze} style={{ ...btnDark, width: "100%", marginTop: 14, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}><Sparkles size={16} /> Analyze {imgs.length} image{imgs.length > 1 ? "s" : ""}</button>
            </>
          )}
          {blood && <button onClick={() => setView("result")} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: C.inkSoft, cursor: "pointer", fontSize: 13 }}>← Back to last result</button>}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={pick} style={{ display: "none" }} />
        </>
      )}

      {view === "analyzing" && <Card style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} className="spin-slow" style={{ color: C.blood }} /><div style={{ marginTop: 10, color: C.ink, fontWeight: 600 }}>Reading your results…</div><div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>Explaining markers, ranges and options.</div></Card>}
      {view === "error" && <Card style={{ textAlign: "center", padding: 32 }}><div style={{ color: C.ink, fontWeight: 600, marginBottom: 12 }}>{err}</div><button onClick={reset} style={{ ...btnDark, padding: "10px 18px" }}>Try again</button></Card>}

      {view === "result" && blood && (
        <>
          {blood.flags?.length > 0 && (
            <Card style={{ borderColor: C.warn, background: "#fdf3f1", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.warn, fontWeight: 700, marginBottom: 6 }}><HeartPulse size={18} /> Please contact a doctor soon about</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: C.ink, fontSize: 14 }}>{blood.flags.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}</ul>
            </Card>
          )}
          <Card style={{ textAlign: "center", padding: 24, marginBottom: 14 }}>
            <Eyebrow>Health score</Eyebrow>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 60, fontWeight: 600, lineHeight: 1, color: scoreColor(blood.score_label) }}>{blood.health_score}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: scoreColor(blood.score_label), textTransform: "capitalize", marginTop: 2 }}>{blood.score_label}</div>
            <div style={{ marginTop: 12 }}><Bar2 value={blood.health_score} target={100} color={scoreColor(blood.score_label)} /></div>
            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 14, lineHeight: 1.5, textAlign: "left" }}>{blood.summary}</div>
            <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 10 }}>A rough overall estimate, not a medical rating.</div>
          </Card>

          <Eyebrow>Your markers</Eyebrow>
          {blood.markers.map((m, i) => <MarkerCard key={i} m={m} />)}

          {/* Diet plan */}
          {blood.diet ? (
            <Card style={{ marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><Utensils size={18} style={{ color: C.protein }} /><span style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: C.ink }}>Your diet plan</span></div>
              <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 12 }}>{blood.diet.focus}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div><div style={{ fontSize: 11, fontWeight: 700, color: C.good, marginBottom: 6 }}>EAT MORE</div>{(blood.diet.eat_more || []).map((x, i) => <div key={i} style={{ fontSize: 13, color: C.ink, marginBottom: 3 }}>• {x}</div>)}</div>
                <div><div style={{ fontSize: 11, fontWeight: 700, color: C.warn, marginBottom: 6 }}>EAT LESS</div>{(blood.diet.eat_less || []).map((x, i) => <div key={i} style={{ fontSize: 13, color: C.ink, marginBottom: 3 }}>• {x}</div>)}</div>
              </div>
              {blood.diet.sample_day && (
                <div style={{ background: C.paper, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, marginBottom: 8 }}>SAMPLE DAY</div>
                  {[["Breakfast", "breakfast"], ["Lunch", "lunch"], ["Dinner", "dinner"], ["Snack", "snack"]].map(([l, k]) => blood.diet.sample_day[k] && (
                    <div key={k} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 5 }}><span style={{ color: C.inkSoft, minWidth: 74 }}>{l}</span><span style={{ color: C.ink }}>{blood.diet.sample_day[k]}</span></div>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <button onClick={makeDiet} disabled={dietLoading} style={{ ...btnDark, width: "100%", marginTop: 4, display: "flex", justifyContent: "center", gap: 8, alignItems: "center", opacity: dietLoading ? 0.6 : 1 }}>{dietLoading ? <><Loader2 size={16} className="spin-slow" /> Building…</> : <><Utensils size={16} /> Build my diet plan</>}</button>
          )}

          <div style={{ marginTop: 16 }}><Disclaimer compact /></div>
          <button onClick={() => { onClear(); reset(); }} style={{ width: "100%", marginTop: 12, background: C.card, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px", cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}><RefreshCw size={16} /> Analyze new labs</button>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/*  PROGRESS                                                           */
/* ================================================================== */
function Progress({ profile, history, weights, tgt, proj, onLogWeight }) {
  const [w, setW] = useState("");
  const week = history.slice(-7);
  const chartData = week.map((d) => ({ day: dayLabel(d.key), kcal: round(sum(d.day.foods, (f) => f.calories)) }));
  const loggedDays = week.filter((d) => d.day.foods.length > 0);
  const n = Math.max(loggedDays.length, 1);
  const avg = { p: sum(week, (d) => sum(d.day.foods, (f) => f.protein_g)) / n, c: sum(week, (d) => sum(d.day.foods, (f) => f.carbs_g)) / n, f: sum(week, (d) => sum(d.day.foods, (f) => f.fat_g)) / n, fiber: sum(week, (d) => sum(d.day.foods, (f) => f.fiber_g)) / n };
  const macroFlags = [];
  if (profile.ready) { if (avg.p < tgt.protein * 0.8) macroFlags.push({ label: "Protein", avg: round(avg.p), target: tgt.protein, pct: Math.round((avg.p / tgt.protein) * 100) }); if (avg.fiber < tgt.fiber * 0.8) macroFlags.push({ label: "Fiber", avg: round(avg.fiber), target: tgt.fiber, pct: Math.round((avg.fiber / tgt.fiber) * 100) }); }
  const microAgg = {};
  week.forEach((d) => { const dm = {}; d.day.foods.forEach((f) => (f.micros || []).forEach((m) => { if (m.name && typeof m.pct_dv === "number") dm[m.name] = (dm[m.name] || 0) + m.pct_dv; })); Object.entries(dm).forEach(([name, pct]) => { microAgg[name] = (microAgg[name] || 0) + pct; }); });
  const microFlags = Object.entries(microAgg).map(([name, total]) => ({ name, avg: Math.round(total / n) })).filter((m) => m.avg < 70).sort((a, b) => a.avg - b.avg).slice(0, 6);
  const wUnit = profile.units === "imperial" ? "lb" : "kg";
  const toDisp = (kg) => round(profile.units === "imperial" ? kgToLb(kg) : kg, 1);
  const weightData = weights.map((x) => ({ date: x.date.slice(5), val: toDisp(x.kg) }));
  const curW = weights.length ? toDisp(weights[weights.length - 1].kg) : (profile.weightKg ? toDisp(profile.weightKg) : null);
  const saveWeight = () => { if (!w) return; onLogWeight(round(profile.units === "imperial" ? lbToKg(Number(w)) : Number(w), 1)); setW(""); };
  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: C.ink, marginBottom: 16 }}>Progress</div>
      {proj && !proj.reached && (
        <Card style={{ marginBottom: 14 }}>
          <Eyebrow>Projected finish</Eyebrow>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}><div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: C.ink }}>{fmtDate(proj.plannedDate)}</div><div style={{ fontSize: 11, color: C.inkSoft }}>on chosen pace</div></div>
            <div style={{ flex: 1 }}><div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: proj.offTrack ? C.warn : C.plum }}>{proj.offTrack ? "off track" : proj.actualDate ? fmtDate(proj.actualDate) : "—"}</div><div style={{ fontSize: 11, color: C.inkSoft }}>on logged pace</div></div>
          </div>
        </Card>
      )}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Eyebrow>Weight</Eyebrow>{curW != null && <span style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: C.ink }}>{curW} {wUnit}</span>}</div>
        {weightData.length > 1 && (
          <div style={{ height: 130, marginBottom: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false} width={34} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Line type="monotone" dataKey="val" stroke={C.fat} strokeWidth={2.5} dot={{ r: 3, fill: C.fat }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}><input type="number" value={w} onChange={(e) => setW(e.target.value)} placeholder={`Today's weight (${wUnit})`} style={inputStyle} /><button onClick={saveWeight} style={{ ...btnDark, padding: "0 18px" }}>Log</button></div>
      </Card>
      <Card>
        <Eyebrow>Calories · last 7 days</Eyebrow>
        <div style={{ height: 140 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}><XAxis dataKey="day" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} /><Bar dataKey="kcal" radius={[6, 6, 0, 0]}>{chartData.map((d, i) => <Cell key={i} fill={d.kcal > 0 ? C.good : C.line} />)}</Bar></BarChart></ResponsiveContainer></div>
      </Card>
      {loggedDays.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 14 }}>
            {[{ l: "Protein", v: round(avg.p), color: C.protein }, { l: "Carbs", v: round(avg.c), color: C.carbs }, { l: "Fat", v: round(avg.f), color: C.fat }].map((m) => <Card key={m.l} style={{ padding: 14, textAlign: "center" }}><div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, color: m.color }}>{m.v}g</div><div style={{ fontSize: 11, color: C.inkSoft }}>avg {m.l.toLowerCase()}/day</div></Card>)}
          </div>
          {(macroFlags.length > 0 || microFlags.length > 0) ? (
            <Card style={{ marginTop: 14, borderColor: C.protein + "55" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><TrendingDown size={18} style={{ color: C.warn }} /><span style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: C.ink }}>Running low on</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {macroFlags.map((m) => <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ color: C.ink, fontWeight: 600, fontSize: 14 }}>{m.label}</span><span style={{ fontSize: 12, color: C.inkSoft }}>{m.avg}g avg · {m.pct}% of {m.target}g</span></div>)}
                {microFlags.map((m) => <div key={m.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ color: C.ink, fontWeight: 600, fontSize: 14 }}>{m.name}</span><span style={{ fontSize: 12, color: C.plum, fontWeight: 600 }}>~{m.avg}% DV/day</span></div>)}
              </div>
              <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 12 }}>Based on meals you logged this week.</div>
            </Card>
          ) : <Card style={{ marginTop: 14, borderColor: C.good + "55" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Check size={18} style={{ color: C.good }} /><span style={{ color: C.ink, fontWeight: 600 }}>No obvious shortfalls this week.</span></div></Card>}
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/*  PROFILE                                                            */
/* ================================================================== */
function Profile({ profile, save, onExport, userEmail, onSignOut }) {
  const [units, setUnits] = useState(profile.units || "metric");
  const [sex, setSex] = useState(profile.sex || "female");
  const [age, setAge] = useState(profile.age || "");
  const [heightCm, setHeightCm] = useState(profile.heightCm || "");
  const [weightKg, setWeightKg] = useState(profile.weightKg || "");
  const [ft, setFt] = useState(profile.heightCm ? Math.floor(cmToIn(profile.heightCm) / 12) : "");
  const [inch, setInch] = useState(profile.heightCm ? Math.round(cmToIn(profile.heightCm) % 12) : "");
  const [lb, setLb] = useState(profile.weightKg ? Math.round(kgToLb(profile.weightKg)) : "");
  const [activity, setActivity] = useState(profile.activity || "sedentary");
  const [goalDir, setGoalDir] = useState(profile.goalDir || "maintain");
  const [pace, setPace] = useState(profile.pace || "moderate");
  const [targetW, setTargetW] = useState(profile.targetWeightKg ? Math.round((units === "imperial" ? kgToLb(profile.targetWeightKg) : profile.targetWeightKg)) : "");

  const resolve = () => {
    if (units === "metric") return { hCm: Number(heightCm) || 0, wKg: Number(weightKg) || 0, tKg: Number(targetW) || 0 };
    return { hCm: round(inToCm((Number(ft) || 0) * 12 + (Number(inch) || 0)), 1), wKg: round(lbToKg(Number(lb) || 0), 1), tKg: round(lbToKg(Number(targetW) || 0), 1) };
  };
  const commit = () => { const { hCm, wKg, tKg } = resolve(); save({ units, sex, age: Number(age) || 0, heightCm: hCm, weightKg: wKg, activity, goalDir, pace, targetWeightKg: tKg || 0, ready: !!(age && hCm && wKg) }); };
  const field = (label, node) => <label style={{ display: "block", marginBottom: 14 }}><div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>{label}</div>{node}</label>;
  const seg = (val, setV, opts) => <div style={{ display: "flex", gap: 8 }}>{opts.map(([v, l]) => <button key={v} onClick={() => setV(v)} style={{ flex: 1, border: `1px solid ${val === v ? C.ink : C.line}`, borderRadius: 10, padding: "9px 4px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: val === v ? C.ink : C.card, color: val === v ? C.paper : C.ink }}>{l}</button>)}</div>;
  const wUnit = units === "imperial" ? "lb" : "kg";
  const paceKcal = goalDir === "maintain" ? 0 : ADJUST[goalDir][pace];
  const weeklyDisp = Math.abs(round((paceKcal * 7 / KCAL_PER_KG) * (units === "imperial" ? kgToLb(1) : 1), 2));
  const maintPreview = maintenance({ sex, age: Number(age), heightCm: units === "metric" ? Number(heightCm) : inToCm((Number(ft) || 0) * 12 + (Number(inch) || 0)), weightKg: units === "metric" ? Number(weightKg) : lbToKg(Number(lb)), activity });

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: C.ink, marginBottom: 16 }}>You</div>
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, background: C.paper, borderRadius: 12, padding: 4 }}>{["metric", "imperial"].map((u) => <button key={u} onClick={() => setUnits(u)} style={{ flex: 1, border: "none", borderRadius: 9, padding: "8px", cursor: "pointer", fontWeight: 600, fontSize: 13, background: units === u ? C.ink : "transparent", color: units === u ? C.paper : C.inkSoft }}>{u === "metric" ? "Metric" : "Imperial"}</button>)}</div>
        {field("Sex (for calorie estimate)", seg(sex, setSex, [["female", "Female"], ["male", "Male"], ["neutral", "Prefer not"]]))}
        {field("Age", <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="years" style={inputStyle} />)}
        {units === "metric" ? field("Height", <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="cm" style={inputStyle} />) : field("Height", <div style={{ display: "flex", gap: 8 }}><input type="number" value={ft} onChange={(e) => setFt(e.target.value)} placeholder="ft" style={inputStyle} /><input type="number" value={inch} onChange={(e) => setInch(e.target.value)} placeholder="in" style={inputStyle} /></div>)}
        {units === "metric" ? field("Current weight", <input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="kg" style={inputStyle} />) : field("Current weight", <input type="number" value={lb} onChange={(e) => setLb(e.target.value)} placeholder="lb" style={inputStyle} />)}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Eyebrow>Activity level</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(ACTIVITY).map(([k, v]) => (
            <button key={k} onClick={() => setActivity(k)} style={{ textAlign: "left", border: `1px solid ${activity === k ? C.ink : C.line}`, background: activity === k ? C.ink : C.card, color: activity === k ? C.paper : C.ink, borderRadius: 12, padding: "10px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><span style={{ fontWeight: 600, fontSize: 14 }}>{v.label}</span><span style={{ fontSize: 12, opacity: 0.75, display: "block" }}>{v.desc}</span></span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>×{v.f}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10 }}>This sets how many calories you burn day-to-day, which drives your deficit or surplus.</div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Eyebrow>Your goal</Eyebrow>
        {field("Direction", seg(goalDir, setGoalDir, [["lose", "Lose"], ["maintain", "Maintain"], ["gain", "Gain"]]))}
        {goalDir !== "maintain" && (
          <>
            {field("Pace", seg(pace, setPace, [["moderate", "Moderate"], ["aggressive", "Aggressive"]]))}
            {field(`Target weight (${wUnit})`, <input type="number" value={targetW} onChange={(e) => setTargetW(e.target.value)} placeholder={wUnit} style={inputStyle} />)}
            <div style={{ background: C.paper, borderRadius: 12, padding: 12, fontSize: 13, color: C.ink }}>{pace === "aggressive" ? "Aggressive" : "Moderate"}: {paceKcal > 0 ? "+" : ""}{paceKcal} kcal/day → about {weeklyDisp} {wUnit}/week {goalDir === "lose" ? "down" : "up"}.{maintPreview ? ` Eating ~${maintPreview + paceKcal} kcal/day.` : ""}</div>
          </>
        )}
      </Card>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: C.inkSoft, fontSize: 12, margin: "14px 2px" }}><Info size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>Projections use ~7,700 kcal per kg — estimates. Weigh in weekly to keep the logged-pace date honest.</span></div>
      <button onClick={commit} style={{ ...btnDark, width: "100%" }}>Save profile & goal</button>
      <button onClick={onExport} style={{ width: "100%", marginTop: 10, background: C.card, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px", cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}><Download size={16} /> Export food log (CSV)</button>

      <div style={{ marginTop: 18, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600 }}>SIGNED IN AS</div>
          <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail || "this device"}</div>
        </div>
        {onSignOut && <button onClick={onSignOut} style={{ flexShrink: 0, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 14px", cursor: "pointer", color: C.ink, fontWeight: 600, fontSize: 13 }}>Sign out</button>}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  TAB BAR                                                            */
/* ================================================================== */
function TabBar({ route, setRoute, goAdd }) {
  const tabs = [
    { id: "today", icon: Flame, label: "Today" },
    { id: "labs", icon: Droplet, label: "Labs" },
    { id: "add", center: true },
    { id: "progress", icon: TrendingUp, label: "Progress" },
    { id: "profile", icon: User, label: "You" },
  ];
  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 20, background: "rgba(251,251,246,.92)", backdropFilter: "blur(8px)", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 4px 10px" }}>
      {tabs.map((t) => {
        if (t.center) return <button key="add" onClick={goAdd} aria-label="Add meal" style={{ width: 54, height: 54, borderRadius: 18, border: "none", cursor: "pointer", background: C.protein, color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 6px 16px rgba(194,81,46,.35)", transform: "translateY(-10px)" }}><Plus size={26} /></button>;
        const active = route === t.id; const Icon = t.icon;
        return <button key={t.id} onClick={() => setRoute(t.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 10px", color: active ? C.ink : C.inkSoft }}><Icon size={21} strokeWidth={active ? 2.4 : 2} /><span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{t.label}</span></button>;
      })}
    </div>
  );
}

/* ================================================================== */
/*  APP                                                                */
/* ================================================================== */
const HISTORY_DAYS = 30;
function computeStreak(history) {
  const has = new Set(history.filter((h) => h.day.foods.length > 0).map((h) => h.key));
  let streak = 0; const d = new Date();
  if (!has.has(dk(d))) d.setDate(d.getDate() - 1);
  while (has.has(dk(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function MainApp({ userEmail, onSignOut }) {
  const [route, setRoute] = useState("today");
  const [selectedDate, setSelectedDate] = useState(dk());
  const [profile, setProfile] = useState({ ready: false });
  const [history, setHistory] = useState([]);
  const [weights, setWeights] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [recents, setRecents] = useState([]);
  const [blood, setBlood] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const day = history.find((h) => h.key === selectedDate)?.day || emptyDay();

  const loadHistory = useCallback(async () => {
    const keys = lastNDays(HISTORY_DAYS);
    setHistory(await Promise.all(keys.map(async (k) => ({ key: k, day: (await sGet("day:" + k)) || emptyDay() }))));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fallback = setTimeout(() => { if (!cancelled) setLoaded(true); }, 3500);
    (async () => {
      const [p, w, fav, rec, bl] = await Promise.all([sGet("profile"), sGet("weights"), sGet("favorites"), sGet("recents"), sGet("blood")]);
      if (cancelled) return;
      if (p) setProfile(p);
      setWeights(w || []); setFavorites(fav || []); setRecents(rec || []); setBlood(bl || null);
      await loadHistory();
      if (!cancelled) { setLoaded(true); clearTimeout(fallback); }
    })();
    return () => { cancelled = true; clearTimeout(fallback); };
  }, [loadHistory]);

  const persistDay = async (nextDay) => {
    await sSet("day:" + selectedDate, nextDay);
    setHistory((h) => (h.some((x) => x.key === selectedDate) ? h.map((x) => (x.key === selectedDate ? { key: selectedDate, day: nextDay } : x)) : [...h, { key: selectedDate, day: nextDay }]));
  };
  const pushRecent = async (tmpl) => { const next = [tmpl, ...recents.filter((r) => r.name !== tmpl.name)].slice(0, 12); setRecents(next); await sSet("recents", next); };
  const addFav = async (tmpl) => { if (favorites.some((f) => f.name === tmpl.name)) return; const next = [tmpl, ...favorites].slice(0, 20); setFavorites(next); await sSet("favorites", next); };
  const saveFood = async (food, favorite) => { const tmpl = template(food); await persistDay({ ...day, foods: [...day.foods, { ...food, photo: food.photo || null }] }); await pushRecent(tmpl); if (favorite) await addFav(tmpl); setRoute("today"); };
  const quickAdd = async (tmpl) => { await persistDay({ ...day, foods: [...day.foods, fromTemplate(tmpl)] }); await pushRecent(tmpl); setRoute("today"); };
  const deleteFood = async (id) => persistDay({ ...day, foods: day.foods.filter((f) => f.id !== id) });
  const saveProfile = async (p) => { setProfile(p); await sSet("profile", p); setRoute("today"); };
  const logWeight = async (kg) => { const today = dk(); const next = [...weights.filter((x) => x.date !== today), { date: today, kg }].sort((a, b) => a.date.localeCompare(b.date)); setWeights(next); await sSet("weights", next); };
  const saveBlood = async (b) => { setBlood(b); await sSet("blood", b); };
  const clearBlood = async () => { setBlood(null); await sSet("blood", null); };
  const exportCSV = async () => {
    let rows = [["date", "meal", "serving", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"]];
    try {
      const list = await store.list("day:");
      for (const key of (list?.keys || []).sort()) { const d = await sGet(key); if (!d) continue; const date = key.replace("day:", ""); d.foods.forEach((f) => rows.push([date, f.name, f.serving || "", f.calories, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g, f.sugar_g, f.sodium_mg])); }
    } catch { history.forEach((h) => h.day.foods.forEach((f) => rows.push([h.key, f.name, f.serving || "", f.calories, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g, f.sugar_g, f.sodium_mg]))); }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "nutracked.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const shiftDate = (n) => { const d = new Date(selectedDate + "T00:00:00"); d.setDate(d.getDate() + n); if (d > new Date()) return; setSelectedDate(dk(d)); };

  const tgt = macroTargets(profile);
  const proj = projection(profile, currentWeightKg(profile, weights), avgNetOverDays(profile, history));
  const streak = computeStreak(history);
  const dateLabelStr = isToday(selectedDate) ? "Today" : new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  if (!loaded) return <div style={{ minHeight: 500, display: "grid", placeItems: "center", background: C.paper, color: C.inkSoft, fontFamily: "Inter, sans-serif" }}><style>{FONTS}</style>Loading Nutracked…</div>;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.paper, color: C.ink, minHeight: "100vh" }}>
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { opacity: .3; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-slow { animation: spin 1.4s linear infinite; }
        button:focus-visible { outline: 2px solid ${C.ink}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }
      `}</style>
      <div style={{ maxWidth: 460, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {route !== "add" && (
          <div style={{ padding: "18px 20px 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <Logo size={28} />
            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 18, color: C.ink, letterSpacing: "-.01em" }}>Nutracked</span>
          </div>
        )}
        <div style={{ flex: 1, padding: route === "add" ? "16px 20px" : "8px 20px 20px" }}>
          {route === "today" && <Today profile={profile} day={day} dateKey={selectedDate} onPrev={() => shiftDate(-1)} onNext={() => shiftDate(1)} onDelete={deleteFood} onFav={(f) => addFav(template(f))} onAdd={() => setRoute("add")} streak={streak} proj={proj} />}
          {route === "labs" && <Labs profile={profile} blood={blood} onSave={saveBlood} onClear={clearBlood} />}
          {route === "add" && <AddFlow onSave={saveFood} onCancel={() => setRoute("today")} favorites={favorites} recents={recents} onQuickAdd={quickAdd} dateLabel={dateLabelStr} />}
          {route === "progress" && <Progress profile={profile} history={history} weights={weights} tgt={tgt} proj={proj} onLogWeight={logWeight} />}
          {route === "profile" && <Profile profile={profile} save={saveProfile} onExport={exportCSV} userEmail={userEmail} onSignOut={onSignOut} />}
        </div>
        <TabBar route={route} setRoute={setRoute} goAdd={() => setRoute("add")} />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  AUTH SCREENS + GATE                                                */
/* ================================================================== */
function Screen({ children }) {
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.paper, color: C.ink, minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <style>{`${FONTS} * { box-sizing: border-box; }`}</style>
      <div style={{ width: "100%", maxWidth: 380 }}>{children}</div>
    </div>
  );
}

const pwRules = (pw) => [
  { label: "At least 8 characters", ok: pw.length >= 8 },
  { label: "Upper & lowercase letters", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { label: "At least one number", ok: /[0-9]/.test(pw) },
];

function AuthScreen() {
  const [mode, setMode] = useState("signin"); // signin | signup | reset
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const rules = pwRules(pw);
  const pwValid = rules.every((r) => r.ok);
  const canSubmit = mode === "reset"
    ? email.includes("@") && !busy
    : email.includes("@") && (mode === "signin" ? pw.length > 0 : pwValid) && !busy;

  const submit = async () => {
    if (!canSubmit) { if (mode === "signup" && !pwValid) setErr("Please meet all password requirements."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) setErr(error.message);
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password: pw });
        if (error) setErr(error.message);
        else if (!data.session) setMsg("Account created. Check your email to confirm, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) setErr(error.message);
        else setMsg("If that email has an account, a reset link is on its way. Check your inbox.");
      }
    } catch { setErr("Something went wrong. Please try again."); }
    setBusy(false);
  };
  const go = (m) => { setMode(m); setErr(""); setMsg(""); };

  const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 13px", fontSize: 15, color: C.ink, outline: "none", background: "#fff" };
  const heading = mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password";
  const cta = busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <Screen>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
        <Logo size={54} />
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 28, color: C.ink, marginTop: 14, letterSpacing: "-.01em" }}>Nutracked</div>
        <div style={{ color: C.inkSoft, fontSize: 14, marginTop: 4, textAlign: "center", maxWidth: 260, lineHeight: 1.4 }}>Track your nutrition and make sense of your bloodwork.</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: 22, boxShadow: "0 1px 3px rgba(27,36,30,.04)" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 19, color: C.ink, marginBottom: 16 }}>{heading}</div>

        {mode === "reset" && <div style={{ fontSize: 13, color: C.inkSoft, marginTop: -8, marginBottom: 16, lineHeight: 1.5 }}>Enter your email and we'll send you a link to set a new password.</div>}

        <label style={{ display: "block", marginBottom: mode === "reset" ? 14 : 12 }}>
          <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>Email</div>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => e.key === "Enter" && submit()} style={inp} />
        </label>

        {mode !== "reset" && (
          <label style={{ display: "block", marginBottom: mode === "signup" ? 10 : 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>Password</div>
              {mode === "signin" && <button type="button" onClick={() => go("reset")} style={{ background: "none", border: "none", color: C.good, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Forgot password?</button>}
            </div>
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={mode === "signin" ? "Your password" : "Create a password"} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.inkSoft, padding: 6, display: "grid", placeItems: "center" }}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
        )}

        {mode === "signup" && (
          <div style={{ margin: "6px 0 14px" }}>
            {rules.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: r.ok ? C.good : C.inkSoft, marginBottom: 4 }}>
                {r.ok ? <CheckCircle2 size={14} /> : <Circle size={14} />} {r.label}
              </div>
            ))}
          </div>
        )}

        {err && <div style={{ color: C.warn, fontSize: 13, marginBottom: 12, marginTop: 6, background: "#fdf3f1", border: `1px solid ${C.warn}44`, borderRadius: 10, padding: "8px 10px" }}>{err}</div>}
        {msg && <div style={{ color: C.good, fontSize: 13, marginBottom: 12, marginTop: 6, background: "#f1f7f3", border: `1px solid ${C.good}44`, borderRadius: 10, padding: "8px 10px" }}>{msg}</div>}

        <button onClick={submit} disabled={!canSubmit} style={{ width: "100%", marginTop: 6, background: C.ink, color: C.paper, border: "none", borderRadius: 12, padding: "13px", cursor: canSubmit ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 15, opacity: canSubmit ? 1 : 0.45, transition: "opacity .15s" }}>{cta}</button>
      </div>

      <div style={{ textAlign: "center", marginTop: 18, fontSize: 14, color: C.inkSoft }}>
        {mode === "reset" ? (
          <button onClick={() => go("signin")} style={{ background: "none", border: "none", color: C.good, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>← Back to sign in</button>
        ) : (
          <>
            {mode === "signin" ? "New to Nutracked? " : "Already have an account? "}
            <button onClick={() => go(mode === "signin" ? "signup" : "signin")} style={{ background: "none", border: "none", color: C.good, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.inkSoft, lineHeight: 1.5, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>Nutracked offers educational estimates, not medical advice.</div>
    </Screen>
  );
}

function UpdatePasswordScreen({ onDone }) {
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const rules = pwRules(pw);
  const valid = rules.every((r) => r.ok);
  const save = async () => {
    if (!valid) { setErr("Please meet all password requirements."); return; }
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) setErr(error.message); else onDone();
    } catch { setErr("Something went wrong. Please try again."); }
    setBusy(false);
  };
  const inp = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 13px", fontSize: 15, color: C.ink, outline: "none", background: "#fff" };
  return (
    <Screen>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
        <Logo size={54} />
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 26, color: C.ink, marginTop: 14 }}>Set a new password</div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: 22 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>New password</div>
          <div style={{ position: "relative" }}>
            <input type={showPw ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Create a password" onKeyDown={(e) => e.key === "Enter" && save()} style={{ ...inp, paddingRight: 44 }} />
            <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.inkSoft, padding: 6, display: "grid", placeItems: "center" }}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
        </label>
        <div style={{ margin: "6px 0 14px" }}>
          {rules.map((r, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: r.ok ? C.good : C.inkSoft, marginBottom: 4 }}>{r.ok ? <CheckCircle2 size={14} /> : <Circle size={14} />} {r.label}</div>)}
        </div>
        {err && <div style={{ color: C.warn, fontSize: 13, marginBottom: 12, background: "#fdf3f1", border: `1px solid ${C.warn}44`, borderRadius: 10, padding: "8px 10px" }}>{err}</div>}
        <button onClick={save} disabled={!valid || busy} style={{ width: "100%", background: C.ink, color: C.paper, border: "none", borderRadius: 12, padding: "13px", cursor: valid && !busy ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 15, opacity: valid && !busy ? 1 : 0.45 }}>{busy ? "Saving…" : "Save new password"}</button>
      </div>
    </Screen>
  );
}

function ConfigScreen() {
  return (
    <Screen>
      <div style={{ textAlign: "center" }}>
        <Logo size={48} />
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: C.ink, margin: "12px 0 8px" }}>Almost there</div>
        <div style={{ color: C.inkSoft, fontSize: 14, lineHeight: 1.55 }}>Accounts need Supabase keys. Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> to your Vercel environment variables and redeploy. Full steps are in the README.</div>
      </div>
    </Screen>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => { authState.uid = data.session?.user?.id || null; setSession(data.session || null); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      authState.uid = s?.user?.id || null;
      setSession(s || null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const signOut = async () => { try { await supabase.auth.signOut(); } catch {} };
  if (!supabase) return <ConfigScreen />;
  if (session === undefined) return <Screen><div style={{ textAlign: "center", color: C.inkSoft }}>Loading…</div></Screen>;
  if (recovery && session) return <UpdatePasswordScreen onDone={() => setRecovery(false)} />;
  if (!session) return <AuthScreen />;
  return <MainApp key={session.user.id} userEmail={session.user.email} onSignOut={signOut} />;
}
