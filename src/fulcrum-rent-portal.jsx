import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";
import emailjs from "@emailjs/browser";
import { createClient } from "@supabase/supabase-js";
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams, useParams, Outlet } from "react-router-dom";
import buildPdrReportData from './utils/buildPdrReportData';
import PdrReportPreview   from './components/PdrReportPreview';
import parseSalesCsv      from './utils/parseSalesCsv';
import * as XLSX           from 'xlsx';
import renderPdrReportHtml from './utils/renderPdrReportHtml';
import BrokerRequestForm     from './features/cashflow/components/BrokerRequestForm.jsx';
import StaffCompletionForm  from './features/cashflow/components/StaffCompletionForm.jsx';
import CashflowDashboard    from './features/cashflow/components/CashflowDashboard.jsx';
import CashflowReportPage   from './features/cashflow/components/CashflowReport.jsx';
import OnboardingForm       from './features/onboarding/components/OnboardingForm.jsx';
import ClientsSection       from './features/onboarding/components/ClientsSection.jsx';
import ClientDetail         from './features/onboarding/components/ClientDetail.jsx';

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

// ── Request service layer ─────────────────────────────────────────────────────
function normaliseRequest(row) {
  // Supabase returns UNIQUE-FK relations as a single object, not an array.
  // Guard against both shapes so loadRequests works regardless of PostgREST version.
  const unwrap = v => (Array.isArray(v) ? v[0] : v) ?? {};
  const rent     = unwrap(row.request_rent_details);
  const cma      = unwrap(row.request_cma_details);
  const referral = unwrap(row.request_referral_details);
  const pdr      = unwrap(row.request_pdr_details);
  return {
    id:            row.id,
    type:          row.request_type,
    request_type:  row.request_type,
    status:        row.status,
    source:        row.source,
    brokerId:      row.broker_id,
    brokerName:    row.broker_name,
    brokerEmail:   row.broker_email,
    brokerCompany: row.broker_company,
    clientName:    row.client_name,
    clientEmail:   row.client_email,
    clientMobile:  row.client_mobile,
    internalNotes: row.internal_notes,
    downloadUrl:   row.download_url,
    createdAt:     row.created_at    ? new Date(row.created_at).getTime()    : null,
    completedAt:   row.completed_at  ? new Date(row.completed_at).getTime()  : null,
    // Rent detail
    address:       rent.address      ?? cma.address,
    weeklyRent:    rent.weekly_rent,
    // CMA detail
    expectedValue: cma.expected_value,
    // Referral detail
    situation:     referral.situation,
    staffNotes:    referral.staff_notes,
    // PDR intake
    budgetMin:     pdr.budget_min,
    budgetMax:     pdr.budget_max,
    propertyTypes: pdr.property_types ?? [],
    bedrooms:      pdr.bedrooms,
    bathrooms:     pdr.bathrooms,
    locations:     pdr.locations,
    purpose:       pdr.purpose,
    rentalYield:   pdr.rental_yield,
    notes:         pdr.notes ?? rent.notes ?? cma.notes,
    // PDR fulfilment
    heroStatement:    pdr.hero_statement,
    viabilitySummary: pdr.viability_summary,
    supportingNotes:  pdr.supporting_notes,
    salesCsvFilePath: pdr.sales_csv_file_path,
    reportPdfPath:    pdr.report_pdf_path,
    reportHtmlPath:   pdr.report_html_path,
    // Strategies (sorted by sort_order)
    strategies: (row.pdr_strategies ?? []).sort((a, b) => a.sort_order - b.sort_order),
  };
}

function normaliseCashflowRequest(row) {
  return {
    id:            row.id,
    type:          'cashflow',
    request_type:  'cashflow',
    status:        row.status,
    address:       row.property_address,
    downloadUrl:   (row.is_public && !row.revoked_at) ? `/report?id=${row.id}` : null,
    createdAt:     row.created_at ? new Date(row.created_at).getTime() : null,
    completedAt:   null,
    entityType:    row.entity_type,
    source: null, brokerId: row.broker_id, brokerName: '', brokerEmail: '', brokerCompany: '',
    clientName: '', clientEmail: '', clientMobile: '', internalNotes: '', notes: '',
    strategies: [],
  };
}

