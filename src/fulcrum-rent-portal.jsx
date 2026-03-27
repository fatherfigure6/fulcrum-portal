import { useState, useEffect, useRef } from "react";
import emailjs from "@emailjs/browser";
import { createClient } from "@supabase/supabase-js";

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Persistent storage helpers ──────────────────────────────────────────────
const store = {
  async get(key) {
    try {
      const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).single();
      if (error?.code === "PGRST116") return null; // row not found — safe to seed
      if (error) return undefined;                 // real error — do not overwrite
      return data ? JSON.parse(data.value) : null;
    } catch { return undefined; }
  },
  async set(key, val) {
    try {
      await supabase.from("kv_store").upsert({ key, value: JSON.stringify(val) });
    } catch {}
  }
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --primary:#2c3e50; --white:#ffffff; --ink:#1a1f2e;
    --grey-100:#f5f5f3; --grey-200:#e4e4e0; --grey-300:#d0d0cb;
    --border:var(--grey-200); --border-strong:var(--grey-300);
    --danger:#b04040; --teal:#1a7a8a; --indigo:#4a5a8a; --r:2px;
    --shadow-1:0 1px 2px rgba(0,0,0,.04);
    --shadow-3:0 4px 8px rgba(0,0,0,.08);
  }
  html,body,#root { height:100%; background:var(--grey-100); color:var(--ink); font-family:'Inter',sans-serif; }
  .shell { display:flex; min-height:100vh; }
  .sidebar { width:260px; min-height:100vh; background:var(--primary); display:flex; flex-direction:column; padding:32px 0; position:fixed; top:0; left:0; bottom:0; border-right:1px solid rgba(255,255,255,.1); }
  .sidebar-logo { padding:0 24px 32px; border-bottom:1px solid rgba(255,255,255,.1); text-align:center; }
  .nav { flex:1; padding:20px 0; }
  .nav-section { font-size:10px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,.25); padding:16px 28px 6px; font-family:'Inter',sans-serif; }
  .nav-item { display:flex; align-items:center; gap:12px; padding:11px 28px; color:rgba(255,255,255,.7); cursor:pointer; font-size:14px; font-weight:400; transition:color 150ms ease,background 150ms ease; border-left:2px solid transparent; }
  .nav-item:hover { color:#fff; background:rgba(255,255,255,.05); }
  .nav-item.active { color:#fff; border-left-color:#fff; background:rgba(255,255,255,.08); font-weight:500; }
  .nav-icon { font-size:17px; width:20px; text-align:center; }
  .sidebar-footer { padding:18px 28px; border-top:1px solid rgba(255,255,255,.1); }
  .user-chip { font-size:11px; color:rgba(255,255,255,.45); }
  .user-name { color:#fff; font-weight:600; font-size:14px; margin-bottom:2px; }
  .btn-signout { margin-top:10px; width:100%; padding:7px; border:1px solid rgba(255,255,255,.2); background:transparent; color:rgba(255,255,255,.6); cursor:pointer; border-radius:var(--r); font-size:13px; transition:border-color 150ms ease,color 150ms ease; font-family:'Inter',sans-serif; }
  .btn-signout:hover { border-color:#fff; color:#fff; }
  .main { margin-left:260px; flex:1; padding:40px 48px; min-height:100vh; }
  .page-header { margin-bottom:28px; }
  .page-title { font-family:'Inter',sans-serif; font-size:24px; font-weight:700; letter-spacing:-.3px; line-height:1.2; color:var(--primary); }
  .page-sub { font-size:13px; color:#888; margin-top:4px; }
  .auth-shell { min-height:100vh; display:flex; align-items:stretch; background:var(--primary); }
  .auth-panel { width:480px; background:var(--white); padding:56px 52px; display:flex; flex-direction:column; justify-content:center; }
  .auth-brand { margin-bottom:36px; display:flex; justify-content:center; }
  .auth-title { font-family:'Inter',sans-serif; font-size:20px; font-weight:700; letter-spacing:-.2px; margin-bottom:24px; color:var(--primary); }
  .auth-deco { flex:1; background:var(--primary); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px; }
  .deco-quote { color:rgba(255,255,255,.4); font-size:14px; text-align:center; max-width:320px; line-height:1.7; letter-spacing:.2px; }
  .card { background:var(--white); border:1px solid var(--border); border-radius:var(--r); padding:20px 24px; box-shadow:var(--shadow-1); }
  .card+.card { margin-top:16px; }
  .card-title { font-weight:600; font-size:15px; margin-bottom:16px; color:var(--primary); }
  .stats { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:24px; }
  .stat { background:var(--white); border:1px solid var(--border); border-radius:var(--r); padding:16px 20px; box-shadow:var(--shadow-1); }
  .stat-num { font-family:'Inter',sans-serif; font-size:32px; font-weight:700; color:var(--primary); line-height:1; font-feature-settings:'tnum'; }
  .stat-num.gold  { color:var(--primary); }
  .stat-num.green { color:var(--primary); }
  .stat-num.rust  { color:var(--danger); }
  .stat-num.teal  { color:var(--teal); }
  .stat-label { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#999; margin-top:6px; }
  .tbl { width:100%; border-collapse:collapse; font-size:14px; }
  .tbl th { text-align:left; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#888; padding:8px 14px 10px; border-bottom:2px solid var(--border-strong); font-weight:600; background:var(--grey-100); }
  .tbl td { padding:10px 14px; border-bottom:1px solid var(--border); vertical-align:middle; font-feature-settings:'tnum'; }
  .tbl tr:last-child td { border-bottom:none; }
  .tbl tr:hover td { background:var(--grey-100); }
  .badge { display:inline-block; padding:2px 8px; border-radius:2px; font-size:11px; font-weight:600; letter-spacing:.3px; text-transform:uppercase; }
  .badge-pending  { background:#f5e8e8; color:#8b2020; }
  .badge-complete { background:#e4ede8; color:#2a5c3a; }
  .badge-approved { background:#e4eaf5; color:#2a3d70; }
  .badge-rent     { background:#edf0f5; color:var(--primary); }
  .badge-cma      { background:#e4eef0; color:#1a5a65; }
  .badge-pdr      { background:#eaecf5; color:#3a4a80; }
  .badge-referral { background:#fef3e2; color:#7a4a00; }
  .btn-purple   { background:var(--indigo); color:#fff; border-color:var(--indigo); }
  .btn-purple:hover { background:#3a4a7a; border-color:#3a4a7a; }
  .pill-group { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
  .pill { padding:6px 14px; border:1px solid var(--border-strong); border-radius:2px; font-size:13px; cursor:pointer; transition:border-color 150ms ease,background 150ms ease; background:var(--white); user-select:none; }
  .pill:hover { border-color:var(--primary); }
  .pill.sel-gold   { border-color:var(--primary); background:var(--grey-100); color:var(--primary); font-weight:600; }
  .pill.sel-purple { border-color:var(--indigo); background:#eaecf5; color:var(--indigo); font-weight:600; }
  .pdr-shell { min-height:100vh; background:var(--grey-100); display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:48px 20px; }
  .pdr-card  { width:100%; max-width:640px; }
  .pdr-brand { text-align:center; margin-bottom:32px; }
  .pdr-sub   { font-size:11px; letter-spacing:3px; color:#aaa; text-transform:uppercase; margin-top:8px; }
  .step-bar  { display:flex; align-items:center; gap:0; margin-bottom:28px; }
  .step-dot  { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
  .step-dot.done    { background:var(--primary); color:#fff; }
  .step-dot.active  { background:var(--primary); color:#fff; }
  .step-dot.waiting { background:var(--grey-200); color:#aaa; }
  .step-line { flex:1; height:1px; background:var(--border); }
  .step-line.done { background:var(--primary); }
  .range-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .type-card.sel-purple { border-color:var(--indigo); background:#f0f1f8; }
  .field { margin-bottom:16px; }
  .field label { display:block; font-size:11px; font-weight:600; letter-spacing:.8px; text-transform:uppercase; color:#666; margin-bottom:6px; }
  .field input,.field select,.field textarea { width:100%; height:40px; padding:0 12px; border:1px solid var(--border); border-radius:var(--r); font-size:14px; font-family:'Inter',sans-serif; background:var(--white); transition:border-color 150ms ease; color:var(--ink); outline:none; }
  .field textarea { height:auto; padding:10px 12px; }
  .field input:focus,.field select:focus,.field textarea:focus { border-color:var(--primary); box-shadow:0 0 0 3px rgba(44,62,80,.12); }
  .field .hint { font-size:12px; color:#aaa; margin-top:4px; }
  .type-toggle { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:4px; }
  .type-card { padding:16px 18px; border:1px solid var(--border); border-radius:var(--r); cursor:pointer; transition:border-color 150ms ease; background:var(--white); }
  .type-card:hover { border-color:var(--primary); }
  .type-card.sel-rent { border-color:var(--primary); background:var(--grey-100); }
  .type-card.sel-cma  { border-color:var(--teal); background:#f0f5f6; }
  .type-card-icon  { font-size:24px; margin-bottom:8px; }
  .type-card-title { font-weight:600; font-size:14px; color:var(--primary); margin-bottom:4px; }
  .type-card-desc  { font-size:12px; color:#999; line-height:1.5; }
  .btn { display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 16px; border-radius:var(--r); font-size:14px; font-weight:600; cursor:pointer; border:1px solid transparent; font-family:'Inter',sans-serif; letter-spacing:.1px; transition:background 150ms ease,border-color 150ms ease; }
  .btn-primary   { background:var(--primary); color:#fff; border-color:var(--primary); }
  .btn-primary:hover { background:#1a2635; border-color:#1a2635; }
  .btn-teal      { background:var(--teal); color:#fff; border-color:var(--teal); }
  .btn-teal:hover { background:#156470; border-color:#156470; }
  .btn-secondary { background:transparent; border:1px solid var(--border-strong); color:var(--ink); }
  .btn-secondary:hover { border-color:var(--primary); }
  .btn-danger    { background:var(--danger); color:#fff; border-color:var(--danger); }
  .btn-danger:hover { background:#8b2020; border-color:#8b2020; }
  .btn-sm  { height:32px; padding:0 12px; font-size:12px; }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .row { display:flex; gap:16px; align-items:center; }
  .row-between { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .mt { margin-top:16px; }
  .empty { text-align:center; padding:48px 20px; color:#bbb; font-size:14px; }
  .empty-icon { font-size:32px; margin-bottom:10px; opacity:.4; }
  .divider { height:1px; background:var(--border); margin:16px 0; }
  .text-link { color:var(--ink); cursor:pointer; font-size:14px; }
  .text-link:hover { text-decoration:underline; }
  .alert { padding:10px 14px; border-radius:var(--r); font-size:14px; margin-bottom:14px; }
  .alert-error   { background:#f5e8e8; color:var(--danger); border:1px solid #ddb8b8; }
  .alert-success { background:#e4ede8; color:#2a5c3a; border:1px solid #b8d4c0; }
  .tag { display:inline-block; background:var(--grey-100); padding:2px 8px; border-radius:2px; font-size:12px; font-family:'JetBrains Mono',monospace; border:1px solid var(--border); }
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; }
  .modal { background:var(--white); border-radius:var(--r); padding:32px; width:100%; max-width:540px; box-shadow:var(--shadow-3); max-height:90vh; overflow-y:auto; }
  .modal-title { font-family:'Inter',sans-serif; font-size:18px; font-weight:700; letter-spacing:-.2px; color:var(--primary); margin-bottom:20px; }
  .install-banner { position:fixed; bottom:20px; right:20px; background:var(--primary); color:#fff; padding:14px 18px; border-radius:var(--r); box-shadow:var(--shadow-3); display:flex; align-items:center; gap:14px; z-index:200; border-left:3px solid rgba(255,255,255,.3); max-width:340px; }
  .install-text { font-size:13px; line-height:1.5; }
  .install-text strong { display:block; margin-bottom:2px; }
  .mobile-header { display:none; }
  .bottom-nav { display:none; }
  @media(max-width:900px){
    .sidebar { width:64px; }
    .nav-item span,.nav-section,.user-chip,.user-name,.btn-signout { display:none; }
    .main { margin-left:64px; padding:28px 16px; }
    .stats { grid-template-columns:repeat(3,1fr); }
    .auth-deco { display:none; }
    .auth-panel { width:100%; }
    .type-toggle { grid-template-columns:1fr; }
    .range-row { grid-template-columns:1fr; }
  }
  @media(max-width:600px){
    .sidebar { display:none; }
    .mobile-header { display:flex; align-items:center; justify-content:space-between; padding:0 16px; background:var(--primary); position:fixed; top:0; left:0; right:0; z-index:50; height:52px; border-bottom:1px solid rgba(255,255,255,.1); }
    .mobile-header-user { display:flex; align-items:center; gap:10px; }
    .mobile-signout { background:transparent; border:1px solid rgba(255,255,255,.3); color:rgba(255,255,255,.8); font-size:12px; padding:5px 10px; border-radius:var(--r); cursor:pointer; font-family:'Inter',sans-serif; }
    .main { margin-left:0; padding:68px 14px 76px; min-height:100vh; }
    .bottom-nav { display:flex; position:fixed; bottom:0; left:0; right:0; background:var(--primary); border-top:1px solid rgba(255,255,255,.1); z-index:50; }
    .bottom-nav-item { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:7px 2px 8px; color:rgba(255,255,255,.55); cursor:pointer; position:relative; gap:2px; }
    .bottom-nav-item.active { color:#fff; background:rgba(255,255,255,.08); }
    .bottom-nav-icon { font-size:20px; line-height:1; }
    .bottom-nav-label { font-size:9px; letter-spacing:.3px; text-transform:uppercase; font-weight:500; }
    .bottom-nav-badge { position:absolute; top:5px; left:calc(50% + 6px); background:#b04040; color:#fff; border-radius:10px; padding:1px 5px; font-size:9px; font-weight:700; line-height:1.4; }
    .stats { grid-template-columns:repeat(6,1fr) !important; }
    .stats .stat { grid-column:span 2; }
    .stats .stat:nth-child(4),.stats .stat:nth-child(5) { grid-column:span 3; }
    .page-title { font-size:20px; }
    .page-header { margin-bottom:18px; }
    .card { padding:14px 14px; overflow-x:auto; }
    .tbl { min-width:480px; }
    .modal { padding:20px 16px; max-height:88vh; width:100%; }
    .row-between { flex-wrap:wrap; gap:8px; }
    .row { flex-wrap:wrap; }
    .auth-panel { padding:36px 24px; }
    .install-banner { bottom:76px; right:12px; left:12px; max-width:100%; }
    .type-toggle { grid-template-columns:1fr; }
    .range-row { grid-template-columns:1fr; }
  }
`;

// ── EmailJS ───────────────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID     = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_STAFF = import.meta.env.VITE_EMAILJS_TEMPLATE_STAFF;
const EMAILJS_TEMPLATE_USER  = import.meta.env.VITE_EMAILJS_TEMPLATE_USER;
const EMAILJS_PUBLIC_KEY     = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

const WA_PHONE  = import.meta.env.VITE_WA_PHONE;
const WA_APIKEY = import.meta.env.VITE_WA_APIKEY;

async function sendWhatsApp(message) {
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&text=${encodeURIComponent(message)}&apikey=${WA_APIKEY}`;
    await fetch(url, { mode: "no-cors" });
  } catch(e) {
    console.error("WhatsApp notification error:", e);
  }
}

async function sendEmail(templateId, params) {
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, templateId, params, { publicKey: EMAILJS_PUBLIC_KEY });
    return true;
  } catch(e) {
    console.error("EmailJS error:", e.status, e.text, JSON.stringify(e));
    return false;
  }
}

// ── Google Places ─────────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;
  window.__gmapsLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    s.async = true; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.__gmapsLoading;
}

function AddressAutocomplete({ value, onChange }) {
  const inputRef = useRef(null);
  const acRef    = useRef(null);
  const [loaded, setLoaded]   = useState(false);
  const [localVal, setLocalVal] = useState(value || "");

  useEffect(() => { loadGoogleMaps().then(() => setLoaded(true)).catch(() => {}); }, []);

  useEffect(() => {
    if (!loaded || !inputRef.current || acRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"], componentRestrictions: { country: "au" },
    });
    ac.addListener("place_changed", () => {
      const addr = ac.getPlace().formatted_address || inputRef.current.value;
      setLocalVal(addr); onChange(addr);
    });
    acRef.current = ac;
  }, [loaded]);

  return (
    <div>
      <input ref={inputRef} value={localVal}
        onChange={e => { setLocalVal(e.target.value); onChange(e.target.value); }}
        placeholder="Start typing a property address…" autoComplete="off" />
      {GOOGLE_MAPS_API_KEY === "YOUR_GOOGLE_MAPS_API_KEY" && (
        <div style={{fontSize:11,color:"#e65100",marginTop:5}}>⚠️ Google Maps API key not set — autocomplete inactive. Manual entry still works.</div>
      )}
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────
const uid      = () => Math.random().toString(36).slice(2, 10);
const fmt      = d  => new Date(d).toLocaleDateString("en-AU", { day:"2-digit", month:"short", year:"numeric" });
const fmtMoney = v  => v ? `$${Number(v).toLocaleString()}` : "—";

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [users,    setUsers]    = useState([]);
  const [requests, setRequests] = useState([]);
  const [session,  setSession]  = useState(null);
  const [view,     setView]     = useState("loading");
  const [page,     setPage]     = useState("dashboard");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall,   setShowInstall]   = useState(false);
  const registering = useRef(false);
  const recovering  = useRef(false);

  const normalizeProfile = row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status || null,
    company: row.company || "",
    phone: row.phone || "",
    mustChangePassword: row.must_change_password || false,
  });

  const loadUsers = async () => {
    const { data } = await supabase.from("profiles").select("*");
    setUsers((data || []).map(normalizeProfile));
  };

  const loadProfile = async userId => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!data) { await supabase.auth.signOut(); return; }
    if (data.role === "broker" && data.status !== "approved") {
      await supabase.auth.signOut();
      return;
    }
    const profile = normalizeProfile(data);
    setSession(profile);
    if (profile.mustChangePassword) setView("change-password");
    else { setView("dashboard"); setPage("dashboard"); }
    if (profile.role === "staff") await loadUsers();
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSess) => {
      if (event === "PASSWORD_RECOVERY") { recovering.current = true; setView("reset"); return; }
      if (event === "USER_UPDATED") { recovering.current = false; return; }
      if (event === "SIGNED_OUT") { recovering.current = false; setSession(null); setView("login"); return; }
      if (authSess?.user && !registering.current && !recovering.current) {
        await loadProfile(authSess.user.id);
      } else if (!authSess?.user && !recovering.current) {
        setSession(null);
        setView("login");
      }
    });
    (async () => {
      let r = await store.get("fa:requests");
      if (r === null) { r = []; await store.set("fa:requests", r); }
      else if (!r) r = [];
      setRequests(r);
    })();
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); setInstallPrompt(e); setShowInstall(true); });
    return () => subscription.unsubscribe();
  }, []);

  const saveRequests = async r => { setRequests(r); await store.set("fa:requests", r); };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return "Invalid email or password.";
    const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", data.user.id).single();
    if (profile?.role === "broker" && profile?.status !== "approved") {
      await supabase.auth.signOut();
      return "Your account is pending approval.";
    }
    return null;
  };

  const logout = async () => { await supabase.auth.signOut(); };

  const register = async data => {
    registering.current = true;
    try {
      const { data: signupData, error } = await supabase.auth.signUp({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });
      if (error) {
        if (error.message.toLowerCase().includes("already")) return "Email already registered.";
        return error.message;
      }
      const { error: profileError } = await supabase.from("profiles").insert({
        id: signupData.user.id,
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        role: "broker",
        status: "pending",
        company: data.company.trim(),
        phone: data.phone?.trim() || null,
        must_change_password: false,
      });
      if (profileError) {
        await supabase.auth.signOut();
        return "Registration failed. Please try again.";
      }
      await supabase.auth.signOut();
      sendEmail(EMAILJS_TEMPLATE_STAFF, {
        email: "brian@fulcrumaustralia.com.au",
        subject: "New Broker Registration — Pending Approval",
        message: `A new broker has registered and requires approval.\n\nName: ${data.name}\nCompany: ${data.company}\nEmail: ${data.email}\nPhone: ${data.phone || "—"}\n\nLog in to the portal to approve or reject this account.`
      });
      sendWhatsApp(`New Broker Registration\n${data.name} (${data.company}) has registered and is awaiting approval.`);
      return null;
    } finally {
      registering.current = false;
    }
  };

  const forgotPassword = async email => {
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    return "If that email exists, password reset instructions have been sent.";
  };

  const resetPassword = async password => {
    if (password.length < 8) return "Password must be at least 8 characters.";
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return error.message;
    return null;
  };

  const approveUser = async id => {
    await supabase.from("profiles").update({ status: "approved" }).eq("id", id);
    setUsers(users.map(u => u.id === id ? { ...u, status: "approved" } : u));
  };

  const rejectUser = async id => {
    const { data } = await supabase.functions.invoke("admin-delete-user", { body: { userId: id } });
    if (data?.error) return;
    setUsers(users.filter(u => u.id !== id));
  };

  const addStaff = async data => {
    const name  = data.name?.trim()  || "";
    const email = data.email?.trim().toLowerCase() || "";
    const password = data.tempPassword;
    if (!name)  return "Full name is required.";
    if (!email) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    if (!password || password.length < 8) return "Temporary password must be at least 8 characters.";
    const { data: result } = await supabase.functions.invoke("admin-create-user", {
      body: { email, password, name, role: "staff", mustChangePassword: true }
    });
    if (result?.error) return result.error;
    setUsers([...users, { id: result.id, name, email, role: "staff", status: null, company: "", phone: "", mustChangePassword: true }]);
    return null;
  };

  const removeStaff = async (id, currentUserId) => {
    if (id === currentUserId) return "You cannot remove your own account.";
    const target = users.find(u => u.id === id);
    if (!target || target.role !== "staff") return "Staff account not found.";
    const remainingStaff = users.filter(u => u.role === "staff" && u.id !== id);
    if (remainingStaff.length === 0) return "Cannot remove the last staff account.";
    const { data } = await supabase.functions.invoke("admin-delete-user", { body: { userId: id } });
    if (data?.error) return data.error;
    setUsers(users.filter(u => u.id !== id));
    return null;
  };

  const addBroker = async data => {
    if (!data.tempPassword || data.tempPassword.length < 8) return "Temporary password must be at least 8 characters.";
    const { data: result } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: data.email.trim().toLowerCase(),
        password: data.tempPassword,
        name: data.name.trim(),
        role: "broker",
        company: data.company.trim(),
        phone: data.phone?.trim() || null,
        mustChangePassword: true,
      }
    });
    if (result?.error) return result.error;
    setUsers([...users, {
      id: result.id, name: data.name.trim(), email: data.email.trim().toLowerCase(),
      company: data.company.trim(), phone: data.phone?.trim() || "",
      role: "broker", status: "approved", mustChangePassword: true,
    }]);
    return null;
  };

  const changePassword = async newPassword => {
    if (newPassword.length < 8) return "Password must be at least 8 characters.";
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return error.message;
    await supabase.from("profiles").update({ must_change_password: false }).eq("id", session.id);
    setSession({ ...session, mustChangePassword: false });
    setView("dashboard");
    setPage("dashboard");
    return null;
  };

  const submitRequest = async data => {
    const req = { ...data, id: uid(), brokerId: session.id, brokerName: session.name, brokerEmail: session.email, brokerCompany: session.company, status: "pending", createdAt: Date.now(), completedAt: null, downloadUrl: null };
    await saveRequests([req, ...requests]);
    const typeLabel = data.type === "rent" ? "Rent Letter" : data.type === "cma" ? "CMA" : data.type === "referral" ? "Client Referral" : "PDR";
    const message = data.type === "referral"
      ? `A new client referral has been submitted.\n\nReferring Broker: ${session.name}\nCompany: ${session.company}\nEmail: ${session.email}\n\nClient Name: ${data.clientName}\nClient Email: ${data.clientEmail}\nClient Mobile: ${data.clientMobile || "—"}\n\nSituation:\n${data.situation}\n\nSubmitted: ${new Date().toLocaleString("en-AU")}\n\nLog in to the portal to review this referral.`
      : `A new ${typeLabel} request has been submitted.\n\nBroker: ${session.name}\nCompany: ${session.company}\nEmail: ${session.email}\nAddress: ${data.address || "—"}\nSubmitted: ${new Date().toLocaleString("en-AU")}\n\nLog in to the portal to review and complete this request.`;
    sendEmail(EMAILJS_TEMPLATE_STAFF, {
      email: "brian@fulcrumaustralia.com.au",
      subject: `New ${typeLabel} — ${session.name} (${session.company})`,
      message
    });
    sendWhatsApp(`New ${typeLabel}\nFrom: ${session.name} (${session.company})\n${data.type === "referral" ? `Client: ${data.clientName}` : `Property: ${data.address || "—"}`}`);
    return req;
  };

  const updateRequest = async (id, patch) => saveRequests(requests.map(r => r.id === id ? { ...r, ...patch } : r));

  if (view === "loading") return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#999"}}>Loading…</div>;

  return (
    <>
      <style>{CSS}</style>
      {showInstall && (
        <div className="install-banner">
          <div style={{fontSize:28}}>📲</div>
          <div className="install-text"><strong>Install Fulcrum Portal</strong>Add to your home screen</div>
          <button className="btn btn-primary btn-sm" onClick={() => { installPrompt?.prompt(); setShowInstall(false); }}>Install</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowInstall(false)}>✕</button>
        </div>
      )}
      {view==="login"           && <LoginScreen onLogin={login} onRegister={() => setView("register")} onForgotPassword={() => setView("forgot")} />}
      {view==="register"        && <RegisterScreen onRegister={register} onBack={() => setView("login")} />}
      {view==="forgot"          && <ForgotPasswordScreen onForgotPassword={forgotPassword} onBack={() => setView("login")} />}
      {view==="reset"           && <ResetPasswordScreen onResetPassword={resetPassword} onBack={async () => { await supabase.auth.signOut(); setView("login"); }} />}
      {view==="change-password" && session && <ChangePasswordScreen onChangePassword={changePassword} />}
      {view==="dashboard" && session && (
        <AppShell session={session} setView={setView} page={page} setPage={setPage} onLogout={logout}
          users={users} requests={requests} onApprove={approveUser} onReject={rejectUser}
          onAddBroker={addBroker} onSubmitRequest={submitRequest} onUpdateRequest={updateRequest}
          onAddStaff={addStaff} onRemoveStaff={removeStaff} />
      )}
    </>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, onRegister, onForgotPassword }) {
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [err,   setErr]   = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => { setErr(""); setLoading(true); const e = await onLogin(email, pass); setLoading(false); if (e) setErr(e); };
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand"><img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:180,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        <div className="auth-title">Sign In</div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="field"><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="you@example.com" /></div>
        <div className="field"><label>Password</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" /></div>
        <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Signing in…" : "Sign In →"}</button>
        <div className="divider" />
        <p style={{fontSize:14,color:"#888",textAlign:"center"}}>New broker? <span className="text-link" onClick={onRegister}>Request access</span></p>
        <p style={{fontSize:13,color:"#aaa",textAlign:"center",marginTop:8}}><span className="text-link" onClick={onForgotPassword}>Forgot password?</span></p>
      </div>
      <div className="auth-deco">
        <div className="deco-quote">Fast rent letters and comparative market analyses — powered by Fulcrum Australia.</div>
      </div>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
function RegisterScreen({ onRegister, onBack }) {
  const [form, setForm] = useState({ name:"", email:"", company:"", phone:"", password:"", confirm:"" });
  const [err,  setErr]  = useState("");
  const [done, setDone] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (!form.name||!form.email||!form.company||!form.password) return setErr("Please fill all required fields.");
    if (form.password !== form.confirm) return setErr("Passwords do not match.");
    if (form.password.length < 8) return setErr("Password must be at least 8 characters.");
    const e = await onRegister(form); if (e) setErr(e); else setDone(true);
  };
  return (
    <div className="auth-shell">
      <div className="auth-panel" style={{width:520}}>
        <div className="auth-brand"><img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:180,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        {done ? (
          <div>
            <div className="alert alert-success" style={{fontSize:15,padding:"20px 24px"}}>✅ Registration submitted! Pending admin approval.</div>
            <button className="btn btn-secondary mt" onClick={onBack}>← Back to Sign In</button>
          </div>
        ) : (
          <>
            <div className="auth-title">Request Access</div>
            {err && <div className="alert alert-error">{err}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
              <div className="field"><label>Full Name *</label><input value={form.name} onChange={set("name")} /></div>
              <div className="field"><label>Company *</label><input value={form.company} onChange={set("company")} /></div>
            </div>
            <div className="field"><label>Email *</label><input value={form.email} onChange={set("email")} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={set("phone")} /></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
              <div className="field"><label>Password *</label><input type="password" value={form.password} onChange={set("password")} /></div>
              <div className="field"><label>Confirm *</label><input type="password" value={form.confirm} onChange={set("confirm")} /></div>
            </div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center"}} onClick={submit}>Submit Request →</button>
            <div className="divider" />
            <p style={{fontSize:14,color:"#888",textAlign:"center"}}><span className="text-link" onClick={onBack}>← Back to Sign In</span></p>
          </>
        )}
      </div>
      <div className="auth-deco">
        <div className="deco-quote">Trusted by Perth mortgage brokers for fast, accurate property reports.</div>
      </div>
    </div>
  );
}

// ── Forgot Password ───────────────────────────────────────────────────────────
function ForgotPasswordScreen({ onForgotPassword, onBack }) {
  const [email,   setEmail]   = useState("");
  const [err,     setErr]     = useState("");
  const [done,    setDone]    = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!email.trim()) return setErr("Please enter your email address.");
    setErr(""); setLoading(true);
    const result = await onForgotPassword(email);
    setLoading(false);
    if (result && result.startsWith("We couldn't")) { setErr(result); }
    else { setDone(true); }
  };
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand"><img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:180,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        <div className="auth-title">Reset Password</div>
        {done ? (
          <div>
            <div className="alert alert-success" style={{fontSize:15,padding:"20px 24px"}}>✅ If that email exists, password reset instructions have been sent.</div>
            <button className="btn btn-secondary mt" onClick={onBack}>← Back to Sign In</button>
          </div>
        ) : (
          <>
            {err && <div className="alert alert-error">{err}</div>}
            <p style={{fontSize:14,color:"#888",marginBottom:16}}>Enter your email address and we'll send you a link to reset your password.</p>
            <div className="field"><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="you@example.com" /></div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Sending…" : "Send Reset Link →"}</button>
            <div className="divider" />
            <p style={{fontSize:14,color:"#888",textAlign:"center"}}><span className="text-link" onClick={onBack}>← Back to Sign In</span></p>
          </>
        )}
      </div>
      <div className="auth-deco">
        <div className="deco-quote">Fast rent letters and comparative market analyses — powered by Fulcrum Australia.</div>
      </div>
    </div>
  );
}

// ── Reset Password ────────────────────────────────────────────────────────────
function ResetPasswordScreen({ onResetPassword, onBack }) {
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [err,      setErr]      = useState("");
  const [done,     setDone]     = useState(false);
  const [loading,  setLoading]  = useState(false);

  const submit = async () => {
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (password !== confirm) return setErr("Passwords do not match.");
    setErr(""); setLoading(true);
    const result = await onResetPassword(password);
    setLoading(false);
    if (result) { setErr(result); }
    else { setDone(true); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand"><img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:180,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        <div className="auth-title">Set New Password</div>
        {done ? (
          <div>
            <div className="alert alert-success" style={{fontSize:15,padding:"20px 24px"}}>✅ Your password has been reset. You can now sign in.</div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:16}} onClick={onBack}>Sign In →</button>
          </div>
        ) : (
          <>
            {err && <div className="alert alert-error">{err}</div>}
            <div className="field"><label>New Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
            <div className="field"><label>Confirm Password</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Re-enter password" /></div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Saving…" : "Reset Password →"}</button>
            <div className="divider" />
            <p style={{fontSize:14,color:"#888",textAlign:"center"}}><span className="text-link" onClick={onBack}>← Back to Sign In</span></p>
          </>
        )}
      </div>
      <div className="auth-deco">
        <div className="deco-quote">Fast rent letters and comparative market analyses — powered by Fulcrum Australia.</div>
      </div>
    </div>
  );
}

// ── Change Password (forced on first login) ───────────────────────────────────
function ChangePasswordScreen({ onChangePassword }) {
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [err,      setErr]      = useState("");
  const [loading,  setLoading]  = useState(false);
  const submit = async () => {
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (password !== confirm)  return setErr("Passwords do not match.");
    setErr(""); setLoading(true);
    const result = await onChangePassword(password);
    setLoading(false);
    if (result) setErr(result);
  };
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand"><img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:180,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        <div className="auth-title">Set Your Password</div>
        <p style={{fontSize:14,color:"#888",marginBottom:16}}>You've been given a temporary password. Please set a new password before continuing.</p>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="field"><label>New Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
        <div className="field"><label>Confirm Password</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Re-enter password" /></div>
        <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Saving…" : "Set Password & Continue →"}</button>
      </div>
      <div className="auth-deco">
        <div className="deco-quote">Fast rent letters and comparative market analyses — powered by Fulcrum Australia.</div>
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell({ session, setView, page, setPage, onLogout, users, requests, onApprove, onReject, onAddBroker, onSubmitRequest, onUpdateRequest, onAddStaff, onRemoveStaff }) {
  useEffect(() => {
    if (session?.mustChangePassword) setView("change-password");
  }, [session]);
  if (session?.mustChangePassword) return null;
  const isStaff  = session.role === "staff";
  const isBroker = session.role === "broker";
  const pendingApprovals = users.filter(u => u.role==="broker" && u.status==="pending").length;
  const pendingRent = requests.filter(r => r.type==="rent" && r.status==="pending").length;
  const pendingCMA  = requests.filter(r => r.type==="cma"  && r.status==="pending").length;
  const pendingPDR  = requests.filter(r => r.type==="pdr"  && r.status==="pending").length;

  const adminNav = [
    { id:"dashboard",     icon:"📊", label:"Dashboard" },
    { section:"Rent Letters" },
    { id:"rent-requests", icon:"📋", label:"Rent Requests", badge:pendingRent },
    { section:"Market Analysis" },
    { id:"cma-requests",  icon:"🏡", label:"CMA Requests",  badge:pendingCMA  },
    { section:"Price Discovery" },
    { id:"pdr-requests",  icon:"🔍", label:"PDR Reports",    badge:pendingPDR },
    { section:"Referrals" },
    { id:"referrals",     icon:"🤝", label:"Referrals",     badge:requests.filter(r=>r.type==="referral"&&r.status==="pending").length },
    { section:"Admin" },
    { id:"brokers",        icon:"👥", label:"Brokers",        badge:pendingApprovals },
    { id:"staff-accounts", icon:"🔐", label:"Staff Accounts" },
  ];
  const brokerNav = [
    { id:"dashboard", icon:"🏠", label:"Dashboard" },
    { id:"new",       icon:"✏️",  label:"New Request" },
    { id:"requests",  icon:"📋", label:"My Requests" },
  ];
  const nav = isStaff ? adminNav : brokerNav;

  const navItems = nav.filter(n => !n.section);

  return (
    <div className="shell">
      <div className="mobile-header">
        <img src="/No BG, Light Text.png" style={{height:30}} alt="Fulcrum Australia" />
        <div className="mobile-header-user">
          <span style={{fontSize:13,color:"rgba(255,255,255,.8)"}}>{session.name}</span>
          <button className="mobile-signout" onClick={onLogout}>Sign Out</button>
        </div>
      </div>
      <aside className="sidebar">
        <div className="sidebar-logo"><img src="/No BG, Light Text.png" style={{maxWidth:140,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        <nav className="nav">
          {nav.map((n,i) => n.section
            ? <div key={i} className="nav-section">{n.section}</div>
            : (
              <div key={n.id} className={`nav-item${page===n.id?" active":""}`} onClick={()=>setPage(n.id)}>
                <span className="nav-icon">{n.icon}</span>
                <span>{n.label}</span>
                {n.badge>0 && <span style={{marginLeft:"auto",background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.9)",borderRadius:2,padding:"1px 7px",fontSize:11,fontWeight:700}}>{n.badge}</span>}
              </div>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">Signed in as</div>
          <div className="user-name">{session.name}</div>
          <button className="btn-signout" onClick={onLogout}>Sign Out</button>
        </div>
      </aside>
      <main className="main">
        {isStaff && <>
          {page==="dashboard"     && <AdminDashboard requests={requests} users={users} setPage={setPage} />}
          {page==="rent-requests" && <AdminRequests  requests={requests.filter(r=>r.type==="rent")} onUpdate={onUpdateRequest} type="rent" />}
          {page==="cma-requests"  && <AdminRequests  requests={requests.filter(r=>r.type==="cma")}  onUpdate={onUpdateRequest} type="cma"  />}
          {page==="pdr-requests"  && <AdminPDRRequests requests={requests.filter(r=>r.type==="pdr")} onUpdate={onUpdateRequest} />}
          {page==="referrals"     && <AdminReferrals  requests={requests.filter(r=>r.type==="referral")} onUpdate={onUpdateRequest} />}
          {page==="brokers"       && <AdminBrokers   users={users} onApprove={onApprove} onReject={onReject} onAddBroker={onAddBroker} />}
          {page==="staff-accounts" && session?.role==="staff" && <AdminStaff users={users} session={session} onAddStaff={onAddStaff} onRemoveStaff={onRemoveStaff} />}
        </>}
        {isBroker && <>
          {page==="dashboard" && <BrokerDashboard session={session} requests={requests.filter(r=>r.brokerId===session.id)} setPage={setPage} />}
          {page==="new"       && <NewRequest onSubmit={onSubmitRequest} onDone={()=>setPage("requests")} />}
          {page==="requests"  && <BrokerRequests requests={requests.filter(r=>r.brokerId===session.id)} />}
        </>}
      </main>
      <nav className="bottom-nav">
        {navItems.map(n => (
          <div key={n.id} className={`bottom-nav-item${page===n.id?" active":""}`} onClick={()=>setPage(n.id)}>
            {n.badge>0 && <span className="bottom-nav-badge">{n.badge}</span>}
            <span className="bottom-nav-icon">{n.icon}</span>
            <span className="bottom-nav-label">{n.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ requests, users, setPage }) {
  const complete      = requests.filter(r=>r.status==="complete");
  const rentPending   = requests.filter(r=>r.type==="rent"&&r.status==="pending");
  const cmaPending    = requests.filter(r=>r.type==="cma" &&r.status==="pending");
  const awaitApproval = users.filter(u=>u.role==="broker"&&u.status==="pending");
  return (
    <>
      <div className="page-header"><div className="page-title">Dashboard</div><div className="page-sub">Overview of all portal activity</div></div>
      <div className="stats">
        <div className="stat"><div className="stat-num">{requests.length}</div><div className="stat-label">Total Requests</div></div>
        <div className="stat"><div className="stat-num gold">{rentPending.length}</div><div className="stat-label">Rent Pending</div></div>
        <div className="stat"><div className="stat-num teal">{cmaPending.length}</div><div className="stat-label">CMA Pending</div></div>
        <div className="stat"><div className="stat-num green">{complete.length}</div><div className="stat-label">Completed</div></div>
        <div className="stat"><div className="stat-num" style={{color:"var(--indigo)"}}>{requests.filter(r=>r.type==="pdr"&&r.status==="pending").length}</div><div className="stat-label">PDR Pending</div></div>
        <div className="stat"><div className="stat-num" style={{color:"#7a4a00"}}>{requests.filter(r=>r.type==="referral"&&r.status==="pending").length}</div><div className="stat-label">Referrals</div></div>
      </div>
      {awaitApproval.length>0 && (
        <div className="card" style={{marginBottom:16,borderLeft:"3px solid var(--danger)"}}>
          <div className="row-between">
            <div className="card-title" style={{margin:0}}>⚠️ Brokers Awaiting Approval</div>
            <button className="btn btn-secondary btn-sm" onClick={()=>setPage("brokers")}>Manage →</button>
          </div>
          <p style={{fontSize:14,color:"#888",marginTop:8}}>{awaitApproval.map(u=>`${u.name} (${u.company})`).join(" · ")}</p>
        </div>
      )}
      <div className="card">
        <div className="row-between">
          <div className="card-title" style={{margin:0}}>Recent Requests</div>
          <div className="row" style={{gap:8}}>
            <button className="btn btn-secondary btn-sm" onClick={()=>setPage("rent-requests")}>Rent Letters →</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>setPage("cma-requests")}>CMAs →</button>
          </div>
        </div>
        <table className="tbl" style={{marginTop:16}}>
          <thead><tr><th>Type</th><th>Broker</th><th>Property</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {requests.slice(0,6).map(r=>(
              <tr key={r.id}>
                <td><TypeBadge t={r.type} /></td>
                <td><strong>{r.brokerName}</strong><br/><span style={{fontSize:12,color:"#aaa"}}>{r.brokerCompany}</span></td>
                <td style={{fontSize:13,maxWidth:200}}>{r.address}</td>
                <td style={{fontSize:13,color:"#888"}}>{fmt(r.createdAt)}</td>
                <td><StatusBadge s={r.status} /></td>
              </tr>
            ))}
            {requests.length===0 && <tr><td colSpan={5}><div className="empty">No requests yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}


// ── Admin / CMA Requests (shared, type-aware) ─────────────────────────────────
function AdminRequests({ requests, onUpdate, type }) {
  const isRent = type === "rent";
  const [selected,  setSelected]  = useState(null);
  const [filter,    setFilter]    = useState("all");
  const [uploadUrl, setUploadUrl] = useState("");
  const [notifSent, setNotifSent] = useState(false);
  const filtered = filter==="all" ? requests : requests.filter(r=>r.status===filter);
  const markComplete = async req => {
    if (!uploadUrl.trim()) return alert("Please enter a download URL for the completed document.");
    await onUpdate(req.id, { status:"complete", completedAt:Date.now(), downloadUrl:uploadUrl.trim() });
    const typeLabel = isRent ? "Rent Letter" : "CMA";
    sendEmail(EMAILJS_TEMPLATE_USER, {
      to_email: req.brokerEmail,
      subject: `Your ${typeLabel} Request is Complete — ${req.address || "Property"}`,
      message: `Hi ${req.brokerName},\n\nYour ${typeLabel} request has been completed by the Fulcrum Australia team.\n\nProperty: ${req.address || "—"}\nCompleted: ${new Date().toLocaleString("en-AU")}\n\nDownload your document here:\n${uploadUrl.trim()}\n\nRegards,\nFulcrum Australia`
    });
    setNotifSent(true);
    setTimeout(()=>{ setSelected(null); setUploadUrl(""); setNotifSent(false); }, 2000);
  };
  return (
    <>
      <div className="page-header">
        <div className="page-title">{isRent?"Rent Letter Requests":"CMA Requests"}</div>
        <div className="page-sub">{isRent?"Manage and complete rent letter requests":"Manage and complete comparative market analysis requests"}</div>
      </div>
      <div className="card">
        <div className="row" style={{marginBottom:20,gap:8}}>
          {["all","pending","complete"].map(f=>(
            <button key={f} className={`btn ${filter===f?(isRent?"btn-primary":"btn-teal"):"btn-secondary"} btn-sm`}
              onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f}</button>
          ))}
        </div>
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Broker</th><th>Property</th><th>{isRent?"Weekly Yield":"Est. Value"}</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map(r=>(
              <tr key={r.id}>
                <td><span className="tag" style={{fontSize:11}}>{r.id}</span></td>
                <td><strong>{r.brokerName}</strong><br/><span style={{fontSize:12,color:"#aaa"}}>{r.brokerCompany}</span></td>
                <td style={{fontSize:13,maxWidth:180}}>{r.address}</td>
                <td><span className="tag">{isRent?`$${r.weeklyRent}/wk`:fmtMoney(r.expectedValue)}</span></td>
                <td style={{fontSize:13,color:"#888"}}>{fmt(r.createdAt)}</td>
                <td><StatusBadge s={r.status} /></td>
                <td><button className="btn btn-secondary btn-sm" onClick={()=>{ setSelected(r); setUploadUrl(r.downloadUrl||""); }}>Manage</button></td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={7}><div className="empty"><div className="empty-icon">📭</div>No requests found</div></td></tr>}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="modal">
            <div className="modal-title">{isRent?"Rent Letter":"CMA"} Request Details</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 24px",marginBottom:20}}>
              <Detail label="Broker"    val={selected.brokerName} />
              <Detail label="Company"   val={selected.brokerCompany} />
              <Detail label="Email"     val={selected.brokerEmail} />
              <Detail label="Submitted" val={fmt(selected.createdAt)} />
              <Detail label="Property Address" val={selected.address} full />
              {isRent
                ? <Detail label="Expected Weekly Rent" val={`$${selected.weeklyRent}/week`} />
                : <Detail label="Expected Sale Price"  val={selected.expectedValue ? fmtMoney(selected.expectedValue) : "Not provided"} />
              }
              {selected.notes && <Detail label="Notes" val={selected.notes} full />}
            </div>
            <div className="divider" />
            {notifSent
              ? <div className="alert alert-success">✅ Marked complete! Broker has been notified.</div>
              : <>
                  <div className="field">
                    <label>Download URL for Completed {isRent?"Letter":"CMA"}</label>
                    <input value={uploadUrl} onChange={e=>setUploadUrl(e.target.value)} placeholder="https://drive.google.com/... or similar" />
                    <div className="hint">Paste a shareable link to the completed PDF</div>
                  </div>
                  <div className="row" style={{justifyContent:"flex-end",gap:10}}>
                    <button className="btn btn-secondary" onClick={()=>setSelected(null)}>Cancel</button>
                    {selected.status==="pending" && (
                      <button className={`btn ${isRent?"btn-primary":"btn-teal"}`} onClick={()=>markComplete(selected)}>✅ Mark Complete & Notify Broker</button>
                    )}
                    {selected.status==="complete" && (
                      <button className="btn btn-secondary" onClick={()=>markComplete(selected)}>Update Download URL</button>
                    )}
                  </div>
                </>
            }
          </div>
        </div>
      )}
    </>
  );
}

// ── Admin Brokers ─────────────────────────────────────────────────────────────
function AdminBrokers({ users, onApprove, onReject, onAddBroker }) {
  const brokers  = users.filter(u=>u.role==="broker");
  const pending  = brokers.filter(b=>b.status==="pending");
  const approved = brokers.filter(b=>b.status==="approved");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", company:"", phone:"", tempPassword:"" });
  const [err,  setErr]  = useState("");
  const [done, setDone] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submitAdd = async () => {
    if (!form.name || !form.email || !form.company || !form.tempPassword) return setErr("Please fill all required fields.");
    const e = await onAddBroker(form);
    if (e) { setErr(e); }
    else {
      setDone(true); setForm({ name:"", email:"", company:"", phone:"", tempPassword:"" }); setErr("");
      setTimeout(() => { setDone(false); setShowForm(false); }, 2500);
    }
  };
  return (
    <>
      <div className="page-header" style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
        <div><div className="page-title">Broker Management</div><div className="page-sub">Approve, manage and review broker accounts</div></div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(s=>!s); setErr(""); setDone(false); }}>+ Add Broker</button>
      </div>
      {showForm && (
        <div className="card" style={{marginBottom:20}}>
          <div className="card-title">Add Broker Account</div>
          {done && <div className="alert alert-success" style={{marginBottom:12}}>✅ Broker added. They will be prompted to set a new password on first sign in.</div>}
          {err  && <div className="alert alert-error"   style={{marginBottom:12}}>{err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
            <div className="field"><label>Full Name *</label><input value={form.name} onChange={set("name")} /></div>
            <div className="field"><label>Company *</label><input value={form.company} onChange={set("company")} /></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
            <div className="field"><label>Email *</label><input value={form.email} onChange={set("email")} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={set("phone")} /></div>
          </div>
          <div className="field" style={{maxWidth:300}}>
            <label>Temporary Password * <span style={{fontSize:11,color:"#aaa",fontWeight:400}}>(min 8 characters)</span></label>
            <input type="text" value={form.tempPassword} onChange={set("tempPassword")} placeholder="e.g. Fulcrum2024!" />
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button className="btn btn-primary btn-sm" onClick={submitAdd}>Add Broker</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {pending.length>0 && (
        <div className="card" style={{marginBottom:20}}>
          <div className="card-title">⏳ Pending Approval ({pending.length})</div>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th></th></tr></thead>
            <tbody>
              {pending.map(b=>(
                <tr key={b.id}>
                  <td><strong>{b.name}</strong></td><td>{b.company}</td>
                  <td style={{fontSize:13}}>{b.email}</td>
                  <td style={{fontSize:13,color:"#aaa"}}>{b.phone||"—"}</td>
                  <td><div className="row" style={{gap:8}}>
                    <button className="btn btn-primary btn-sm" onClick={()=>onApprove(b.id)}>Approve</button>
                    <button className="btn btn-danger  btn-sm" onClick={()=>onReject(b.id)}>Reject</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <div className="card-title">✅ Approved Brokers ({approved.length})</div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {approved.map(b=>(
              <tr key={b.id}>
                <td><strong>{b.name}</strong></td><td>{b.company}</td>
                <td style={{fontSize:13}}>{b.email}</td>
                <td>{b.mustChangePassword ? <span className="badge badge-pending">Temp password</span> : <StatusBadge s="approved" />}</td>
                <td><button className="btn btn-danger btn-sm" onClick={()=>{ if(window.confirm(`Remove access for ${b.name}? This cannot be undone.`)) onReject(b.id); }}>Remove</button></td>
              </tr>
            ))}
            {approved.length===0 && <tr><td colSpan={5}><div className="empty">No approved brokers yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Admin Staff Accounts ──────────────────────────────────────────────────────
function AdminStaff({ users, session, onAddStaff, onRemoveStaff }) {
  if (!session || session.role !== "staff") return null;
  const staffUsers = users.filter(u => u.role === "staff");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", tempPassword:"" });
  const [err,     setErr]     = useState("");
  const [done,    setDone]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submitAdd = async () => {
    if (loading) return;
    setErr(""); setLoading(true);
    const result = await onAddStaff(form);
    setLoading(false);
    if (result) { setErr(result); }
    else {
      setDone(true); setForm({ name:"", email:"", tempPassword:"" }); setErr("");
      setTimeout(() => { setDone(false); setShowForm(false); }, 2500);
    }
  };
  const doRemove = async id => {
    if (removing) return;
    setRemoving(id);
    const result = await onRemoveStaff(id, session.id);
    setRemoving(null);
    if (result) alert(result);
  };
  return (
    <>
      <div className="page-header" style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
        <div><div className="page-title">Staff Accounts</div><div className="page-sub">Add and remove staff (admin) access</div></div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(s=>!s); setErr(""); setDone(false); }}>+ Add Staff</button>
      </div>
      {showForm && (
        <div className="card" style={{marginBottom:20}}>
          <div className="card-title">Add Staff Account</div>
          {done && <div className="alert alert-success" style={{marginBottom:12}}>✅ Staff account created successfully. They will be prompted to set a new password on first sign in.</div>}
          {err  && <div className="alert alert-error"   style={{marginBottom:12}}>{err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
            <div className="field"><label>Full Name *</label><input value={form.name} onChange={set("name")} /></div>
            <div className="field"><label>Email *</label><input value={form.email} onChange={set("email")} /></div>
          </div>
          <div className="field" style={{maxWidth:300}}>
            <label>Temporary Password * <span style={{fontSize:11,color:"#aaa",fontWeight:400}}>(min 8 characters)</span></label>
            <input type="text" value={form.tempPassword} onChange={set("tempPassword")} placeholder="e.g. Fulcrum2024!" />
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button className="btn btn-primary btn-sm" onClick={submitAdd} disabled={loading}>{loading ? "Adding…" : "Add Staff"}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-title">Staff Accounts ({staffUsers.length})</div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {staffUsers.map(u => {
              const isSelf = u.id === session.id;
              return (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td style={{fontSize:13}}>{u.email}</td>
                  <td>{u.mustChangePassword ? <span className="badge badge-pending">Temp password</span> : <span className="badge badge-approved">Active</span>}</td>
                  <td>
                    {isSelf
                      ? <span style={{fontSize:12,color:"#aaa"}}>Current User</span>
                      : <button className="btn btn-danger btn-sm" onClick={() => doRemove(u.id)} disabled={removing===u.id}>{removing===u.id ? "Removing…" : "Remove"}</button>
                    }
                  </td>
                </tr>
              );
            })}
            {staffUsers.filter(u => u.id !== session.id).length === 0 && (
              <tr><td colSpan={4}><div className="empty">No other staff accounts yet.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Admin Referrals ───────────────────────────────────────────────────────────
function AdminReferrals({ requests, onUpdate }) {
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState("all");
  const [notes,    setNotes]    = useState("");
  const [done,     setDone]     = useState(false);
  const filtered = filter==="all" ? requests : requests.filter(r=>r.status===filter);
  const markComplete = async req => {
    await onUpdate(req.id, { status:"complete", completedAt:Date.now(), staffNotes:notes });
    setDone(true);
    setTimeout(()=>{ setSelected(null); setNotes(""); setDone(false); }, 2000);
  };
  return (
    <>
      <div className="page-header">
        <div className="page-title">Client Referrals</div>
        <div className="page-sub">Referrals submitted by brokers and financial planners</div>
      </div>
      <div className="card">
        <div className="row" style={{marginBottom:20,gap:8}}>
          {["all","pending","complete"].map(f=>(
            <button key={f} className={`btn ${filter===f?"btn-primary":"btn-secondary"} btn-sm`}
              onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f}</button>
          ))}
        </div>
        <table className="tbl">
          <thead><tr><th>Client</th><th>Referred By</th><th>Company</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map(r=>(
              <tr key={r.id}>
                <td><strong>{r.clientName}</strong><br/><span style={{fontSize:12,color:"#aaa"}}>{r.clientEmail}</span></td>
                <td>{r.brokerName}</td>
                <td style={{fontSize:13,color:"#888"}}>{r.brokerCompany}</td>
                <td style={{fontSize:13,color:"#888"}}>{fmt(r.createdAt)}</td>
                <td><StatusBadge s={r.status} /></td>
                <td><button className="btn btn-secondary btn-sm" onClick={()=>{ setSelected(r); setNotes(r.staffNotes||""); }}>Review</button></td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={6}><div className="empty"><div className="empty-icon">🤝</div>No referrals found</div></td></tr>}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="modal">
            <div className="modal-title">Client Referral Details</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 24px",marginBottom:20}}>
              <Detail label="Client Name"  val={selected.clientName} />
              <Detail label="Client Email" val={selected.clientEmail} />
              <Detail label="Client Mobile" val={selected.clientMobile||"—"} />
              <Detail label="Submitted"    val={fmt(selected.createdAt)} />
              <Detail label="Referring Broker"   val={selected.brokerName} />
              <Detail label="Broker Company"     val={selected.brokerCompany} />
              <Detail label="Broker Email"       val={selected.brokerEmail} />
              <Detail label="Client Situation" val={selected.situation} full />
            </div>
            <div className="divider" />
            {done
              ? <div className="alert alert-success">✅ Referral marked as complete.</div>
              : <>
                  <div className="field">
                    <label>Staff Notes <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
                    <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Internal notes about this referral…" style={{resize:"vertical"}} />
                  </div>
                  <div className="row" style={{justifyContent:"flex-end",gap:10}}>
                    <button className="btn btn-secondary" onClick={()=>setSelected(null)}>Cancel</button>
                    {selected.status==="pending" && (
                      <button className="btn btn-primary" onClick={()=>markComplete(selected)}>✅ Mark Complete</button>
                    )}
                    {selected.status==="complete" && (
                      <button className="btn btn-secondary" onClick={()=>markComplete(selected)}>Update Notes</button>
                    )}
                  </div>
                </>
            }
          </div>
        </div>
      )}
    </>
  );
}

// ── Broker Dashboard ──────────────────────────────────────────────────────────
function BrokerDashboard({ session, requests, setPage }) {
  const complete     = requests.filter(r=>r.status==="complete");
  const rentReqs     = requests.filter(r=>r.type==="rent");
  const cmaReqs      = requests.filter(r=>r.type==="cma");
  const referralReqs = requests.filter(r=>r.type==="referral");
  const recent       = requests.slice(0,4);
  return (
    <>
      <div className="page-header">
        <div className="page-title">Welcome, {session.name.split(" ")[0]}</div>
        <div className="page-sub">{session.company} · Property Services Portal</div>
      </div>
      <div className="stats" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        <div className="stat"><div className="stat-num">{requests.length}</div><div className="stat-label">Total</div></div>
        <div className="stat"><div className="stat-num gold">{rentReqs.length}</div><div className="stat-label">Rent Letters</div></div>
        <div className="stat"><div className="stat-num teal">{cmaReqs.length}</div><div className="stat-label">CMAs</div></div>
        <div className="stat"><div className="stat-num green">{complete.length}</div><div className="stat-label">Completed</div></div>
        <div className="stat"><div className="stat-num" style={{color:"#7a4a00"}}>{referralReqs.length}</div><div className="stat-label">Referrals</div></div>
      </div>
      <div className="row" style={{marginBottom:20,gap:12}}>
        <button className="btn btn-primary" onClick={()=>setPage("new")}>✏️ New Request</button>
        <button className="btn btn-secondary" onClick={()=>setPage("requests")}>View All Requests</button>
      </div>
      {recent.length>0 ? (
        <div className="card">
          <div className="card-title">Recent Requests</div>
          <table className="tbl">
            <thead><tr><th>Type</th><th>Property</th><th>Date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {recent.map(r=>(
                <tr key={r.id}>
                  <td><TypeBadge t={r.type} /></td>
                  <td style={{fontSize:13}}>{r.address}</td>
                  <td style={{fontSize:13,color:"#888"}}>{fmt(r.createdAt)}</td>
                  <td><StatusBadge s={r.status} /></td>
                  <td>{r.status==="complete"&&r.downloadUrl&&<a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{textDecoration:"none"}}>⬇️</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:48,marginBottom:16}}>📄</div>
          <p style={{color:"#aaa",marginBottom:20}}>No requests yet. Submit your first request to get started.</p>
          <button className="btn btn-primary" onClick={()=>setPage("new")}>✏️ New Request</button>
        </div>
      )}
    </>
  );
}

// ── New Request ───────────────────────────────────────────────────────────────
function NewRequest({ onSubmit, onDone }) {
  const [type,     setType]     = useState(null);
  const [done,     setDone]     = useState(false);
  const [lastType, setLastType] = useState(null);
  const handleSubmit = async data => { setLastType(type); await onSubmit({ ...data, type }); setDone(true); };

  if (done) return (
    <div style={{maxWidth:560}}>
      <div className="page-header"><div className="page-title">Request Submitted</div></div>
      <div className="card" style={{textAlign:"center",padding:"48px 32px"}}>
        <div style={{fontSize:56,marginBottom:16}}>✅</div>
        <h2 style={{fontFamily:"'Inter',sans-serif",fontSize:20,fontWeight:700,color:"var(--primary)",marginBottom:12}}>Request Received</h2>
        <p style={{color:"#888",lineHeight:1.7,marginBottom:24}}>
          {lastType==="referral"
            ? "Your client referral has been received. The Fulcrum Australia team will be in touch with your client shortly."
            : <>Your {lastType==="rent"?"rent letter":lastType==="cma"?"comparative market analysis":"Price Discovery Report"} request has been received.<br/>You'll be notified as soon as your document is ready to download.</>
          }
        </p>
        <div className="row" style={{justifyContent:"center",gap:12}}>
          <button className="btn btn-primary" onClick={onDone}>View My Requests</button>
          <button className="btn btn-secondary" onClick={()=>{ setType(null); setDone(false); }}>Submit Another</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:580}}>
      <div className="page-header"><div className="page-title">New Request</div><div className="page-sub">Select the type of report you need</div></div>
      {!type && (
        <div className="card">
          <div className="card-title">What would you like to request?</div>
          <div className="type-toggle">
            <div className={`type-card${type==="rent"?" sel-rent":""}`} onClick={()=>setType("rent")}>
              <div className="type-card-icon">📄</div>
              <div className="type-card-title">Rent Letter</div>
              <div className="type-card-desc">Rental yield confirmation for a property — used to support mortgage applications.</div>
            </div>
            <div className={`type-card${type==="cma"?" sel-cma":""}`} onClick={()=>setType("cma")}>
              <div className="type-card-icon">🏡</div>
              <div className="type-card-title">Market Analysis</div>
              <div className="type-card-desc">Comparative market analysis showing estimated current property value.</div>
            </div>
            <div className={`type-card${type==="pdr"?" sel-purple":""}`} onClick={()=>setType("pdr")}>
              <div className="type-card-icon">🔍</div>
              <div className="type-card-title">Price Discovery Report</div>
              <div className="type-card-desc">Send a detailed questionnaire to your client to understand their purchasing parameters — budget, property type, location and investment goals. You'll receive a report confirming what's achievable.</div>
            </div>
            <div className={`type-card${type==="referral"?" sel-gold":""}`} onClick={()=>setType("referral")} style={{borderColor:type==="referral"?"#7a4a00":"",background:type==="referral"?"#fef3e2":""}}>
              <div className="type-card-icon">🤝</div>
              <div className="type-card-title">Client Referral</div>
              <div className="type-card-desc">Refer a client to Fulcrum Australia for professional property buying services. Our buyers agency team will follow up directly with your client.</div>
            </div>
          </div>
        </div>
      )}
      {type==="rent"     && <RentForm     onSubmit={handleSubmit} onBack={()=>setType(null)} />}
      {type==="cma"      && <CMAForm      onSubmit={handleSubmit} onBack={()=>setType(null)} />}
      {type==="pdr"      && <PDRBrokerForm onSubmit={handleSubmit} onBack={()=>setType(null)} session={null} />}
      {type==="referral" && <ReferralForm  onSubmit={handleSubmit} onBack={()=>setType(null)} />}
    </div>
  );
}

function RentForm({ onSubmit, onBack }) {
  const [form, setForm] = useState({ address:"", weeklyRent:"", notes:"" });
  const [err,  setErr]  = useState("");
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const submit = async () => {
    if (!form.address.trim()) return setErr("Property address is required.");
    if (!form.weeklyRent||isNaN(form.weeklyRent)||Number(form.weeklyRent)<=0) return setErr("Please enter a valid weekly rent amount.");
    setLoading(true); await onSubmit(form); setLoading(false);
  };
  return (
    <div className="card" style={{marginTop:16}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>📄 Rent Letter Request</div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Change type</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="field">
        <label>Property Address *</label>
        <AddressAutocomplete value={form.address} onChange={val=>setForm(f=>({...f,address:val}))} />
        <div className="hint">Start typing — select from dropdown for a verified Australian address</div>
      </div>
      <div className="field">
        <label>Expected Weekly Rental Yield *</label>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span>
          <input value={form.weeklyRent} onChange={set("weeklyRent")} placeholder="650" style={{paddingLeft:28}} type="number" min="0" />
        </div>
        <div className="hint">Expected weekly rental amount in AUD</div>
      </div>
      <div className="field">
        <label>Additional Notes <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
        <textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Any specific requirements or context…" style={{resize:"vertical"}} />
      </div>
      <div className="divider" />
      <div className="row" style={{justifyContent:"flex-end"}}>
        <button className="btn btn-primary" onClick={submit} disabled={loading}>{loading?"Submitting…":"Submit Request →"}</button>
      </div>
    </div>
  );
}

function CMAForm({ onSubmit, onBack }) {
  const [form, setForm] = useState({ address:"", expectedValue:"", notes:"" });
  const [err,  setErr]  = useState("");
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const submit = async () => {
    if (!form.address.trim()) return setErr("Property address is required.");
    setLoading(true); await onSubmit(form); setLoading(false);
  };
  return (
    <div className="card" style={{marginTop:16}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>🏡 Market Analysis Request</div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Change type</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="field">
        <label>Property Address *</label>
        <AddressAutocomplete value={form.address} onChange={val=>setForm(f=>({...f,address:val}))} />
        <div className="hint">Start typing — select from dropdown for a verified Australian address</div>
      </div>
      <div className="field">
        <label>Expected Sale Price <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span>
          <input value={form.expectedValue} onChange={set("expectedValue")} placeholder="750000" style={{paddingLeft:28}} type="number" min="0" />
        </div>
        <div className="hint">Your estimated property value — helps us calibrate the analysis</div>
      </div>
      <div className="field">
        <label>Additional Notes <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
        <textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Any relevant context about the property…" style={{resize:"vertical"}} />
      </div>
      <div className="divider" />
      <div className="row" style={{justifyContent:"flex-end"}}>
        <button className="btn btn-teal" onClick={submit} disabled={loading}>{loading?"Submitting…":"Submit Request →"}</button>
      </div>
    </div>
  );
}

function ReferralForm({ onSubmit, onBack }) {
  const [form, setForm] = useState({ clientName:"", clientEmail:"", clientMobile:"", situation:"" });
  const [err,  setErr]  = useState("");
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const submit = async () => {
    if (!form.clientName.trim())  return setErr("Client name is required.");
    if (!form.clientEmail.trim()) return setErr("Client email is required.");
    if (!/\S+@\S+\.\S+/.test(form.clientEmail)) return setErr("Please enter a valid email address.");
    if (!form.situation.trim())   return setErr("Please provide a brief description of the client and their situation.");
    setLoading(true); await onSubmit(form); setLoading(false);
  };
  return (
    <div className="card" style={{marginTop:16}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>🤝 Client Referral</div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Change type</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="field">
        <label>Client Name *</label>
        <input value={form.clientName} onChange={set("clientName")} placeholder="Jane Smith" />
      </div>
      <div className="field">
        <label>Client Email *</label>
        <input value={form.clientEmail} onChange={set("clientEmail")} placeholder="jane@example.com" type="email" />
      </div>
      <div className="field">
        <label>Client Mobile <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
        <input value={form.clientMobile} onChange={set("clientMobile")} placeholder="04XX XXX XXX" type="tel" />
      </div>
      <div className="field">
        <label>Client Situation *</label>
        <textarea value={form.situation} onChange={set("situation")} rows={5} placeholder="Describe the client and their situation — their property goals, budget, timeline, and any relevant context that will help our team assist them…" style={{resize:"vertical"}} />
      </div>
      <div className="divider" />
      <div className="row" style={{justifyContent:"flex-end"}}>
        <button className="btn btn-primary" onClick={submit} disabled={loading} style={{background:"#7a4a00",borderColor:"#7a4a00"}}>{loading?"Submitting…":"Submit Referral →"}</button>
      </div>
    </div>
  );
}

// ── Broker Requests (combined) ────────────────────────────────────────────────
function BrokerRequests({ requests }) {
  const [filter,     setFilter]     = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  let filtered = requests;
  if (filter     !=="all") filtered = filtered.filter(r=>r.status===filter);
  if (typeFilter !=="all") filtered = filtered.filter(r=>r.type===typeFilter);
  return (
    <>
      <div className="page-header"><div className="page-title">My Requests</div><div className="page-sub">All your rent letter and CMA requests in one place</div></div>
      <div className="card">
        <div className="row" style={{marginBottom:16,gap:10,flexWrap:"wrap"}}>
          <div className="row" style={{gap:6}}>
            {["all","pending","complete"].map(f=>(
              <button key={f} className={`btn ${filter===f?"btn-primary":"btn-secondary"} btn-sm`} onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f}</button>
            ))}
          </div>
          <div style={{width:1,height:24,background:"var(--border)"}} />
          <div className="row" style={{gap:6}}>
            {[["all","All Types"],["rent","📄 Rent"],["cma","🏡 CMA"],["referral","🤝 Referral"]].map(([v,l])=>(
              <button key={v} className="btn btn-secondary btn-sm" onClick={()=>setTypeFilter(v)}
                style={{borderColor:typeFilter===v?"var(--primary)":"var(--border-strong)",fontWeight:typeFilter===v?700:400}}>{l}</button>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead><tr><th>Type</th><th>Property</th><th>Details</th><th>Submitted</th><th>Status</th><th>Document</th></tr></thead>
          <tbody>
            {filtered.map(r=>(
              <tr key={r.id}>
                <td><TypeBadge t={r.type} /></td>
                <td style={{fontSize:13,maxWidth:200}}>{r.address}</td>
                <td><span className="tag">{r.type==="rent"?`$${r.weeklyRent}/wk`:r.type==="pdr"?r.clientName||"Client":r.type==="referral"?r.clientName||"Client":fmtMoney(r.expectedValue)}</span></td>
                <td style={{fontSize:13,color:"#888"}}>{fmt(r.createdAt)}</td>
                <td><StatusBadge s={r.status} /></td>
                <td>{r.status==="complete"&&r.downloadUrl
                  ? <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{textDecoration:"none"}}>⬇️</a>
                  : <span style={{fontSize:12,color:"#bbb"}}>Pending</span>}
                </td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={6}><div className="empty"><div className="empty-icon">📭</div>No requests found</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusBadge({ s }) {
  const map = { pending:["badge-pending","Pending"], complete:["badge-complete","Complete"], approved:["badge-approved","Approved"] };
  const [cls, label] = map[s] || ["badge-pending", s];
  return <span className={`badge ${cls}`}>{label}</span>;
}
function TypeBadge({ t }) {
  if (t==="cma")      return <span className="badge badge-cma">🏡 CMA</span>;
  if (t==="pdr")      return <span className="badge badge-pdr">🔍 PDR</span>;
  if (t==="referral") return <span className="badge badge-referral">🤝 Referral</span>;
  return <span className="badge badge-rent">📄 Rent</span>;
}
function Detail({ label, val, full }) {
  return (
    <div style={full?{gridColumn:"1/-1"}:{}}>
      <div style={{fontSize:11,letterSpacing:"1px",textTransform:"uppercase",color:"#aaa",marginBottom:3}}>{label}</div>
      <div style={{fontSize:14,fontWeight:500}}>{val}</div>
    </div>
  );
}

// ── Price Discovery Report — Public Client Form ───────────────────────────────
// Accessible at ?pdr=<brokerId> — no login required for clients
export function PDRPublicForm() {
  // Parse broker id from URL
  const brokerId = new URLSearchParams(window.location.search).get("pdr") || "";
  const [step, setStep]   = useState(0);
  const [done, setDone]   = useState(false);
  const [form, setForm]   = useState({
    clientName:"", clientEmail:"", clientMobile:"",
    budgetMin:"", budgetMax:"",
    propertyTypes:[], bedrooms:"", bathrooms:"",
    locations:"", purpose:"owner", rentalYield:"", notes:""
  });
  const [err, setErr] = useState("");

  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const togglePT = pt => setForm(f=>({
    ...f, propertyTypes: f.propertyTypes.includes(pt)
      ? f.propertyTypes.filter(x=>x!==pt)
      : [...f.propertyTypes, pt]
  }));

  const steps = ["Your Details","Budget","Property","Location","Submit"];

  const validate = () => {
    if (step===0 && (!form.clientName||!form.clientEmail||!form.clientMobile)) return "Please fill in your name, email and mobile.";
    if (step===1 && !form.budgetMax) return "Please enter at least a maximum budget.";
    if (step===2 && form.propertyTypes.length===0) return "Please select at least one property type.";
    if (step===3 && !form.locations.trim()) return "Please enter at least one preferred suburb.";
    return "";
  };

  const next = () => { const e=validate(); if(e){setErr(e);return;} setErr(""); setStep(s=>s+1); };
  const back = () => { setErr(""); setStep(s=>s-1); };

  const submit = async () => {
    const e = validate(); if(e){setErr(e);return;}
    try {
      const all = await store.get("fa:requests") || [];
      const req = {
        ...form, type:"pdr", id:uid(), brokerId, brokerName:"", brokerEmail:"", brokerCompany:"",
        status:"pending", createdAt:Date.now(), completedAt:null, downloadUrl:null
      };
      await store.set("fa:requests", [req, ...all]);
      sendEmail(EMAILJS_TEMPLATE_STAFF, {
        email: "brian@fulcrumaustralia.com.au",
        subject: `New PDR Submission — ${form.clientName}`,
        message: `A new Price Discovery Report request has been submitted.\n\nClient: ${form.clientName}\nEmail: ${form.clientEmail}\nMobile: ${form.clientMobile}\nBudget: ${form.budgetMin ? `$${Number(form.budgetMin).toLocaleString()} – ` : ""}$${Number(form.budgetMax).toLocaleString()}\nLocations: ${form.locations}\nSubmitted: ${new Date().toLocaleString("en-AU")}\n\nLog in to the portal to review and complete this request.`
      });
      sendWhatsApp(`New PDR Submission\nClient: ${form.clientName}\nEmail: ${form.clientEmail}\nMobile: ${form.clientMobile || "—"}`);
      setDone(true);
    } catch { setErr("Something went wrong. Please try again."); }
  };

  if (done) return (
    <div className="pdr-shell">
      <div className="pdr-card">
        <div className="pdr-brand"><img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:160,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        <div className="card" style={{textAlign:"center",padding:"40px 24px"}}>
          <div style={{fontSize:48,marginBottom:16}}>✅</div>
          <h2 style={{fontFamily:"'Inter',sans-serif",fontSize:20,fontWeight:700,color:"var(--primary)",marginBottom:12}}>Thank You, {form.clientName.split(" ")[0]}!</h2>
          <p style={{color:"#888",lineHeight:1.7}}>Your property parameters have been submitted. Our team will cross-reference current market data and prepare your Price Discovery Report. You'll receive it via email shortly.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="pdr-shell">
      <style>{CSS}</style>
      <div className="pdr-card">
        <div className="pdr-brand">
          <img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:160,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" />
          <div className="pdr-sub">Price Discovery Report</div>
        </div>
        <div className="step-bar">
          {steps.flatMap((s,i)=>[
            i>0 && <div key={`l${i}`} className={`step-line${i<=step?" done":""}`} />,
            <div key={`d${i}`} className={`step-dot ${i<step?"done":i===step?"active":"waiting"}`}>
              {i<step?"✓":i+1}
            </div>
          ])}
        </div>
        <div className="card">
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)",marginBottom:16}}>{steps[step]}</div>
          {err && <div className="alert alert-error">{err}</div>}

          {step===0 && (
            <>
              <div className="field"><label>Full Name *</label><input value={form.clientName} onChange={set("clientName")} placeholder="Jane Smith" /></div>
              <div className="field"><label>Email Address *</label><input value={form.clientEmail} onChange={set("clientEmail")} placeholder="jane@example.com" type="email" /></div>
              <div className="field"><label>Mobile Number *</label><input value={form.clientMobile} onChange={set("clientMobile")} placeholder="04xx xxx xxx" type="tel" /></div>
            </>
          )}

          {step===1 && (
            <>
              <p style={{fontSize:13,color:"#888",marginBottom:16}}>What is your purchasing budget?</p>
              <div className="range-row">
                <div className="field">
                  <label>Minimum Budget</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span>
                    <input value={form.budgetMin} onChange={set("budgetMin")} placeholder="400,000" style={{paddingLeft:28}} type="number" min="0" />
                  </div>
                </div>
                <div className="field">
                  <label>Maximum Budget *</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span>
                    <input value={form.budgetMax} onChange={set("budgetMax")} placeholder="650,000" style={{paddingLeft:28}} type="number" min="0" />
                  </div>
                </div>
              </div>
              <div className="field" style={{marginTop:8}}>
                <label>Purchasing Purpose *</label>
                <div className="pill-group">
                  {[["owner","🏠 Owner-Occupier"],["investor","📈 Investor"]].map(([v,l])=>(
                    <div key={v} className={`pill${form.purpose===v?" sel-gold":""}`} onClick={()=>setForm(f=>({...f,purpose:v}))}>{l}</div>
                  ))}
                </div>
              </div>
              {form.purpose==="investor" && (
                <div className="field">
                  <label>Target Rental Yield</label>
                  <div style={{position:"relative"}}>
                    <input value={form.rentalYield} onChange={set("rentalYield")} placeholder="5.5" type="number" min="0" max="20" step="0.1" style={{paddingRight:32}} />
                    <span style={{position:"absolute",right:14,top:11,color:"#aaa",fontWeight:600}}>%</span>
                  </div>
                  <div className="hint">Expected gross rental yield per annum</div>
                </div>
              )}
            </>
          )}

          {step===2 && (
            <>
              <div className="field">
                <label>Property Type * <span style={{fontWeight:400,color:"#bbb"}}>(select all that apply)</span></label>
                <div className="pill-group">
                  {["House","Townhouse","Unit / Apartment","Villa","Land"].map(pt=>(
                    <div key={pt} className={`pill${form.propertyTypes.includes(pt)?" sel-purple":""}`} onClick={()=>togglePT(pt)}>{pt}</div>
                  ))}
                </div>
              </div>
              <div className="range-row">
                <div className="field">
                  <label>Bedrooms</label>
                  <div className="pill-group">
                    {["1","2","3","4","5+"].map(n=>(
                      <div key={n} className={`pill${form.bedrooms===n?" sel-gold":""}`} onClick={()=>setForm(f=>({...f,bedrooms:n}))}>{n}</div>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Bathrooms</label>
                  <div className="pill-group">
                    {["1","2","3","4+"].map(n=>(
                      <div key={n} className={`pill${form.bathrooms===n?" sel-gold":""}`} onClick={()=>setForm(f=>({...f,bathrooms:n}))}>{n}</div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {step===3 && (
            <>
              <div className="field">
                <label>Preferred Suburbs / Locations *</label>
                <textarea value={form.locations} onChange={set("locations")} rows={3} placeholder="e.g. Applecross, Mount Pleasant, Cottesloe, South Perth…" style={{resize:"vertical"}} />
                <div className="hint">List any suburbs or areas you're considering — as many as you like</div>
              </div>
              <div className="field">
                <label>Additional Notes <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
                <textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Any other requirements, deal-breakers, or context that would help us…" style={{resize:"vertical"}} />
              </div>
            </>
          )}

          {step===4 && (
            <div>
              <p style={{fontSize:14,color:"#888",lineHeight:1.7,marginBottom:20}}>Please review your details before submitting. Our team will prepare your Price Discovery Report and send it to <strong>{form.clientEmail}</strong>.</p>
              <div style={{display:"grid",gap:"10px 24px",gridTemplateColumns:"1fr 1fr",background:"var(--grey-100)",borderRadius:"var(--r)",padding:"14px 18px",border:"1px solid var(--border)"}}>
                {[
                  ["Name",     form.clientName],
                  ["Mobile",   form.clientMobile],
                  ["Budget",   `${form.budgetMin?fmtMoney(form.budgetMin):"Any"} – ${fmtMoney(form.budgetMax)}`],
                  ["Purpose",  form.purpose==="investor"?"Investor":"Owner-Occupier"],
                  ["Types",    form.propertyTypes.join(", ")||"—"],
                  ["Bedrooms", form.bedrooms||"Any"],
                  ["Bathrooms",form.bathrooms||"Any"],
                  ["Suburbs",  form.locations||"—"],
                  ...(form.purpose==="investor"&&form.rentalYield?[["Yield Target",`${form.rentalYield}%`]]:[]),
                ].map(([l,v])=>(
                  <div key={l}><div style={{fontSize:10,letterSpacing:"1px",textTransform:"uppercase",color:"#aaa",marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:500}}>{v}</div></div>
                ))}
              </div>
            </div>
          )}

          <div className="divider" />
          <div className="row" style={{justifyContent:"space-between"}}>
            {step>0 ? <button className="btn btn-secondary" onClick={back}>← Back</button> : <span/>}
            {step<4
              ? <button className="btn btn-purple" onClick={next}>Next →</button>
              : <button className="btn btn-purple" onClick={submit}>Submit Report Request →</button>
            }
          </div>
        </div>
        <p style={{textAlign:"center",fontSize:12,color:"#ccc",marginTop:20}}>Powered by Fulcrum Australia · Perth Rental Management</p>
      </div>
    </div>
  );
}

// ── Price Discovery — Broker Submission Form (inside portal) ──────────────────
function PDRBrokerForm({ onSubmit, onBack }) {
  const [form, setForm] = useState({
    clientName:"", clientEmail:"", clientMobile:"",
    budgetMin:"", budgetMax:"",
    propertyTypes:[], bedrooms:"", bathrooms:"",
    locations:"", purpose:"owner", rentalYield:"", notes:""
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const togglePT = pt => setForm(f=>({
    ...f, propertyTypes: f.propertyTypes.includes(pt)
      ? f.propertyTypes.filter(x=>x!==pt)
      : [...f.propertyTypes, pt]
  }));

  const submit = async () => {
    if (!form.clientName||!form.clientEmail) return setErr("Client name and email are required.");
    if (!form.budgetMax) return setErr("Maximum budget is required.");
    if (form.propertyTypes.length===0) return setErr("Please select at least one property type.");
    if (!form.locations.trim()) return setErr("Please enter at least one preferred suburb.");
    setLoading(true); await onSubmit(form); setLoading(false);
  };

  return (
    <div className="card" style={{marginTop:16,maxWidth:640}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>🔍 Price Discovery Report</div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Change type</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}

      <div style={{fontWeight:600,fontSize:13,color:"var(--primary)",marginBottom:10,letterSpacing:.2}}>Client Details</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <div className="field"><label>Client Name *</label><input value={form.clientName} onChange={set("clientName")} placeholder="Jane Smith" /></div>
        <div className="field"><label>Mobile *</label><input value={form.clientMobile} onChange={set("clientMobile")} placeholder="04xx xxx xxx" /></div>
      </div>
      <div className="field"><label>Client Email *</label><input value={form.clientEmail} onChange={set("clientEmail")} placeholder="jane@example.com" type="email" /></div>

      <div className="divider" />
      <div style={{fontWeight:600,fontSize:13,color:"var(--primary)",marginBottom:10,letterSpacing:.2}}>Budget & Purpose</div>
      <div className="range-row">
        <div className="field">
          <label>Min Budget</label>
          <div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span><input value={form.budgetMin} onChange={set("budgetMin")} placeholder="400,000" style={{paddingLeft:28}} type="number" min="0" /></div>
        </div>
        <div className="field">
          <label>Max Budget *</label>
          <div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span><input value={form.budgetMax} onChange={set("budgetMax")} placeholder="650,000" style={{paddingLeft:28}} type="number" min="0" /></div>
        </div>
      </div>
      <div className="field">
        <label>Purchasing Purpose</label>
        <div className="pill-group">
          {[["owner","🏠 Owner-Occupier"],["investor","📈 Investor"]].map(([v,l])=>(
            <div key={v} className={`pill${form.purpose===v?" sel-gold":""}`} onClick={()=>setForm(f=>({...f,purpose:v}))}>{l}</div>
          ))}
        </div>
      </div>
      {form.purpose==="investor" && (
        <div className="field">
          <label>Target Rental Yield</label>
          <div style={{position:"relative"}}>
            <input value={form.rentalYield} onChange={set("rentalYield")} placeholder="5.5" type="number" min="0" max="20" step="0.1" style={{paddingRight:32}} />
            <span style={{position:"absolute",right:14,top:11,color:"#aaa",fontWeight:600}}>%</span>
          </div>
        </div>
      )}

      <div className="divider" />
      <div style={{fontWeight:600,fontSize:13,color:"var(--primary)",marginBottom:10,letterSpacing:.2}}>Property Requirements</div>
      <div className="field">
        <label>Property Type * <span style={{fontWeight:400,color:"#bbb"}}>(select all that apply)</span></label>
        <div className="pill-group">
          {["House","Townhouse","Unit / Apartment","Villa","Land"].map(pt=>(
            <div key={pt} className={`pill${form.propertyTypes.includes(pt)?" sel-purple":""}`} onClick={()=>togglePT(pt)}>{pt}</div>
          ))}
        </div>
      </div>
      <div className="range-row">
        <div className="field">
          <label>Bedrooms</label>
          <div className="pill-group">
            {["1","2","3","4","5+"].map(n=>(
              <div key={n} className={`pill${form.bedrooms===n?" sel-gold":""}`} onClick={()=>setForm(f=>({...f,bedrooms:n}))}>{n}</div>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Bathrooms</label>
          <div className="pill-group">
            {["1","2","3","4+"].map(n=>(
              <div key={n} className={`pill${form.bathrooms===n?" sel-gold":""}`} onClick={()=>setForm(f=>({...f,bathrooms:n}))}>{n}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="divider" />
      <div style={{fontWeight:600,fontSize:13,color:"var(--primary)",marginBottom:10,letterSpacing:.2}}>Location & Notes</div>
      <div className="field">
        <label>Preferred Suburbs *</label>
        <textarea value={form.locations} onChange={set("locations")} rows={2} placeholder="e.g. Applecross, Mount Pleasant, Cottesloe…" style={{resize:"vertical"}} />
      </div>
      <div className="field">
        <label>Additional Notes <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
        <textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Any other requirements or context…" style={{resize:"vertical"}} />
      </div>

      <div className="divider" />
      <div className="row" style={{justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:12,color:"#aaa"}}>Or <span className="text-link" onClick={()=>{ const link=window.location.origin+window.location.pathname+"?pdr=broker"; navigator.clipboard?.writeText(link); alert("Client link copied!\n\n"+link); }}>copy client link ↗</span></div>
        <button className="btn btn-purple" onClick={submit} disabled={loading}>{loading?"Submitting…":"Submit Report →"}</button>
      </div>
    </div>
  );
}

// ── Admin PDR Requests ────────────────────────────────────────────────────────
function AdminPDRRequests({ requests, onUpdate }) {
  const [selected,  setSelected]  = useState(null);
  const [filter,    setFilter]    = useState("all");
  const [uploadUrl, setUploadUrl] = useState("");
  const [notifSent, setNotifSent] = useState(false);
  const filtered = filter==="all" ? requests : requests.filter(r=>r.status===filter);

  const markComplete = async req => {
    if (!uploadUrl.trim()) return alert("Please enter a download URL for the completed report.");
    await onUpdate(req.id, { status:"complete", completedAt:Date.now(), downloadUrl:uploadUrl.trim() });
    sendEmail(EMAILJS_TEMPLATE_USER, {
      to_email: req.clientEmail,
      subject: `Your Price Discovery Report is Ready — ${req.address || "Property"}`,
      message: `Hi ${req.clientName},\n\nYour Price Discovery Report has been completed by the Fulcrum Australia team.\n\nProperty: ${req.address || "—"}\nCompleted: ${new Date().toLocaleString("en-AU")}\n\nAccess your report here:\n${uploadUrl.trim()}\n\nRegards,\nFulcrum Australia`
    });
    setNotifSent(true);
    setTimeout(()=>{ setSelected(null); setUploadUrl(""); setNotifSent(false); }, 2000);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Price Discovery Reports</div>
        <div className="page-sub">Review client purchasing parameters and upload completed reports</div>
      </div>
      <div className="card">
        <div className="row" style={{marginBottom:20,gap:8}}>
          {["all","pending","complete"].map(f=>(
            <button key={f} className={`btn ${filter===f?"btn-purple":"btn-secondary"} btn-sm`} onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f}</button>
          ))}
        </div>
        <table className="tbl">
          <thead><tr><th>Client</th><th>Broker</th><th>Budget</th><th>Purpose</th><th>Types</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map(r=>(
              <tr key={r.id}>
                <td><strong>{r.clientName}</strong><br/><span style={{fontSize:12,color:"#aaa"}}>{r.clientEmail}</span></td>
                <td style={{fontSize:13,color:"#888"}}>{r.brokerName||<span style={{color:"#ccc"}}>Direct</span>}</td>
                <td><span className="tag">{r.budgetMin?fmtMoney(r.budgetMin)+" – ":""}{fmtMoney(r.budgetMax)}</span></td>
                <td><span className={`badge ${r.purpose==="investor"?"badge-cma":"badge-approved"}`}>{r.purpose==="investor"?"📈 Investor":"🏠 Owner"}</span></td>
                <td style={{fontSize:12,color:"#888",maxWidth:140}}>{(r.propertyTypes||[]).join(", ")||"—"}</td>
                <td style={{fontSize:13,color:"#888"}}>{fmt(r.createdAt)}</td>
                <td><StatusBadge s={r.status} /></td>
                <td><button className="btn btn-secondary btn-sm" onClick={()=>{ setSelected(r); setUploadUrl(r.downloadUrl||""); }}>Review</button></td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={8}><div className="empty"><div className="empty-icon">🔍</div>No PDR requests yet</div></td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="modal" style={{maxWidth:600}}>
            <div className="modal-title">Price Discovery — {selected.clientName}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 24px",marginBottom:20}}>
              <Detail label="Client Name"  val={selected.clientName} />
              <Detail label="Mobile"       val={selected.clientMobile||"—"} />
              <Detail label="Email"        val={selected.clientEmail} />
              <Detail label="Submitted"    val={fmt(selected.createdAt)} />
              <Detail label="Purpose"      val={selected.purpose==="investor"?"📈 Investor":"🏠 Owner-Occupier"} />
              <Detail label="Budget"       val={`${selected.budgetMin?fmtMoney(selected.budgetMin)+" – ":""}${fmtMoney(selected.budgetMax)}`} />
              {selected.purpose==="investor"&&selected.rentalYield && <Detail label="Yield Target" val={`${selected.rentalYield}% p.a.`} />}
              <Detail label="Property Types" val={(selected.propertyTypes||[]).join(", ")||"—"} />
              <Detail label="Bedrooms"     val={selected.bedrooms||"Any"} />
              <Detail label="Bathrooms"    val={selected.bathrooms||"Any"} />
              <Detail label="Preferred Suburbs" val={selected.locations||"—"} full />
              {selected.notes && <Detail label="Notes" val={selected.notes} full />}
            </div>
            <div className="divider" />
            {notifSent
              ? <div className="alert alert-success">✅ Report uploaded! Client has been notified.</div>
              : <>
                  <div className="field">
                    <label>Upload Completed Report URL</label>
                    <input value={uploadUrl} onChange={e=>setUploadUrl(e.target.value)} placeholder="https://drive.google.com/... or similar" />
                    <div className="hint">Paste a shareable link to the completed PDF report</div>
                  </div>
                  <div className="row" style={{justifyContent:"flex-end",gap:10}}>
                    <button className="btn btn-secondary" onClick={()=>setSelected(null)}>Cancel</button>
                    {selected.status==="pending" && <button className="btn btn-purple" onClick={()=>markComplete(selected)}>✅ Upload & Notify Client</button>}
                    {selected.status==="complete" && <button className="btn btn-secondary" onClick={()=>markComplete(selected)}>Update Report URL</button>}
                  </div>
                </>
            }
          </div>
        </div>
      )}
    </>
  );
}