async function loadRequests() {
  const [reqResult, cfResult] = await Promise.all([
    supabase
      .from('requests')
      .select(`
        *,
        request_rent_details(*),
        request_cma_details(*),
        request_referral_details(*),
        request_pdr_details(*),
        pdr_strategies(*)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('cashflow_reports')
      .select('id, created_at, status, property_address, entity_type, is_public, revoked_at, broker_id')
      .order('created_at', { ascending: false }),
  ]);
  if (reqResult.error) throw reqResult.error;
  if (cfResult.error) console.error('[loadRequests] cashflow_reports query failed:', cfResult.error);
  console.log('[loadRequests] cashflow rows:', { count: cfResult.data?.length ?? 0, hasError: !!cfResult.error, rows: cfResult.data ?? [] });
  const requests  = (reqResult.data ?? []).map(normaliseRequest);
  const cashflows = (cfResult.data  ?? []).map(normaliseCashflowRequest);
  return [...requests, ...cashflows].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}


// ── PDR service helpers ───────────────────────────────────────────────────────
async function updatePdrDetails(requestId, patch) {
  const { error } = await supabase.from('request_pdr_details').update(patch).eq('request_id', requestId);
  if (error) throw error;
}
async function addStrategy(requestId, data) {
  const { error } = await supabase.from('pdr_strategies').insert({ request_id: requestId, ...data });
  if (error) throw error;
}
async function updateStrategy(strategyId, patch) {
  const { error } = await supabase.from('pdr_strategies').update(patch).eq('id', strategyId);
  if (error) throw error;
}
async function deleteStrategy(strategyId) {
  const { error } = await supabase.from('pdr_strategies').delete().eq('id', strategyId);
  if (error) throw error;
}
async function reorderStrategies(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from('pdr_strategies').update({ sort_order: i }).eq('id', id)));
}

// ── Strategy type definitions ─────────────────────────────────────────────────
const STRATEGY_TYPES = [
  { value: 'value_creation',         label: 'Value Creation Strategy'       },
  { value: 'capital_adjustment',     label: 'Capital Adjustment Strategy'   },
  { value: 'location_expansion',     label: 'Location Expansion Strategy'   },
  { value: 'property_configuration', label: 'Property Configuration Strategy' },
  { value: 'subdivision',            label: 'Subdivision Strategy'          },
  { value: 'ancillary_dwelling',     label: 'Ancillary Dwelling Strategy'   },
];
const STRATEGY_LABEL = Object.fromEntries(STRATEGY_TYPES.map(t => [t.value, t.label]));
const BLANK_STRAT = {
  strategy_type: 'value_creation', headline: '', summary: '',
  target_purchase_price: '', budget_amount: '', projected_end_value: '', supporting_notes: '',
};

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

// ── Infrastructure ────────────────────────────────────────────────────────────
const DRAFT_VERSION = 1;
const AUTH_ONLY_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/change-password"];

const ROUTES = [
  { path: "/dashboard",     label: "Dashboard",         crumbParent: null },
  { path: "/rent-requests", label: "Rent Requests",     crumbParent: "/dashboard" },
  { path: "/price-check-requests",  label: "Price Check Requests",      crumbParent: "/dashboard" },
  { path: "/pdr-reports",   label: "PD Reports",        crumbParent: "/dashboard" },
  { path: "/referrals",     label: "Referrals",         crumbParent: "/dashboard" },
  { path: "/brokers",       label: "Broker Management", crumbParent: "/dashboard" },
  { path: "/staff",         label: "Staff Accounts",    crumbParent: "/dashboard" },
  { path: "/requests",      label: "My Requests",       crumbParent: "/dashboard" },
  { path: "/requests/new",  label: "New Request",       crumbParent: "/requests"  },
];

function buildCrumbs(pathname) {
  const route = ROUTES.find(r => r.path === pathname);
  if (!route || !route.crumbParent) return [];
  const parent = ROUTES.find(r => r.path === route.crumbParent);
  const chain = parent ? [{ label: parent.label, to: parent.path }] : [];
  return [...chain, { label: route.label }];
}

function isDraftDirty(current, initial) {
  try { return JSON.stringify(current) !== JSON.stringify(initial); }
  catch { return false; }
}

function useDraft(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== DRAFT_VERSION || !parsed?.data) return initial;
      return parsed.data;
    } catch { return initial; }
  });

  const set = useCallback(updater => {
    setValue(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        localStorage.setItem(key, JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), data: next }));
      } catch {}
      return next;
    });
  }, [key]);

  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setValue(initial);
  }, [key]);

  return [value, set, clear];
}

function useUnsavedWarning(isDirty) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}

const DirtyCtx = createContext({ dirtyRef: { current: false } });

function Breadcrumbs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const crumbs = buildCrumbs(pathname);
  if (crumbs.length === 0) return null;
  return (
    <div className="breadcrumbs">
      {crumbs.map((c, i) => (
        <span key={i} style={{display:"flex",alignItems:"center",gap:6}}>
          {i > 0 && <span className="bc-sep">›</span>}
          {c.to
            ? <span className="bc-link" onClick={() => navigate(c.to)}>{c.label}</span>
            : <span className="bc-current">{c.label}</span>
          }
        </span>
      ))}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'grid', placeItems: 'center', fontFamily: 'Inter, Arial, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <img src="/No BG, Light Text.png" alt="Fulcrum Australia" style={{ height: 36, marginBottom: 24, filter: 'invert(1) brightness(0.3)' }} />
        <div style={{ fontSize: 14, color: '#9ca3af' }}>Loading…</div>
      </div>
    </div>
  );
}

function ProtectedRoute({ session, isLoading, children }) {
  const location = useLocation();
  if (isLoading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (session.mustChangePassword && location.pathname !== "/change-password")
    return <Navigate to="/change-password" replace />;
  if (!session.mustChangePassword && location.pathname === "/change-password")
    return <Navigate to="/dashboard" replace />;
  return children;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [users,               setUsers]               = useState([]);
  const [requests,            setRequests]            = useState([]);
  const [session,             setSession]             = useState(null);
  const [pendingClientsCount, setPendingClientsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall,   setShowInstall]   = useState(false);
  const registering    = useRef(false);
  const recovering     = useRef(false);
  const profileLoadRef = useRef({ userId: null, promise: null });
  const isInitialLoad  = useRef(true);
  const wasLoggedIn    = useRef(false); // true once a session has been successfully established
  const navigate = useNavigate();
  const location = useLocation();

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

  const loadProfile = (userId) => {
    if (profileLoadRef.current.promise && profileLoadRef.current.userId === userId) {
      console.log("[loadProfile] deduped — already loading for", userId);
      return profileLoadRef.current.promise;
    }

    const run = (async () => {
      try {
        console.log("[loadProfile] starting for", userId);
        const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (!data) {
          console.warn("[loadProfile] no profile found, signing out");
          await supabase.auth.signOut();
          setSession(null);
          setIsLoading(false);
          navigate("/login", { replace: true });
          return;
        }
        if (data.role === "broker" && data.status !== "approved") {
          console.warn("[loadProfile] broker not approved, signing out");
          await supabase.auth.signOut();
          setSession(null);
          setIsLoading(false);
          navigate("/login", { replace: true });
          return;
        }
        const profile = normalizeProfile(data);
        setSession(profile);
        setIsLoading(false);
        if (profile.mustChangePassword) {
          navigate("/change-password", { replace: true });
        } else if (['/login', '/'].includes(window.location.pathname)) {
          // Navigate to dashboard only if currently on the login page.
          // Prevents unwanted redirects on tab-switch reconnects or token refreshes.
          const intendedPath = location.state?.from?.pathname;
          const safe = intendedPath && !AUTH_ONLY_PATHS.includes(intendedPath) ? intendedPath : "/dashboard";
          navigate(safe, { replace: true });
        }
        wasLoggedIn.current = true;
        if (profile.role === "staff") {
          loadUsers().catch(err => {
            console.error("[loadUsers] failed:", err);
          });
          supabase
            .from("clients")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending")
            .then(({ count }) => setPendingClientsCount(count ?? 0))
            .catch(() => {});
        }
      } catch (err) {
        console.error("[loadProfile] failed:", err);
        setSession(null);
        setIsLoading(false);
        navigate("/login", { replace: true });
      } finally {
        if (profileLoadRef.current.userId === userId) {
          profileLoadRef.current = { userId: null, promise: null };
        }
      }
    })();

    profileLoadRef.current = { userId, promise: run };
    return run;
  };

  const resolveAuth = async (authSession) => {
    try {
      console.log("[resolveAuth] session:", authSession, "recovering:", recovering.current);
      if (authSession?.user && !recovering.current) {
        await loadProfile(authSession.user.id);
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error("[resolveAuth] error:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        console.log("[initAuth] getSession result:", data);
        if (!mounted) return;
        await resolveAuth(data.session);
      } catch (err) {
        console.error("[initAuth] getSession error:", err);
        if (mounted) setIsLoading(false);
      } finally {
        isInitialLoad.current = false;
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (!mounted) return;
      console.log("[onAuthStateChange] event:", event, "session:", authSession);
      if (event === "PASSWORD_RECOVERY") { recovering.current = true; navigate("/reset-password"); return; }
      if (event === "USER_UPDATED") { recovering.current = false; return; }
      if (event === "TOKEN_REFRESHED") return; // silent refresh — do not re-navigate
      if (event === "SIGNED_OUT") { recovering.current = false; wasLoggedIn.current = false; setSession(null); setIsLoading(false); navigate("/login"); return; }
      if (registering.current) return;
      void resolveAuth(authSession);
    });

    loadRequests()
      .then(r => { if (mounted) setRequests(r); })
      .catch(err => { console.error("[loadRequests] failed:", err); if (mounted) setRequests([]); });

    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); setInstallPrompt(e); setShowInstall(true); });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => { setIsLoading(v => v ? false : v); }, 3000);
    return () => clearTimeout(timeout);
  }, []);

  const login = async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return "Invalid email or password.";
      return null;
    } catch (err) {
      console.error("login failed:", err);
      return "An error occurred. Please try again.";
    }
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
      redirectTo: `${window.location.origin}/reset-password`,
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
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.access_token) return "Not authenticated.";
    const { data, error: invokeError } = await supabase.functions.invoke("admin-delete-user", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { userId: id },
    });
    if (invokeError || data?.error) {
      console.error("[admin-delete-user] invoke failed:", invokeError || data?.error);
      return invokeError?.message || data?.error || "Request failed.";
    }
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
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.access_token) return "Not authenticated.";
    const { data: result, error: invokeError } = await supabase.functions.invoke("admin-create-user", {
      headers: { Authorization: `Bearer ${authSession.access_token}` },
      body: { email, password, name, role: "staff", mustChangePassword: true },
    });
    if (invokeError || result?.error) {
      console.error("[admin-create-user] invoke failed:", invokeError || result?.error);
      return invokeError?.message || result?.error || "Request failed.";
    }
    if (!result?.id) {
      console.error("[admin-create-user] missing result.id:", result);
      return "Request failed.";
    }
    setUsers([...users, { id: result.id, name, email, role: "staff", status: null, company: "", phone: "", mustChangePassword: true }]);
    return null;
  };

  const removeStaff = async (id, currentUserId) => {
    if (id === currentUserId) return "You cannot remove your own account.";
    const target = users.find(u => u.id === id);
    if (!target || target.role !== "staff") return "Staff account not found.";
    const remainingStaff = users.filter(u => u.role === "staff" && u.id !== id);
    if (remainingStaff.length === 0) return "Cannot remove the last staff account.";
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.access_token) return "Not authenticated.";
    const { data, error: invokeError } = await supabase.functions.invoke("admin-delete-user", {
      headers: { Authorization: `Bearer ${authSession.access_token}` },
      body: { userId: id },
    });
    if (invokeError || data?.error) {
      console.error("[admin-delete-user] invoke failed:", invokeError || data?.error);
      return invokeError?.message || data?.error || "Request failed.";
    }
    setUsers(users.filter(u => u.id !== id));
    return null;
  };

  const addBroker = async data => {
    if (!data.tempPassword || data.tempPassword.length < 8) return "Temporary password must be at least 8 characters.";
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.access_token) return "Not authenticated.";
    const { data: result, error: invokeError } = await supabase.functions.invoke("admin-create-user", {
      headers: { Authorization: `Bearer ${authSession.access_token}` },
      body: {
        email: data.email.trim().toLowerCase(),
        password: data.tempPassword,
        name: data.name.trim(),
        role: "broker",
        company: data.company.trim(),
        phone: data.phone?.trim() || null,
        mustChangePassword: true,
      },
    });
    if (invokeError || result?.error) {
      console.error("[admin-create-user] invoke failed:", invokeError || result?.error);
      return invokeError?.message || result?.error || "Request failed.";
    }
    if (!result?.id) {
      console.error("[admin-create-user] missing result.id:", result);
      return "Request failed.";
    }
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
    navigate("/dashboard", { replace: true });
    return null;
  };

  const submitRequest = async data => {
    let rpcResult;
    if (data.type === "rent") {
      rpcResult = await supabase.rpc("create_rent_request", {
        p_address:     data.address,
        p_weekly_rent: String(data.weeklyRent ?? ""),
        p_notes:       data.notes || "",
      });
    } else if (data.type === "cma") {
      rpcResult = await supabase.rpc("create_cma_request", {
        p_address:        data.address,
        p_expected_value: String(data.expectedValue ?? ""),
        p_notes:          data.notes || "",
      });
    } else if (data.type === "referral") {
      rpcResult = await supabase.rpc("create_referral_request", {
        p_client_name:   data.clientName,
        p_client_email:  data.clientEmail,
        p_client_mobile: data.clientMobile || "",
        p_situation:     data.situation || "",
      });
    } else if (data.type === "pdr") {
      rpcResult = await supabase.rpc("create_pdr_request", {
        p_client_name:    data.clientName,
        p_client_email:   data.clientEmail,
        p_client_mobile:  data.clientMobile || "",
        p_budget_min:     String(data.budgetMin ?? ""),
        p_budget_max:     String(data.budgetMax ?? ""),
        p_property_types: data.propertyTypes || [],
        p_bedrooms:       data.bedrooms || "",
        p_bathrooms:      data.bathrooms || "",
        p_locations:      data.locations || "",
        p_purpose:        data.purpose || "",
        p_rental_yield:   String(data.rentalYield ?? ""),
        p_notes:          data.notes || "",
      });
    }
    if (rpcResult?.error) throw rpcResult.error;

    const typeLabel = data.type === "rent" ? "Rent Letter" : data.type === "cma" ? "Price Check" : data.type === "referral" ? "Client Referral" : "PDR";
    const message = data.type === "referral"
      ? `A new client referral has been submitted.\n\nReferring Broker: ${session.name}\nCompany: ${session.company}\nEmail: ${session.email}\n\nClient Name: ${data.clientName}\nClient Email: ${data.clientEmail}\nClient Mobile: ${data.clientMobile || "—"}\n\nSituation:\n${data.situation}\n\nSubmitted: ${new Date().toLocaleString("en-AU")}\n\nLog in to the portal to review this referral.`
      : `A new ${typeLabel} request has been submitted.\n\nBroker: ${session.name}\nCompany: ${session.company}\nEmail: ${session.email}\nAddress: ${data.address || "—"}\nSubmitted: ${new Date().toLocaleString("en-AU")}\n\nLog in to the portal to review and complete this request.`;
    sendEmail(EMAILJS_TEMPLATE_STAFF, {
      email: "brian@fulcrumaustralia.com.au",
      subject: `New ${typeLabel} — ${session.name} (${session.company})`,
      message
    });
    sendWhatsApp(`New ${typeLabel}\nFrom: ${session.name} (${session.company})\n${data.type === "referral" ? `Client: ${data.clientName}` : `Property: ${data.address || "—"}`}`);
    loadRequests().then(setRequests).catch(console.error);
    return { id: rpcResult?.data };
  };

  const refreshRequests = () => loadRequests().then(setRequests).catch(console.error);

  // Notification callback for cashflow request submission
  const onCashflowNotify = async ({ brokerName, propertyAddress }) => {
    const msg = `New Cashflow Analysis Request\nFrom: ${brokerName}\nProperty: ${propertyAddress}\n\nLog in to the portal to complete and generate the report.`;
    sendEmail(EMAILJS_TEMPLATE_STAFF, {
      email: "brian@fulcrumaustralia.com.au",
      subject: `New Cashflow Request — ${brokerName}`,
      message: msg,
    });
    sendWhatsApp(msg);
  };

  const updateRequest = async (id, patch) => {
    const dbPatch = {};
    if (patch.status       !== undefined) dbPatch.status        = patch.status;
    if (patch.downloadUrl  !== undefined) dbPatch.download_url  = patch.downloadUrl;
    if (patch.completedAt  !== undefined) dbPatch.completed_at  = patch.completedAt ? new Date(patch.completedAt).toISOString() : null;
    if (patch.internalNotes !== undefined) dbPatch.internal_notes = patch.internalNotes;
    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from("requests").update(dbPatch).eq("id", id);
      if (error) throw error;
    }
    if (patch.staffNotes !== undefined) {
      const { error } = await supabase.from("request_referral_details").update({ staff_notes: patch.staffNotes }).eq("request_id", id);
      if (error) throw error;
    }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };
  const deleteRequest = async (id) => {
    const { error } = await supabase.from("requests").delete().eq("id", id);
    if (error) throw error;
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  const myRequests   = useMemo(() => requests.filter(r => r.brokerId === session?.id), [requests, session?.id]);
  const rentReqs     = useMemo(() => requests.filter(r => r.type === "rent"),           [requests]);
  const cmaReqs      = useMemo(() => requests.filter(r => r.type === "cma"),            [requests]);
  const pdrReqs      = useMemo(() => requests.filter(r => r.type === "pdr"),            [requests]);
  const referralReqs = useMemo(() => requests.filter(r => r.type === "referral"),       [requests]);

  return (
    <>
      {showInstall && (
        <div className="install-banner">
          <div style={{fontSize:28}}>📲</div>
          <div className="install-text"><strong>Install Fulcrum Portal</strong>Add to your home screen</div>
          <button className="btn btn-primary btn-sm" onClick={() => { installPrompt?.prompt(); setShowInstall(false); }}>Install</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowInstall(false)}>✕</button>
        </div>
      )}
      <Routes>
        <Route path="/login"           element={<LoginScreen onLogin={login} />} />
        <Route path="/register"        element={<RegisterScreen onRegister={register} />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen onForgotPassword={forgotPassword} />} />
        <Route path="/reset-password"  element={<ResetPasswordScreen onResetPassword={resetPassword} onSignOut={() => supabase.auth.signOut()} />} />
        <Route path="/pdr"             element={<PDRPublicForm />} />
        <Route path="/report"          element={<CashflowReportPage />} />
        <Route path="/onboard"         element={<OnboardingForm />} />

        <Route path="/change-password" element={
          <ProtectedRoute session={session} isLoading={isLoading}>
            <ChangePasswordScreen onChangePassword={changePassword} />
          </ProtectedRoute>
        } />

        <Route path="/" element={
          <ProtectedRoute session={session} isLoading={isLoading}>
            <AppShell session={session} onLogout={logout} requests={requests} users={users} pendingClientsCount={pendingClientsCount} supabase={supabase} />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={
            session?.role === "staff"
              ? <AdminDashboard requests={requests} users={users} />
              : <BrokerDashboard session={session} requests={myRequests} />
          } />
          <Route path="rent-requests" element={
            session?.role === "staff"
              ? <AdminRequests requests={rentReqs} onUpdate={updateRequest} onDelete={deleteRequest} type="rent" session={session} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="price-check-requests" element={
            session?.role === "staff"
              ? <AdminRequests requests={cmaReqs} onUpdate={updateRequest} onDelete={deleteRequest} type="cma" />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="pdr-reports" element={
            session?.role === "staff"
              ? <AdminPDRRequests requests={pdrReqs} onUpdate={updateRequest} onDelete={deleteRequest} onRefresh={refreshRequests} initialSelectedId={location.state?.autoSelectId} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="pdr-reports/new" element={
            session?.role === "staff"
              ? <StaffNewPdrPage supabase={supabase} session={session} pdrReqs={pdrReqs} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="referrals" element={
            session?.role === "staff"
              ? <AdminReferrals requests={referralReqs} onUpdate={updateRequest} onDelete={deleteRequest} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="brokers" element={
            session?.role === "staff"
              ? <AdminBrokers users={users} onApprove={approveUser} onReject={rejectUser} onAddBroker={addBroker} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="staff" element={
            session?.role === "staff"
              ? <AdminStaff users={users} session={session} onAddStaff={addStaff} onRemoveStaff={removeStaff} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="requests" element={
            session?.role === "broker"
              ? <BrokerRequests requests={myRequests} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="requests/new" element={
            session?.role === "broker"
              ? <NewRequest onSubmit={submitRequest} session={session} />
              : <Navigate to="/dashboard" replace />
          } />

          {/* ── Cashflow Analysis ── */}
          <Route path="cashflow/new" element={
            session?.role === "broker"
              ? <BrokerRequestForm supabase={supabase} session={session} onNotify={onCashflowNotify} onComplete={() => { refreshRequests(); navigate('/requests'); }} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="cashflow/staff/new" element={
            session?.role === "staff"
              ? <StaffCompletionForm
                  cashflowRequest={null}
                  supabase={supabase}
                  session={session}
                  onComplete={(id) => navigate(`/report?id=${id}`)}
                  onCancel={() => navigate('/cashflow')}
                />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="cashflow/:id" element={
            session?.role === "staff"
              ? <StaffCashflowRoute supabase={supabase} session={session} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="cashflow" element={
            <CashflowDashboard supabase={supabase} session={session} />
          } />

          {/* ── Clients / Onboarding ── */}
          <Route path="clients" element={
            session?.role === "staff"
              ? <ClientsSection supabase={supabase} session={session} />
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="clients/:id" element={
            session?.role === "staff"
              ? <ClientDetail supabase={supabase} session={session} />
              : <Navigate to="/dashboard" replace />
          } />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

// ── Staff cashflow route — loads request and renders StaffCompletionForm ──────
function StaffCashflowRoute({ supabase, session }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    supabase
      .from('cashflow_reports')
      .select('id, inputs_broker, inputs_final, status, property_address, entity_type')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setLoadError('Request not found or you do not have access.');
        } else {
          setRequest(data);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, supabase]);

  if (loading) return <div style={{padding:40,textAlign:'center',color:'#888'}}>Loading request…</div>;
  if (loadError) return <div style={{padding:40,textAlign:'center',color:'#ef4444'}}>{loadError}</div>;

  return (
    <StaffCompletionForm
      cashflowRequest={request}
      supabase={supabase}
      session={session}
      onComplete={() => navigate('/cashflow')}
      onCancel={() => navigate('/cashflow')}
    />
  );
}

// ── Password Input with show/hide toggle ──────────────────────────────────────
function PasswordInput({ value, onChange, onKeyDown, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input type={show?"text":"password"} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} />
      <button type="button" className="pw-eye" onClick={()=>setShow(s=>!s)} tabIndex={-1}>{show?"HIDE":"SHOW"}</button>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [err,   setErr]   = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setErr("");
    setLoading(true);
    try {
      const e = await onLogin(email, pass);
      if (e) setErr(e);
    } catch (err) {
      console.error("submit failed:", err);
      setErr("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand"><img src="/Full Logo Light BG, Dark Text.png" style={{maxWidth:180,display:"block",margin:"0 auto"}} alt="Fulcrum Australia" /></div>
        <div className="auth-title">Sign In</div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="field"><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="you@example.com" /></div>
        <div className="field"><label>Password</label><PasswordInput value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" /></div>
        <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Signing in…" : "Sign In →"}</button>
        <div className="divider" />
        <p style={{fontSize:14,color:"#888",textAlign:"center"}}>New broker? <span className="text-link" onClick={() => navigate("/register")}>Request access</span></p>
        <p style={{fontSize:13,color:"#aaa",textAlign:"center",marginTop:8}}><span className="text-link" onClick={() => navigate("/forgot-password")}>Forgot password?</span></p>
      </div>
      <div className="auth-deco">
        <div className="deco-quote">Fast rent letters and comparative market analyses — powered by Fulcrum Australia.</div>
      </div>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
function RegisterScreen({ onRegister }) {
  const navigate = useNavigate();
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
            <button className="btn btn-secondary mt" onClick={() => navigate("/login")}>← Back to Sign In</button>
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
              <div className="field"><label>Password *</label><PasswordInput value={form.password} onChange={set("password")} /></div>
              <div className="field"><label>Confirm *</label><PasswordInput value={form.confirm} onChange={set("confirm")} /></div>
            </div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center"}} onClick={submit}>Submit Request →</button>
            <div className="divider" />
            <p style={{fontSize:14,color:"#888",textAlign:"center"}}><span className="text-link" onClick={() => navigate("/login")}>← Back to Sign In</span></p>
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
function ForgotPasswordScreen({ onForgotPassword }) {
  const navigate = useNavigate();
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
            <button className="btn btn-secondary mt" onClick={() => navigate("/login")}>← Back to Sign In</button>
          </div>
        ) : (
          <>
            {err && <div className="alert alert-error">{err}</div>}
            <p style={{fontSize:14,color:"#888",marginBottom:16}}>Enter your email address and we'll send you a link to reset your password.</p>
            <div className="field"><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="you@example.com" /></div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Sending…" : "Send Reset Link →"}</button>
            <div className="divider" />
            <p style={{fontSize:14,color:"#888",textAlign:"center"}}><span className="text-link" onClick={() => navigate("/login")}>← Back to Sign In</span></p>
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
function ResetPasswordScreen({ onResetPassword, onSignOut }) {
  const navigate = useNavigate();
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
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:16}} onClick={() => navigate("/login")}>Sign In →</button>
          </div>
        ) : (
          <>
            {err && <div className="alert alert-error">{err}</div>}
            <div className="field"><label>New Password</label><PasswordInput value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
            <div className="field"><label>Confirm Password</label><PasswordInput value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Re-enter password" /></div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Saving…" : "Reset Password →"}</button>
            <div className="divider" />
            <p style={{fontSize:14,color:"#888",textAlign:"center"}}><span className="text-link" onClick={async () => { await onSignOut(); navigate("/login"); }}>← Back to Sign In</span></p>
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
        <div className="field"><label>New Password</label><PasswordInput value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
        <div className="field"><label>Confirm Password</label><PasswordInput value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Re-enter password" /></div>
        <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={submit} disabled={loading}>{loading ? "Saving…" : "Set Password & Continue →"}</button>
      </div>
      <div className="auth-deco">
        <div className="deco-quote">Fast rent letters and comparative market analyses — powered by Fulcrum Australia.</div>
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell({ session, onLogout, requests, users, pendingClientsCount, supabase }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dirtyRef = useRef(false);

  const isStaff = session.role === "staff";
  const pendingApprovals = useMemo(() => users.filter(u => u.role==="broker" && u.status==="pending").length,      [users]);
  const pendingRent      = useMemo(() => requests.filter(r => r.type==="rent" && r.status==="pending").length,     [requests]);
  const pendingCMA       = useMemo(() => requests.filter(r => r.type==="cma"  && r.status==="pending").length,     [requests]);
  const pendingPDR       = useMemo(() => requests.filter(r => r.type==="pdr"  && r.status==="pending").length,     [requests]);
  const pendingReferrals = useMemo(() => requests.filter(r => r.type==="referral" && r.status==="pending").length, [requests]);

  const adminNav = [
    { path:"/dashboard",     icon:"📊", label:"Dashboard" },
    { section:"Rent Letters" },
    { path:"/rent-requests", icon:"📋", label:"Rent Requests", badge:pendingRent },
    { section:"Market Analysis" },
    { path:"/price-check-requests",  icon:"🏡", label:"Price Check Requests",  badge:pendingCMA  },
    { section:"Price Discovery" },
    { path:"/pdr-reports",   icon:"🔍", label:"PD Reports",    badge:pendingPDR },
    { section:"Cashflow Analysis" },
    { path:"/cashflow",          icon:"📈", label:"Cashflow Reports" },
    { section:"Clients" },
    { path:"/clients",           icon:"👤", label:"Clients",          badge:pendingClientsCount },
    { section:"Referrals" },
    { path:"/referrals",     icon:"🤝", label:"Referrals",     badge:pendingReferrals },
    { section:"Admin" },
    { path:"/brokers",       icon:"👥", label:"Brokers",       badge:pendingApprovals },
    { path:"/staff",         icon:"🔐", label:"Staff Accounts" },
  ];
  const brokerNav = [
    { path:"/dashboard",    icon:"🏠", label:"Dashboard" },
    { path:"/requests/new", icon:"✏️",  label:"New Request" },
    { path:"/requests",     icon:"📋", label:"My Requests" },
  ];
  const nav = isStaff ? adminNav : brokerNav;
  const navItems = nav.filter(n => !n.section);

  const handleNav = path => {
    if (dirtyRef.current && !window.confirm("You have unsaved changes. Leave anyway?")) return;
    navigate(path);
  };

  return (
    <DirtyCtx.Provider value={{ dirtyRef }}>
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
                <div key={n.path} className={`nav-item${pathname===n.path?" active":""}`} onClick={() => handleNav(n.path)}>
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
          <Breadcrumbs />
          <Outlet />
        </main>
        <nav className="bottom-nav">
          {navItems.map(n => (
            <div key={n.path} className={`bottom-nav-item${pathname===n.path?" active":""}`} onClick={() => handleNav(n.path)}>
              {n.badge>0 && <span className="bottom-nav-badge">{n.badge}</span>}
              <span className="bottom-nav-icon">{n.icon}</span>
              <span className="bottom-nav-label">{n.label}</span>
            </div>
          ))}
        </nav>
      </div>
    </DirtyCtx.Provider>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ requests, users }) {
  const navigate = useNavigate();
  const complete      = requests.filter(r=>r.status==="complete");
  const rentPending   = requests.filter(r=>r.type==="rent"&&r.status==="pending");
  const cmaPending    = requests.filter(r=>r.type==="cma" &&r.status==="pending");
  const awaitApproval = users.filter(u=>u.role==="broker"&&u.status==="pending");
  return (
    <div className="dashboard-shell">
      <div className="page-header"><div className="page-title">Dashboard</div><div className="page-sub">Overview of all portal activity</div></div>
      <div className="stats">
        <div className="stat"><div className="stat-num">{requests.length}</div><div className="stat-label">Total Requests</div></div>
        <div className="stat"><div className="stat-num gold">{rentPending.length}</div><div className="stat-label">Rent Pending</div></div>
        <div className="stat"><div className="stat-num teal">{cmaPending.length}</div><div className="stat-label">Price Checks Pending</div></div>
        <div className="stat"><div className="stat-num green">{complete.length}</div><div className="stat-label">Completed</div></div>
        <div className="stat"><div className="stat-num" style={{color:"var(--indigo)"}}>{requests.filter(r=>r.type==="pdr"&&r.status==="pending").length}</div><div className="stat-label">PDR Pending</div></div>
        <div className="stat"><div className="stat-num" style={{color:"#7a4a00"}}>{requests.filter(r=>r.type==="referral"&&r.status==="pending").length}</div><div className="stat-label">Referrals</div></div>
      </div>
      {awaitApproval.length>0 && (
        <div className="card" style={{marginBottom:16,borderLeft:"3px solid var(--danger)"}}>
          <div className="row-between">
            <div className="card-title" style={{margin:0}}>⚠️ Brokers Awaiting Approval</div>
            <button className="btn btn-secondary btn-sm" onClick={()=>navigate("/brokers")}>Manage →</button>
          </div>
          <p style={{fontSize:14,color:"#888",marginTop:8}}>{awaitApproval.map(u=>`${u.name} (${u.company})`).join(" · ")}</p>
        </div>
      )}
      <div className="card">
        <div className="row-between">
          <div className="card-title" style={{margin:0}}>Recent Requests</div>
          <div className="row" style={{gap:8}}>
            <button className="btn btn-secondary btn-sm" onClick={()=>navigate("/rent-requests")}>Rent Letters →</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>navigate("/price-check-requests")}>Price Checks →</button>
          </div>
        </div>
        <div className="req-table-wrap">
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
        <div className="req-cards" style={{marginTop:16}}>
          {requests.slice(0,6).length ? requests.slice(0,6).map(r=>(
            <div key={r.id} className="req-card">
              <TypeBadge t={r.type} />
              <div className="req-card-address">{r.address || "—"}</div>
              <div className="req-card-date">{fmt(r.createdAt)}</div>
              <StatusBadge s={r.status} />
            </div>
          )) : (
            <div style={{fontSize:14,color:"#aaa"}}>No requests yet</div>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Generate Rent Letter Modal ────────────────────────────────────────────────
function GenerateRentLetterModal({ request, session, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  const INITIAL_FORM = {
    propertyAddress: request.address || '',
    rentLow:         '',
    rentHigh:        '',
    signatoryName:   session.name  || '',
    signatoryPhone:  session.phone || '',
    signatoryEmail:  session.email || '',
    letterDate:      today,
  };
  const [form,            setForm]            = useState(INITIAL_FORM);
  const [cmaFile,         setCmaFile]         = useState(null);
  const [step,            setStep]            = useState('idle');
  const [errors,          setErrors]          = useState({});
  const [errorMsg,        setErrorMsg]        = useState('');
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [resultSignedUrl, setResultSignedUrl] = useState('');

  const stepLabels = {
    'uploading-cma':    'Uploading CMA…',
    'generating':       'Generating letter…',
    'uploading-letter': 'Uploading letter…',
    'saving':           'Saving record…',
  };
  const isInProgress = ['uploading-cma', 'generating', 'uploading-letter', 'saving'].includes(step);

  const onChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const validate = () => {
    const e = {};
    if (!form.propertyAddress.trim()) e.propertyAddress = 'Required';
    const low  = parseInt(form.rentLow,  10);
    const high = parseInt(form.rentHigh, 10);
    if (!form.rentLow  || isNaN(low)  || low  <  50 || low  > 10000) e.rentLow  = 'Must be 50–10,000';
    if (!form.rentHigh || isNaN(high) || high < low || high > 10000) e.rentHigh = 'Must be ≥ rent low and ≤ 10,000';
    if (!form.signatoryName.trim())  e.signatoryName  = 'Required';
    if (!form.signatoryPhone.trim()) e.signatoryPhone = 'Required';
    if (!form.signatoryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.signatoryEmail)) e.signatoryEmail = 'Valid email required';
    if (!form.letterDate) e.letterDate = 'Required';
    return e;
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setIsGenerating(true);
    setErrorMsg('');

    const now  = Date.now();
    const yyyy = new Date().getFullYear();
    const mm   = String(new Date().getMonth() + 1).padStart(2, '0');
    let cmaPath = null;

    try {
      // Step 1 — Upload CMA (optional)
      if (cmaFile) {
        setStep('uploading-cma');
        cmaPath = `${yyyy}/${mm}/${request.id}_${now}_cma.pdf`;
        const { error: cmaError } = await supabase.storage
          .from('cma-uploads')
          .upload(cmaPath, cmaFile, { contentType: 'application/pdf' });
        if (cmaError) throw new Error(`CMA upload failed: ${cmaError.message}`);
      }

      // Step 2 — Generate PDF via edge function
      setStep('generating');
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-rent-letter`;
      const genResp = await fetch(edgeFnUrl, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${authSession.access_token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          propertyAddress: form.propertyAddress.trim(),
          rentLow:         parseInt(form.rentLow,  10),
          rentHigh:        parseInt(form.rentHigh, 10),
          signatoryName:   form.signatoryName.trim(),
          signatoryPhone:  form.signatoryPhone.trim(),
          signatoryEmail:  form.signatoryEmail.trim(),
          letterDate:      form.letterDate,
        }),
      });

      if (!genResp.ok) {
        const body = await genResp.json().catch(() => ({}));
        if (genResp.status === 403) throw new Error('Permission denied. You must be a staff member to generate letters.');
        if (genResp.status === 422) throw new Error(body.error || 'Letter content exceeds single page. Shorten the property address.');
        throw new Error(body.error || `Generation failed (${genResp.status})`);
      }

      const pdfBytes = await genResp.arrayBuffer();

      // Step 3 — Upload letter PDF
      setStep('uploading-letter');
      const { count: existingCount } = await supabase
        .from('rent_letters')
        .select('*', { count: 'exact', head: true })
        .eq('request_id', request.id);
      const versionNumber = (existingCount ?? 0) + 1;

      const letterPath = `${yyyy}/${mm}/${request.id}_${now}_v${versionNumber}.pdf`;
      const { error: letterError } = await supabase.storage
        .from('rent-letters')
        .upload(letterPath, pdfBytes, { contentType: 'application/pdf' });
      if (letterError) {
        console.error('ORPHAN_FILE', { bucket: 'cma-uploads', path: cmaPath, requestId: request.id, reason: 'letter upload failed' });
        throw new Error(`Letter upload failed: ${letterError.message}`);
      }

      // Step 4 — Save DB record
      setStep('saving');
      const { error: insertError } = await supabase.from('rent_letters').insert({
        request_id:             request.id,
        property_address:       form.propertyAddress.trim(),
        rent_low:               parseInt(form.rentLow,  10),
        rent_high:              parseInt(form.rentHigh, 10),
        signatory_name:         form.signatoryName.trim(),
        signatory_phone:        form.signatoryPhone.trim(),
        signatory_email:        form.signatoryEmail.trim(),
        version_number:         versionNumber,
        cma_storage_path:       cmaPath,
        cma_original_filename:  cmaFile?.name ?? null,
        cma_file_size_bytes:    cmaFile?.size ?? null,
        letter_storage_path:    letterPath,
        letter_file_size_bytes: pdfBytes.byteLength,
        generated_by:           session.id,
        letter_date:            form.letterDate,
      });

      if (insertError) {
        await supabase.storage.from('rent-letters').remove([letterPath]).catch(() => {
          console.error('ORPHAN_FILE', {
            bucket: 'rent-letters', path: letterPath,
            requestId: request.id, userId: session.id,
            timestamp: new Date().toISOString(), reason: 'DB insert failed after PDF upload',
          });
        });
        throw new Error(`Failed to save record: ${insertError.message}`);
      }

      const { data: signedData } = await supabase.storage
        .from('rent-letters')
        .createSignedUrl(letterPath, 3600);
      setResultSignedUrl(signedData?.signedUrl || '');
      setStep('success');

    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setStep('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForNewVersion = () => {
    setStep('idle'); setErrorMsg(''); setErrors({});
    setCmaFile(null); setResultSignedUrl('');
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !isInProgress && onClose()}>
      <div className="modal" style={{maxWidth:520,overflowY:'auto',maxHeight:'90vh'}}>
        <div className="modal-title">Generate Rent Letter</div>

        {step === 'success' ? (
          <div>
            <div className="alert alert-success" style={{marginBottom:16}}>
              Letter generated! The download link expires in 1 hour.
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {resultSignedUrl && (
                <a href={resultSignedUrl} download="rent-letter.pdf" className="btn btn-primary">
                  Download Letter
                </a>
              )}
              <button className="btn btn-secondary" onClick={resetForNewVersion}>Generate New Version</button>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Property Address *</label>
              <input value={form.propertyAddress}
                onChange={e => onChange('propertyAddress', e.target.value)}
                placeholder="123 Example St, Perth WA 6000" />
              {errors.propertyAddress && <div style={{fontSize:12,color:'#e07070',marginTop:4}}>{errors.propertyAddress}</div>}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
              <div className="field">
                <label>Rent Low ($/wk) *</label>
                <input type="number" min="50" max="10000"
                  value={form.rentLow} onChange={e => onChange('rentLow', e.target.value)}
                  placeholder="450" />
                {errors.rentLow && <div style={{fontSize:12,color:'#e07070',marginTop:4}}>{errors.rentLow}</div>}
              </div>
              <div className="field">
                <label>Rent High ($/wk) *</label>
                <input type="number" min="50" max="10000"
                  value={form.rentHigh} onChange={e => onChange('rentHigh', e.target.value)}
                  placeholder="500" />
                {errors.rentHigh && <div style={{fontSize:12,color:'#e07070',marginTop:4}}>{errors.rentHigh}</div>}
              </div>
            </div>

            <div className="divider" />

            <div style={{fontWeight:600,fontSize:13,color:'var(--primary)',marginBottom:10,letterSpacing:.2}}>Signatory</div>
            <div className="field">
              <label>Name *</label>
              <input value={form.signatoryName} onChange={e => onChange('signatoryName', e.target.value)} />
              {errors.signatoryName && <div style={{fontSize:12,color:'#e07070',marginTop:4}}>{errors.signatoryName}</div>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
              <div className="field">
                <label>Phone *</label>
                <input value={form.signatoryPhone}
                  onChange={e => onChange('signatoryPhone', e.target.value)}
                  placeholder="08 6158 9924" />
                {errors.signatoryPhone && <div style={{fontSize:12,color:'#e07070',marginTop:4}}>{errors.signatoryPhone}</div>}
              </div>
              <div className="field">
                <label>Email *</label>
                <input type="email" value={form.signatoryEmail}
                  onChange={e => onChange('signatoryEmail', e.target.value)} />
                {errors.signatoryEmail && <div style={{fontSize:12,color:'#e07070',marginTop:4}}>{errors.signatoryEmail}</div>}
              </div>
            </div>

            <div className="divider" />

            <div className="field">
              <label>Letter Date *</label>
              <input type="date" value={form.letterDate}
                onChange={e => onChange('letterDate', e.target.value)} />
              {errors.letterDate && <div style={{fontSize:12,color:'#e07070',marginTop:4}}>{errors.letterDate}</div>}
            </div>

            <div className="field">
              <label>
                CMA / Market Evidence
                <span style={{fontWeight:400,color:'#bbb',marginLeft:6}}>(PDF, optional — max 20MB)</span>
              </label>
              <input type="file" accept="application/pdf" onChange={e => {
                const f = e.target.files?.[0];
                if (f && f.size > 20 * 1024 * 1024) { alert('CMA file must be under 20MB.'); e.target.value = ''; return; }
                setCmaFile(f || null);
              }} />
              {cmaFile && (
                <div style={{fontSize:12,color:'#888',marginTop:4}}>
                  {cmaFile.name} ({(cmaFile.size / 1024).toFixed(0)} KB)
                </div>
              )}
              <div className="hint">The CMA (Comparative Market Analysis) is your supporting evidence for the rent range — e.g. an RP Data PDF.</div>
            </div>

            {isInProgress && (
              <div className="alert" style={{background:'#f0f4ff',color:'#3a5cc7',marginBottom:12,border:'1px solid #c7d5f5'}}>
                {stepLabels[step]}
              </div>
            )}
            {step === 'error' && (
              <div className="alert alert-error" style={{marginBottom:12}}>{errorMsg}</div>
            )}

            <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:8}}>
              <button className="btn btn-secondary" onClick={onClose} disabled={isInProgress}>Cancel</button>
              <button className="btn btn-primary" onClick={handleGenerate}
                disabled={isGenerating} aria-busy={isGenerating}>
                {isGenerating ? (stepLabels[step] || 'Processing…') : 'Generate Letter'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Admin / CMA Requests (shared, type-aware) ─────────────────────────────────
function AdminRequests({ requests, onUpdate, onDelete, type, session }) {
  const isRent = type === "rent";
  const [selected,           setSelected]           = useState(null);
  const [filter,             setFilter]             = useState("all");
  const [uploadUrl,          setUploadUrl]          = useState("");
  const [notifSent,          setNotifSent]          = useState(false);
  const [showLetterModal,    setShowLetterModal]    = useState(false);
  const [rentLetterCount,    setRentLetterCount]    = useState(0);
  const filtered = filter==="all" ? requests : requests.filter(r=>r.status===filter);

  // Load existing letter count whenever a rent request is selected
  useEffect(() => {
    if (!isRent || !selected?.id) { setRentLetterCount(0); return; }
    supabase
      .from('rent_letters')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', selected.id)
      .then(({ count }) => setRentLetterCount(count ?? 0))
      .catch(() => setRentLetterCount(0));
  }, [selected?.id, isRent]); // eslint-disable-line react-hooks/exhaustive-deps

  const markComplete = async req => {
    if (!uploadUrl.trim()) return alert("Please enter a download URL for the completed document.");
    await onUpdate(req.id, { status:"complete", completedAt:Date.now(), downloadUrl:uploadUrl.trim() });
    const typeLabel = isRent ? "Rent Letter" : "Price Check";
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
        <div className="page-title">{isRent?"Rent Letter Requests":"Price Check Requests"}</div>
        <div className="page-sub">{isRent?"Manage and complete rent letter requests":"Manage and complete Price Check requests"}</div>
      </div>
      <div className="card">
        <div className="row" style={{marginBottom:20,gap:8}}>
          {["all","pending","complete"].map(f=>(
            <button key={f} className={`btn ${filter===f?(isRent?"btn-primary":"btn-teal"):"btn-secondary"} btn-sm`}
              onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f}</button>
          ))}
        </div>
        <div className="req-table-wrap">
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
        <div className="req-cards">
          {filtered.map(r=>(
            <div key={r.id} className="req-card">
              <TypeBadge t={r.type||(isRent?"rent":"cma")} />
              <div className="req-card-name">{r.address||"—"}</div>
              <div className="req-card-sub">{r.brokerName}{r.brokerCompany?` · ${r.brokerCompany}`:""}</div>
              <div className="req-card-date">{fmt(r.createdAt)}</div>
              <StatusBadge s={r.status} />
              <div className="req-card-actions">
                <button className="btn btn-secondary btn-sm" onClick={()=>{ setSelected(r); setUploadUrl(r.downloadUrl||""); }}>Manage →</button>
              </div>
            </div>
          ))}
          {filtered.length===0 && <div className="empty">No requests found</div>}
        </div>
      </div>
      {selected && (
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="modal">
            <div className="modal-title">{isRent?"Rent Letter":"Price Check"} Request Details</div>
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
            {/* Rent letter generation — staff only, rent requests only */}
            {isRent && session && (
              <>
                <div className="divider" />
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:'var(--primary)'}}>Rent Letter</div>
                    {rentLetterCount > 0 && (
                      <div style={{fontSize:12,color:'#888',marginTop:2}}>
                        {rentLetterCount} version{rentLetterCount !== 1 ? 's' : ''} generated
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowLetterModal(true)}>
                    {rentLetterCount === 0 ? 'Generate Rent Letter' : 'Generate New Version'}
                  </button>
                </div>
              </>
            )}
            <div className="divider" />
            {notifSent
              ? <div className="alert alert-success">✅ Marked complete! Broker has been notified.</div>
              : <>
                  <div className="field">
                    <label>Download URL for Completed {isRent?"Letter":"Price Check"}</label>
                    <input value={uploadUrl} onChange={e=>setUploadUrl(e.target.value)} placeholder="https://drive.google.com/... or similar" />
                    <div className="hint">Paste a shareable link to the completed PDF</div>
                  </div>
                  <div className="row" style={{justifyContent:"space-between",gap:10}}>
                    <button className="btn btn-danger btn-sm" onClick={()=>{ if(window.confirm("Delete this request? This cannot be undone.")){ onDelete(selected.id, selected.type); setSelected(null); } }}>Delete</button>
                    <div className="row" style={{gap:10}}>
                      <button className="btn btn-secondary" onClick={()=>setSelected(null)}>Cancel</button>
                      {selected.status==="pending" && (
                        <button className={`btn ${isRent?"btn-primary":"btn-teal"}`} onClick={()=>markComplete(selected)}>✅ Mark Complete & Notify Broker</button>
                      )}
                      {selected.status==="complete" && (
                        <button className="btn btn-secondary" onClick={()=>markComplete(selected)}>Update Download URL</button>
                      )}
                    </div>
                  </div>
                </>
            }
          </div>
        </div>
      )}
      {showLetterModal && selected && session && (
        <GenerateRentLetterModal
          request={selected}
          session={session}
          onClose={() => {
            setShowLetterModal(false);
            // Refresh letter count after modal closes
            supabase
              .from('rent_letters')
              .select('*', { count: 'exact', head: true })
              .eq('request_id', selected.id)
              .then(({ count }) => setRentLetterCount(count ?? 0))
              .catch(() => {});
          }}
        />
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
          <div className="req-table-wrap">
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
          <div className="req-cards">
            {pending.map(b=>(
              <div key={b.id} className="req-card">
                <div className="req-card-name">{b.name}</div>
                <div className="req-card-sub">{b.company}</div>
                <div className="req-card-sub">{b.email}</div>
                {b.phone && <div className="req-card-sub">{b.phone}</div>}
                <div className="req-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={()=>onApprove(b.id)}>Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={()=>onReject(b.id)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-title">✅ Approved Brokers ({approved.length})</div>
        <div className="req-table-wrap">
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
        <div className="req-cards">
          {approved.map(b=>(
            <div key={b.id} className="req-card">
              <div className="req-card-name">{b.name}</div>
              <div className="req-card-sub">{b.company}</div>
              <div className="req-card-sub">{b.email}</div>
              {b.mustChangePassword
                ? <span className="badge badge-pending">Temp password</span>
                : <StatusBadge s="approved" />}
              <div className="req-card-actions">
                <button className="btn btn-danger btn-sm"
                  onClick={()=>{ if(window.confirm(`Remove access for ${b.name}? This cannot be undone.`)) onReject(b.id); }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {approved.length===0 && <div style={{fontSize:14,color:"#aaa"}}>No approved brokers yet</div>}
        </div>
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
        <div className="req-table-wrap">
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
        <div className="req-cards">
          {staffUsers.map(u=>(
            <div key={u.id} className="req-card">
              <div className="req-card-name">{u.name}</div>
              <div className="req-card-sub">{u.email}</div>
              {u.mustChangePassword
                ? <span className="badge badge-pending">Temp password</span>
                : <span className="badge badge-approved">Active</span>}
              <div className="req-card-actions">
                {u.id===session.id
                  ? <span style={{fontSize:12,color:"#aaa"}}>Current user</span>
                  : <button className="btn btn-danger btn-sm"
                      disabled={!!removing}
                      onClick={()=>doRemove(u.id)}>
                      {removing===u.id?"Removing…":"Remove"}
                    </button>}
              </div>
            </div>
          ))}
          {staffUsers.length===0 && <div style={{fontSize:14,color:"#aaa"}}>No staff accounts yet</div>}
        </div>
      </div>
    </>
  );
}

// ── Admin Referrals ───────────────────────────────────────────────────────────
function AdminReferrals({ requests, onUpdate, onDelete }) {
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
        <div className="req-table-wrap">
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
        <div className="req-cards">
          {filtered.map(r=>(
            <div key={r.id} className="req-card">
              <div className="req-card-name">{r.clientName}</div>
              <div className="req-card-sub">{r.clientEmail}</div>
              <div className="req-card-sub">Referred by {r.brokerName}{r.brokerCompany?` · ${r.brokerCompany}`:""}</div>
              <div className="req-card-date">{fmt(r.createdAt)}</div>
              <StatusBadge s={r.status} />
              <div className="req-card-actions">
                <button className="btn btn-secondary btn-sm" onClick={()=>{ setSelected(r); setNotes(r.staffNotes||""); }}>Review →</button>
              </div>
            </div>
          ))}
          {filtered.length===0 && <div className="empty"><div className="empty-icon">📭</div>No referrals found</div>}
        </div>
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
                  <div className="row" style={{justifyContent:"space-between",gap:10}}>
                    <button className="btn btn-danger btn-sm" onClick={()=>{ if(window.confirm("Delete this referral? This cannot be undone.")){ onDelete(selected.id, selected.type); setSelected(null); } }}>Delete</button>
                    <div className="row" style={{gap:10}}>
                      <button className="btn btn-secondary" onClick={()=>setSelected(null)}>Cancel</button>
                      {selected.status==="pending" && (
                        <button className="btn btn-primary" onClick={()=>markComplete(selected)}>✅ Mark Complete</button>
                      )}
                      {selected.status==="complete" && (
                        <button className="btn btn-secondary" onClick={()=>markComplete(selected)}>Update Notes</button>
                      )}
                    </div>
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
function BrokerDashboard({ session, requests }) {
  const navigate = useNavigate();
  const complete     = requests.filter(r=>r.status==="complete");
  const rentReqs     = requests.filter(r=>r.type==="rent");
  const cmaReqs      = requests.filter(r=>r.type==="cma");
  const referralReqs = requests.filter(r=>r.type==="referral");
  const recent       = requests.slice(0,4);
  return (
    <div className="dashboard-shell">
      <div className="page-header">
        <div className="page-title">Welcome, {session.name.split(" ")[0]}</div>
        <div className="page-sub">{session.company} · Property Services Portal</div>
      </div>
      <div className="stats">
        <div className="stat"><div className="stat-num">{requests.length}</div><div className="stat-label">Total</div></div>
        <div className="stat"><div className="stat-num gold">{rentReqs.length}</div><div className="stat-label">Rent Letters</div></div>
        <div className="stat"><div className="stat-num teal">{cmaReqs.length}</div><div className="stat-label">Price Checks</div></div>
        <div className="stat"><div className="stat-num green">{complete.length}</div><div className="stat-label">Completed</div></div>
        <div className="stat"><div className="stat-num" style={{color:"#7a4a00"}}>{referralReqs.length}</div><div className="stat-label">Referrals</div></div>
      </div>
      <div className="row" style={{marginBottom:20,gap:12}}>
        <button className="btn btn-primary" onClick={()=>navigate("/requests/new")}>✏️ New Request</button>
        <button className="btn btn-secondary" onClick={()=>navigate("/requests")}>View All Requests</button>
      </div>
      {recent.length>0 ? (
        <div className="card">
          <div className="card-title">Recent Requests</div>
          <div className="req-table-wrap">
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
          <div className="req-cards">
            {recent.length ? recent.map(r=>(
              <div key={r.id} className="req-card">
                <TypeBadge t={r.type} />
                <div className="req-card-address">{r.address || "—"}</div>
                <div className="req-card-date">{fmt(r.createdAt)}</div>
                <StatusBadge s={r.status} />
                {r.status==="complete" && r.downloadUrl && (
                  <div className="req-card-doc">
                    <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{textDecoration:"none"}}>⬇️ Download</a>
                  </div>
                )}
              </div>
            )) : (
              <div style={{fontSize:14,color:"#aaa"}}>No requests yet</div>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:48,marginBottom:16}}>📄</div>
          <p style={{color:"#aaa",marginBottom:20}}>No requests yet. Submit your first request to get started.</p>
          <button className="btn btn-primary" onClick={()=>navigate("/requests/new")}>✏️ New Request</button>
        </div>
      )}
    </div>
  );
}

// ── New Request ───────────────────────────────────────────────────────────────
function NewRequest({ onSubmit, session }) {
  const navigate = useNavigate();
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
            : <>Your {lastType==="rent"?"rent letter":lastType==="cma"?"Price Check":"Price Discovery Report"} request has been received.<br/>You'll be notified as soon as your document is ready to download.</>
          }
        </p>
        <div className="row" style={{justifyContent:"center",gap:12}}>
          <button className="btn btn-primary" onClick={() => navigate("/requests")}>View My Requests</button>
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
              <div className="type-card-title">Price Check</div>
              <div className="type-card-desc">Current market value estimate for a property based on comparable sales.</div>
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
            <div className="type-card" onClick={() => navigate("/cashflow/new")} style={{cursor:"pointer"}}>
              <div className="type-card-icon">📈</div>
              <div className="type-card-title">Cashflow Analysis</div>
              <div className="type-card-desc">Model the rental income, expenses, and long-term cashflow for an investment property purchase.</div>
            </div>
          </div>
        </div>
      )}
      {type==="rent"     && <RentForm     onSubmit={handleSubmit} onBack={()=>setType(null)} />}
      {type==="cma"      && <PriceCheckForm onSubmit={handleSubmit} onBack={()=>setType(null)} />}
      {type==="pdr"      && <PDRBrokerForm onSubmit={handleSubmit} onBack={()=>setType(null)} session={session} />}
      {type==="referral" && <ReferralForm  onSubmit={handleSubmit} onBack={()=>setType(null)} />}
    </div>
  );
}

function RentForm({ onSubmit, onBack }) {
  const INITIAL = { address:"", weeklyRent:"", notes:"" };
  const [form, setForm, clearDraft] = useDraft('draft:new-request:rent', INITIAL);
  const [err,  setErr]  = useState("");
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const isDirty = isDraftDirty(form, INITIAL);
  useUnsavedWarning(isDirty);
  const { dirtyRef } = useContext(DirtyCtx);
  useEffect(() => { dirtyRef.current = isDirty; return () => { dirtyRef.current = false; }; }, [isDirty]);
  const handleBack = () => { if (isDirty && !window.confirm("Discard changes?")) return; onBack(); };
  const submit = async () => {
    if (!form.address.trim()) return setErr("Property address is required.");
    if (!form.weeklyRent||isNaN(form.weeklyRent)||Number(form.weeklyRent)<=0) return setErr("Please enter a valid weekly rent amount.");
    setLoading(true); await onSubmit(form); clearDraft(); setLoading(false);
  };
  return (
    <div className="card" style={{marginTop:16}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>📄 Rent Letter Request</div>
        <button className="btn btn-secondary btn-sm" onClick={handleBack}>← Change type</button>
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

function PriceCheckForm({ onSubmit, onBack }) {
  const INITIAL = { address:"", expectedValue:"", notes:"" };
  const [form, setForm, clearDraft] = useDraft('draft:new-request:cma', INITIAL);
  const [err,  setErr]  = useState("");
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const isDirty = isDraftDirty(form, INITIAL);
  useUnsavedWarning(isDirty);
  const { dirtyRef } = useContext(DirtyCtx);
  useEffect(() => { dirtyRef.current = isDirty; return () => { dirtyRef.current = false; }; }, [isDirty]);
  const handleBack = () => { if (isDirty && !window.confirm("Discard changes?")) return; onBack(); };
  const submit = async () => {
    if (!form.address.trim()) return setErr("Property address is required.");
    setLoading(true); await onSubmit(form); clearDraft(); setLoading(false);
  };
  return (
    <div className="card" style={{marginTop:16}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>🏡 Price Check Request</div>
        <button className="btn btn-secondary btn-sm" onClick={handleBack}>← Change type</button>
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
  const INITIAL = { clientName:"", clientEmail:"", clientMobile:"", situation:"" };
  const [form, setForm, clearDraft] = useDraft('draft:new-request:referral', INITIAL);
  const [err,  setErr]  = useState("");
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const isDirty = isDraftDirty(form, INITIAL);
  useUnsavedWarning(isDirty);
  const { dirtyRef } = useContext(DirtyCtx);
  useEffect(() => { dirtyRef.current = isDirty; return () => { dirtyRef.current = false; }; }, [isDirty]);
  const handleBack = () => { if (isDirty && !window.confirm("Discard changes?")) return; onBack(); };
  const submit = async () => {
    if (!form.clientName.trim())  return setErr("Client name is required.");
    if (!form.clientEmail.trim()) return setErr("Client email is required.");
    if (!/\S+@\S+\.\S+/.test(form.clientEmail)) return setErr("Please enter a valid email address.");
    if (!form.situation.trim())   return setErr("Please provide a brief description of the client and their situation.");
    setLoading(true); await onSubmit(form); clearDraft(); setLoading(false);
  };
  return (
    <div className="card" style={{marginTop:16}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>🤝 Client Referral</div>
        <button className="btn btn-secondary btn-sm" onClick={handleBack}>← Change type</button>
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
      <div className="page-header"><div className="page-title">My Requests</div><div className="page-sub">All your requests in one place</div></div>
      <div className="card">
        <div className="row" style={{marginBottom:16,gap:10,flexWrap:"wrap"}}>
          <div className="row" style={{gap:6}}>
            {["all","pending","complete"].map(f=>(
              <button key={f} className={`btn ${filter===f?"btn-primary":"btn-secondary"} btn-sm`} onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f}</button>
            ))}
          </div>
          <div style={{width:1,height:24,background:"var(--border)"}} />
          <div className="row" style={{gap:6}}>
            {[["all","All Types"],["rent","📄 Rent"],["cma","🏡 Price Check"],["pdr","🔍 PDR"],["cashflow","📈 Cashflow Analysis"],["referral","🤝 Referral"]].map(([v,l])=>(
              <button key={v} className="btn btn-secondary btn-sm" onClick={()=>setTypeFilter(v)}
                style={{borderColor:typeFilter===v?"var(--primary)":"var(--border-strong)",fontWeight:typeFilter===v?700:400}}>{l}</button>
            ))}
          </div>
        </div>
        <div className="req-table-wrap">
          <table className="tbl">
            <thead><tr><th>Type</th><th>Property</th><th>Details</th><th>Submitted</th><th>Status</th><th>Document</th></tr></thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.id}>
                  <td><TypeBadge t={r.type} /></td>
                  <td style={{fontSize:13,maxWidth:200}}>{r.address}</td>
                  <td><span className="tag">{r.type==="rent"?`$${r.weeklyRent}/wk`:r.type==="pdr"?r.clientName||"Client":r.type==="referral"?r.clientName||"Client":r.type==="cashflow"?(r.entityType?r.entityType.replace(/_/g,' '):"Investment"):fmtMoney(r.expectedValue)}</span></td>
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
        <div className="req-cards">
          {filtered.length ? filtered.map(r=>(
            <div key={r.id} className="req-card">
              <TypeBadge t={r.type} />
              <div className="req-card-address">{r.address || "—"}</div>
              <div className="req-card-date">{fmt(r.createdAt)}</div>
              <StatusBadge s={r.status} />
              {r.status==="complete" && r.downloadUrl && (
                <div className="req-card-doc">
                  <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{textDecoration:"none"}}>⬇️ Download</a>
                </div>
              )}
            </div>
          )) : (
            <div className="empty"><div className="empty-icon">📭</div>No requests found</div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusBadge({ s }) {
  const map = { pending:["badge-pending","Pending"], complete:["badge-complete","Complete"], approved:["badge-approved","Approved"], in_review:["badge-in-review","In Review"], in_progress:["badge-in-progress","In Progress"], cancelled:["badge-cancelled","Cancelled"] };
  const [cls, label] = map[s] || ["badge-pending", s];
  return <span className={`badge ${cls}`}>{label}</span>;
}
function TypeBadge({ t }) {
  if (t==="cashflow") return <span className="badge badge-cashflow">📈 Cashflow Analysis</span>;
  if (t==="cma")      return <span className="badge badge-cma">🏡 Price Check</span>;
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
// Accessible at /pdr?id=<brokerId> — no login required for clients
export function PDRPublicForm() {
  const [searchParams] = useSearchParams();
  const brokerId = searchParams.get("id") || "";
  const [step, setStep]   = useState(0);
  const [done, setDone]   = useState(false);
  const PDR_INITIAL = {
    clientName:"", clientEmail:"", clientMobile:"",
    budgetMin:"", budgetMax:"",
    propertyTypes:[], bedrooms:"", bathrooms:"",
    locations:"", purpose:"owner", rentalYield:"", notes:""
  };
  const [form, setForm, clearDraft] = useDraft(`draft:pdr-public:${brokerId}`, PDR_INITIAL);
  const [err, setErr] = useState("");
  useUnsavedWarning(!done && isDraftDirty(form, PDR_INITIAL));

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
      const { error } = await supabase.rpc("create_pdr_public", {
        p_broker_id:      brokerId || null,
        p_client_name:    form.clientName,
        p_client_email:   form.clientEmail,
        p_client_mobile:  form.clientMobile || "",
        p_budget_min:     String(form.budgetMin ?? ""),
        p_budget_max:     String(form.budgetMax ?? ""),
        p_property_types: form.propertyTypes || [],
        p_bedrooms:       form.bedrooms || "",
        p_bathrooms:      form.bathrooms || "",
        p_locations:      form.locations || "",
        p_purpose:        form.purpose || "",
        p_rental_yield:   String(form.rentalYield ?? ""),
        p_notes:          form.notes || "",
      });
      if (error) throw error;
      sendEmail(EMAILJS_TEMPLATE_STAFF, {
        email: "brian@fulcrumaustralia.com.au",
        subject: `New PDR Submission — ${form.clientName}`,
        message: `A new Price Discovery Report request has been submitted.\n\nClient: ${form.clientName}\nEmail: ${form.clientEmail}\nMobile: ${form.clientMobile}\nBudget: ${form.budgetMin ? `$${Number(form.budgetMin).toLocaleString()} – ` : ""}$${Number(form.budgetMax).toLocaleString()}\nLocations: ${form.locations}\nSubmitted: ${new Date().toLocaleString("en-AU")}\n\nLog in to the portal to review and complete this request.`
      });
      sendWhatsApp(`New PDR Submission\nClient: ${form.clientName}\nEmail: ${form.clientEmail}\nMobile: ${form.clientMobile || "—"}`);
      clearDraft();
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

// ── Source label helper ───────────────────────────────────────────────────────
function getRequestSourceLabel(source) {
  if (source === 'public') return 'Public Form';
  if (source === 'staff')  return 'Staff';
  return 'Broker Portal';
}

// ── PDR shared form fields ────────────────────────────────────────────────────
function PDRFormFields({ form, onChange, errors }) {
  const togglePT = pt => {
    const next = form.propertyTypes.includes(pt)
      ? form.propertyTypes.filter(x => x !== pt)
      : [...form.propertyTypes, pt];
    onChange('propertyTypes', next);
  };
  return (
    <>
      <div style={{fontWeight:600,fontSize:13,color:"var(--primary)",marginBottom:10,letterSpacing:.2}}>Client Details</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <div className="field">
          <label>Client Name *</label>
          <input value={form.clientName} onChange={e=>onChange('clientName',e.target.value)} placeholder="Jane Smith" />
          {errors.clientName && <div style={{fontSize:12,color:"#e07070",marginTop:4}}>{errors.clientName}</div>}
        </div>
        <div className="field">
          <label>Mobile</label>
          <input value={form.clientMobile} onChange={e=>onChange('clientMobile',e.target.value)} placeholder="04xx xxx xxx" />
        </div>
      </div>
      <div className="field">
        <label>Client Email *</label>
        <input value={form.clientEmail} onChange={e=>onChange('clientEmail',e.target.value)} placeholder="jane@example.com" type="email" />
        {errors.clientEmail && <div style={{fontSize:12,color:"#e07070",marginTop:4}}>{errors.clientEmail}</div>}
      </div>
      <div className="divider" />
      <div style={{fontWeight:600,fontSize:13,color:"var(--primary)",marginBottom:10,letterSpacing:.2}}>Budget & Purpose</div>
      <div className="range-row">
        <div className="field">
          <label>Min Budget</label>
          <div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span><input value={form.budgetMin} onChange={e=>onChange('budgetMin',e.target.value)} placeholder="400,000" style={{paddingLeft:28}} type="number" min="0" /></div>
        </div>
        <div className="field">
          <label>Max Budget *</label>
          <div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:11,color:"#aaa",fontWeight:600}}>$</span><input value={form.budgetMax} onChange={e=>onChange('budgetMax',e.target.value)} placeholder="650,000" style={{paddingLeft:28}} type="number" min="0" /></div>
          {errors.budgetMax && <div style={{fontSize:12,color:"#e07070",marginTop:4}}>{errors.budgetMax}</div>}
        </div>
      </div>
      <div className="field">
        <label>Purchasing Purpose</label>
        <div className="pill-group">
          {[["owner","🏠 Owner-Occupier"],["investor","📈 Investor"]].map(([v,l])=>(
            <div key={v} className={`pill${form.purpose===v?" sel-gold":""}`} onClick={()=>onChange('purpose',v)}>{l}</div>
          ))}
        </div>
      </div>
      {form.purpose==="investor" && (
        <div className="field">
          <label>Target Rental Yield</label>
          <div style={{position:"relative"}}>
            <input value={form.rentalYield} onChange={e=>onChange('rentalYield',e.target.value)} placeholder="5.5" type="number" min="0" max="20" step="0.1" style={{paddingRight:32}} />
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
        {errors.propertyTypes && <div style={{fontSize:12,color:"#e07070",marginTop:4}}>{errors.propertyTypes}</div>}
      </div>
      <div className="range-row">
        <div className="field">
          <label>Bedrooms</label>
          <div className="pill-group">
            {["1","2","3","4","5+"].map(n=>(
              <div key={n} className={`pill${form.bedrooms===n?" sel-gold":""}`} onClick={()=>onChange('bedrooms',n)}>{n}</div>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Bathrooms</label>
          <div className="pill-group">
            {["1","2","3","4+"].map(n=>(
              <div key={n} className={`pill${form.bathrooms===n?" sel-gold":""}`} onClick={()=>onChange('bathrooms',n)}>{n}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="divider" />
      <div style={{fontWeight:600,fontSize:13,color:"var(--primary)",marginBottom:10,letterSpacing:.2}}>Location & Notes</div>
      <div className="field">
        <label>Preferred Suburbs *</label>
        <textarea value={form.locations} onChange={e=>onChange('locations',e.target.value)} rows={2} placeholder="e.g. Applecross, Mount Pleasant, Cottesloe…" style={{resize:"vertical"}} />
        {errors.locations && <div style={{fontSize:12,color:"#e07070",marginTop:4}}>{errors.locations}</div>}
      </div>
      <div className="field">
        <label>Additional Notes <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
        <textarea value={form.notes} onChange={e=>onChange('notes',e.target.value)} rows={2} placeholder="Any other requirements or context…" style={{resize:"vertical"}} />
      </div>
    </>
  );
}

// ── Price Discovery — Broker Submission Form (inside portal) ──────────────────
function PDRBrokerForm({ onSubmit, onBack, session }) {
  const INITIAL = {
    clientName:"", clientEmail:"", clientMobile:"",
    budgetMin:"", budgetMax:"",
    propertyTypes:[], bedrooms:"", bathrooms:"",
    locations:"", purpose:"owner", rentalYield:"", notes:""
  };
  const [form, setForm, clearDraft] = useDraft('draft:new-request:pdr', INITIAL);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const isDirty = isDraftDirty(form, INITIAL);
  useUnsavedWarning(isDirty);
  const { dirtyRef } = useContext(DirtyCtx);
  useEffect(() => { dirtyRef.current = isDirty; return () => { dirtyRef.current = false; }; }, [isDirty]);
  const handleBack = () => { if (isDirty && !window.confirm("Discard changes?")) return; onBack(); };

  const onChange = (field, value) => setForm(f => ({...f, [field]: value}));

  const submit = async () => {
    if (!form.clientName||!form.clientEmail) return setErr("Client name and email are required.");
    if (!form.budgetMax) return setErr("Maximum budget is required.");
    if (form.propertyTypes.length===0) return setErr("Please select at least one property type.");
    if (!form.locations.trim()) return setErr("Please enter at least one preferred suburb.");
    setLoading(true); await onSubmit(form); clearDraft(); setLoading(false);
  };

  return (
    <div className="card" style={{marginTop:16,maxWidth:640}}>
      <div className="row-between" style={{marginBottom:16}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:16,fontWeight:700,color:"var(--primary)"}}>🔍 Price Discovery Report</div>
        <button className="btn btn-secondary btn-sm" onClick={handleBack}>← Change type</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <PDRFormFields form={form} onChange={onChange} errors={{}} />
      <div className="divider" />
      <div className="row" style={{justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:12,color:"#aaa"}}>Or <span className="text-link" onClick={()=>{ const link=`${window.location.origin}/pdr?id=${session?.id||""}`; navigator.clipboard?.writeText(link); alert("Client link copied!\n\n"+link); }}>copy client link ↗</span></div>
        <button className="btn btn-purple" onClick={submit} disabled={loading}>{loading?"Submitting…":"Submit Report →"}</button>
      </div>
    </div>
  );
}

// ── Staff New PDR Page ────────────────────────────────────────────────────────
function StaffNewPdrPage({ supabase, session, pdrReqs }) {
  const navigate = useNavigate();
  const INITIAL = {
    clientName:"", clientEmail:"", clientMobile:"",
    budgetMin:"", budgetMax:"",
    propertyTypes:[], bedrooms:"", bathrooms:"",
    locations:"", purpose:"owner", rentalYield:"", notes:"",
  };
  const [form,             setForm]             = useState(INITIAL);
  const [clients,          setClients]          = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [errors,           setErrors]           = useState({});
  const [submitError,      setSubmitError]      = useState('');
  const [loading,          setLoading]          = useState(false);

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone')
      .in('status', ['submitted', 'active'])
      .order('first_name')
      .then(({ data }) => setClients(data ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (field, value) => setForm(f => ({...f, [field]: value}));

  const handleClientPick = e => {
    const id = e.target.value || null;
    setSelectedClientId(id);
    if (!id) return;
    const c = clients.find(cl => cl.id === id);
    if (c) setForm(f => ({
      ...f,
      clientName:   `${c.first_name} ${c.last_name}`.trim(),
      clientEmail:  c.email || '',
      clientMobile: c.phone || '',
    }));
  };

  const priorCount = (() => {
    if (!selectedClientId) return 0;
    const c = clients.find(cl => cl.id === selectedClientId);
    return c ? pdrReqs.filter(r => r.clientEmail === c.email).length : 0;
  })();

  const validate = () => {
    const e = {};
    if (!form.clientName.trim())  e.clientName  = 'Required';
    if (!form.clientEmail.trim()) e.clientEmail = 'Required';
    if (!form.budgetMax.trim())   e.budgetMax   = 'Required';
    if (!form.locations.trim())   e.locations   = 'Required';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setLoading(true);
    setSubmitError('');
    const { data: newId, error } = await supabase.rpc('create_pdr_staff', {
      p_client_name:    form.clientName.trim(),
      p_client_email:   form.clientEmail.trim(),
      p_client_mobile:  form.clientMobile,
      p_budget_min:     form.budgetMin,
      p_budget_max:     form.budgetMax,
      p_property_types: form.propertyTypes,
      p_bedrooms:       form.bedrooms,
      p_bathrooms:      form.bathrooms,
      p_locations:      form.locations.trim(),
      p_purpose:        form.purpose,
      p_rental_yield:   form.rentalYield,
      p_notes:          form.notes,
      p_client_id:      selectedClientId ?? null,
    });
    setLoading(false);
    if (error) { setSubmitError(error.message); return; }
    navigate('/pdr-reports', { state: { autoSelectId: newId } });
  };

  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:"24px 16px 48px"}}>
      <div style={{marginBottom:20}}>
        <button className="btn btn-secondary btn-sm" onClick={()=>navigate('/pdr-reports')}>← Back</button>
      </div>
      <div className="card">
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:18,fontWeight:700,color:"var(--primary)",marginBottom:20}}>
          New Price Discovery Report
        </div>

        {/* Client picker */}
        <div className="field" style={{marginBottom:16}}>
          <label>Select Existing Client <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
          <select value={selectedClientId??""} onChange={handleClientPick} style={{width:"100%"}}>
            <option value="">— Select existing client (optional) —</option>
            {clients.map(c=>(
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.email}</option>
            ))}
          </select>
          {selectedClientId && priorCount > 0 && (
            <div style={{fontSize:12,color:"#888",marginTop:6}}>
              {priorCount} prior PDR request{priorCount!==1?"s":""} for this client.
            </div>
          )}
        </div>

        <div className="divider" />

        <PDRFormFields form={form} onChange={onChange} errors={errors} />

        <div className="divider" />

        {submitError && <div className="alert alert-error" style={{marginBottom:12}}>{submitError}</div>}
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <button className="btn btn-purple" onClick={handleSubmit} disabled={loading}>
            {loading?"Creating…":"Create PDR"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin PDR Requests ────────────────────────────────────────────────────────
function AdminPDRRequests({ requests, onUpdate, onDelete, onRefresh, initialSelectedId }) {
  const navigate = useNavigate();
  const [selected,    setSelected]    = useState(null);
  const [filter,      setFilter]      = useState("all");
  const [previewMode, setPreviewMode] = useState(false);
  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  // Keep selected fresh after parent state refreshes
  useEffect(() => {
    if (selected) {
      const fresh = requests.find(r => r.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [requests]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select newly created request (once, on first load)
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (!didAutoSelect.current && initialSelectedId && requests.length) {
      const match = requests.find(r => r.id === initialSelectedId);
      if (match) { setSelected(match); didAutoSelect.current = true; }
    }
  }, [requests, initialSelectedId]);

  // ── Fulfilment fields ─────────────────────────────────────────────────────
  const [ful,        setFul]        = useState({ hero_statement: '', viability_summary: '', supporting_notes: '' });
  const [fulSaving,  setFulSaving]  = useState(false);
  const [fulMsg,     setFulMsg]     = useState('');
  useEffect(() => {
    if (selected?.id) {
      setFul({
        hero_statement:    selected.heroStatement    || '',
        viability_summary: selected.viabilitySummary || '',
        supporting_notes:  selected.supportingNotes  || '',
      });
      setFulMsg('');
      setReportGenerating(false); setReportGenerateError('');
      setReportHtmlUrl(''); setReportPdfUrl('');
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveFulfilment = async () => {
    setFulSaving(true); setFulMsg('');
    try {
      await updatePdrDetails(selected.id, ful);
      await onRefresh();
      setFulMsg('saved');
    } catch { setFulMsg('error'); }
    setFulSaving(false);
  };

  // ── CSV / Market Evidence state ───────────────────────────────────────────
  const [salesRows,         setSalesRows]         = useState([]);
  const [salesRowCount,     setSalesRowCount]      = useState(0);
  const [salesWarnings,     setSalesWarnings]      = useState([]);
  const [salesUploadStatus, setSalesUploadStatus]  = useState('idle'); // 'idle'|'uploading'|'done'|'error'
  const [salesUploadError,  setSalesUploadError]   = useState('');
  const [bestFitImageUrl,   setBestFitImageUrl]    = useState('');
  const [nominatedRow,      setNominatedRow]       = useState(null);
  const [salesLoading,      setSalesLoading]       = useState(false);

  // Load stored CSV whenever selected request (or its stored path) changes
  useEffect(() => {
    let cancelled = false;
    setSalesRows([]); setSalesRowCount(0); setSalesWarnings([]);
    setSalesUploadStatus('idle'); setSalesUploadError('');
    if (!selected?.salesCsvFilePath) return () => { cancelled = true; };
    setSalesLoading(true);
    supabase.storage.from('pdr-assets').download(selected.salesCsvFilePath)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setSalesRows([]); setSalesRowCount(0); setSalesWarnings([]);
          setSalesUploadError('Could not load stored CSV.');
          setSalesLoading(false);
          return;
        }
        return data.text().then(text => {
          if (cancelled) return;
          try {
            const result = parseSalesCsv(text);
            if (cancelled) return;
            setSalesRows(result.rows);
            setSalesRowCount(result.rowCount);
            setSalesWarnings(result.warnings);
            setSalesUploadStatus('done');
          } catch (err) {
            if (cancelled) return;
            setSalesRows([]); setSalesRowCount(0); setSalesWarnings([]);
            setSalesUploadError(err.message || 'CSV parse failed.');
          }
        });
      })
      .catch(err => {
        if (cancelled) return;
        setSalesRows([]); setSalesRowCount(0); setSalesWarnings([]);
        setSalesUploadError(err.message || 'CSV load failed.');
      })
      .finally(() => { if (!cancelled) setSalesLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.salesCsvFilePath]); // eslint-disable-line react-hooks/exhaustive-deps

  function isRedFill(cell) {
    const style = cell?.s;
    if (!style) return false;
    // Check both fgColor (solid fill) and bgColor
    for (const key of ['fgColor', 'bgColor']) {
      const color = style[key];
      if (!color) continue;
      if (color.rgb) {
        // SheetJS stores as 8-char AARRGGBB or 6-char RRGGBB — handle both
        const rgb = color.rgb.length === 8 ? color.rgb.slice(2) : color.rgb;
        const r = parseInt(rgb.slice(0, 2), 16);
        const g = parseInt(rgb.slice(2, 4), 16);
        const b = parseInt(rgb.slice(4, 6), 16);
        if (r > 180 && g < 100 && b < 100) return true;
      }
      if (color.indexed === 10) return true; // Excel indexed red
      // Theme index 1 = Accent 2 = red in default Office theme
      if (color.theme === 1 && (color.tint == null || Math.abs(color.tint) < 0.15)) return true;
    }
    return false;
  }

  const handleCsvUpload = async (file) => {
    setSalesUploadError('');
    if (!file) return;
    if (file.size === 0) { setSalesUploadError('File is empty.'); return; }
    if (file.size > 2 * 1024 * 1024) { setSalesUploadError('File exceeds 2 MB limit.'); return; }
    const name = file.name?.toLowerCase() ?? '';
    const isXlsx = name.endsWith('.xlsx') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isCsv  = file.type === 'text/csv' || file.type === '' || name.endsWith('.csv');
    if (!isXlsx && !isCsv) { setSalesUploadError('Please upload a CSV or XLSX file.'); return; }

    let parsed;
    try {
      let text;
      if (isXlsx) {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array', cellStyles: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];

        // Find first red-highlighted data row by index (0-based, excluding header)
        let redDataRowIndex = null;
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        outer:
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && isRedFill(cell)) {
              redDataRowIndex = r - range.s.r - 1;
              console.log('[nomination] Red row found at data index', redDataRowIndex, '| cell:', XLSX.utils.encode_cell({r,c}), '| style:', JSON.stringify(cell.s));
              break outer;
            }
          }
        }
        if (redDataRowIndex === null) {
          // Log first few cells to help diagnose missing styles
          for (let r = range.s.r + 1; r <= Math.min(range.s.r + 3, range.e.r); r++) {
            for (let c = range.s.c; c <= Math.min(range.s.c + 2, range.e.c); c++) {
              const cell = ws[XLSX.utils.encode_cell({ r, c })];
              if (cell) console.log('[nomination] Sample cell', XLSX.utils.encode_cell({r,c}), '| s:', JSON.stringify(cell.s), '| v:', cell.v);
            }
          }
          console.log('[nomination] No red row detected');
        }

        text = XLSX.utils.sheet_to_csv(ws);
        parsed = parseSalesCsv(text);

        // Index-based match — direct and reliable regardless of address format
        if (redDataRowIndex !== null) {
          const match = parsed.rows[redDataRowIndex] ?? null;
          console.log('[nomination] Matched row:', match?.address ?? 'no match (index out of range)');
          setNominatedRow(match);
        } else {
          setNominatedRow(null);
        }
      } else {
        text = await file.text();
        parsed = parseSalesCsv(text);
        setNominatedRow(null); // CSV uploads clear any nomination
      }
    } catch (err) {
      setSalesUploadError(err.message || 'File parse failed.');
      return;
    }

    setSalesUploadStatus('uploading');
    const path = `pdr/${selected.id}/sales.csv`;
    const { error: uploadErr } = await supabase.storage
      .from('pdr-assets')
      .upload(path, file, { upsert: true, contentType: 'text/csv' });
    if (uploadErr) {
      setSalesUploadStatus('error');
      setSalesUploadError(uploadErr.message);
      return;
    }

    const { error: dbErr } = await supabase.from('request_pdr_details')
      .update({ sales_csv_file_path: path })
      .eq('request_id', selected.id);
    if (dbErr) {
      setSalesUploadStatus('error');
      setSalesUploadError('Uploaded but failed to save path: ' + dbErr.message);
      return;
    }

    setSalesRows(parsed.rows);
    setSalesRowCount(parsed.rowCount);
    setSalesWarnings(parsed.warnings);
    setSalesUploadStatus('done');
    onRefresh();
  };

  // ── Report generation state ───────────────────────────────────────────────
  const [reportGenerating,    setReportGenerating]    = useState(false);
  const [reportGenerateError, setReportGenerateError] = useState('');
  const [reportHtmlUrl,       setReportHtmlUrl]       = useState('');
  const [reportPdfUrl,        setReportPdfUrl]        = useState('');

  // Reset report URLs when request changes; load signed URLs if paths already exist
  useEffect(() => {
    let cancelled = false;
    setReportHtmlUrl(''); setReportPdfUrl('');
    if (!selected?.id || (!selected.reportHtmlPath && !selected.reportPdfPath)) {
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        // HTML: download bytes and create a local blob URL so the browser
        // always renders it as text/html regardless of storage Content-Type headers
        const [htmlDownload, pdfSigned] = await Promise.all([
          selected.reportHtmlPath
            ? supabase.storage.from('pdr-reports').download(selected.reportHtmlPath)
            : Promise.resolve(null),
          selected.reportPdfPath
            ? supabase.storage.from('pdr-reports').createSignedUrl(selected.reportPdfPath, 3600)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (htmlDownload?.error || pdfSigned?.error) {
          setReportGenerateError('Report links could not be loaded.');
          return;
        }
        if (htmlDownload?.data) {
          const text = await htmlDownload.data.text();
          if (!cancelled) {
            const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/html; charset=utf-8' }));
            setReportHtmlUrl(blobUrl);
          }
        }
        if (pdfSigned?.data?.signedUrl) setReportPdfUrl(pdfSigned.data.signedUrl);
      } catch {
        if (!cancelled) setReportGenerateError('Report links could not be loaded.');
      }
    })();

    return () => { cancelled = true; };
  }, [selected?.id, selected?.reportHtmlPath, selected?.reportPdfPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateReport = async () => {
    if (reportGenerating) return;
    if (!selected?.id) { setReportGenerateError('No request selected.'); return; }

    setReportGenerating(true);
    setReportGenerateError('');
    setReportHtmlUrl(''); setReportPdfUrl('');

    try {
      // 1. Build report data
      const report = buildPdrReportData({
        ...selected,
        heroStatement:    ful.hero_statement    || selected.heroStatement,
        viabilitySummary: ful.viability_summary || selected.viabilitySummary,
        supportingNotes:  ful.supporting_notes  || selected.supportingNotes,
      }, salesRows);
      if (!report) throw new Error('Could not build report data.');

      // Nominated row (red-highlighted in xlsx) overrides auto-selection
      if (nominatedRow) {
        report.bestFitProperty = {
          address:   nominatedRow.address   || null,
          suburb:    nominatedRow.suburb    || null,
          state:     nominatedRow.state     || null,
          postcode:  nominatedRow.postcode  || null,
          salePrice: nominatedRow.salePrice || null,
          beds:      nominatedRow.bedrooms  ?? null,
          baths:     nominatedRow.bathrooms ?? null,
          cars: null, landSize: null, floorSize: null, yearBuilt: null, imageUrl: null,
        };
      }
      // Image URL applies on top of whichever property was selected
      if (report.bestFitProperty && bestFitImageUrl.trim()) {
        report.bestFitProperty.imageUrl = bestFitImageUrl.trim();
      }

      // 2. Render HTML string — single source for both HTML file and PDF
      const logoUrl = window.location.origin + '/' + encodeURIComponent('No BG, Light Text.png');
      const htmlString = renderPdrReportHtml(report, { logoUrl });
      if (!htmlString || typeof htmlString !== 'string' || htmlString.trim().length < 100) {
        throw new Error('Could not render report HTML.');
      }

      // 3. Upload HTML first — preserved even if PDF generation fails
      const htmlPath = `pdr/${selected.id}/report.html`;
      const htmlBlob = new Blob([htmlString], { type: 'text/html' });
      const { error: htmlUploadErr } = await supabase.storage
        .from('pdr-reports')
        .upload(htmlPath, htmlBlob, { upsert: true, contentType: 'text/html; charset=utf-8' });
      if (htmlUploadErr) throw new Error('HTML upload failed: ' + htmlUploadErr.message);

      // 4. Generate PDF via server-side Playwright
      const pdfResponse = await fetch('/api/render-pdr-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: htmlString,
          requestId: selected.id,
        }),
      });

      if (!pdfResponse.ok) {
        let errMsg = 'PDF generation failed.';
        try {
          const errData = await pdfResponse.json();
          if (errData.error) errMsg = errData.error;
        } catch {}
        throw new Error(errMsg);
      }

      const pdfBlob = await pdfResponse.blob();
      if (!pdfBlob || pdfBlob.size === 0) throw new Error('Could not generate PDF.');

      // 5. Upload PDF — cleanup HTML on failure
      const pdfPath = `pdr/${selected.id}/report.pdf`;
      const { error: pdfUploadErr } = await supabase.storage
        .from('pdr-reports')
        .upload(pdfPath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
      if (pdfUploadErr) {
        try { await supabase.storage.from('pdr-reports').remove([htmlPath]); } catch { /* cleanup best-effort */ }
        throw new Error('PDF upload failed: ' + pdfUploadErr.message);
      }

      // 6. Save paths to DB — cleanup both files on failure
      const { error: dbErr } = await supabase.from('request_pdr_details')
        .update({ report_html_path: htmlPath, report_pdf_path: pdfPath })
        .eq('request_id', selected.id);
      if (dbErr) {
        try { await supabase.storage.from('pdr-reports').remove([htmlPath, pdfPath]); } catch { /* cleanup best-effort */ }
        throw new Error('Report paths not saved: ' + dbErr.message);
      }

      // 7. HTML: create local blob URL (bypasses Supabase storage Content-Type headers)
      //    PDF: signed URL (PDF viewer handles it correctly regardless of headers)
      const htmlBlobUrl = URL.createObjectURL(new Blob([htmlString], { type: 'text/html; charset=utf-8' }));
      setReportHtmlUrl(htmlBlobUrl);

      const pdfSigned = await supabase.storage.from('pdr-reports').createSignedUrl(pdfPath, 3600);
      if (pdfSigned.error) {
        setReportGenerateError('Report saved but PDF link could not be generated.');
      } else if (pdfSigned.data?.signedUrl) {
        setReportPdfUrl(pdfSigned.data.signedUrl);
      }

      // Auto-store permanent public viewer URL for broker-facing access
      const viewerUrl = `${window.location.origin}/api/report?id=${selected.id}`;
      await onUpdate(selected.id, { downloadUrl: viewerUrl });

      onRefresh();
    } catch (err) {
      setReportGenerateError(err.message || 'Report generation failed.');
    } finally {
      setReportGenerating(false);
    }
  };

  // ── Strategy state ────────────────────────────────────────────────────────
  const [stratEdits,  setStratEdits]  = useState({});
  const [stratSaving, setStratSaving] = useState(null);
  const [stratMsg,    setStratMsg]    = useState({});
  const [addingStrat, setAddingStrat] = useState(false);
  const [newStrat,    setNewStrat]    = useState(BLANK_STRAT);
  const [addSaving,   setAddSaving]   = useState(false);

  useEffect(() => {
    if (!selected) return;
    const edits = {};
    (selected.strategies || []).forEach(s => {
      edits[s.id] = {
        headline:             s.headline             || '',
        summary:              s.summary              || '',
        target_purchase_price: s.target_purchase_price != null ? String(s.target_purchase_price) : '',
        budget_amount:         s.budget_amount         != null ? String(s.budget_amount)         : '',
        projected_end_value:   s.projected_end_value   != null ? String(s.projected_end_value)   : '',
        supporting_notes:      s.supporting_notes      || '',
      };
    });
    setStratEdits(edits);
    setStratMsg({});
  }, [selected]);

  const setStratField = (id, k, v) => setStratEdits(prev => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  const toNum = v => (v === '' || v == null) ? null : Number(v);

  const saveStrategy = async s => {
    const e = stratEdits[s.id] || {};
    setStratSaving(s.id);
    try {
      await updateStrategy(s.id, {
        headline:              e.headline              || null,
        summary:               e.summary               || null,
        target_purchase_price: toNum(e.target_purchase_price),
        budget_amount:         toNum(e.budget_amount),
        projected_end_value:   toNum(e.projected_end_value),
        supporting_notes:      e.supporting_notes      || null,
      });
      await onRefresh();
      setStratMsg(prev => ({ ...prev, [s.id]: 'saved' }));
    } catch { setStratMsg(prev => ({ ...prev, [s.id]: 'error' })); }
    setStratSaving(null);
  };

  const handleDeleteStrategy = async id => {
    if (!window.confirm('Remove this strategy?')) return;
    await deleteStrategy(id);
    await onRefresh();
  };

  const handleMoveStrategy = async (idx, dir) => {
    const strats = [...(selected.strategies || [])];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= strats.length) return;
    [strats[idx], strats[swap]] = [strats[swap], strats[idx]];
    await reorderStrategies(strats.map(s => s.id));
    onRefresh();
  };

  const handleAddStrategy = async () => {
    setAddSaving(true);
    try {
      await addStrategy(selected.id, {
        strategy_type:         newStrat.strategy_type,
        headline:              newStrat.headline              || null,
        summary:               newStrat.summary               || null,
        target_purchase_price: toNum(newStrat.target_purchase_price),
        budget_amount:         toNum(newStrat.budget_amount),
        projected_end_value:   toNum(newStrat.projected_end_value),
        supporting_notes:      newStrat.supporting_notes      || null,
        sort_order:            (selected.strategies || []).length,
      });
      await onRefresh();
      setNewStrat(BLANK_STRAT);
      setAddingStrat(false);
    } catch { alert('Failed to add strategy. Please try again.'); }
    setAddSaving(false);
  };

  const openRequest = r => {
    setSelected(r); setAddingStrat(false); setNewStrat(BLANK_STRAT); setPreviewMode(false);
    setSalesRows([]); setSalesRowCount(0); setSalesWarnings([]);
    setSalesUploadStatus('idle'); setSalesUploadError('');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div className="page-title">Price Discovery Reports</div>
        <div className="page-sub">Review submitted briefs, add staff positioning, and manage strategic pathways</div>
      </div>
      <div className="card">
        <div className="row" style={{marginBottom:20,gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {["all","pending","in_review","in_progress","complete","cancelled"].map(f => (
            <button key={f} className={`btn ${filter===f?"btn-purple":"btn-secondary"} btn-sm`}
              onClick={()=>setFilter(f)} style={{textTransform:"capitalize",whiteSpace:"nowrap"}}>
              {f === "all" ? "All" : f.replace("_", " ")}
            </button>
          ))}
          <button className="btn btn-purple btn-sm" onClick={()=>navigate('/pdr-reports/new')} style={{marginLeft:"auto"}}>
            + New PDR
          </button>
        </div>
        <div className="req-table-wrap">
          <table className="tbl">
            <thead><tr><th>Client</th><th>Broker</th><th>Budget</th><th>Purpose</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.clientName}</strong><br/><span style={{fontSize:12,color:"#aaa"}}>{r.clientEmail}</span></td>
                  <td style={{fontSize:13,color:"#888"}}>{r.brokerName||<span style={{color:"#ccc"}}>Direct</span>}</td>
                  <td><span className="tag">{r.budgetMin?fmtMoney(r.budgetMin)+" – ":""}{fmtMoney(r.budgetMax)}</span></td>
                  <td><span className={`badge ${r.purpose==="investor"?"badge-cma":"badge-approved"}`}>{r.purpose==="investor"?"📈 Investor":"🏠 Owner"}</span></td>
                  <td style={{fontSize:13,color:"#888"}}>{fmt(r.createdAt)}</td>
                  <td><StatusBadge s={r.status} /></td>
                  <td><button className="btn btn-purple btn-sm" onClick={()=>openRequest(r)}>Open →</button></td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={7}><div className="empty"><div className="empty-icon">🔍</div>No PDR requests found</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="req-cards">
          {filtered.map(r => (
            <div key={r.id} className="req-card">
              <div className="req-card-name">{r.clientName}</div>
              <div className="req-card-sub">{r.clientEmail}</div>
              <div className="req-card-sub">{r.brokerName ? `Via ${r.brokerName}` : "Direct submission"}</div>
              <div className="req-card-sub">{r.budgetMin?`${fmtMoney(r.budgetMin)} – `:""}{fmtMoney(r.budgetMax)}</div>
              <div className="req-card-date">{fmt(r.createdAt)}</div>
              <StatusBadge s={r.status} />
              <div className="req-card-actions">
                <button className="btn btn-purple btn-sm" onClick={()=>openRequest(r)}>Open →</button>
              </div>
            </div>
          ))}
          {filtered.length===0 && <div className="empty"><div className="empty-icon">📭</div>No PDR requests found</div>}
        </div>
      </div>

      {selected && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setSelected(null)}>
          <div className="modal" style={{maxWidth:860,width:"95vw",overflowY:"auto",maxHeight:"90vh"}}>

            {/* Header */}
            <div className="row-between" style={{marginBottom:20}}>
              <div>
                <div className="modal-title" style={{marginBottom:4}}>Price Discovery Report</div>
                <div style={{fontSize:13,color:"#888"}}>{selected.clientName} · {fmt(selected.createdAt)}</div>
              </div>
              <div className="row" style={{gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <StatusBadge s={selected.status} />
                <select
                  value={selected.status}
                  onChange={async e => { await onUpdate(selected.id, { status: e.target.value }); onRefresh(); }}
                  style={{fontSize:12,padding:"4px 8px",border:"1px solid var(--border-strong)",borderRadius:4,background:"var(--card)",color:"var(--text)"}}
                >
                  {["pending","in_review","in_progress","complete","cancelled"].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g," ")}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm" onClick={()=>setSelected(null)}>✕ Close</button>
              </div>
            </div>

            {/* ── Edit / Preview toggle ───────────────────────────────── */}
            <div className="row" style={{gap:8,marginBottom:20,borderBottom:"1px solid var(--border)",paddingBottom:16}}>
              <button className={`btn btn-sm ${!previewMode ? 'btn-purple' : 'btn-secondary'}`}
                onClick={() => setPreviewMode(false)}>✏️ Edit</button>
              <button className={`btn btn-sm ${previewMode ? 'btn-purple' : 'btn-secondary'}`}
                onClick={() => setPreviewMode(true)}>👁 Preview Report</button>
            </div>

            {previewMode
              ? (() => {
                  const r = buildPdrReportData({
                    ...selected,
                    heroStatement:    ful.hero_statement    || selected.heroStatement,
                    viabilitySummary: ful.viability_summary || selected.viabilitySummary,
                    supportingNotes:  ful.supporting_notes  || selected.supportingNotes,
                  }, salesRows);
                  if (r && nominatedRow) {
                    r.bestFitProperty = {
                      address:   nominatedRow.address   || null,
                      suburb:    nominatedRow.suburb    || null,
                      state:     nominatedRow.state     || null,
                      postcode:  nominatedRow.postcode  || null,
                      salePrice: nominatedRow.salePrice || null,
                      beds:      nominatedRow.bedrooms  ?? null,
                      baths:     nominatedRow.bathrooms ?? null,
                      cars: null, landSize: null, floorSize: null, yearBuilt: null, imageUrl: null,
                    };
                  }
                  if (r?.bestFitProperty && bestFitImageUrl.trim()) {
                    r.bestFitProperty.imageUrl = bestFitImageUrl.trim();
                  }
                  return <PdrReportPreview report={r} />;
                })()
              : <>

            {/* ── Section 1: Submitted Brief ───────────────────────────── */}
            <div className="pdr-section-label">Submitted Brief</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 24px",marginBottom:16}}>
              <Detail label="Client Name"   val={selected.clientName} />
              <Detail label="Client Email"  val={selected.clientEmail} />
              <Detail label="Mobile"        val={selected.clientMobile||"—"} />
              <Detail label="Source"        val={getRequestSourceLabel(selected.source)} />
              {selected.brokerName && (
                <Detail label="Submitted By" val={`${selected.brokerName}${selected.brokerCompany?` · ${selected.brokerCompany}`:""}`} />
              )}
              <Detail label="Purpose"  val={selected.purpose==="investor"?"📈 Investor":"🏠 Owner-Occupier"} />
              <Detail label="Budget"   val={`${selected.budgetMin?fmtMoney(selected.budgetMin)+" – ":""}${fmtMoney(selected.budgetMax)}`} />
              {selected.purpose==="investor" && selected.rentalYield && (
                <Detail label="Yield Target" val={`${selected.rentalYield}% p.a.`} />
              )}
              <Detail label="Property Types" val={(selected.propertyTypes||[]).join(", ")||"—"} />
              <Detail label="Bedrooms"   val={selected.bedrooms||"Any"} />
              <Detail label="Bathrooms"  val={selected.bathrooms||"Any"} />
              <Detail label="Preferred Suburbs" val={selected.locations||"—"} full />
              {selected.notes && <Detail label="Client Notes" val={selected.notes} full />}
            </div>

            <div className="divider" />

            {/* ── Section 2: Staff Positioning ─────────────────────────── */}
            <div className="pdr-section-label">Staff Positioning</div>
            <div className="field">
              <label>Hero Statement</label>
              <textarea value={ful.hero_statement} rows={3} style={{resize:"vertical"}}
                placeholder="High-level positioning statement for this client's brief…"
                onChange={e => setFul(f => ({...f, hero_statement: e.target.value}))} />
            </div>
            <div className="field">
              <label>Viability Summary</label>
              <textarea value={ful.viability_summary} rows={3} style={{resize:"vertical"}}
                placeholder="Overall assessment of what's achievable within this brief…"
                onChange={e => setFul(f => ({...f, viability_summary: e.target.value}))} />
            </div>
            <div className="field">
              <label>Supporting Notes <span style={{fontWeight:400,color:"#bbb"}}>(internal)</span></label>
              <textarea value={ful.supporting_notes} rows={2} style={{resize:"vertical"}}
                placeholder="Research context, caveats, internal analysis…"
                onChange={e => setFul(f => ({...f, supporting_notes: e.target.value}))} />
            </div>
            <div className="row" style={{justifyContent:"flex-end",alignItems:"center",gap:12,marginBottom:4}}>
              {fulMsg==="saved" && <span style={{fontSize:12,color:"#2a5c3a"}}>✓ Saved</span>}
              {fulMsg==="error" && <span style={{fontSize:12,color:"#8b2020"}}>Save failed — try again</span>}
              <button className="btn btn-purple" onClick={saveFulfilment} disabled={fulSaving}>
                {fulSaving ? "Saving…" : "Save Positioning"}
              </button>
            </div>

            <div className="divider" />

            {/* ── Market Evidence ───────────────────────────────────────── */}
            <div className="pdr-section-label">Market Evidence</div>
            <div style={{marginBottom:12}}>
              {selected.salesCsvFilePath && (
                <div style={{fontSize:12, color:'#aaa', marginBottom:6}}>
                  Attached: {selected.salesCsvFilePath.split('/').pop()}
                </div>
              )}
              <label className="form-label">Upload Sales CSV</label>
              <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => handleCsvUpload(e.target.files[0])}
                style={{display:'block', marginBottom:8}} />
              {salesLoading && (
                <span style={{color:'#aaa', fontSize:13}}>Loading saved CSV…</span>
              )}
              {!salesLoading && salesUploadStatus === 'uploading' && (
                <span style={{color:'#aaa', fontSize:13}}>Uploading…</span>
              )}
              {!salesLoading && salesUploadStatus === 'done' && (
                <span style={{color:'#7cfc00', fontSize:13}}>
                  ✓ {salesRowCount} row{salesRowCount !== 1 ? 's' : ''} parsed
                </span>
              )}
              {salesUploadError && (
                <span style={{color:'#f66', fontSize:13, display:'block'}}>{salesUploadError}</span>
              )}
              {salesWarnings.length > 0 && (
                <ul style={{color:'#f0a500', fontSize:12, margin:'4px 0 0 16px', padding:0}}>
                  {salesWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {nominatedRow && (
                <div style={{marginTop:6, fontSize:12, color:'#7cfc00', display:'flex', alignItems:'center', gap:8}}>
                  <span>★ Nominated: {nominatedRow.address}</span>
                  <button className="btn btn-secondary btn-sm" style={{fontSize:11, padding:'1px 8px'}}
                    onClick={() => setNominatedRow(null)}>Clear</button>
                </div>
              )}
            </div>

            <div style={{marginTop:12}}>
              <label className="form-label">Best-Fit Property Image URL</label>
              <input
                type="url"
                value={bestFitImageUrl}
                onChange={e => setBestFitImageUrl(e.target.value)}
                placeholder="https://..."
                style={{display:'block', width:'100%', marginBottom:4}}
              />
              <span style={{fontSize:12, color:'#aaa'}}>
                Paste a direct image URL for the best-fit property photo in the PDF.
              </span>
            </div>

            <div className="divider" />

            {/* ── Section 3: Strategic Pathways ────────────────────────── */}
            <div className="row-between" style={{marginBottom:14}}>
              <div className="pdr-section-label" style={{marginBottom:0}}>Strategic Pathways</div>
              {!addingStrat && (
                <button className="btn btn-secondary btn-sm" onClick={()=>setAddingStrat(true)}>+ Add Strategy</button>
              )}
            </div>

            {(selected.strategies||[]).length === 0 && !addingStrat && (
              <div style={{fontSize:13,color:"#aaa",marginBottom:16,fontStyle:"italic"}}>
                No strategies added yet. Click + Add Strategy to begin.
              </div>
            )}

            {(selected.strategies||[]).map((s, idx) => {
              const e    = stratEdits[s.id] || {};
              const msg  = stratMsg[s.id];
              const last = idx === (selected.strategies.length - 1);
              return (
                <div key={s.id} className="strategy-card">
                  <div className="strategy-card-header">
                    <div style={{fontWeight:700,fontSize:13,color:"var(--primary)"}}>
                      {STRATEGY_LABEL[s.strategy_type] || s.strategy_type}
                    </div>
                    <div className="row" style={{gap:6}}>
                      <button className="btn btn-secondary btn-sm" onClick={()=>handleMoveStrategy(idx,'up')}  disabled={idx===0}  title="Move up">↑</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>handleMoveStrategy(idx,'down')} disabled={last} title="Move down">↓</button>
                      <button className="btn btn-danger btn-sm"    onClick={()=>handleDeleteStrategy(s.id)}>Remove</button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Headline</label>
                    <input value={e.headline||''} placeholder="e.g. Unlock equity through strategic improvement…"
                      onChange={ev => setStratField(s.id,'headline',ev.target.value)} />
                  </div>
                  <div className="field">
                    <label>Summary</label>
                    <textarea value={e.summary||''} rows={3} style={{resize:"vertical"}}
                      placeholder="Describe this strategic pathway in client-friendly language…"
                      onChange={ev => setStratField(s.id,'summary',ev.target.value)} />
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 16px"}}>
                    <div className="field">
                      <label>Target Purchase Price</label>
                      <div style={{position:"relative"}}>
                        <span style={{position:"absolute",left:10,top:11,color:"#aaa",fontSize:13}}>$</span>
                        <input type="number" min="0" value={e.target_purchase_price||''} placeholder="600000" style={{paddingLeft:22}}
                          onChange={ev => setStratField(s.id,'target_purchase_price',ev.target.value)} />
                      </div>
                    </div>
                    <div className="field">
                      <label>Budget / Works</label>
                      <div style={{position:"relative"}}>
                        <span style={{position:"absolute",left:10,top:11,color:"#aaa",fontSize:13}}>$</span>
                        <input type="number" min="0" value={e.budget_amount||''} placeholder="50000" style={{paddingLeft:22}}
                          onChange={ev => setStratField(s.id,'budget_amount',ev.target.value)} />
                      </div>
                    </div>
                    <div className="field">
                      <label>Projected End Value</label>
                      <div style={{position:"relative"}}>
                        <span style={{position:"absolute",left:10,top:11,color:"#aaa",fontSize:13}}>$</span>
                        <input type="number" min="0" value={e.projected_end_value||''} placeholder="750000" style={{paddingLeft:22}}
                          onChange={ev => setStratField(s.id,'projected_end_value',ev.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div className="field">
                    <label>Supporting Notes <span style={{fontWeight:400,color:"#bbb"}}>(internal)</span></label>
                    <textarea value={e.supporting_notes||''} rows={2} style={{resize:"vertical"}}
                      placeholder="Research, comparables, caveats…"
                      onChange={ev => setStratField(s.id,'supporting_notes',ev.target.value)} />
                  </div>
                  <div className="row" style={{justifyContent:"flex-end",alignItems:"center",gap:10}}>
                    {msg==="saved" && <span style={{fontSize:12,color:"#2a5c3a"}}>✓ Saved</span>}
                    {msg==="error" && <span style={{fontSize:12,color:"#8b2020"}}>Save failed</span>}
                    <button className="btn btn-purple btn-sm" onClick={()=>saveStrategy(s)} disabled={stratSaving===s.id}>
                      {stratSaving===s.id ? "Saving…" : "Save Strategy"}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add Strategy form */}
            {addingStrat && (
              <div className="strategy-card strategy-card-new">
                <div className="pdr-section-label" style={{marginBottom:12}}>New Strategy</div>
                <div className="field">
                  <label>Strategy Type</label>
                  <select value={newStrat.strategy_type} onChange={e=>setNewStrat(s=>({...s,strategy_type:e.target.value}))}
                    style={{width:"100%",padding:"9px 12px",border:"1px solid var(--border-strong)",borderRadius:6,background:"var(--card)",color:"var(--text)",fontSize:14}}>
                    {STRATEGY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Headline</label>
                  <input value={newStrat.headline} placeholder="e.g. Unlock equity through strategic improvement…"
                    onChange={e=>setNewStrat(s=>({...s,headline:e.target.value}))} />
                </div>
                <div className="field">
                  <label>Summary</label>
                  <textarea value={newStrat.summary} rows={3} style={{resize:"vertical"}}
                    placeholder="Describe this strategic pathway…"
                    onChange={e=>setNewStrat(s=>({...s,summary:e.target.value}))} />
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 16px"}}>
                  <div className="field">
                    <label>Target Purchase Price</label>
                    <div style={{position:"relative"}}>
                      <span style={{position:"absolute",left:10,top:11,color:"#aaa",fontSize:13}}>$</span>
                      <input type="number" min="0" value={newStrat.target_purchase_price} placeholder="600000" style={{paddingLeft:22}}
                        onChange={e=>setNewStrat(s=>({...s,target_purchase_price:e.target.value}))} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Budget / Works</label>
                    <div style={{position:"relative"}}>
                      <span style={{position:"absolute",left:10,top:11,color:"#aaa",fontSize:13}}>$</span>
                      <input type="number" min="0" value={newStrat.budget_amount} placeholder="50000" style={{paddingLeft:22}}
                        onChange={e=>setNewStrat(s=>({...s,budget_amount:e.target.value}))} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Projected End Value</label>
                    <div style={{position:"relative"}}>
                      <span style={{position:"absolute",left:10,top:11,color:"#aaa",fontSize:13}}>$</span>
                      <input type="number" min="0" value={newStrat.projected_end_value} placeholder="750000" style={{paddingLeft:22}}
                        onChange={e=>setNewStrat(s=>({...s,projected_end_value:e.target.value}))} />
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Supporting Notes <span style={{fontWeight:400,color:"#bbb"}}>(optional)</span></label>
                  <textarea value={newStrat.supporting_notes} rows={2} style={{resize:"vertical"}}
                    placeholder="Research, comparables, caveats…"
                    onChange={e=>setNewStrat(s=>({...s,supporting_notes:e.target.value}))} />
                </div>
                <div className="row" style={{justifyContent:"flex-end",gap:10}}>
                  <button className="btn btn-secondary btn-sm" onClick={()=>{setAddingStrat(false);setNewStrat(BLANK_STRAT);}}>Cancel</button>
                  <button className="btn btn-purple btn-sm" onClick={handleAddStrategy} disabled={addSaving}>
                    {addSaving ? "Adding…" : "Add Strategy"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Report Output ─────────────────────────────────────────── */}
            <div className="divider" />
            <div className="pdr-section-label">Report Output</div>
            <div style={{marginBottom:8}}>
              <button
                className="btn btn-purple"
                onClick={handleGenerateReport}
                disabled={reportGenerating}
                style={{marginBottom:12}}
              >
                {reportGenerating
                  ? 'Generating…'
                  : (reportHtmlUrl || selected.reportHtmlPath)
                    ? 'Regenerate Report'
                    : 'Generate Report'}
              </button>

              {reportGenerating && (
                <div style={{color:'#aaa', fontSize:13, marginBottom:8}}>Generating report…</div>
              )}
              {reportGenerateError && (
                <div style={{color:'#f66', fontSize:13, marginBottom:8}}>{reportGenerateError}</div>
              )}

              {(reportHtmlUrl || reportPdfUrl) && (
                <div style={{marginTop:4}}>
                  <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:10}}>
                    {reportHtmlUrl && (
                      <a href={`${window.location.origin}/api/report?id=${selected.id}`} target="_blank" rel="noreferrer"
                        className="btn btn-secondary btn-sm">
                        Open HTML Report
                      </a>
                    )}
                    {reportPdfUrl && (
                      <a href={reportPdfUrl} download={`pdr-${selected.id}.pdf`}
                        className="btn btn-secondary btn-sm">
                        Download PDF
                      </a>
                    )}
                  </div>
                  {reportHtmlUrl && (
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <input
                        readOnly
                        value={`${window.location.origin}/api/report?id=${selected.id}`}
                        style={{fontSize:12, color:'#555', background:'#f5f7fa', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', flex:1, minWidth:0}}
                        onFocus={e => e.target.select()}
                      />
                      <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/report?id=${selected.id}`)}>Copy</button>
                    </div>
                  )}
                </div>
              )}
              {!reportHtmlUrl && !reportPdfUrl
                && (selected.reportHtmlPath || selected.reportPdfPath)
                && !reportGenerating
                && !reportGenerateError && (
                <div style={{color:'#aaa', fontSize:12}}>Previously generated — links loading…</div>
              )}
            </div>

              </>
            }

            {/* Footer */}
            <div className="row" style={{justifyContent:"space-between",gap:10}}>
              <button className="btn btn-danger btn-sm" onClick={()=>{
                if(window.confirm("Delete this PDR request? This cannot be undone.")) { onDelete(selected.id); setSelected(null); }
              }}>Delete Request</button>
              <button className="btn btn-secondary" onClick={()=>setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
