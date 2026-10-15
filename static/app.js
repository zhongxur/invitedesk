// InviteDesk front-end — plain ES module, no build step, no network dependencies.
// Hash routes: #/today  #/welcome  #/directory[/gid]  #/team  #/usage
//              #/event/<id>/<tab>[/<sub>][?p=<personId>&f=<drivePath>]

/* ================================================================== utilities */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]));
const num = (v) => Number(v) || 0;
const fmtInt = (n) => Math.round(num(n)).toLocaleString("en-US");
const fmtTok = (n) => {
  n = num(n);
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1) + "k";
  return fmtInt(n);
};
const fmtCost = (n) => {
  n = num(n);
  if (n === 0) return "$0.00";
  if (n < 0.01) return "$" + n.toFixed(4);
  if (n < 1) return "$" + n.toFixed(3);
  return "$" + n.toFixed(2);
};
const fmtUSD = (n) => "$" + num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const asDate = (iso) => new Date(iso + "T12:00:00");
const weekdayOf = (iso) => (isISODate(iso) ? asDate(iso).toLocaleDateString("en-US", { weekday: "long" }) : "");
function fmtDate(iso, opts = {}) {
  if (!iso) return "";
  if (!isISODate(String(iso).slice(0, 10))) return String(iso);
  const d = asDate(String(iso).slice(0, 10));
  const s = d.toLocaleDateString("en-US", { weekday: opts.weekday === false ? undefined : "short", month: "short", day: "numeric", year: opts.year === false ? undefined : "numeric" });
  return s;
}
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return String(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
function daysBetween(a, b) { return Math.round((asDate(b) - asDate(a)) / 86400000); }
function relDue(iso) {
  if (!isISODate(iso)) return "";
  const d = daysBetween(todayISO(), iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d < 0 ? `${-d} days overdue` : `in ${d} days`;
}
const HONORIFIC = /^(dr|prof|mr|mrs|ms|mx|sir|dame|hon|rev)\.?$/i;
function initials(name) {
  const s = (name || "?").trim();
  const latin = s.replace(/[\u3400-\u9fff\uf900-\ufaff]+/g, " ").replace(/[()\uff08\uff09]/g, " ").trim();
  const words = latin.split(/\s+/).filter((w) => w && !HONORIFIC.test(w) && /[A-Za-z]/.test(w));
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  const cjk = s.match(/[\u3400-\u9fff]/);
  return cjk ? cjk[0] : (s[0] || "?").toUpperCase();
}
function hueOf(str) { let h = 7; for (const ch of String(str || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; }
function avatar(name, size = "") {
  return `<span class="av ${size}" style="--h:${hueOf(name)}" title="${esc(name || "")}" aria-hidden="true">${esc(initials(name))}</span>`;
}
function shortName(n) {
  n = (n || "").trim();
  const latin = n.replace(/[\u3400-\u9fff]+/g, "").replace(/[()\uff08\uff09]/g, " ").replace(/\s+/g, " ").trim();
  if (!latin) return n.slice(0, 5);
  const w = latin.split(" ");
  if (w.length > 1 && HONORIFIC.test(w[0])) return `${w[0]} ${w[w.length - 1]}`;
  if (latin.length <= 14) return latin;
  if (w.length >= 3) return latin.slice(0, 15).trim() + "…";
  return w[0];
}
function personCell(name, sub, size = "") {
  return `<div class="person">${avatar(name, size)}<div><div class="nm" title="${esc(name)}">${esc(name)}</div>${sub ? `<div class="al" title="${esc(sub)}">${esc(sub)}</div>` : ""}</div></div>`;
}
function skel(n = 2) {
  return `<div class="skel-wrap" aria-label="Loading">${Array.from({ length: n }, () => `<div class="skel-card"><div class="skeleton h"></div><div class="skeleton w80"></div><div class="skeleton w60"></div><div class="skeleton w30"></div></div>`).join("")}</div>`;
}
const SEAL = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="8" width="34" height="24" rx="4" fill="#F4EEFB" stroke="#140C20" stroke-width="1.2"/><path d="M4.5 10 20 21.5 35.5 10" fill="none" stroke="#140C20" stroke-opacity=".45" stroke-width="1.2"/><circle cx="20" cy="23" r="8.8" fill="none" stroke="#2DD4BF" stroke-width="1.8" stroke-dasharray="1.6 1.1"/><circle cx="20" cy="23" r="7.3" fill="#2DD4BF"/><circle cx="20" cy="23" r="5.1" fill="none" stroke="#06201F" stroke-opacity=".35" stroke-width=".8"/><path d="m17.4 23.2 1.8 1.7 3.4-3.6" fill="none" stroke="#06201F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function illus(ic) {
  return `<svg class="illus" viewBox="0 0 120 84" aria-hidden="true"><ellipse cx="62" cy="76" rx="42" ry="5" fill="var(--surface-3)"/>
    <rect x="20" y="16" width="62" height="46" rx="7" fill="var(--surface-2)" stroke="var(--border-strong)" transform="rotate(-7 51 39)"/>
    <rect x="34" y="18" width="64" height="48" rx="7" fill="var(--surface)" stroke="var(--border-strong)"/>
    <path d="M36 22 66 43l30-21" fill="none" stroke="var(--border-strong)"/>
    <circle cx="66" cy="47" r="13" fill="var(--brass-soft)" stroke="var(--brass)" stroke-dasharray="2 1.6"/>
    <svg x="58" y="39" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brass-ink)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[ic] || ICONS.mail}</svg></svg>`;
}
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + "s"}`;
const fv = (x) => (x == null ? "" : typeof x === "object" ? x.value || "" : String(x));
const isURL = (s) => /^https?:\/\//i.test(s || "");
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
function hrefFor(v) {
  v = (v || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) return "mailto:" + v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return "https://" + v;
  return "";
}
function linkify(v) {
  const h = hrefFor(v);
  return h ? `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v);
}
const store = {
  get(k, d) { try { const v = localStorage.getItem("invitedesk." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("invitedesk." + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

/* ================================================================== icons (inline, feather-style) */

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  chevron: '<polyline points="9 18 15 12 9 6"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  logo: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M4 7l8 6 8-6"/>',
  camera: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
};
const icon = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

/* ================================================================== vocabularies */

const PSTATUS = {
  confirmed: ["Confirmed", "", "green"],
  likely: ["Likely", "", "teal"],
  pending: ["Pending", "", "amber"],
  contacted_no_reply: ["No reply yet", "", "orange"],
  declined: ["Declined", "", "red"],
  not_started: ["Not started", "", "gray"],
  backup: ["Backup", "", "blue"],
  unknown: ["Unknown", "", "gray"],
};
const DSTATUS = {
  needs_changes: ["Needs changes", "", "amber"],
  blocked: ["Blocked by reviewer", "", "red"],
  ready_for_review: ["Ready for review", "", "blue"],
  in_review: ["In review", "", "purple"],
  approved: ["Approved", "", "green"],
  sent: ["Sent", "", "teal"],
  discarded: ["Discarded", "", "gray"],
  draft: ["Draft", "", "gray"],
  superseded: ["Superseded", "", "gray"],
};
const DRAFT_ORDER = ["needs_changes", "blocked", "ready_for_review", "in_review", "approved", "sent", "draft", "discarded"];
const EVSTATUS = {
  imported: ["Imported · agents not run yet", "gray"],
  running: ["Agents running", "teal"],
  done: ["Done", "green"],
  budget_stop: ["Stopped at budget cap", "amber"],
  error: ["Error", "red"],
  demo: ["Demo snapshot", "purple"],
};
const RUNSTATUS = { running: ["Running", "teal"], done: ["Done", "green"], budget_stop: ["Stopped at budget cap", "amber"], error: ["Error", "red"], demo: ["Demo snapshot", "purple"] };
const runLabel = (st) => (RUNSTATUS[st] || [String(st || "—").replace(/_/g, " ")])[0];
const runChip = (st) => chip(esc(runLabel(st)), (RUNSTATUS[st] || [0, "gray"])[1], "sq");
const CHANNELS = {
  email: "Email", agency_email: "Agency email", instagram: "Instagram", wechat: "WeChat", weibo: "Weibo",
  xiaohongshu: "Xiaohongshu (RED)", phone: "Phone", linkedin: "LinkedIn", website: "Website", management: "Management",
  intermediary: "Intermediary", other: "Other",
};
const ROUTE_TYPES = {
  existing_thread: "Existing thread", intermediary_intro: "Intro via intermediary", official_management: "Official management",
  direct_dm: "Direct message", partner_org: "Partner organisation", public_contact: "Public contact", in_person: "In person",
};
const DKIND = { invitation: "Invitation", intro_request: "Intro request", follow_up: "Follow-up", sponsor_ask: "Sponsor ask", logistics: "Logistics" };
const LANGS = { "zh-Hans": "Simplified Chinese", "zh-Hant": "Traditional Chinese", en: "English", bilingual: "Bilingual" };
const ISSUE_KIND = { conflict: ["Conflict", "red"], consistency: ["Consistency", "amber"], claim: ["Unverified claim", "blue"], injection: ["Prompt injection", "pink"] };
const VERDICT = { pass: ["Passed review", "green", "check"], needs_changes: ["Needs changes", "amber", "edit"], block: ["Blocked", "red", "x"] };
const OUTCOME = {
  accepted: ["Accepted", "green"], declined: ["Declined", "red"], interested_needs_info: ["Interested — needs info", "teal"],
  redirected: ["Redirected", "blue"], scheduling: ["Scheduling", "purple"], no_clear_answer: ["No clear answer", "gray"],
  suspicious: ["Suspicious", "red"],
};

const chip = (label, tone = "gray", extra = "") => `<span class="chip tone-${tone} ${extra}">${label}</span>`;
function pStatusChip(s, withZh = true) {
  const [en, zh, tone] = PSTATUS[s] || [s || "—", "", "gray"];
  return chip(`<span class="dot"></span>${esc(en)}${withZh && zh ? ` <span style="opacity:.7;font-weight:500">${zh}</span>` : ""}`, tone);
}
function dStatusChip(s) {
  if (!s) return `<span class="faint small">—</span>`;
  const [en, , tone] = DSTATUS[s] || [s, "", "gray"];
  return chip(esc(en), tone, "sq");
}
const tierBadge = (t) => `<span class="tier ${t && "ABC".includes(t) ? t : "none"}" title="${t ? "Tier " + t : "Not tiered yet"}">${esc(t || "–")}</span>`;
const CH_ICON = { email: "mail", agency_email: "briefcase", management: "briefcase", instagram: "camera", wechat: "msg", phone: "phone", website: "globe", intermediary: "users", other: "link" };
const CH_TEXT = { linkedin: "in", weibo: "Wb", xiaohongshu: "RED" };
function chBadge(c) {
  const title = `${CHANNELS[c.channel] || c.channel}: ${c.value || ""}${c.verified ? " · from your files" : " · public / unverified"}`;
  const inner = CH_ICON[c.channel] ? icon(CH_ICON[c.channel]) : esc(CH_TEXT[c.channel] || (c.channel || "?").slice(0, 2));
  return `<span class="chi ${c.verified ? "" : "unv"}" title="${esc(title)}">${inner}</span>`;
}
function shortCh(ch) {
  return { email: "Email", agency_email: "Agency", instagram: "IG", wechat: "WeChat", weibo: "Weibo", xiaohongshu: "RED", phone: "Phone",
    linkedin: "LinkedIn", website: "Web", management: "Mgmt", intermediary: "Intro", other: "Other" }[ch] || ch;
}
function routeSummary(r, name = "") {
  if (!r) return `<span class="faint small">No route yet</span>`;
  const via = ((r.via || "").split(/[,(\uff08]/)[0] || "").trim();
  const label = ROUTE_TYPES[r.route_type] || r.route_type;
  const full = `${label}${r.via ? " via " + r.via : ""} (${r.channel || ""}) · ${r.warmth}${r.next_action ? "\nNext: " + r.next_action : ""}`;
  return `<span class="mchain" title="${esc(full)}"><span class="wdot ${esc(r.warmth)}"></span>${via ? `<span class="via">${esc(shortName(via))}</span>` : `<span class="rt">${esc(label)}</span>`}<span class="arr">→</span>${name ? avatar(name, "xs") : `<span class="to">${esc(r.channel || "")}</span>`}</span>`;
}
function evStatusChip(s) {
  const [label, tone] = EVSTATUS[s] || [s || "—", "gray"];
  return chip(`<span class="dot"></span>${esc(label)}`, tone);
}
function emptyState(ic, title, text, actions = "", sm = false) {
  return `<div class="empty ${sm ? "sm" : ""}">${illus(ic)}<h4>${title}</h4>${text ? `<p>${text}</p>` : ""}${actions ? `<div class="btn-row">${actions}</div>` : ""}</div>`;
}
function srcTip(x, title = "Sources") {
  const srcs = (x && x.sources) || [];
  if (!srcs.length) return "";
  return `<span class="tip" tabindex="0" aria-label="Show sources">${icon("info")}<span class="tip-body" role="tooltip"><span class="t">${title}</span>${srcs
    .map((s) => `<span class="src"><span class="doc">${esc(s.document)}</span>“${esc(s.quote)}”</span>`).join("")}</span></span>`;
}
function infoTip(text) {
  return `<span class="tip" tabindex="0">${icon("info")}<span class="tip-body" role="tooltip">${text}</span></span>`;
}

/* ================================================================== API, toasts, modal */

class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function api(path, { method = "GET", body, form } = {}) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, opts); }
  catch { throw new ApiError("Cannot reach the InviteDesk server. Is `uv run app.py` still running?", 0); }
  const ct = res.headers.get("content-type") || "";
  let data = null;
  try { data = ct.includes("json") ? await res.json() : await res.text(); } catch { data = null; }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    if (data && typeof data === "object" && data.detail) {
      msg = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail) ? data.detail.map((d) => d.msg || JSON.stringify(d)).join("; ") : JSON.stringify(data.detail);
    } else if (res.status >= 500) msg = "The server hit an error (" + res.status + "). Check the terminal running app.py.";
    throw new ApiError(msg, res.status);
  }
  return data;
}

function toast(msg, type = "info", ms = 4200) {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === "error" ? "alert" : type === "ok" ? "check" : "info")}<div>${msg}</div><button class="x" aria-label="Dismiss">${icon("x")}</button>`;
  el.querySelector(".x").onclick = () => el.remove();
  box.appendChild(el);
  setTimeout(() => el.remove(), type === "error" ? 8000 : ms);
}
const toastErr = (e) => toast(esc(e && e.message ? e.message : String(e)), "error");

function openModal({ title, sub = "", body, foot = "", onMount, wide = false }) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-wrap" data-modal-bg><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${wide ? "width:min(760px,100%)" : ""}">
    <div class="modal-head"><div><h3>${title}</h3>${sub ? `<div class="page-sub">${sub}</div>` : ""}</div>
    <button class="btn ghost sm" data-act="close-modal" aria-label="Close">${icon("x")}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ""}</div></div>`;
  const bg = $("[data-modal-bg]", root);
  bg.addEventListener("mousedown", (e) => { if (e.target === bg) closeModal(); });
  if (onMount) onMount($(".modal", root));
  const first = $(".modal input:not([type=file]), .modal select, .modal textarea, .modal .opt", root);
  if (first) first.focus();
}
function closeModal() { $("#modal-root").innerHTML = ""; }

function confirmBox(title, text, okLabel = "Confirm", danger = false) {
  return new Promise((resolve) => {
    openModal({
      title, body: `<p class="muted" style="font-size:13.5px">${text}</p>`,
      foot: `<button class="btn" data-cf="no">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-cf="yes">${okLabel}</button>`,
      onMount(m) {
        m.querySelector('[data-cf="no"]').onclick = () => { closeModal(); resolve(false); };
        m.querySelector('[data-cf="yes"]').onclick = () => { closeModal(); resolve(true); };
        setTimeout(() => m.querySelector('[data-cf="yes"]').focus(), 0);
      },
    });
  });
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${label || "Working…"}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

function parseCSV(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

function renderMd(src) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  let html = "", list = 0;
  const close = () => { while (list > 0) { html += "</ul>"; list--; } };
  for (const line of src.split("\n")) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (h) { close(); const n = Math.min(h[1].length, 3); html += `<h${n}>${inline(h[2])}</h${n}>`; }
    else if (li) {
      const depth = li[1].length >= 2 ? 2 : 1;
      while (list < depth) { html += "<ul>"; list++; }
      while (list > depth) { html += "</ul>"; list--; }
      html += `<li>${inline(li[2])}</li>`;
    } else if (!line.trim()) close();
    else { close(); html += `<p>${inline(line)}</p>`; }
  }
  close();
  return `<div class="md">${html}</div>`;
}

/* ================================================================== state & routing */

const S = {
  health: null,
  events: [],
  today: null,
  route: { parts: [], query: new URLSearchParams() },
  mainKey: null,
  ev: null, // current event detail
  evId: null,
  trace: {}, // eid -> {entries:[], lastId}
  poll: null, // {eid, timer}
  planning: new Set(), // person ids being planned
  generating: null, // {eid, brief}
  draftDirty: false,
  runSel: null,
  guestsFilter: store.get("guestsFilter", { q: "", tier: "", status: "", slot: "", origin: "", entity: "person", needs: false }),
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || "") };
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function setQuery(key, val, replace = false) {
  const { parts, query } = parseHash();
  if (val == null || val === "") query.delete(key); else query.set(key, val);
  const qs = query.toString();
  const h = "#/" + parts.map(encodeURIComponent).join("/") + (qs ? "?" + qs : "");
  if (replace) { history.replaceState(null, "", h); route(); } else location.hash = h;
}
const evHash = (eid, tab = "overview", sub = "", q = "") => `#/event/${eid}/${tab}${sub ? "/" + encodeURIComponent(sub) : ""}${q ? "?" + q : ""}`;
const personHash = (eid, pid, tab = "guests") => evHash(eid, tab, "", "p=" + pid);

async function route() {
  const r = parseHash();
  S.route = r;
  const [head, a, b, c] = r.parts;
  // main key ignores the person drawer (?p=) so opening/closing it doesn't re-render the page behind
  const q2 = new URLSearchParams(r.query); q2.delete("p");
  const key = r.parts.join("/") + "?" + q2.toString();
  if (S.draftDirty && key !== S.mainKey && !(await confirmLeaveDraft())) { history.replaceState(null, "", "#/" + S.mainKey.replace(/\?$/, "")); return; }
  const changed = key !== S.mainKey;
  S.mainKey = key;
  renderSidebar();
  if (changed) {
    $("#main").scrollTop = 0;
    try {
      if (!head) { go(S.events.length ? "#/today" : "#/welcome"); return; }
      if (head === "today") await viewToday();
      else if (head === "welcome") viewWelcome();
      else if (head === "directory") await (a ? viewProfile(+a) : viewDirectory());
      else if (head === "team") await viewTeam();
      else if (head === "usage") await viewUsage();
      else if (head === "event" && a) await viewEvent(+a, b || "overview", c);
      else go("#/today");
    } catch (e) {
      $("#view").innerHTML = `<div class="page">${emptyState("alert", "Something went wrong", esc(e.message || e), `<a class="btn" href="#/today">Back to Today</a><button class="btn" data-act="reload">Retry</button>`)}</div>`;
      if (e.status !== 404) console.warn(e);
    }
  }
  syncDrawer();
}

async function confirmLeaveDraft() {
  const ok = await confirmBox("Discard unsaved edits?", "You edited this draft but didn't save. Leave without saving?", "Discard edits", true);
  if (ok) S.draftDirty = false;
  return ok;
}

/* ================================================================== sidebar & banner */

async function loadEvents() {
  try { S.events = await api("/api/events"); } catch (e) { toastErr(e); }
  renderSidebar();
}

function renderSidebar() {
  const [head, a] = S.route.parts;
  const nav = (href, ic, en, active, count = "") =>
    `<a class="nav-item ${active ? "active" : ""}" href="${href}" ${active ? 'aria-current="page"' : ""}>${icon(ic)}<span>${en}</span>${count}</a>`;
  const overdue = S.today ? S.today.followups.filter((f) => f.overdue).length : 0;
  const evs = S.events.map((e) => {
    const act = head === "event" && +a === e.id;
    return `<a class="event-link ${act ? "active" : ""}" href="${evHash(e.id)}" title="${esc(e.name)}" style="--h:${hueOf(e.name)}">
      <span class="edot"></span><div class="name">${e.running ? '<span class="live-dot" title="Agents running"></span>' : ""}<span class="ellipsis">${esc(e.name)}</span></div>
      <div class="meta">${e.date ? esc(fmtDate(e.date, { weekday: false })) : "Date to be confirmed"} · ${e.people || 0} people</div></a>`;
  }).join("");
  const h = S.health;
  $("#sidebar").innerHTML = `
    <a class="brand" href="#/today"><span class="brand-mark">${SEAL}</span>
      <span><div class="brand-name">InviteDesk</div><div class="brand-sub">Outreach desk</div></span></a>
    <nav class="nav">
      ${nav("#/today", "sun", "Today", head === "today" || head === "welcome", overdue ? `<span class="count hot" title="Overdue follow-ups">${overdue}</span>` : "")}
      ${nav("#/directory", "book", "Directory", head === "directory")}
      ${nav("#/team", "users", "Team", head === "team")}
      ${nav("#/usage", "chart", "Usage & cost", head === "usage")}
    </nav>
    <div class="nav-section"><span class="eyebrow">Events</span><span class="count-badge">${S.events.length}</span></div>
    <div class="events-list">${evs || `<div class="small muted" style="padding:6px 10px">No events yet.</div>`}</div>
    <div class="sidebar-foot">
      <button class="btn primary block" data-act="new-event">${icon("plus")}New event</button>
      <div class="model-line" title="Language model used by every agent"><span class="kd ${h && h.key_present ? "" : "off"}"></span><span class="ellipsis">${esc(h ? h.model : "…")} · ${h ? (h.key_present ? "API key found" : "no API key") : ""}</span></div>
    </div>`;
}

function renderBanner() {
  const h = S.health;
  $("#banner").innerHTML = h && !h.key_present
    ? `<div class="banner">${icon("alert")}<span><b>No API key found.</b> Browsing works; agents need <code>PORTKEY_API_KEY</code> in <code>.env</code> (this folder or the one above). Restart the app after adding it.</span></div>`
    : "";
}

/* ================================================================== new event / import */

function newEventModal(defaultMode) {
  const h = S.health || { samples: [], demo_snapshot: false };
  let mode = defaultMode || "import";
  const samples = h.samples || [];
  const sampleLabel = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const body = `
    <div class="opt-tabs four" role="tablist">
      <button class="opt" data-mode="import" role="tab">${"<b>" + icon("upload") + "Import folder</b>"}<span>Your planning folder as a .zip</span></button>
      <button class="opt" data-mode="sample" role="tab" ${samples.length ? "" : "disabled"}><b>${icon("folder")}Sample event</b><span>${samples.length} fictional sample folders</span></button>
      <button class="opt" data-mode="public" role="tab" ${h.key_present ? "" : "disabled title='Needs an API key'"}><b>${icon("globe")}Public event</b><span>No files — research it from the web</span></button>
      <button class="opt" data-mode="demo" role="tab" ${h.demo_snapshot ? "" : "disabled"}><b>${icon("sparkle")}Load demo</b><span>Recorded agent run, instant</span></button>
    </div>
    <div data-pane="import">
      <label class="drop" data-drop>${icon("upload")}<b>Drop your event folder (.zip) here</b><span class="small">or click to choose · Word, Excel, PowerPoint, PDF, text</span>
        <input type="file" accept=".zip" class="sr-only" data-file></label>
      <div class="small mt8" data-filename></div>
      <div class="grid cols-2 mt12">
        <div class="field"><label for="ne-name">Event name <span class="faint">(optional)</span></label><input id="ne-name" class="input" data-name placeholder="Agents will read it from your files"></div>
        <div class="field"><label for="ne-org">Organisation <span class="faint">(optional)</span></label><input id="ne-org" class="input" data-org placeholder="e.g. Yale Greater China Club"></div>
      </div>
      <p class="hint mt12">Importing only reads your files (no AI, no cost). You then press <b>Run agents</b> to build the Fact Sheet, roster, routes and drafts.</p>
    </div>
    <div data-pane="sample" hidden>
      <div class="field"><label>Choose a sample folder</label>
        <select class="select" data-sample>${samples.map((s) => `<option value="${esc(s)}">${esc(sampleLabel(s))}</option>`).join("")}</select></div>
      <p class="hint mt12">Sample folders are fictional and deliberately messy (conflicting dates, wrong links, a prompt-injection line) so you can see the agents catch them.</p>
    </div>
    <div data-pane="public" hidden>
      <div class="field"><label for="ne-pname">Event name <span style="color:var(--accent)">*</span></label><input id="ne-pname" class="input" data-pname placeholder="e.g. Asia Society Annual Gala 2027" required></div>
      <div class="grid cols-2 mt12">
        <div class="field"><label for="ne-porg">Organiser</label><input id="ne-porg" class="input" data-porg placeholder="Who runs it?"></div>
        <div class="field"><label for="ne-purl">Website URL</label><input id="ne-purl" class="input" data-purl type="url" placeholder="https://…"></div>
      </div>
      <div class="field mt12"><label for="ne-pnotes">Notes</label><textarea id="ne-pnotes" class="textarea" rows="3" data-pnotes placeholder="What do you know already? Date, audience, who you want to invite…"></textarea></div>
      <p class="hint mt12">The <b>Event Researcher</b> agent searches the web and writes a cited research memo (30–90 s, a few cents). You then press <b>Run agents</b> to build the Fact Sheet, roster and drafts.</p>
      <div data-public-progress></div>
    </div>
    <div data-pane="demo" hidden>
      <div class="callout">${icon("sparkle")}<div><b>Load the demo snapshot.</b> Adds the sample events with a complete recorded agent run — fact sheets, rosters, routes, reviewed drafts, audit, follow-ups — so you can explore everything without waiting or spending.</div></div>
    </div>`;
  openModal({
    title: "New event", sub: "Bring in an event's planning folder. Nothing is ever sent on your behalf.", body,
    foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-go>${icon("check")}Continue</button>`,
    onMount(m) {
      const setMode = (md) => {
        mode = md;
        $$(".opt", m).forEach((o) => o.setAttribute("aria-pressed", o.dataset.mode === md));
        $$("[data-pane]", m).forEach((p) => (p.hidden = p.dataset.pane !== md));
        $("[data-go]", m).innerHTML = icon(md === "demo" ? "sparkle" : md === "sample" ? "folder" : md === "public" ? "globe" : "upload") + ({ import: "Import folder", sample: "Import sample", demo: "Load demo", public: "Research event" }[md]);
      };
      $$(".opt", m).forEach((o) => (o.onclick = () => !o.disabled && setMode(o.dataset.mode)));
      setMode(mode);
      const fileIn = $("[data-file]", m), drop = $("[data-drop]", m);
      const showFile = () => { const f = fileIn.files[0]; $("[data-filename]", m).innerHTML = f ? `${icon("file").replace("<svg", '<svg style="width:13px;height:13px;vertical-align:-2px"')} <b>${esc(f.name)}</b> · ${(f.size / 1024).toFixed(0)} KB` : ""; };
      fileIn.onchange = showFile;
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
      drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files.length) { fileIn.files = e.dataTransfer.files; showFile(); } };
      $("[data-go]", m).onclick = async (e) => {
        const btn = e.currentTarget;
        try {
          if (mode === "import") {
            const f = fileIn.files[0];
            if (!f) { toast("Choose a .zip of your event folder first.", "error"); return; }
            if (!/\.zip$/i.test(f.name)) { toast("Please upload a .zip file (compress the folder first).", "error"); return; }
            const fd = new FormData();
            fd.append("file", f); fd.append("name", $("[data-name]", m).value.trim()); fd.append("org", $("[data-org]", m).value.trim());
            setBusy(btn, true, "Importing…");
            const r = await api("/api/events/import", { method: "POST", form: fd });
            await afterImport(r.event_id, "Folder imported");
          } else if (mode === "sample") {
            setBusy(btn, true, "Importing…");
            const r = await api("/api/events/import_sample", { method: "POST", body: { sample: $("[data-sample]", m).value, org: "" } });
            await afterImport(r.event_id, "Sample imported");
          } else if (mode === "public") {
            const name = $("[data-pname]", m).value.trim();
            if (!name) { toast("Give the event a name first.", "error"); $("[data-pname]", m).focus(); return; }
            const url = $("[data-purl]", m).value.trim();
            if (url && !/^https?:\/\//i.test(url)) { toast("The website should start with http:// or https://", "error"); return; }
            setBusy(btn, true, "Researching…");
            $$("[data-pane='public'] input, [data-pane='public'] textarea, .opt", m).forEach((x) => (x.disabled = true));
            const started = Date.now();
            const prog = $("[data-public-progress]", m);
            const steps = ["Searching the web for the event", "Reading official pages and news", "Writing a cited research memo", "Saving it as the event's first document"];
            const paint = () => { const sec = Math.round((Date.now() - started) / 1000); const i = Math.min(steps.length - 1, Math.floor(sec / 18));
              prog.innerHTML = `<div class="working mt12"><span class="spinner"></span><div><b>Event Researcher is working…</b> <span class="muted small">${sec}s · usually 30–90 s</span>
                <div class="steps">${steps.map((st, j) => `<span style="${j === i ? "color:var(--text);font-weight:600" : j < i ? "text-decoration:line-through" : ""}">${st}</span>${j < steps.length - 1 ? icon("chevron").replace("<svg", '<svg style="width:11px;height:11px"') : ""}`).join("")}</div></div></div>`; };
            paint(); const tick = setInterval(paint, 1000);
            try {
              const r = await api("/api/events/create", { method: "POST", body: { name, org: $("[data-porg]", m).value.trim(), url, notes: $("[data-pnotes]", m).value.trim() } });
              clearInterval(tick);
              await afterImport(r.event_id, "Research memo ready");
            } catch (err) { clearInterval(tick); prog.innerHTML = ""; $$("[data-pane='public'] input, [data-pane='public'] textarea, .opt", m).forEach((x) => (x.disabled = false)); throw err; }
          } else {
            setBusy(btn, true, "Loading demo…");
            await loadDemo();
          }
        } catch (err) { toastErr(err); setBusy(btn, false); }
      };
    },
  });
}

async function afterImport(eid, msg) {
  closeModal();
  await loadEvents();
  toast(`${msg}. Next step: <b>Run agents</b> to build the Fact Sheet and roster.`, "ok", 6000);
  go(evHash(eid, "overview"));
}
async function loadDemo(btn) {
  if (btn) setBusy(btn, true, "Loading demo…");
  try {
    const r = await api("/api/demo/load", { method: "POST" });
    closeModal();
    await loadEvents();
    toast(`Demo loaded: ${plural((r.loaded || []).length, "event")} with a recorded agent run.`, "ok");
    go("#/today");
    if (S.mainKey && S.mainKey.startsWith("today")) { S.mainKey = null; route(); }
  } catch (e) { toastErr(e); if (btn) setBusy(btn, false); }
}
async function importSample(name, btn) {
  setBusy(btn, true, "Importing…");
  try {
    const r = await api("/api/events/import_sample", { method: "POST", body: { sample: name, org: "" } });
    await afterImport(r.event_id, "Sample imported");
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

/* ================================================================== welcome / first run */

function viewWelcome() {
  const h = S.health || { samples: [], demo_snapshot: false };
  const sampleLabel = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  $("#view").innerHTML = `<div class="page" style="max-width:1120px">
    <div class="hero"><span class="seal">${SEAL}</span>
      <div class="eyebrow brass">Guest · speaker · sponsor outreach</div>
      <h1 style="margin-top:6px">Welcome to InviteDesk</h1><div class="ornament"><i></i></div>
      <p>A desk of AI agents that turns your messy event folder into a single fact sheet, a ranked guest list with the warmest route to each person, and reviewed invitation drafts in Chinese or English. <b>You approve everything — the desk never sends messages itself.</b></p>
    </div>
    <div class="onb-grid">
      <div class="card onb"><div class="n">${icon("sparkle")}</div><h3>Load the demo</h3>
        <p>See a finished run on fictional sample events: fact sheet, conflicts, guests, routes, drafts, audit. Instant and free.</p>
        ${h.demo_snapshot ? `<button class="btn primary" data-act="load-demo">${icon("sparkle")}Load demo</button>` : `<p class="hint">No demo snapshot in this copy — try a sample event instead (import is free; agents cost a few cents).</p><button class="btn primary" disabled>${icon("sparkle")}Load demo</button>`}</div>
      <div class="card onb"><div class="n">${icon("folder")}</div><h3>Try a sample event</h3>
        <p>Import a fictional club's planning folder, then watch the agents work live on the agent board.</p>
        ${h.samples && h.samples.length ? `<select class="select" id="wel-sample">${h.samples.map((s) => `<option value="${esc(s)}">${esc(sampleLabel(s))}</option>`).join("")}</select>
        <button class="btn" data-act="wel-sample">${icon("folder")}Import sample</button>` : `<p class="hint">No sample folders found in <code>sample_event/</code>.</p>`}</div>
      <div class="card onb"><div class="n">${icon("upload")}</div><h3>Import your folder</h3>
        <p>Zip your event's planning folder (proposal, guest tracker, invitation examples, sponsorship, budget) and drop it in.</p>
        <button class="btn" data-act="new-event" data-mode="import">${icon("upload")}Import .zip</button></div>
    </div>
    <div class="how">
      ${[["1", "Import", "Your files stay on this computer."], ["2", "Run agents", "Brief → roster → strategy → scouting → routes & drafts."], ["3", "Review", "Fix conflicts, edit drafts, approve. Reviewer agent checks every draft first."], ["4", "Send yourself", "Approved drafts land in Drive/outbox — send from your own mail or WeChat."]]
        .map(([n, t, s]) => `<div class="card step"><div class="num">STEP ${n}</div><b>${t}</b><span>${s}</span></div>`).join("")}
    </div></div>`;
}

/* ================================================================== today */

async function viewToday() {
  if (!S.events.length) { await loadEvents(); if (!S.events.length) { viewWelcome(); return; } }
  $("#view").innerHTML = `<div class="page">${skel(3)}</div>`;
  const t = await api("/api/today");
  S.today = t;
  renderSidebar();
  const overdue = t.followups.filter((f) => f.overdue), dueToday = t.followups.filter((f) => f.due_today);
  const soon = t.followups.filter((f) => !f.overdue && !f.due_today).slice(0, 8);
  const review = t.drafts.filter((d) => d.status !== "approved");
  const d = new Date(), hr = d.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const whoRaw = (store.get("author", "") || "").trim();
  const who = /^(organi[sz]er|admin|me|user)$/i.test(whoRaw) ? "" : whoRaw;
  const changes = t.drafts.filter((x) => x.status === "needs_changes" || x.status === "blocked");
  const conflicts = [...t.issues].sort((a, b) => (a.kind === "conflict" ? 0 : 1) - (b.kind === "conflict" ? 0 : 1));
  const cand = [
    ...overdue.map((f) => ({ k: "overdue", eb: `Overdue follow-up · ${relDue(f.due)}`, who: f.name, tt: f.name, ss: f.action, href: personHash(f.event_id, f.person_id, "followups"), go: "Open person" })),
    ...changes.map((x) => ({ k: "changes", eb: x.status === "blocked" ? "Draft blocked by reviewer" : "Draft needs changes", who: x.name, tt: `${x.name} — ${DKIND[x.kind] || x.kind}`, ss: x.event_name, href: evHash(x.event_id, "drafts", x.id), go: "Fix the draft" })),
    ...conflicts.map((i) => ({ k: "issue", eb: i.kind === "conflict" ? "High-severity conflict" : "High-severity issue", tt: i.field, ss: `${i.found || ""}${i.expected ? " → " + i.expected : ""}`, href: evHash(i.event_id, "consistency"), go: "Resolve" })),
    ...dueToday.map((f) => ({ k: "today", eb: "Due today", who: f.name, tt: f.name, ss: f.action, href: personHash(f.event_id, f.person_id, "followups"), go: "Open person" })),
    ...review.filter((x) => x.status !== "needs_changes" && x.status !== "blocked").map((x) => ({ k: "review", eb: "Draft ready for review", who: x.name, tt: `${x.name} — ${DKIND[x.kind] || x.kind}`, ss: x.event_name, href: evHash(x.event_id, "drafts", x.id), go: "Review" })),
  ];
  const top = [];
  for (const k of ["overdue", "changes", "issue"]) { const c = cand.find((x) => x.k === k); if (c) top.push(c); }
  for (const c of cand) { if (top.length >= 3) break; if (!top.includes(c)) top.push(c); }
  top.length = Math.min(top.length, 3);
  const rest = cand.length - top.length;
  const fuRow = (f) => {
    const cls = f.overdue ? "overdue" : f.due_today ? "today" : "";
    return `<div class="fu ${cls}"><div class="due">${esc(fmtDate(f.due, { year: false, weekday: false }))}<small>${esc(relDue(f.due))}</small></div>
      <div class="person" style="align-items:flex-start">${avatar(f.name, "sm")}<div style="min-width:0"><a class="who" href="${personHash(f.event_id, f.person_id, "followups")}">${esc(f.name)}</a> <span class="muted xsmall">· ${esc(f.event_name)}</span>
      <div class="small ellipsis" title="${esc(f.action)}">${esc(f.action)}</div><div class="xsmall muted ellipsis">${esc(f.reason || "")}</div></div></div>
      <button class="btn sm" data-act="fu-done" data-id="${f.id}">${icon("check")}Done</button></div>`;
  };
  const kpi = (k, v, s, ic, cls = "") => `<div class="kpi ${cls}"><div class="k">${icon(ic)}${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $("#view").innerHTML = `<div class="page">
    <div class="greet"><div><div class="eyebrow brass">${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
      <h1 class="mt8">${greet}${who ? `, ${esc(who)}` : ""}</h1>
      <div class="sub">${top.length ? "Your top 3 for today" : "Nothing urgent today — enjoy the calm."}</div></div>
      <button class="btn" data-act="new-event">${icon("plus")}New event</button></div>
    ${top.length ? `<div class="top3">${top.map((c) => `<a class="tcard k-${c.k}" href="${c.href}"><div class="eyebrow">${esc(c.eb)}</div>
        <div class="row" style="gap:12px;align-items:flex-start">${c.who ? avatar(c.who) : `<span class="av" style="--h:210">${icon("alert").replace("<svg", '<svg style="width:15px;height:15px"')}</span>`}<div style="min-width:0"><div class="tt" title="${esc(c.tt)}">${esc(c.tt)}</div><div class="ss" title="${esc(c.ss)}">${esc(c.ss)}</div></div></div>
        <div class="go">${esc(c.go)}${icon("chevron")}</div></a>`).join("")}</div>
      ${rest > 0 ? `<button class="more-link btn ghost sm" data-act="scroll-queue">and ${rest} more in your queue ${icon("chevron")}</button>` : `<div class="mb16"></div>`}` : ""}
    ${dailyBriefCard()}
    <div class="kpis light">
      ${kpi("Overdue follow-ups", overdue.length, "need a nudge", "clock", overdue.length ? "alert" : "")}
      ${kpi("Due today", dueToday.length, "follow-ups", "calendar")}
      ${kpi("Drafts to review", review.length, "checked by the reviewer agent", "edit", "accent")}
      ${kpi("High-severity issues", t.issues.length, "dates, links, injections", "alert", t.issues.length ? "alert" : "")}
    </div>
    <div class="subhead">Your events</div>
    <div class="ev-cards mb16">${t.events.map((e) => {
      const ev = S.events.find((x) => x.id === e.id) || {};
      const pct = e.needed > 0 ? Math.min(100, Math.round((e.confirmed / e.needed) * 100)) : e.people ? Math.round((e.confirmed / e.people) * 100) : 0;
      return `<a class="card ev-card" href="${evHash(e.id)}" style="--h:${hueOf(e.name)}"><div class="row" style="align-items:flex-start"><div class="t" style="flex:1;min-width:0"><span class="edot"></span>${esc(e.name)}</div>${ev.running ? '<span class="live-dot"></span>' : ""}</div>
        ${e.org && e.org !== e.name ? `<div class="eyebrow ellipsis" title="${esc(e.org)}">${esc(e.org)}</div>` : ""}
        <div class="m">${icon("calendar")}<span class="ellipsis">${e.date ? esc(fmtDate(e.date)) : "Date to be confirmed"}</span></div>
        <div class="bar thin green"><i style="width:${pct}%"></i></div>
        <div class="row small wrap" style="gap:6px">${e.needed > 0 ? `<span class="nowrap"><b class="serif" style="font-size:15px">${e.confirmed}</b> confirmed <span class="muted">/ ${e.needed} needed${e.open_slots ? ` · ${e.open_slots} open` : ""}</span></span>` : e.people ? `<span class="nowrap"><b class="serif" style="font-size:15px">${e.confirmed}</b> confirmed <span class="muted">of ${e.people} on the roster</span></span>` : `<span class="muted nowrap">No roster yet</span>`}<span class="spacer"></span>${evStatusChip(ev.running ? "running" : e.status)}</div></a>`;
    }).join("")}</div>
    <div class="split" id="queue" style="scroll-margin-top:20px">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${icon("clock")}Follow-ups</h3><span class="small muted">${overdue.length} overdue · ${dueToday.length} today</span></div>
          ${[...overdue, ...dueToday, ...soon].length ? `<div>${[...overdue, ...dueToday, ...soon].map(fuRow).join("")}</div>` : emptyState("check", "Nothing due", "No open follow-ups. Run agents on an event to schedule them.", "", true)}</div>
        <div class="card"><div class="card-head"><h3>${icon("edit")}Drafts awaiting review</h3><span class="count-badge">${review.length}</span></div>
          ${review.length ? review.slice(0, 12).map((x) => `<a class="li" href="${evHash(x.event_id, "drafts", x.id)}"><div class="mli">${avatar(x.name)}<div style="min-width:0"><div class="l1"><span class="nm">${esc(x.name)}</span>${dStatusChip(x.status)}</div>
            <div class="subj">${esc(DKIND[x.kind] || x.kind)} · ${esc(LANGS[x.language] || x.language || "")} · ${esc(x.channel || "")} · ${esc(x.event_name)}</div></div></div></a>`).join("") : emptyState("inbox", "Inbox zero", "No drafts waiting for a human decision.", "", true)}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${icon("alert")}High-severity issues</h3><span class="count-badge ${t.issues.length ? "hot" : ""}">${t.issues.length}</span></div>
          ${t.issues.length ? t.issues.slice(0, 8).map((i) => `<a class="li" href="${evHash(i.event_id, "consistency")}"><div class="t"><span class="sev high">${esc(ISSUE_KIND[i.kind]?.[0] || i.kind)}</span><span class="muted xsmall" style="font-weight:400">${esc(i.event_name)}</span></div>
            <div class="small ellipsis" style="margin-top:4px" title="${esc(i.found || "")}">${esc(i.field)}: <b>${esc((i.found || "").slice(0, 80))}</b>${i.expected ? ` → ${esc(i.expected)}` : ""}</div><div class="s mono">${esc(i.document)}</div></a>`).join("") : emptyState("shield", "All clear", "No open high-severity issues.", "", true)}</div>
        <div class="card"><div class="card-head"><h3>${icon("activity")}Recent activity</h3></div>
          ${t.recent.length ? `<div>${t.recent.slice(0, 14).map(feedItem).join("")}</div>` : emptyState("activity", "No activity yet", "", "", true)}</div>
      </div>
    </div></div>`;
}

function feedItem(x) {
  return `<div class="feed-item">${avatar(x.name, "sm")}<div class="tx"><a class="who" href="${personHash(x.event_id, x.person_id)}">${esc(x.name)}</a> <span class="small">${esc(x.note)}</span>
    <div class="m">${esc(x.actor || "")} · ${esc(fmtDate(x.date, { year: false }))} · ${esc(x.event_name || "")}</div></div></div>`;
}

/* ================================================================== daily brief (Chief of Staff agent) */

function dailyBriefCard() {
  const saved = store.get("dailyBrief", null);
  const lang = store.get("briefLang", "en");
  const prio = { now: ["Now", "orange"], today: ["Today", "amber"], "this week": ["This week", "slate"] };
  const names = {};
  if (S.today) [...S.today.followups, ...S.today.drafts, ...S.today.recent].forEach((x) => { if (x.person_id && x.name) names[x.person_id] = x.name; });
  let inner;
  if (saved && saved.data) {
    const b = saved.data;
    const acts = (b.actions || []).map((a, i) => {
      const [pl, tone] = prio[a.priority] || [a.priority || "—", "gray"];
      const done = (saved.done || []).includes(i);
      const words = String(a.action || "").trim().split(/\s+/);
      const verb = words.shift() || "";
      const nm = a.person_id ? names[a.person_id] : "";
      const text = `<b>${esc(verb)}</b> ${esc(words.join(" "))}`;
      return `<div class="bact ${done ? "done" : ""}"><input type="checkbox" ${done ? "checked" : ""} data-act="brief-check" data-i="${i}" aria-label="Mark done">
        ${chip(pl, tone, "sq")}${nm ? avatar(nm, "sm") : `<span class="av sm" style="--h:40">${icon("calendar").replace("<svg", '<svg style="width:12px;height:12px"')}</span>`}
        <div class="what"><div class="a" title="${esc(a.action)}">${a.person_id ? `<a href="#" data-act="open-person-any" data-pid="${a.person_id}">${text}</a>` : text}</div>
          <div class="w" title="${esc((a.event || "") + (a.why ? " — " + a.why : ""))}">${esc(a.event || "")}${a.why ? " — " + esc(a.why) : ""}</div></div></div>`;
    }).join("");
    inner = `<div class="serif" style="font-size:19px;font-weight:600;line-height:1.35">${esc(b.headline || "")}</div>
      <div class="xsmall muted mt8">Generated ${esc(fmtDateTime(saved.at))}${saved.lang ? " · " + (saved.lang === "en" ? "English" : "Chinese") : ""}</div>
      <div class="grid mt16" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);align-items:start;gap:28px">
        <div><div class="subhead">Actions</div>${acts || '<div class="small muted">No actions.</div>'}</div>
        <div>${(b.changes || []).length ? `<div class="subhead">What changed</div><div class="vtl">${b.changes.map((c) => `<div class="it k-change"><div class="note small">${esc(c)}</div></div>`).join("")}</div>` : ""}
          ${(b.risks || []).length ? `<div class="subhead">Risks</div>${b.risks.map((c) => `<div class="risk">${icon("alert")}<span>${esc(c)}</span></div>`).join("")}` : ""}</div>
      </div>`;
  } else {
    inner = `<div class="row" style="gap:16px;align-items:center"><span style="width:44px;height:44px;flex:none">${SEAL}</span><div class="small muted">A short, prioritised to-do list across all your events, written by the Chief of Staff agent from today's follow-ups, drafts, issues and replies. Takes about 10–20 seconds and costs a fraction of a cent.</div></div>`;
  }
  return `<div class="card mb16" id="brief-card"><div class="card-head"><h3>${icon("sparkle")}Daily brief</h3>
    <div class="btn-row"><span class="xsmall muted">Brief language:</span><div class="seg-ctl" role="group" aria-label="Brief language">
      <button data-act="brief-lang" data-lang="en" aria-pressed="${lang === "en"}">English</button><button data-act="brief-lang" data-lang="zh-Hans" aria-pressed="${lang === "zh-Hans"}">Chinese</button></div>
      <button class="btn sm ${saved ? "" : "primary"}" data-act="brief-gen" ${S.health && !S.health.key_present ? 'disabled title="Needs an API key"' : ""}>${icon(saved ? "refresh" : "sparkle")}${saved ? "Regenerate" : "Generate brief"}</button></div></div>
    <div class="card-body" style="padding:20px 22px">${inner}</div></div>`;
}

/* ================================================================== event workspace */

const TABS = [
  ["overview", "Overview", "", "grid"],
  ["lists", "Lists", "", "list"],
  ["guests", "Guests", "", "users"],
  ["drafts", "Drafts", "", "edit"],
  ["consistency", "Consistency", "", "shield"],
  ["followups", "Follow-ups", "", "clock"],
  ["reimbursement", "Reimbursement", "", "receipt"],
  ["drive", "Drive", "", "cloud"],
  ["documents", "Documents", "", "file"],
  ["run", "Agent run", "", "activity"],
];

async function loadEvent(eid) {
  const [ev, ppl] = await Promise.all([api(`/api/events/${eid}`), api(`/api/events/${eid}/people`).catch(() => null)]);
  S.ev = ev;
  if (ppl) {
    const persons = ppl.filter((p) => (p.entity || "person") !== "organization" && p.relationship !== "team_member");
    S.ev.personCounts = { people: persons.length, confirmed: persons.filter((p) => p.status === "confirmed").length };
  }
  S.evId = eid;
  const evRow = S.events.find((e) => e.id === eid);
  if (evRow && evRow.running !== S.ev.running) { evRow.running = S.ev.running; renderSidebar(); }
  if (S.ev.running) startPoll(eid);
  return S.ev;
}

function eventHeader(ev, tab) {
  const fs = ev.fact_sheet || {};
  const date = fv(fs.date);
  const c = ev.counts || {};
  const counts = { guests: c.people, drafts: c.drafts, consistency: c.issues, followups: c.followups, documents: (ev.documents || []).length };
  const hot = { consistency: c.issues > 0 };
  const compact = tab !== "overview";
  const title = fv(fs.event_name) || ev.name;
  const zh = fv(fs.event_name_zh);
  const time = fv(fs.main_time) || fv(fs.vip_time);
  const venueFull = fv(fs.venue) || fv(fs.city_region);
  const venueShort = venueFull.split(";")[0].split(",").slice(0, 2).join(",").trim();
  const where = venueFull ? [venueShort] : [];
  const dateLine = date ? (isISODate(date) ? asDate(date).toLocaleDateString("en-US", compact ? { weekday: "short", month: "short", day: "numeric", year: "numeric" } : { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : date) : "Date to be confirmed";
  const pill = (k, v, t, cls = "") => `<a class="kpill ${cls}" href="${evHash(ev.id, t)}"><b>${v}</b><span>${k}</span></a>`;
  return `<div class="ev-hero ${compact ? "compact" : ""}"><div class="ev-hero-in">
      <div class="ev-top"><div class="crumbs" style="margin:0"><a href="#/today">Events</a>${icon("chevron").replace("<svg", '<svg style="width:12px;height:12px"')}<span class="ellipsis" style="max-width:340px">${esc(fv(fs.org_name_en) || ev.org || "Event")}</span></div>
        ${evStatusChip(ev.running ? "running" : ev.status)}<span class="spacer"></span>
        <span class="xsmall muted nowrap">${fmtCost(ev.spent_usd)} spent on agents${ev.last_run ? " · last run " + esc(fmtDateTime(ev.last_run.started_at)) : ""}</span>
        ${ev.running ? `<a class="btn sm" href="${evHash(ev.id, "run")}"><span class="live-dot"></span>Agents running — watch</a>` : `<button class="btn primary sm" data-act="open-run" ${S.health && !S.health.key_present ? "disabled" : ""}>${icon("play")}Run agents</button>`}</div>
      <div class="inv">
        ${compact ? "" : `<div class="eyebrow">${esc(fv(fs.org_name_en) || ev.org || "Event")}</div>`}
        <h1 class="inv-title" title="${esc(title)}">${esc(title)}${compact && zh ? `<span class="zh2">${esc(zh)}</span>` : ""}</h1>
        ${!compact && zh ? `<div class="inv-sub">${esc(zh)}</div>` : ""}
        ${compact ? "" : `<div class="ornament"><i></i></div>`}
        <div class="engraved"><span>${esc(dateLine)}</span>${time ? `<span>${esc(time)}</span>` : ""}${where.length ? `<span title="${esc(venueFull)}">${esc(where.join(", "))}</span>` : ""}</div>
        <div class="kpi-pills">${pill("people", (ev.personCounts || c).people || 0, "guests")}${pill("confirmed", (ev.personCounts || c).confirmed || 0, "guests")}${pill("drafts", c.drafts || 0, "drafts")}${pill("open issues", c.issues || 0, "consistency", c.issues ? "hot" : "")}${pill("follow-ups", c.followups || 0, "followups")}</div>
      </div></div></div>
    <div class="ev-sticky"><div class="tabs" role="tablist">
      ${TABS.map(([id, en]) => `<a class="tab ${tab === id ? "active" : ""}" role="tab" aria-selected="${tab === id}" href="${evHash(ev.id, id)}">${en}${
        id === "run" && ev.running ? '<span class="live-dot"></span>' : counts[id] ? `<span class="count-badge ${hot[id] ? "hot" : ""}">${counts[id]}</span>` : ""}</a>`).join("")}
    </div></div>`;
}

async function viewEvent(eid, tab, sub) {
  if (!TABS.find((t) => t[0] === tab)) tab = "overview";
  const first = S.evId !== eid || !S.ev;
  if (first) $("#view").innerHTML = `<div class="page">${skel()}</div>`;
  try { await loadEvent(eid); } catch (e) {
    if (e.status === 404) { $("#view").innerHTML = `<div class="page">${emptyState("alert", "Event not found", "It may have been removed from this workspace.", `<a class="btn" href="#/today">Back to Today</a>`)}</div>`; return; }
    throw e;
  }
  $("#view").innerHTML = eventHeader(S.ev, tab) + `<div class="page" id="tab-body">${skel()}</div>`;
  S.tab = tab; S.sub = sub;
  await renderTab();
}

async function renderTab() {
  const body = $("#tab-body");
  if (!body) return;
  const fn = { overview: tabOverview, lists: tabLists, guests: tabGuests, drafts: tabDrafts, consistency: tabConsistency, followups: tabFollowups,
    reimbursement: tabReimbursement, drive: tabDrive, documents: tabDocuments, run: tabRun }[S.tab];
  try { await fn(body, S.sub); }
  catch (e) { body.innerHTML = emptyState("alert", "Couldn't load this tab", esc(e.message), `<button class="btn" data-act="reload-tab">${icon("refresh")}Retry</button>`); }
}

/** Refresh only the event header (hero KPIs, status, tab counts) — used while agents run. */
async function refreshHeader() {
  if (!S.evId || !$(".ev-hero")) return;
  try {
    await loadEvent(S.evId);
    const tmp = document.createElement("div");
    tmp.innerHTML = eventHeader(S.ev, S.tab);
    const head = $(".ev-hero"), sticky = $(".ev-sticky");
    if (head && sticky) { head.replaceWith(tmp.children[0]); sticky.replaceWith(tmp.children[0]); }
  } catch { /* keep the old header */ }
}

/** Refresh the event header counts + current tab without a loading flash. */
async function refreshEventView() {
  if (!S.evId || !$("#tab-body")) return;
  try {
    await loadEvent(S.evId);
    const tmp = document.createElement("div");
    tmp.innerHTML = eventHeader(S.ev, S.tab);
    const head = $(".ev-hero"), sticky = $(".ev-sticky");
    if (head && sticky) { head.replaceWith(tmp.children[0]); sticky.replaceWith(tmp.children[0]); }
    await renderTab();
  } catch (e) { toastErr(e); }
}

/* ---------------------------------------------------------------- overview */

function factRow(label, x, opts = {}) {
  const v = fv(x);
  if (!v && !opts.always) return "";
  return `<dt>${label}</dt><dd>${v ? (opts.link ? linkify(v) : esc(v)) : '<span class="faint">—</span>'}${opts.extra || ""}${srcTip(x)}</dd>`;
}

function runPanel(ev, compact = false) {
  const h = S.health || {};
  if (ev.running) {
    return `<div class="working"><span class="spinner"></span><div style="flex:1"><b>Agents are working on this event.</b><div class="small muted">Watch each agent hand off on the live board.</div></div>
      <a class="btn sm" href="${evHash(ev.id, "run")}">${icon("activity")}Open board</a></div>`;
  }
  const stages = [
    ["brief", "Brief Analyst", "Fact Sheet + conflicts"],
    ["roster", "Roster Analyst", "people, aliases, contacts"],
    ["strategy", "Program Strategist", "slots, rubric, tiers A/B/C"],
    ["scout", "Talent Scouts", "new candidates, cited URLs"],
    ["outreach", "Routes → drafts → review", "for the top N people"],
  ];
  const saved = store.get("runOpts", { budget: 0.5, top: 12, stages: stages.map((s) => s[0]) });
  return `<div class="stack" style="gap:12px" data-runpanel>
    ${!h.key_present ? `<div class="callout warn">${icon("alert")}<div>Agents need <code>PORTKEY_API_KEY</code> in <code>.env</code>. Everything else works without it.</div></div>` : ""}
    <div class="grid cols-2" style="gap:10px">
      <div class="field"><label for="rp-budget">Budget (USD) ${infoTip("The run stops cleanly when this much has been spent. A full run on a sample event usually costs $0.05–0.30.")}</label>
        <input id="rp-budget" class="input" type="number" min="0.05" max="5" step="0.05" value="${saved.budget}" data-budget></div>
      <div class="field"><label for="rp-top">Draft for top N people ${infoTip("Route Planner → Drafter → Reviewer run for this many Tier A/B people (cost scales with N).")}</label>
        <input id="rp-top" class="input" type="number" min="1" max="40" step="1" value="${saved.top}" data-top></div>
    </div>
    ${compact ? "" : `<div><div class="label mb8">Stages</div><div class="stages">${stages.map(([id, n, d]) => `<label class="check"><input type="checkbox" value="${id}" data-stage ${saved.stages.includes(id) ? "checked" : ""}><span>${n}<small>${d}</small></span></label>`).join("")}</div>
      <div class="hint mt8">Consistency audit, reimbursement check, follow-ups and the Drive export always run (no AI cost).</div></div>`}
    <button class="btn primary lg block" data-act="run-agents" ${h.key_present ? "" : "disabled"}>${icon("play")}Run agents</button>
  </div>`;
}

async function startRun(btn) {
  const panel = btn.closest("[data-runpanel]");
  const budget = parseFloat($("[data-budget]", panel).value) || 0.5;
  const top = parseInt($("[data-top]", panel).value, 10) || 12;
  const boxes = $$("[data-stage]", panel);
  const stages = boxes.length ? boxes.filter((b) => b.checked).map((b) => b.value) : null;
  if (stages && !stages.length) { toast("Pick at least one stage.", "error"); return; }
  const prev = store.get("runOpts", {});
  store.set("runOpts", { budget, top, stages: stages || prev.stages || ["brief", "roster", "strategy", "scout", "outreach"] });
  setBusy(btn, true, "Starting…");
  try {
    await api(`/api/events/${S.evId}/run`, { method: "POST", body: { budget_usd: budget, top_n: top, ...(stages ? { stages } : {}) } });
    toast("Agents started. Watch them on the board.", "ok");
    closeModal();
    const ev = S.events.find((e) => e.id === S.evId); if (ev) ev.running = true;
    S.runSel = null;
    startPoll(S.evId);
    S.mainKey = null;
    go(evHash(S.evId, "run"));
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

const STAGES = [
  ["not", "Not contacted", ["not_started", "unknown", "backup"]],
  ["contacted", "Contacted", ["contacted_no_reply"]],
  ["waiting", "Waiting", ["pending", "likely"]],
  ["confirmed", "Confirmed", ["confirmed"]],
  ["declined", "Declined", ["declined"]],
];
const stageOf = (status) => (STAGES.find((s) => s[2].includes(status)) || STAGES[0])[0];
function pipelineCard(people) {
  const ppl = (people || []).filter((p) => p.relationship !== "team_member" && (p.entity || "person") !== "organization");
  const n = ppl.length;
  const cnt = Object.fromEntries(STAGES.map(([k]) => [k, ppl.filter((p) => stageOf(p.status) === k).length]));
  const pct = (v) => (n ? Math.round((v / n) * 100) : 0);
  return `<div class="card mb16"><div class="card-head"><h3>${icon("route")}Guest pipeline</h3>
      <a class="small muted" href="${evHash(S.evId, "guests")}">${plural(n, "person", "people")} · open board ${icon("chevron").replace("<svg", '<svg style="width:12px;height:12px;vertical-align:-2px"')}</a></div>
    <div class="card-body" style="padding:20px 6px 18px">
      ${n ? `<div class="pipeline">${STAGES.map(([k, l]) => `<div class="pstage"><div class="lbl"><i class="st-${k}"></i><span class="eyebrow">${l}</span></div><div class="num">${cnt[k]}</div><div class="pct">${pct(cnt[k])}%</div></div>`).join("")}</div>
        <div style="padding:0 18px"><div class="pbar">${STAGES.map(([k]) => cnt[k] ? `<i class="st-${k}" style="width:${(cnt[k] / n) * 100}%" title="${cnt[k]}"></i>` : "").join("")}</div></div>`
      : `<div style="padding:0 18px" class="small muted">No people yet — run the agents to build the roster.</div>`}
    </div></div>`;
}

async function tabOverview(body) {
  const ev = S.ev, fs = ev.fact_sheet, st = ev.strategy || {}, c = ev.counts || {};
  const people = await api(`/api/events/${ev.id}/people`).catch(() => []);
  const kpis = pipelineCard(people);
  const reimport = `<div class="card"><div class="card-head"><h3>${icon("refresh")}Re-import updated folder</h3></div><div class="card-body">
      <p class="small muted mb12">Changed the tracker or added a document? Upload the new .zip. People, timelines, drafts and your decisions are kept; documents are replaced.</p>
      <div class="row"><input type="file" accept=".zip" class="input" style="padding-top:5px" data-reimport-file aria-label="Updated folder .zip"><button class="btn" data-act="reimport">${icon("upload")}Upload</button></div></div></div>`;

  const nextStep = !ev.last_run && !ev.running ? `<div class="nextstep"><div style="flex:1;min-width:0"><div class="eyebrow" style="color:var(--accent)">Next step</div><h4>Run the agents on this event</h4>
      <div class="small muted">The Brief Analyst writes the Fact Sheet from ${plural((ev.documents || []).length, "document")}; the Roster Analyst and Strategist build and rank your guest list; routes and reviewed drafts follow. Nothing is sent.</div></div>
      <button class="btn primary lg" data-act="open-run" ${(S.health || {}).key_present ? "" : "disabled"}>${icon("play")}Run agents</button></div>` : "";
  if (!fs) {
    body.innerHTML = `${nextStep}${kpis}<div class="split"><div class="stack">
      <div class="card"><div class="card-body">${emptyState("sparkle", "No Fact Sheet yet", `${plural((ev.documents || []).length, "document")} imported. Run the agents to read them: the Brief Analyst writes the Fact Sheet (with sources and conflicts), the Roster Analyst finds every person, and the Program Strategist ranks them.`,
        `<a class="btn" href="${evHash(ev.id, "documents")}">${icon("file")}See imported documents</a>`)}</div></div>
      ${(ev.documents || []).some((d) => (d.flags || []).length) ? `<div class="callout danger">${icon("shield")}<div><b>Instruction-like text found in your files.</b> InviteDesk treats it as data, never as instructions. See the Documents tab.</div></div>` : ""}
      </div><div class="stack"><div class="card"><div class="card-head"><h3>${icon("play")}Run agents</h3></div><div class="card-body">${runPanel(ev)}</div></div>${reimport}</div></div>`;
    return;
  }

  const prog = fs.program || [];
  const conflicts = fs.conflicts || [];
  const openConf = conflicts.filter((x) => !x.resolved).length;
  const weekday = fs.weekday || weekdayOf(fv(fs.date));
  const factCard = `<div class="card"><div class="card-head"><h3>${icon("file")}Fact Sheet</h3>
      <span class="small muted">Single source of truth · hover ${icon("info").replace("<svg", '<svg style="width:12px;height:12px;vertical-align:-2px"')} for sources</span></div>
    <div class="card-body"><dl class="facts">
      ${factRow("Event", fs.event_name)}${factRow("Chinese name", fs.event_name_zh)}${factRow("Organiser", fs.org_name_en)}${factRow("Organiser (Chinese)", fs.org_name_zh)}
      ${factRow("Date", fs.date, { always: true, extra: weekday ? ` ${chip(esc(weekday), "purple", "sq")}` : "" })}
      ${factRow("VIP reception", fs.vip_time)}${factRow("Main program", fs.main_time)}${factRow("Venue", fs.venue, { always: true })}${factRow("City / region", fs.city_region)}
      ${fs.budget && fv(fs.budget) ? `<dt>Budget</dt><dd>${esc(fv(fs.budget))}${fs.budget_assumed ? ` <span class="tip" tabindex="0" style="cursor:help">${chip("Assumed", "amber")}<span class="tip-body" role="tooltip">No document states a budget — estimated by the Brief Analyst.</span></span>` : ""}${srcTip(fs.budget)}${fs.budget_basis ? `<div class="basis">${esc(fs.budget_basis)}</div>` : ""}</dd>` : ""}
      ${factRow("Website", fs.website, { link: true })}${factRow("Event page", fs.event_page, { link: true })}${factRow("Contact", fs.contact_email, { link: true })}${factRow("Instagram", fs.instagram)}
      ${fs.audience ? `<dt>Audience</dt><dd>${esc(fs.audience)}</dd>` : ""}
    </dl>
    ${fs.org_description ? `<div class="subhead">About the organiser</div><p class="small" style="color:var(--text-2)">${esc(fs.org_description)}</p>` : ""}
    </div></div>`;
  const progCard = `<div class="card"><div class="card-head"><h3>${icon("clock")}Program & tiers</h3></div><div class="card-body">
      ${prog.length ? `<div class="subhead">Program timeline</div><div class="timeline-prog">${prog.map((s) => `<div class="seg"><span class="time">${esc(s.time || "—")}</span><span>${esc(s.segment)}</span></div>`).join("")}</div>` : ""}
      ${(fs.ticket_tiers || []).length ? `<div class="subhead">Tickets</div><div class="tiers">${fs.ticket_tiers.map((t) => `<div class="tier-card"><div class="n">${esc(t.name)}</div><div class="p">${esc(t.price)}</div><div class="i">${esc(t.includes || "")}</div></div>`).join("")}</div>` : ""}
      ${(fs.sponsorship_tiers || []).length ? `<div class="subhead">Sponsorship</div><div class="tiers">${fs.sponsorship_tiers.map((t) => `<div class="tier-card"><div class="n">${esc(t.name)}</div><div class="p">${esc(t.price)}</div><div class="i">${esc(t.includes || "")}</div></div>`).join("")}</div>` : ""}
      ${fs.guest_policy ? `<div class="subhead">Guest policy</div><div class="callout plain">${icon("shield")}<div class="small">${esc(fs.guest_policy)}</div></div>` : ""}
      ${(fs.key_messages || []).length ? `<div class="subhead">Key messages</div><ul class="bullets small">${fs.key_messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${(fs.team || []).length ? `<div class="subhead">Organising team</div><div class="row wrap">${fs.team.map((t) => `<span class="chip outline wrap" style="max-width:100%" title="${esc(t.email || "")}">${esc(t.name)} · ${esc(t.role)}</span>`).join("")}</div>` : ""}
      ${(fs.open_questions || []).length ? `<div class="subhead">Open questions</div><ul class="bullets small">${fs.open_questions.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
    </div></div>`;
  const conflictCard = `<div class="card"><div class="card-head"><h3>${icon("alert")}Conflicts</h3>
      ${conflicts.length ? chip(openConf ? `${openConf} to decide` : "All resolved", openConf ? "red" : "green") : ""}</div>
    <div class="card-body">${conflicts.length ? conflicts.map((cf, i) => conflictBlock(cf, i)).join("") : `<div class="small muted">${icon("check").replace("<svg", '<svg style="width:14px;height:14px;vertical-align:-2px;color:var(--green-dot)"')} The documents agree on the key facts.</div>`}</div></div>`;
  const slots = st.slots || [];
  const slotCard = slots.length ? `<div class="card"><div class="card-head"><h3>${icon("grid")}Program slots</h3><span class="small muted">${slots.reduce((a, s) => a + (s.gap > 0 ? s.gap : 0), 0)} still open</span></div><div class="card-body tight" style="padding:4px 20px">
      ${slots.map((s) => {
        const filled = (s.filled_by || []).length, need = Math.max(s.needed || 0, filled, 1);
        const segs = Array.from({ length: Math.min(need, 12) }, (_, i) => `<i class="${i < filled ? "on" : s.gap > 0 && i < filled + s.gap ? "gap" : ""}"></i>`).join("");
        return `<div class="slot"><div class="top"><b>${esc(s.name)}</b><span class="small">${s.gap > 0 ? `<span class="nowrap" style="color:var(--amber-fg);font-weight:600">${s.gap} open</span>` : `<span class="nowrap" style="color:var(--green-fg);font-weight:600">filled</span>`}</span></div>
          <div class="segbar" title="${filled} of ${s.needed} filled">${segs}</div>
          ${filled ? `<div class="xsmall muted ellipsis" title="${esc(s.filled_by.join(", "))}">${s.filled_by.map(esc).join(", ")}</div>` : ""}${s.criteria ? `<div class="xsmall faint">${esc(s.criteria)}</div>` : ""}</div>`;
      }).join("")}</div></div>` : "";
  const rub = st.rubric || [];
  const rubricCard = rub.length ? `<div class="card"><div class="card-head"><h3>${icon("chart")}Priority rubric</h3></div><div class="card-body">
      ${rub.map((r) => `<div class="hbar" style="grid-template-columns:130px minmax(0,1fr) 44px" title="${esc(r.description)}"><span class="small ellipsis">${esc(r.name)}</span><div class="track" style="height:10px"><i class="cost" style="width:${Math.round(num(r.weight) * 100)}%"></i></div><span class="v small">${Math.round(num(r.weight) * 100)}%</span></div>`).join("")}
      ${(st.scouting_briefs || []).length ? `<div class="subhead">Scouting briefs</div><ul class="bullets small">${st.scouting_briefs.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    </div></div>` : "";
  body.innerHTML = `${nextStep}${kpis}<div class="split"><div class="stack">${factCard}${progCard}</div>
    <div class="stack">${conflictCard}<div class="card"><div class="card-head"><h3>${icon("play")}Run agents</h3>${ev.last_run ? `<span class="small muted">last: ${esc(ev.last_run.status)}</span>` : ""}</div><div class="card-body">${runPanel(ev)}</div></div>
    ${slotCard}${rubricCard}${reimport}</div></div>`;
}

function conflictBlock(cf, i) {
  const vals = (cf.values || []).map((v) => `<div class="cval"><div class="q"><span class="doc">${esc(v.document)}</span><span class="quote">“${esc(v.quote)}”</span></div>
      ${cf.resolved ? "" : `<button class="btn xs" data-act="conflict-use" data-i="${i}" data-v="${esc(v.value || v.quote)}" title="Use this value — you can still edit it below">Use this</button>`}</div>`).join("");
  if (cf.resolved) {
    return `<div class="conflict resolved"><div class="f">${esc(cf.field)} ${chip(icon("check") + "Resolved", "green")}</div>
      <div class="small mt8">Using <b>${esc(cf.recommended)}</b> <span class="muted">— ${esc(cf.reason || "")}</span></div>
      <details class="mt8"><summary class="small muted" style="cursor:pointer">Show sources / change</summary>${vals}
        <div class="row mt8"><input class="input sm" value="${esc(cf.recommended)}" data-conf-input="${i}" aria-label="Correct value"><button class="btn sm" data-act="conflict-resolve" data-i="${i}">Save</button></div></details></div>`;
  }
  const ask = /ASK/i.test(cf.recommended || "");
  return `<div class="conflict"><div class="f">${esc(cf.field)} ${chip("Needs your decision", "red")}</div>
    <div class="mt8">${vals}</div>
    <div class="callout plain mt8" style="padding:9px 11px">${icon("sparkle")}<div class="small">${ask ? "The Brief Analyst couldn't tell which is right — <b>please decide</b>." : `Recommended: <b>${esc(cf.recommended)}</b>`}<div class="muted xsmall">${esc(cf.reason || "")}</div></div></div>
    <div class="row mt8"><input class="input sm" value="${ask ? "" : esc(cf.recommended)}" placeholder="Type the correct value" data-conf-input="${i}" aria-label="Correct value for ${esc(cf.field)}">
      <button class="btn sm primary" data-act="conflict-resolve" data-i="${i}">${icon("check")}Confirm</button></div></div>`;
}

async function resolveConflict(btn) {
  const i = +btn.dataset.i;
  const cf = S.ev.fact_sheet.conflicts[i];
  const input = $(`[data-conf-input="${i}"]`);
  const value = input.value.trim();
  if (!value) { toast("Type or pick the correct value first.", "error"); input.focus(); return; }
  setBusy(btn, true, "Saving…");
  try {
    await api(`/api/events/${S.evId}/facts/resolve`, { method: "POST", body: { field: cf.field, value } });
    toast(`“${esc(cf.field)}” set to <b>${esc(value)}</b>. Audit re-run and Drive updated.`, "ok");
    await refreshEventView();
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

async function reimport(btn) {
  const f = $("[data-reimport-file]").files[0];
  if (!f) { toast("Choose the updated .zip first.", "error"); return; }
  const fd = new FormData();
  fd.append("file", f); fd.append("name", S.ev.name || ""); fd.append("org", S.ev.org || ""); fd.append("event_id", S.evId);
  setBusy(btn, true, "Uploading…");
  try {
    await api("/api/events/import", { method: "POST", form: fd });
    toast("Documents refreshed. Run the agents again to pick up the changes.", "ok", 6000);
    await refreshEventView();
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

/* ---------------------------------------------------------------- lists (generated + extracted) */

const LIST_MODES = {
  fast: { label: "Fast", hint: "≈ $0.05–0.10 · model knowledge + web verification", help: "Fast: the scout proposes people from model knowledge, then verifies each on the web. ~$0.05–0.10." },
  deep: { label: "Deep research", hint: "≈ $0.15–0.30 · scout searches the web itself", help: "Deep research: the scout searches the web itself — best for niche community lists. ~$0.15–0.30." },
};
const listMode = () => (store.get("listMode", "fast") === "deep" ? "deep" : "fast");

function listExamples() {
  const slots = ((S.ev && S.ev.strategy) || {}).slots || [];
  const open = slots.find((x) => (x.gap || 0) > 0) || slots[0];
  return [
    "Keynote speakers who fit the event theme, 5 names",
    "Sponsors with a track record at similar events",
    open ? `Panelists for “${open.name.replace(/\s*\([^)]*\)\s*$/, "")}”, ${Math.max(3, Math.min(8, (open.gap || open.needed || 4) + 2))} names` : "Panelists for the main panel, 6 names",
    "Alumni founders or investors for networking",
  ];
}
const LIST_EXAMPLES_UNUSED = [
  "Keynote speakers: Bay Area Chinese tech executives who are LGBTQ+ allies",
  "Sponsors: Bay Area companies with Asian/LGBTQ+ ERGs",
  "Panelists on clean-energy finance, 6 names",
  "Private-session invitees: alumni founders/investors",
];

async function tabLists(body) {
  const lists = await api(`/api/events/${S.evId}/lists`);
  S.lists = lists;
  const gen = S.generating && S.generating.eid === S.evId;
  const h = S.health || {};
  const composer = `<div class="card mb16" style="border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)">
    <div class="card-head"><h3>${icon("sparkle")}Generate a list</h3><span class="small muted">A Talent Scout agent researches the web and returns people with cited evidence</span></div>
    <div class="card-body">
      <textarea class="textarea" rows="2" data-list-brief placeholder="Describe who you need, e.g. “Panelists for the main panel, 6 names, ideally based nearby and bilingual”" ${gen ? "disabled" : ""}>${esc(gen ? S.generating.brief : store.get("listBrief", ""))}</textarea>
      <div class="row wrap mt8"><span class="xsmall muted">Try:</span>${listExamples().map((x) => `<button class="chip outline" style="cursor:pointer;border:0" data-act="list-example" data-v="${esc(x)}" ${gen ? "disabled" : ""}>${esc(x)}</button>`).join("")}</div>
      <div class="row wrap mt12"><label class="small muted" for="list-count">How many</label>
        <select id="list-count" class="select sm" style="width:80px" data-list-count ${gen ? "disabled" : ""}>${[3, 5, 6, 8, 10, 12, 15].map((n) => `<option ${n === 8 ? "selected" : ""}>${n}</option>`).join("")}</select>
        <div class="seg-ctl" role="group" aria-label="Research mode" style="margin-left:8px">${Object.entries(LIST_MODES).map(([k, m]) => `<button data-act="list-mode" data-v="${k}" aria-pressed="${listMode() === k}" title="${esc(m.help)}" ${gen ? "disabled" : ""}>${m.label}</button>`).join("")}</div>
        <span class="spacer"></span><span class="xsmall muted" data-list-mode-hint>${esc(LIST_MODES[listMode()].hint)} · nothing is sent to anyone</span>
        <button class="btn primary" style="margin-left:auto" data-act="list-generate" ${gen || !h.key_present ? "disabled" : ""}>${gen ? '<span class="spinner"></span>Researching…' : icon("sparkle") + "Generate"}</button></div>
      <div data-list-progress>${gen ? listProgressHtml() : ""}</div>
    </div></div>`;
  if (!lists.length) {
    body.innerHTML = composer + `<div class="card">${emptyState("list", "No lists yet", "Generate a list above, or run the agents: the roster from your files is grouped into lists by program slot, and scouted candidates appear here first.")}</div>`;
    return;
  }
  const open = store.get("listsOpen", {});
  body.innerHTML = composer + lists.map((l, i) => {
    const isOpen = open[l.name] != null ? open[l.name] : l.scouted || i < 3;
    return `<details class="card mb16" ${isOpen ? "open" : ""} data-list-name="${esc(l.name)}">
      <summary class="card-head" style="cursor:pointer;list-style:none"><h3>${icon(l.scouted ? "sparkle" : "list")}${esc(l.name.replace(/^Scouted · /, ""))}
        ${l.scouted ? chip("Scouted", "pink") : chip("From your files", "gray")}<span class="count-badge">${l.people.length}</span></h3>
        <div class="btn-row"><button class="btn sm" data-act="list-csv" data-i="${i}">${icon("download")}Export CSV</button></div></summary>
      <div class="table-wrap"><table class="tbl" style="table-layout:fixed"><colgroup><col style="width:27%"><col style="width:52px"><col style="width:86px"><col style="width:13%"><col style="width:16%"><col style="width:108px"><col style="width:162px"></colgroup><thead><tr><th>Person</th><th>Tier</th><th>Fit</th><th>Evidence</th><th>Best route</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${l.people.map((p) => listRow(p)).join("")}</tbody></table></div></details>`;
  }).join("");
  $$("details[data-list-name]", body).forEach((d) => d.addEventListener("toggle", () => { const o = store.get("listsOpen", {}); o[d.dataset.listName] = d.open; store.set("listsOpen", o); }));
}

function listRow(p) {
  const score = p.priority_score == null ? null : Math.round(p.priority_score);
  const ev = (p.evidence || []).filter(Boolean);
  const urls = ev.filter(isURL), docs = ev.filter((e) => !isURL(e));
  const planning = S.planning.has(p.id);
  return `<tr class="clickable" data-act="open-person" data-pid="${p.id}">
    <td><div class="person" style="align-items:flex-start">${avatar(p.name)}<div style="min-width:0"><div class="nm" title="${esc(p.name)}">${esc(p.name)}</div>${p.aliases && p.aliases.length ? `<div class="al">${esc(p.aliases.slice(0, 2).join(" · "))}</div>` : ""}
      <div class="xsmall muted" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px" title="${esc(p.intro || "")}">${esc(p.intro || p.role || "")}</div></div></div></td>
    <td>${tierBadge(p.tier)}</td>
    <td>${score == null ? '<span class="faint small">—</span>' : `<div class="row" style="gap:6px"><div class="bar thin" style="flex:1;margin:0"><i style="width:${Math.min(100, score)}%"></i></div><span class="small strong" style="width:24px;text-align:right">${score}</span></div>`}</td>
    <td>${urls.slice(0, 3).map((u) => `<a class="chip outline" style="margin:1px 2px 1px 0;max-width:180px" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${icon("external")}<span class="ellipsis">${esc(domainOf(u))}</span></a>`).join("")}
      ${docs.length ? `<span class="xsmall muted" title="${esc(docs.join("\n"))}">${plural(docs.length, "file")}</span>` : ""}${!ev.length ? '<span class="faint small">—</span>' : ""}</td>
    <td>${routeSummary(p.best_route, p.name)}</td>
    <td><div class="stack" style="gap:4px">${pStatusChip(p.status, false)}${p.draft_status ? dStatusChip(p.draft_status) : ""}</div></td>
    <td class="nowrap" style="text-align:right"><button class="btn xs" data-act="plan-person" data-pid="${p.id}" ${planning || !(S.health || {}).key_present ? "disabled" : ""}>${planning ? '<span class="spinner"></span>Planning…' : icon("route") + "Plan & draft"}</button>
      <button class="btn xs ghost" data-act="open-person" data-pid="${p.id}" aria-label="Open ${esc(p.name)}">${icon("chevron")}</button></td></tr>`;
}

function listProgressHtml() {
  const g = S.generating;
  const tr = (S.trace[S.evId] || { entries: [] }).entries.filter((e) => e.id > (g.afterId || 0) && /Scout|Coordinator|Budget/.test(e.agent));
  const secs = Math.round((Date.now() - g.started) / 1000);
  return `<div class="working mt12"><span class="spinner"></span><div style="flex:1;min-width:0"><b>Talent Scout is researching…</b> <span class="muted small">${secs}s · ${listMode() === "deep" ? "deep research, usually 1–3 min" : "usually 30–90 s"}</span>
    ${tr.slice(-4).map((e) => `<div class="xsmall muted ellipsis">${esc(fmtTime(e.ts))} · ${esc(e.agent)}: ${esc(e.message)}</div>`).join("")}</div></div>`;
}

async function generateList(btn) {
  const ta = $("[data-list-brief]");
  const brief = ta.value.trim();
  if (!brief) { toast("Describe the list you want first — or click one of the examples.", "error"); ta.focus(); return; }
  const count = parseInt($("[data-list-count]").value, 10) || 8;
  store.set("listBrief", brief);
  const eid = S.evId;
  await ensureTrace(eid);
  S.generating = { eid, brief, started: Date.now(), afterId: (S.trace[eid] || {}).lastId || 0 };
  startPoll(eid, true);
  if (S.tab === "lists") await renderTab();
  const tick = setInterval(() => { const el = $("[data-list-progress]"); if (el && S.generating) el.innerHTML = listProgressHtml(); }, 1000);
  try {
    const r = await api(`/api/events/${eid}/lists/generate`, { method: "POST", body: { brief, count, mode: listMode() } });
    const n = (r.added || []).length;
    toast(n ? `Added <b>${n}</b> people to “${esc(r.list_name)}” (${fmtCost(r.cost_usd || 0)}).` : `“${esc(r.list_name || "List")}”: no new people with evidence were found${r.cost_usd != null ? ` (${fmtCost(r.cost_usd)})` : ""}. ${esc(r.warning || "Try a broader brief or Deep research.")}`, n ? "ok" : "info", 7000);
    if (n) store.set("listBrief", "");
  } catch (e) { toastErr(e); }
  finally {
    clearInterval(tick);
    S.generating = null;
    stopPollIfIdle(eid);
    if (S.evId === eid) await refreshEventView();
  }
}

function exportListCSV(i) {
  const l = S.lists[i];
  const rows = [["name", "aliases", "tier", "fit_score", "status", "role", "owner", "origin", "intro", "evidence", "best_route", "draft_status", "contacts"]];
  for (const p of l.people) {
    const r = p.best_route;
    rows.push([p.name, (p.aliases || []).join("; "), p.tier || "", p.priority_score ?? "", p.status, p.role || "", p.owner || "", p.origin || "", p.intro || "",
      (p.evidence || []).join(" "), r ? `${ROUTE_TYPES[r.route_type] || r.route_type}${r.via ? " via " + r.via : ""} (${r.warmth})` : "", p.draft_status || "",
      (p.contacts || []).map((c) => `${c.channel}:${c.value}`).join("; ")]);
  }
  downloadText(`${(S.ev.name || "event").replace(/[^\w\u4e00-\u9fff]+/g, "_")}__${l.name.replace(/[^\w\u4e00-\u9fff]+/g, "_")}.csv`, toCSV(rows));
}

async function planPerson(pid, btn) {
  if (S.planning.has(pid)) return;
  S.planning.add(pid);
  const eid = S.evId;
  await ensureTrace(eid);
  startPoll(eid, true);
  const rerender = () => {
    $$(`[data-act="plan-person"][data-pid="${pid}"]`).forEach((b) => { b.disabled = S.planning.has(pid); b.innerHTML = S.planning.has(pid) ? '<span class="spinner"></span>Planning…' : icon("route") + "Plan & draft"; });
    if (S.drawerPid === pid) renderDrawerPlanState();
  };
  rerender();
  toast("Connection Finder → Route Planner → Drafter → Reviewer started. Takes 30–120 s; keep working meanwhile.", "info", 5000);
  try {
    const r = await api(`/api/people/${pid}/plan`, { method: "POST" });
    toast(`Routes and a reviewed draft are ready (${fmtCost(r.usage && r.usage.cost_usd)}).`, "ok");
  } catch (e) { toastErr(e); }
  finally {
    S.planning.delete(pid);
    stopPollIfIdle(eid);
    rerender();
    if (S.drawerPid === pid) await loadDrawer(pid);
    if (S.evId === eid) await refreshEventView();
  }
}

/* ---------------------------------------------------------------- guests */

function needsAction(p) {
  if (p.relationship === "team_member") return false;
  if (["needs_changes", "ready_for_review", "in_review", "blocked"].includes(p.draft_status)) return true;
  if (["contacted_no_reply", "pending", "likely"].includes(p.status)) return true;
  return (p.tier === "A" || p.tier === "B") && ["not_started", "unknown"].includes(p.status) && !p.draft_status;
}

async function tabGuests(body) {
  const people = await api(`/api/events/${S.evId}/people`);
  S.people = people;
  const f = S.guestsFilter;
  const slots = [...new Set(people.map((p) => p.slot).filter(Boolean))].sort();
  const hasOrgs = people.some((p) => p.entity === "organization");
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`;
  body.innerHTML = `<div class="card">
    <div class="filters">
      <div class="search">${icon("search")}<input class="input" placeholder="Search name, alias, role…  ( / )" value="${esc(f.q)}" data-gf="q" data-search aria-label="Search guests"></div>
      ${hasOrgs ? `<div class="seg-ctl" role="group" aria-label="People or organisations">${[["person", "People"], ["organization", "Organisations"], ["", "All"]].map(([v, l]) => `<button data-act="gf-entity" data-v="${v}" aria-pressed="${f.entity === v}">${l}</button>`).join("")}</div>` : ""}
      <select class="select" data-gf="tier" aria-label="Tier">${opt("", "All tiers", f.tier)}${["A", "B", "C"].map((t) => opt(t, "Tier " + t, f.tier)).join("")}${opt("none", "Not tiered", f.tier)}</select>
      <select class="select" data-gf="status" aria-label="Status">${opt("", "All statuses", f.status)}${Object.entries(PSTATUS).map(([k, v]) => opt(k, v[0], f.status)).join("")}</select>
      ${slots.length ? `<select class="select" data-gf="slot" aria-label="Slot" style="max-width:200px">${opt("", "All slots", f.slot)}${slots.map((s) => opt(s, s, f.slot)).join("")}</select>` : ""}
      <select class="select" data-gf="origin" aria-label="Origin">${opt("", "Roster + scouted", f.origin)}${opt("roster", "From your files", f.origin)}${opt("scout", "Scouted", f.origin)}</select>
      <button class="toggle" data-act="gf-needs" aria-pressed="${!!f.needs}" title="Drafts to review, Tier A/B not contacted yet, or waiting on a reply">${icon("zap")}Needs action</button>
      <span class="spacer"></span><span class="small muted" data-gcount></span>
      <div class="seg-ctl" role="group" aria-label="View">${[["table", "table", "Table"], ["board", "columns", "Board"]].map(([v, ic, l]) => `<button data-act="g-view" data-v="${v}" aria-pressed="${guestView() === v}">${icon(ic)}${l}</button>`).join("")}</div>
    </div>
    <div data-gtable></div></div>`;
  renderGuestRows();
}

function filteredPeople() {
  const f = S.guestsFilter, q = f.q.trim().toLowerCase();
  return (S.people || []).filter((p) => {
    if (f.entity && (p.entity || "person") !== f.entity) return false;
    if (f.tier && (f.tier === "none" ? p.tier : p.tier !== f.tier)) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.slot && p.slot !== f.slot) return false;
    if (f.origin && (p.origin || "roster") !== f.origin) return false;
    if (f.needs && !needsAction(p)) return false;
    if (q) {
      const hay = [p.name, ...(p.aliases || []), p.role, p.slot, p.owner, p.intro, p.category].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const guestView = () => (store.get("guestView", "table") === "board" ? "board" : "table");
function renderGuestRows() {
  const el = $("[data-gtable]");
  if (!el) return;
  const rows = filteredPeople();
  const total = (S.people || []).length;
  $("[data-gcount]").textContent = rows.length === total ? plural(total, "person", "people") : `${rows.length} of ${total}`;
  if (!total) { el.innerHTML = emptyState("users", "No people yet", "Run the agents: the Roster Analyst extracts everyone your files mention (with Chinese/English aliases), then the Strategist ranks them into tiers.", `<button class="btn primary" data-act="open-run">${icon("play")}Run agents</button>`); return; }
  if (!rows.length) { el.innerHTML = emptyState("search", "No matches", "Try clearing a filter.", `<button class="btn" data-act="gf-clear">Clear filters</button>`); return; }
  if (guestView() === "board") {
    el.innerHTML = `<div class="kanban">${STAGES.map(([k, l]) => {
      const list = rows.filter((p) => stageOf(p.status) === k);
      return `<div class="kcol"><div class="kcol-h"><i class="st-${k}"></i><span class="eyebrow">${l}</span><span class="spacer"></span><span class="count-badge">${list.length}</span></div>
        <div class="kcards">${list.map((p) => `<button class="pcard" data-act="open-person" data-pid="${p.id}" title="${esc(p.name)}">
          <div class="top">${avatar(p.name, "sm")}<div style="min-width:0;flex:1"><div class="nm">${esc(p.name)}</div><div class="rl" title="${esc(p.role || "")}">${esc(p.role || p.slot || "Role to be decided")}</div></div></div>
          <div class="mid">${routeSummary(p.best_route, p.name)}</div>
          <div class="bot">${tierBadge(p.tier)}${p.draft_status ? dStatusChip(p.draft_status) : p.origin === "scout" ? chip("scouted", "pink") : '<span class="xsmall faint">no draft</span>'}</div></button>`).join("") || `<div class="kempty">Nobody here</div>`}</div></div>`;
    }).join("")}</div>`;
    return;
  }
  el.innerHTML = `<div class="table-wrap"><table class="tbl fixed rows"><thead><tr><th style="width:24%">Name</th><th style="width:52px">Tier</th><th style="width:14%">Role / slot</th><th style="width:124px">Status</th><th class="col-owner" style="width:118px">Owner</th><th style="width:112px">Channels</th><th>Best route</th><th style="width:124px">Draft</th></tr></thead><tbody>
    ${rows.map((p) => {
      const tags = `${p.origin === "scout" ? chip("scouted", "pink") : ""}${p.entity === "organization" ? chip("org", "slate", "sq") : ""}${p.relationship === "team_member" ? chip("team", "brass", "sq") : ""}`;
      const sub = (p.aliases || []).join(" · ");
      return `<tr class="clickable ${S.drawerPid === p.id ? "selected" : ""}" data-act="open-person" data-pid="${p.id}" tabindex="0">
      <td><div class="person">${avatar(p.name)}<div style="min-width:0"><div class="row" style="gap:6px;min-width:0"><span class="nm" title="${esc(p.name)}">${esc(p.name)}</span>${tags}${p.in_other_events ? `<span title="Also appears in another event" style="color:var(--brass);display:inline-flex">${icon("link").replace("<svg", '<svg style="width:13px;height:13px"')}</span>` : ""}</div>${sub ? `<div class="al" title="${esc(sub)}">${esc(sub)}</div>` : ""}</div></div></td>
      <td>${tierBadge(p.tier)}</td>
      <td title="${esc([p.role, p.slot].filter(Boolean).join(" · "))}"><span class="small">${esc(p.role || p.slot || "—")}</span></td>
      <td>${pStatusChip(p.status, false)}</td>
      <td class="col-owner">${p.owner ? `<span class="person" title="${esc(p.owner)}">${avatar(p.owner, "xs")}<span class="small ellipsis">${esc(p.owner)}</span></span>` : '<span class="faint small">—</span>'}</td>
      <td><div class="row" style="gap:5px">${(p.contacts || []).slice(0, 3).map(chBadge).join("")}${(p.contacts || []).length > 3 ? `<span class="xsmall muted">+${p.contacts.length - 3}</span>` : ""}${!(p.contacts || []).length ? '<span class="faint small">none</span>' : ""}</div></td>
      <td>${routeSummary(p.best_route, p.name)}</td>
      <td>${dStatusChip(p.draft_status)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

/* ---------------------------------------------------------------- person drawer */

const PATH_KIND = {
  existing_thread: ["Existing thread", ""], owner: ["Relationship owner", ""], team_intro: ["Team member intro", ""],
  intermediary: ["Intermediary", ""], organisation: ["Through organisation", ""], past_event: ["Past event", ""],
  linkedin_1st: ["LinkedIn 1st-degree", ""], linkedin_colleague: ["LinkedIn colleague", ""],
};
const WARM_TONE = { hot: "orange", warm: "amber", cold: "slate" };

function syncDrawer() {
  const p = S.route.query.get("p");
  const onEvent = S.route.parts[0] === "event";
  if (p && onEvent) { if (S.drawerPid !== +p) openDrawer(+p); }
  else if (S.drawerPid) closeDrawerDom();
}

function openDrawer(pid) {
  S.drawerPid = pid;
  S.drawer = null;
  S.paths = null;
  $("#drawer-root").innerHTML = `<div class="backdrop" data-act="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Person details">
    <button class="btn ghost sm close" data-act="close-drawer" aria-label="Close (Esc)">${icon("x")}</button><div data-drawer>${skel()}</div></aside>`;
  $$("tr[data-pid]").forEach((tr) => tr.classList.toggle("selected", +tr.dataset.pid === pid));
  loadDrawer(pid);
}
function closeDrawerDom() {
  S.drawerPid = null;
  $("#drawer-root").innerHTML = "";
  $$("tr.selected").forEach((tr) => tr.classList.remove("selected"));
}
function closeDrawer() { setQuery("p", null); }

async function loadDrawer(pid) {
  try {
    const [p, paths] = await Promise.all([api(`/api/people/${pid}`), api(`/api/people/${pid}/paths`).catch(() => [])]);
    if (S.drawerPid !== pid) return;
    S.drawer = p; S.paths = paths;
    renderDrawer();
  } catch (e) {
    const el = $("[data-drawer]");
    if (el) el.innerHTML = `<div class="drawer-body">${emptyState("alert", "Couldn't load this person", esc(e.message))}</div>`;
  }
}

function renderDrawerPlanState() {
  const el = $("[data-plan-state]");
  if (!el || !S.drawer) return;
  el.innerHTML = planStateHtml(S.drawer);
}
function planStateHtml(p) {
  if (S.planning.has(p.id)) {
    return `<div class="working"><span class="spinner"></span><div><b>Planning & drafting…</b>
      <div class="steps">Connection Finder ${icon("chevron").replace("<svg", '<svg style="width:11px;height:11px"')} Route Planner ${icon("chevron").replace("<svg", '<svg style="width:11px;height:11px"')} Drafter ${icon("chevron").replace("<svg", '<svg style="width:11px;height:11px"')} Reviewer · 30–120 s</div></div></div>`;
  }
  const noKey = !(S.health || {}).key_present;
  return `<button class="btn primary" data-act="plan-person" data-pid="${p.id}" ${noKey ? "disabled title='Needs an API key'" : ""}>${icon("route")}${(p.routes || []).length ? "Re-plan & draft" : "Plan & draft"} </button>`;
}

function connGraph(paths, p) {
  const shown = paths.slice(0, 5);
  const colA = [], colB = [];
  const idx = (arr, n) => { let i = arr.indexOf(n); if (i < 0) { arr.push(n); i = arr.length - 1; } return i; };
  const links = shown.map((x, i) => {
    const ch = (x.chain && x.chain.length ? x.chain : [x.via, p.name]).filter(Boolean);
    const src = ch.length > 1 ? ch[0] : x.via || "Team";
    const mid = ch.length > 2 ? ch[1] : null;
    return { a: idx(colA, src), b: mid != null ? idx(colB, mid) : null, warmth: x.warmth || "cold", best: i === 0 };
  });
  const rows = Math.max(colA.length, colB.length, 1);
  const W = 540, top = 30, rowH = 62, H = top + rows * rowH + 6;
  const xA = 62, xB = 270, xT = colB.length ? 470 : 400;
  const yOf = (i, len) => top + ((rows * rowH) / len) * (i + 0.5);
  const yT = top + (rows * rowH) / 2;
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${x1 + (x2 - x1) * 0.5},${y1} ${x2 - (x2 - x1) * 0.5},${y2} ${x2},${y2}`;
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  const node = (x, y, name, cls, r = 17) => `<g class="nd ${cls}" style="--h:${hueOf(name)}"><title>${esc(name)}</title>
      <circle class="bg" cx="${x}" cy="${y}" r="${r}" style="fill:hsl(var(--h) var(--av-s) var(--av-l))"/>
      <text class="ini" x="${x}" y="${y}" style="fill:hsl(var(--h) 40% var(--av-text-l));font-size:${r > 18 ? 13 : 11}px">${esc(initials(name))}</text>
      <text class="lb" x="${x}" y="${y + r + 14}">${esc(cut(shortName(name), 18))}</text></g>`;
  let edges = "";
  links.forEach((l) => {
    const yA = yOf(l.a, colA.length);
    const cls = `lnk ${esc(l.warmth)} ${l.best ? "best" : ""}`;
    if (l.b != null) {
      const yB = yOf(l.b, colB.length);
      edges += `<path class="${cls}" d="${curve(xA + 18, yA, xB - 18, yB)}"/><path class="${cls}" d="${curve(xB + 18, yB, xT - 23, yT)}"/>`;
    } else edges += `<path class="${cls}" d="${curve(xA + 18, yA, xT - 23, yT)}"/>`;
  });
  const bestWarm = links[0] ? links[0].warmth : "cold";
  return `<svg class="cgraph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Connection map: who on your team can reach ${esc(p.name)}">
    <text class="col" x="${xA}" y="14">YOUR TEAM</text>${colB.length ? `<text class="col" x="${xB}" y="14">INTERMEDIARY</text>` : ""}<text class="col" x="${xT}" y="14">INVITEE</text>
    ${edges}
    ${colA.map((n, i) => node(xA, yOf(i, colA.length), n, "team")).join("")}
    ${colB.map((n, i) => node(xB, yOf(i, colB.length), n, "via")).join("")}
    <circle class="halo" cx="${xT}" cy="${yT}" r="28"/>
    ${node(xT, yT, p.name, "target " + bestWarm, 22)}
  </svg>`;
}

function renderDrawer() {
  const p = S.drawer, el = $("[data-drawer]");
  if (!p || !el) return;
  const prevBody = $(".drawer-body", el);
  const keepScroll = prevBody && S.drawerRendered === p.id ? prevBody.scrollTop : 0;
  S.drawerRendered = p.id;
  queueMicrotask(() => { const b = $(".drawer-body", el); if (b) b.scrollTop = keepScroll; });
  const paths = S.paths || [];
  const routes = p.routes || [];
  const reply = (S.replyResult || {})[p.id];
  const statusOpts = Object.entries(PSTATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? "selected" : ""}>${v[0]}</option>`).join("");
  const evid = (p.evidence || []).filter(Boolean);
  const docId = (path) => ((S.ev && S.ev.documents) || []).find((d) => d.path === path)?.id;
  const srcLink = (s) => !s ? "" : isURL(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(domainOf(s))} ${icon("external").replace("<svg", '<svg style="width:11px;height:11px;vertical-align:-1px"')}</a>`
    : docId(s) ? `<a href="${evHash(p.event_id, "documents", docId(s))}">${esc(s)}</a>` : esc(s);

  const connMap = `<div class="dsec"><h4>${icon("users")}Connection map<span class="spacer"></span><span class="xsmall faint" style="font-family:var(--sans);font-weight:400">team → intermediary → invitee</span></h4>
    ${paths.length ? `${connGraph(paths, p)}<div class="plist">${paths.map((x, i) => {
      const [en] = PATH_KIND[x.kind] || [x.kind];
      return `<div class="pi ${i === 0 ? "best" : ""}"><span class="n">${i + 1}</span><div style="min-width:0"><div class="row wrap" style="gap:6px"><b>${esc(en)}</b>${chip(`<span class="dot"></span>${esc(x.warmth)}`, WARM_TONE[x.warmth] || "gray")}${x.channel ? `<span class="ch">${esc(shortCh(x.channel))}</span>` : ""}${i === 0 ? chip("Strongest", "brass") : ""}</div>${x.evidence ? `<div class="xsmall muted" style="margin-top:2px">${esc(x.evidence)}</div>` : ""}</div></div>`;
    }).join("")}</div>`
      : `<div class="callout plain">${icon("info")}<div class="small">No connection paths in your records yet. Add an owner, notes that name an intermediary, or import a team member's LinkedIn connections on the <a class="link" href="#/team">Team</a> page — the Route Planner will also research official channels.</div></div>`}</div>`;

  const routesHtml = `<div class="dsec"><h4>${icon("route")}Recommended routes</h4>
    ${routes.length ? `<div class="routes">${routes.map((r, i) => {
      const label = r.route_type === "intermediary_intro" ? `Warm intro via ${r.via || "intermediary"}` : ROUTE_TYPES[r.route_type] || r.route_type;
      return `<div class="route ${esc(r.warmth)} ${i === 0 ? "first" : ""}"><span class="rank">${r.rank || i + 1}</span><div style="min-width:0">
        <div class="path">${esc(label)}${r.via && r.route_type !== "intermediary_intro" ? `<span class="arrow">via</span>${esc(r.via)}` : ""}${chip(`<span class="dot"></span>${esc(r.warmth)}`, WARM_TONE[r.warmth] || "gray")}</div>
        ${r.channel || r.target ? `<div class="row small mt8" style="gap:6px;flex-wrap:wrap"><span class="ch">${esc(shortCh(r.channel) || r.channel || "")}</span>${r.target ? `<code style="word-break:break-all">${esc(r.target)}</code><button class="btn xs ghost" data-act="copy" data-v="${esc(r.target)}" title="Copy">Copy</button>` : '<span class="muted xsmall">target still to be found</span>'}</div>` : ""}
        ${r.next_action ? `<div class="next">${icon("zap")}<b>${esc(r.next_action)}</b></div>` : ""}
        ${r.rationale ? `<div class="why">${esc(r.rationale)}</div>` : ""}
        ${r.evidence ? `<div class="xsmall muted mt8">Evidence: ${esc(r.evidence)}</div>` : ""}
        ${r.source_url ? `<div class="xsmall mt8"><a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">${icon("globe").replace("<svg", '<svg style="width:11px;height:11px;vertical-align:-1px"')} found on web — verify (${esc(domainOf(r.source_url))})</a></div>` : ""}
      </div></div>`;
    }).join("")}</div>` : `<div class="small muted">No routes yet. Press <b>Plan & draft</b>: the Route Planner ranks every path (existing thread, warm intro, official management, partner org, public contact) and the Drafter writes the first message.</div>`}</div>`;

  const contacts = `<div class="dsec"><h4>${icon("mail")}Contact points<span class="count-badge">${(p.contacts || []).length}</span></h4>
    ${(p.contacts || []).length ? `<div class="card">${p.contacts.map((c) => `<div class="contact"><span class="ch">${esc(shortCh(c.channel))}</span>
      <div class="val">${linkify(c.value)}<small>${c.label ? esc(c.label) + " · " : ""}${srcLink(c.source)}</small></div>
      ${c.verified ? chip(icon("check") + "From your files", "green") : chip("Public — verify", "amber")}</div>`).join("")}</div>` : `<div class="small muted">No contact points recorded.</div>`}</div>`;

  const drafts = (p.drafts || []).filter((d) => d.status !== "superseded");
  const draftsHtml = `<div class="dsec"><h4>${icon("edit")}Drafts<span class="count-badge">${drafts.length}</span></h4>
    ${drafts.length ? `<div class="card">${drafts.map((d) => `<a class="li" href="${evHash(p.event_id, "drafts", d.id)}"><div class="t">${esc(DKIND[d.kind] || d.kind)} ${dStatusChip(d.status)}</div>
      <div class="s">${esc(LANGS[d.language] || d.language || "")} · ${esc(d.channel || "")} · v${d.version || 1} · ${esc(d.subject || "").slice(0, 70)}</div></a>`).join("")}</div>` : `<div class="small muted">No drafts yet.</div>`}</div>`;

  const replyHtml = `<div class="dsec"><h4>${icon("msg")}Log a reply</h4>
    <div class="card card-body" style="padding:12px">
      <textarea class="textarea" rows="3" placeholder="Paste the reply you received (email, WeChat, DM)… The Reply Interpreter updates status, contacts and the next follow-up." data-reply-text></textarea>
      <div class="row mt8"><select class="select sm" style="width:140px" data-reply-ch aria-label="Channel">${["email", "wechat", "instagram", "linkedin", "phone", "xiaohongshu", "weibo", "other"].map((c) => `<option value="${c}">${esc(CHANNELS[c] || c)}</option>`).join("")}</select>
        <input type="date" class="input sm" style="width:150px" value="${todayISO()}" data-reply-date aria-label="Date received"><span class="spacer"></span>
        <button class="btn sm primary" data-act="log-reply" ${(S.health || {}).key_present ? "" : "disabled"}>${icon("sparkle")}Interpret reply</button></div>
      ${reply ? replyResultHtml(reply) : ""}</div></div>`;

  const tl = p.timeline || [];
  const timeline = `<div class="dsec"><h4>${icon("clock")}Timeline</h4>
    <div class="row mb12"><input class="input sm" placeholder="Add a note (e.g. ‘Met at Lunar New Year gala’)…" data-note aria-label="Add a note"><button class="btn sm" data-act="add-note">Add</button></div>
    ${tl.length ? `<div class="vtl">${tl.map((t) => `<div class="it k-${esc(t.kind)}"><div class="when">${esc(fmtDate(t.date))}<span>·</span>${avatar(t.actor || "?", "xs")}<span>${esc(t.actor || "")}</span>${chip(esc(t.kind), "gray", "sq")}</div><div class="note">${esc(t.note)}</div></div>`).join("")}</div>` : '<div class="small muted">No history yet.</div>'}</div>`;

  const others = (p.other_events || []);
  const othersHtml = others.length ? `<div class="dsec"><h4>${icon("link")}Also in other events</h4>
    <div class="card">${others.map((o) => `<a class="li" href="${personHash(o.event_id, o.person_id)}"><div class="t">${esc(o.event_name)} ${pStatusChip(o.status, false)}</div><div class="s">${esc(o.role || "")}${o.owner ? " · owner " + esc(o.owner) : ""}</div></a>`).join("")}</div></div>` : "";

  el.innerHTML = `<div class="drawer-head">
      <div class="dh">${avatar(p.name, "xl")}<div style="min-width:0;flex:1"><h2>${esc(p.name)}</h2>
        <div class="role">${esc([p.role, p.slot && p.slot !== p.role ? p.slot : ""].filter(Boolean).join(" · ") || "Role to be decided")}</div>
        <div class="aliases">${pStatusChip(p.status, false)}${p.tier ? chip(`Tier ${esc(p.tier)}`, p.tier === "A" ? "blue" : p.tier === "B" ? "brass" : "gray") : ""}${p.priority_score != null ? chip(`Fit ${Math.round(p.priority_score)}`, "gray") : ""}${p.origin === "scout" ? chip("scouted", "pink") : ""}${p.entity === "organization" ? chip("organisation", "slate") : ""}${(p.aliases || []).map((a) => `<span class="chip outline">${esc(a)}</span>`).join("")}</div>
        ${p.category || p.location ? `<div class="xsmall muted mt8">${esc([p.category, p.location].filter(Boolean).join(" · "))}</div>` : ""}</div></div>
      <div class="props">
        <div class="field"><label>Status</label><select class="select sm" data-act-change="p-status">${statusOpts}</select></div>
        <div class="field"><label>Tier</label><select class="select sm" data-act-change="p-tier">${["A", "B", "C"].map((t) => `<option ${p.tier === t ? "selected" : ""}>${t}</option>`).join("")}${!p.tier ? '<option selected value="">–</option>' : ""}</select></div>
        <div class="field"><label>Owner (DRI)</label><div class="row"><input class="input sm" value="${esc(p.owner || "")}" placeholder="Who owns this relationship?" data-owner><button class="btn sm" data-act="save-owner">Save</button></div></div>
      </div>
      <div class="row mt12" data-plan-state>${planStateHtml(p)}</div>
    </div>
    <div class="drawer-body">
      ${connMap}${routesHtml}${contacts}
      ${p.intro || p.rationale ? `<div class="dsec"><h4>${icon("flag")}Why this person</h4><div class="card card-body small" style="padding:12px 14px">${p.intro ? `<p>${esc(p.intro)}</p>` : ""}${p.rationale ? `<p class="muted mt8">${esc(p.rationale)}</p>` : ""}
        ${evid.length ? `<div class="row wrap mt8" style="gap:4px">${evid.map((e) => isURL(e) ? `<a class="chip outline" href="${esc(e)}" target="_blank" rel="noopener noreferrer">${icon("external")}${esc(domainOf(e))}</a>` : `<span class="chip outline">${srcLink(e)}</span>`).join("")}</div>` : ""}</div></div>` : ""}
      ${draftsHtml}${replyHtml}${othersHtml}${timeline}
    </div>`;
}

function replyResultHtml(r) {
  const a = r.analysis || {};
  const [ol, ot] = OUTCOME[a.outcome] || [a.outcome, "gray"];
  return `<div class="result-card">
    <div class="row wrap">${chip(esc(ol), ot)}<span class="small">→ status ${pStatusChip(a.new_status, false)}</span><span class="spacer"></span><span class="xsmall muted">${r.usage ? fmtCost(r.usage.cost_usd) : ""}</span></div>
    ${a.injection || (r.regex_flags || []).length ? `<div class="callout danger mt8">${icon("shield")}<div class="small"><b>Possible prompt injection — status was NOT changed automatically.</b><div class="quote mt8">${esc(a.injection || r.regex_flags[0])}</div></div></div>` : ""}
    <p class="small mt8">${esc(a.summary || "")}</p>
    ${(a.details || []).length ? `<ul class="bullets small mt8">${a.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
    ${(a.new_contacts || []).length ? `<div class="small mt8"><b>New contacts:</b> ${a.new_contacts.map((c) => `<span class="ch">${esc(shortCh(c.channel))}</span> ${esc(c.value)}`).join(", ")}</div>` : ""}
    ${a.next_action ? `<div class="next small mt8" style="display:flex;gap:6px">${icon("zap").replace("<svg", '<svg style="width:14px;height:14px;color:var(--accent);flex:none;margin-top:2px"')}<span><b>${esc(a.next_action)}</b>${a.follow_up_in_days != null ? ` <span class="muted">· follow up in ${a.follow_up_in_days} days</span>` : ""}</span></div>` : ""}
  </div>`;
}

async function patchPerson(body, msg) {
  const pid = S.drawerPid;
  try {
    const p = await api(`/api/people/${pid}`, { method: "PATCH", body });
    if (S.drawerPid === pid) { S.drawer = p; renderDrawer(); }
    toast(msg, "ok", 2500);
    refreshBehindDrawer();
  } catch (e) { toastErr(e); }
}
const refreshBehindDrawer = debounce(() => { if (["guests", "lists", "followups", "overview"].includes(S.tab)) refreshEventView(); }, 300);

async function logReply(btn) {
  const text = $("[data-reply-text]").value.trim();
  if (!text) { toast("Paste the reply text first.", "error"); return; }
  const pid = S.drawerPid;
  setBusy(btn, true, "Interpreting…");
  try {
    const r = await api(`/api/people/${pid}/reply`, { method: "POST", body: { text, channel: $("[data-reply-ch]").value, date: $("[data-reply-date]").value } });
    S.replyResult = S.replyResult || {};
    S.replyResult[pid] = r;
    toast("Reply logged. Status, contacts and follow-ups updated.", "ok");
    await loadDrawer(pid);
    refreshBehindDrawer();
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

/* ---------------------------------------------------------------- drafts */

async function tabDrafts(body, sub) {
  const drafts = await api(`/api/events/${S.evId}/drafts`);
  S.drafts = drafts;
  if (!drafts.length) {
    body.innerHTML = `<div class="card">${emptyState("edit", "No drafts yet", "Drafts appear after the agents run (top N people) or when you press <b>Plan & draft</b> on a person. Every draft is checked by an independent Reviewer agent before you see it.", `<button class="btn primary" data-act="open-run">${icon("play")}Run agents</button><a class="btn" href="${evHash(S.evId, "lists")}">${icon("list")}Go to lists</a>`)}</div>`;
    return;
  }
  let did = sub ? +sub : null;
  if (!did || !drafts.find((d) => d.id === did)) {
    const first = DRAFT_ORDER.map((s) => drafts.find((d) => d.status === s)).find(Boolean) || drafts[0];
    did = first.id;
    history.replaceState(null, "", evHash(S.evId, "drafts", did, S.route.query.get("p") ? "p=" + S.route.query.get("p") : ""));
    S.mainKey = `event/${S.evId}/drafts/${did}?`;
  }
  body.innerHTML = `<div class="mail">
    <div class="card list-pane" aria-label="Review queue">${draftListHtml(drafts, did)}</div>
    <div data-draft-detail style="display:contents"><div>${skel(1)}</div></div></div>`;
  await loadDraftDetail(did);
}

async function loadDraftDetail(did) {
  const d = await api(`/api/drafts/${did}`);
  S.draft = d;
  S.draftDirty = false;
  renderDraftDetail();
}

function renderDraftDetail() {
  const d = S.draft, el = $("[data-draft-detail]");
  if (!d || !el) return;
  const rv = (d.review && d.review.final) || null;
  const hist = (d.review && d.review.history) || [];
  const [vl, vt, vi] = rv ? VERDICT[rv.verdict] || [rv.verdict, "gray", "info"] : ["Not reviewed", "gray", "info"];
  const busy = S.draftBusy;
  const blocked = d.status === "blocked";
  const issues = (rv && rv.issues) || [];
  const isSent = d.status === "sent", isDisc = d.status === "discarded";
  const serif = store.get("letterSerif", false);
  el.innerHTML = `<div class="stack" style="gap:14px;min-width:0">
    ${d.status === "approved" ? `<div class="callout ok">${icon("check")}<div><b>Approved.</b> Exported to <a class="link" href="${evHash(S.evId, "drive", "", "f=" + encodeURIComponent("outbox/"))}">Drive/outbox</a> as an .eml file — send it from your own mail client (or copy into WeChat), then press <b>Mark as sent</b>. InviteDesk never sends messages itself.</div></div>` : ""}
    ${blocked ? `<div class="callout danger">${icon("x")}<div><b>The Reviewer blocked this draft.</b> Fix the issues it lists, save, then re-run the review. Approval is disabled until it passes.</div></div>` : ""}
    <div class="letter">
      <div class="letter-head">
        <div class="row" style="gap:10px;margin-bottom:8px">${avatar(d.name, "sm")}<a class="strong" href="${personHash(S.evId, d.person_id, "drafts")}">${esc(d.name)}</a>${dStatusChip(d.status)}<span class="spacer"></span>
          <div class="badges">${chip(esc(DKIND[d.kind] || d.kind), "brass", "sq")}${chip(esc(LANGS[d.language] || d.language || "?"), "blue", "sq")}${chip(esc(CHANNELS[d.channel] || d.channel || "channel?"), "gray", "sq")}</div></div>
        <div class="hrow"><span>To</span><input id="dr-to" class="input" value="${esc(d.recipient || "")}" data-draft-field="recipient" placeholder="address / handle" aria-label="Recipient"></div>
        <div class="hrow"><span>Subject</span><input id="dr-subj" class="input subject-input" value="${esc(d.subject || "")}" data-draft-field="subject" aria-label="Subject"></div>
      </div>
      <div class="paper"><textarea id="dr-body" class="textarea body-input ${serif ? "serifed" : ""}" data-draft-field="body" aria-label="Message body">${esc(d.body || "")}</textarea></div>
      <div class="paper-foot"><span class="xsmall muted">v${d.version || 1} · updated ${esc(fmtDateTime(d.updated_at))}</span><span class="xsmall" style="color:var(--amber-fg)" data-dirty-note></span><span class="spacer"></span>
        <div class="seg-ctl" role="group" aria-label="Letter typeface"><button data-act="draft-serif" data-v="0" aria-pressed="${!serif}">Sans</button><button data-act="draft-serif" data-v="1" aria-pressed="${serif}">${icon("type")}Letter</button></div>
        <button class="btn sm" data-act="copy" data-v="${esc(d.body || "")}" data-copy-body>${icon("file")}Copy</button><button class="btn sm" data-act="draft-save" disabled data-save-btn>${icon("check")}Save edits</button></div>
      <div class="actionbar">
        <button class="btn success" data-act="draft-status" data-s="approved" ${blocked || isSent || busy || d.status === "approved" ? "disabled" : ""} title="${blocked ? "Blocked by the reviewer — fix and re-run review first" : "Approve: exports an .eml to Drive/outbox"}">${icon("check")}Approve</button>
        <button class="btn" data-act="draft-status" data-s="needs_changes" ${isSent || busy ? "disabled" : ""}>${icon("edit")}Request changes</button>
        <button class="btn" data-act="draft-status" data-s="sent" ${d.status !== "approved" || busy ? "disabled" : ""} title="${d.status !== "approved" ? "Approve first, then send it yourself" : "I sent it from my own account"}">${icon("send")}Mark as sent</button>
        <button class="btn" data-act="draft-review" ${busy || isSent || !(S.health || {}).key_present ? "disabled" : ""}>${busy === "review" ? '<span class="spinner"></span>Reviewing… 20–40 s' : icon("refresh") + "Re-run review"}</button>
        <span class="spacer"></span>
        <button class="btn danger" data-act="draft-status" data-s="discarded" ${isDisc || busy ? "disabled" : ""}>${icon("trash")}Discard</button>
      </div>
    </div></div>
    <div class="mail-side">
      <div class="card"><div class="card-head"><h3>${icon("shield")}Reviewer</h3><span class="xsmall muted">independent agent</span></div><div class="card-body">
        <div class="verdict tone-${vt}">${icon(vi)}${esc(vl)}<span class="spacer"></span><span class="small" style="font-weight:500;font-family:var(--sans)">${plural(issues.length, "issue")}</span></div>
        ${issues.length ? `<div class="mt8">${issues.map((i) => `<div class="issue"><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span><div><div>${chip(esc(i.type), "gray", "sq")} ${esc(i.text)}</div>${i.fix ? `<div class="fix"><b>Fix:</b> ${esc(i.fix)}</div>` : ""}</div></div>`).join("")}</div>` : `<p class="small muted mt12">${rv ? "No issues against the Fact Sheet, guest policy and evidence." : "This draft has not been reviewed yet."}</p>`}
        ${hist.length > 1 ? `<div class="subhead">Review history</div><div class="row wrap small">${hist.map((h, i) => `${i ? '<span class="faint">→</span>' : ""}<span>v${h.version}: ${esc((VERDICT[h.verdict] || [h.verdict])[0])} (${(h.issues || []).length})</span>`).join(" ")}</div>` : ""}
      </div></div>
      <div class="card"><div class="card-head"><h3>${icon("flag")}Personal claims</h3><span class="count-badge">${(d.claims || []).length}</span></div><div class="card-body">
        ${(d.claims || []).length ? `<ul class="clean">${d.claims.map((c) => `<li class="issue" style="grid-template-columns:1fr"><div>${esc(c.claim)}<div class="xsmall muted mt8">${isURL(c.evidence) ? `<a class="link" href="${esc(c.evidence)}" target="_blank" rel="noopener noreferrer">${esc(domainOf(c.evidence))}</a>` : "Source: " + esc(c.evidence)}</div></div></li>`).join("")}</ul>` : '<p class="small muted">No personal claims — the message sticks to Fact Sheet facts.</p>'}
      </div></div>
      <div class="card"><div class="card-head"><h3>${icon("msg")}Comments</h3><span class="count-badge">${(d.comments || []).length}</span></div><div class="card-body">
        ${(d.comments || []).map((c) => `<div class="comment"><div class="row">${avatar(c.author, "sm")}<span class="who">${esc(c.author)}</span><span class="xsmall muted">${esc(fmtDateTime(c.created_at))}</span></div><div class="mt8">${esc(c.text)}</div></div>`).join("") || '<p class="small muted mb8">Leave notes for teammates, e.g. “use Prof. Huang’s title”.</p>'}
        <div class="row mt8"><input class="input sm" style="width:96px" value="${esc(store.get("author", ""))}" placeholder="Name" data-c-author aria-label="Your name"><input class="input sm" placeholder="Write a comment…" data-c-text aria-label="Comment"><button class="btn sm" data-act="draft-comment">Post</button></div>
      </div></div>
    </div>`;
}

function draftListHtml(drafts, did) {
  const groups = DRAFT_ORDER.map((s) => [s, drafts.filter((d) => d.status === s)]).filter(([, l]) => l.length);
  const other = drafts.filter((d) => !DRAFT_ORDER.includes(d.status));
  if (other.length) groups.push(["other", other]);
  return groups.map(([s, l]) => `<div class="group-h"><span class="eyebrow">${esc((DSTATUS[s] || [s])[0])}</span><span class="count-badge">${l.length}</span></div>
    ${l.map((d) => `<a class="li ${d.id === did ? "active" : ""}" href="${evHash(S.evId, "drafts", d.id)}"><div class="mli">${avatar(d.name)}<div style="min-width:0">
      <div class="l1"><span class="nm">${esc(d.name)}</span>${tierBadge(d.tier)}</div>
      <div class="subj" title="${esc(d.subject || "")}">${esc(d.subject || "(no subject)")}</div>
      <div class="l3">${chip(esc(DKIND[d.kind] || d.kind), "gray", "sq")}<span class="xsmall muted ellipsis">${esc(LANGS[d.language] || d.language || "")} · ${esc(CHANNELS[d.channel] || d.channel || "")}</span></div></div></div></a>`).join("")}`).join("");
}

function draftEdits() {
  const d = S.draft, out = {};
  $$("[data-draft-field]").forEach((i) => { if (i.value !== (d[i.dataset.draftField] || "")) out[i.dataset.draftField] = i.value; });
  return out;
}
function onDraftInput() {
  const dirty = Object.keys(draftEdits()).length > 0;
  S.draftDirty = dirty;
  const b = $("[data-save-btn]"); if (b) b.disabled = !dirty;
  const n = $("[data-dirty-note]"); if (n) n.textContent = dirty ? "Unsaved edits" : "";
}

async function draftAction(kind, el) {
  const d = S.draft;
  try {
    if (kind === "save") {
      const edits = draftEdits();
      if (!Object.keys(edits).length) return;
      setBusy(el, true, "Saving…");
      S.draft = await api(`/api/drafts/${d.id}`, { method: "PATCH", body: edits });
      S.draftDirty = false;
      toast(`Saved as v${S.draft.version}. Re-run the review if you changed facts.`, "ok");
    } else if (kind === "status") {
      const s = el.dataset.s;
      if (s === "sent" && !(await confirmBox("Mark as sent?", "Confirm you sent this message yourself (email, WeChat, DM). InviteDesk never sends anything; this just records it on the timeline.", "Yes, I sent it"))) return;
      if (s === "discarded" && !(await confirmBox("Discard this draft?", "It stays in the history but leaves the review queue.", "Discard", true))) return;
      const edits = draftEdits();
      setBusy(el, true, "Saving…");
      S.draft = await api(`/api/drafts/${d.id}`, { method: "PATCH", body: { ...edits, status: s } });
      S.draftDirty = false;
      toast({ approved: "Approved — the .eml is in Drive/outbox. Send it from your own mail client.", needs_changes: "Marked as needing changes.", sent: "Recorded as sent. Follow-ups will track the reply.", discarded: "Draft discarded." }[s] || "Updated.", "ok", 5000);
    } else if (kind === "review") {
      const edits = draftEdits();
      if (Object.keys(edits).length) S.draft = await api(`/api/drafts/${d.id}`, { method: "PATCH", body: edits });
      S.draftBusy = "review"; renderDraftDetail();
      const r = await api(`/api/drafts/${d.id}/review`, { method: "POST" });
      S.draft = r;
      const v = (r.review && r.review.final && r.review.final.verdict) || "";
      toast(`Reviewer: ${esc((VERDICT[v] || [v])[0])}.`, v === "pass" ? "ok" : "info");
    } else if (kind === "comment") {
      const text = $("[data-c-text]").value.trim();
      const author = $("[data-c-author]").value.trim() || "organiser";
      if (!text) { toast("Write a comment first.", "error"); return; }
      store.set("author", author);
      setBusy(el, true, "Posting…");
      S.draft = await api(`/api/drafts/${d.id}/comments`, { method: "POST", body: { author, text } });
    }
  } catch (e) { toastErr(e); }
  S.draftBusy = null;
  const keepScroll = $("#main").scrollTop;
  await refreshDraftsList();
  renderDraftDetail();
  $("#main").scrollTop = keepScroll;
}
async function refreshDraftsList() {
  try { await loadEvent(S.evId); } catch { /* ignore */ }
  const drafts = await api(`/api/events/${S.evId}/drafts`).catch(() => S.drafts);
  S.drafts = drafts;
  const pane = $(".list-pane");
  if (pane) pane.innerHTML = draftListHtml(drafts, S.draft.id);
}

/* ---------------------------------------------------------------- consistency */

async function tabConsistency(body) {
  const issues = await api(`/api/events/${S.evId}/issues`);
  S.issues = issues;
  S.issueFilter = S.issueFilter || { status: "open", kind: "" };
  renderIssues(body);
}
function renderIssues(body = $("#tab-body")) {
  const all = S.issues || [], f = S.issueFilter;
  const open = all.filter((i) => i.status === "open");
  const cnt = (arr, k, v) => arr.filter((i) => i[k] === v).length;
  if (!all.length) {
    body.innerHTML = `<div class="card">${emptyState("shield", S.ev.fact_sheet ? "No issues found" : "Not audited yet", S.ev.fact_sheet ? "Every document agrees with the Fact Sheet: dates, links, prices and claims check out." : "The Consistency Auditor compares every document against the Fact Sheet after the agents run.", S.ev.fact_sheet ? "" : `<button class="btn primary" data-act="open-run">${icon("play")}Run agents</button>`)}</div>`;
    return;
  }
  const list = all.filter((i) => (f.status === "all" || i.status === f.status) && (!f.kind || i.kind === f.kind));
  const byDoc = {};
  list.forEach((i) => (byDoc[i.document] = byDoc[i.document] || []).push(i));
  const docId = (path) => (S.ev.documents || []).find((d) => d.path === path)?.id;
  body.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(5,minmax(0,1fr))">
      <div class="kpi ${cnt(open, "severity", "high") ? "alert" : ""}"><div class="k"><span class="sev high"></span>High</div><div class="v">${cnt(open, "severity", "high")}</div><div class="s">open · fix before sending</div></div>
      <div class="kpi"><div class="k"><span class="sev medium"></span>Medium</div><div class="v">${cnt(open, "severity", "medium")}</div><div class="s">open</div></div>
      <div class="kpi"><div class="k"><span class="sev low"></span>Low</div><div class="v">${cnt(open, "severity", "low")}</div><div class="s">open</div></div>
      <div class="kpi" style="grid-column:span 2"><div class="k">By kind · click to filter</div><div class="row wrap mt8" style="gap:6px">
        ${Object.entries(ISSUE_KIND).map(([k, [l, tone]]) => `<button class="chip lg tone-${tone}" style="border:0;cursor:pointer;${f.kind === k ? "box-shadow:0 0 0 2px var(--accent)" : ""}" data-act="if-kind" data-v="${k}" aria-pressed="${f.kind === k}">${esc(l)} <b>${cnt(open, "kind", k)}</b></button>`).join("")}</div></div>
    </div>
    <div class="row mb16 wrap"><div class="seg-ctl" role="group" aria-label="Filter by status">${[["open", "Open"], ["resolved", "Resolved"], ["ignored", "Ignored"], ["all", "All"]].map(([v, l]) => `<button data-act="if-status" data-v="${v}" aria-pressed="${f.status === v}">${l} <span class="faint">${v === "all" ? all.length : cnt(all, "status", v)}</span></button>`).join("")}</div>
      ${f.kind ? `<button class="chip tone-purple" style="border:0;cursor:pointer" data-act="if-kind" data-v="">${esc(ISSUE_KIND[f.kind][0])} ${icon("x")}</button>` : ""}
      <span class="spacer"></span><span class="small muted">The Consistency Auditor checks every document against the Fact Sheet (no AI cost).</span></div>
    ${Object.keys(byDoc).length ? Object.entries(byDoc).map(([doc, items]) => `<div class="card doc-group mb16"><div class="card-head"><h3>${icon("file")}${docId(doc) ? `<a href="${evHash(S.evId, "documents", docId(doc))}" style="color:inherit">${esc(doc)}</a>` : esc(doc)}</h3><span class="count-badge">${items.length}</span></div>
      ${items.map((i) => `<div class="issue-row ${i.status !== "open" ? "dim" : ""}"><div><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span></div>
        <div style="min-width:0"><div class="row wrap" style="gap:6px">${chip(esc((ISSUE_KIND[i.kind] || [i.kind])[0]), (ISSUE_KIND[i.kind] || [0, "gray"])[1], "sq")}<b class="small">${esc(i.field)}</b>${i.status !== "open" ? chip(esc(i.status), "gray") : ""}</div>
          <div class="fe"><span class="muted xsmall">found</span><span class="found">${esc(i.found)}</span>${i.expected ? `<span class="faint">→</span><span class="muted xsmall">expected</span><span class="exp">${esc(i.expected)}</span>` : ""}</div>
          ${i.quote && i.quote !== i.found ? `<div class="quote mt8">“${esc(i.quote)}”</div>` : ""}
          ${i.suggestion ? `<div class="xsmall muted mt8">${esc(i.suggestion)}</div>` : ""}</div>
        <div class="btn-row">${i.status === "open" ? `<button class="btn xs" data-act="issue-set" data-id="${i.id}" data-s="resolved">${icon("check")}Resolve</button><button class="btn xs ghost" data-act="issue-set" data-id="${i.id}" data-s="ignored">Ignore</button>` : `<button class="btn xs ghost" data-act="issue-set" data-id="${i.id}" data-s="open">Reopen</button>`}</div></div>`).join("")}</div>`).join("")
    : `<div class="card">${emptyState("check", "Nothing here", "No issues match this filter.", "", true)}</div>`}`;
}

/* ---------------------------------------------------------------- follow-ups */

async function tabFollowups(body) {
  const fu = await api(`/api/events/${S.evId}/followups`);
  const t = todayISO();
  const open = fu.filter((f) => f.status === "open");
  const groups = [
    ["Overdue", open.filter((f) => f.due < t), "overdue"],
    ["Due today", open.filter((f) => f.due === t), "today"],
    ["Upcoming", open.filter((f) => f.due > t), ""],
    ["Done", fu.filter((f) => f.status !== "open"), "done"],
  ].filter(([, l]) => l.length);
  if (!fu.length) { body.innerHTML = `<div class="card">${emptyState("clock", "No follow-ups scheduled", "The Follow-up Planner schedules nudges from the outreach history (7 days after a first message, then switch route) and logistics notes for confirmed guests.")}</div>`; return; }
  body.innerHTML = groups.map(([label, list, cls]) => `<div class="card mb16"><div class="card-head"><h3>${esc(label)}</h3><span class="count-badge ${cls === "overdue" ? "hot" : ""}">${list.length}</span></div>
    ${list.map((f) => `<div class="fu ${cls}"><div class="due">${esc(fmtDate(f.due, { year: false }))}<small>${esc(cls === "done" ? "done" : relDue(f.due))}</small></div>
      <div class="person" style="align-items:flex-start">${avatar(f.name, "sm")}<div style="min-width:0"><div class="ellipsis"><a class="who" href="#" data-act="open-person" data-pid="${f.person_id}">${esc(f.name)}</a> <span class="small muted" title="${esc(f.role || "")}">${esc(f.role || "")}${f.owner ? " · owner " + esc(f.owner) : ""}</span></div>
        <div class="small ellipsis" title="${esc(f.action)}">${esc(f.action)}</div><div class="xsmall muted ellipsis">${esc(f.reason || "")}</div></div></div>
      ${f.status === "open" ? `<button class="btn sm" data-act="fu-done" data-id="${f.id}">${icon("check")}Done</button>` : chip("done", "green")}</div>`).join("")}</div>`).join("");
}

/* ---------------------------------------------------------------- reimbursement */

function flagTone(f) {
  const s = f.toLowerCase();
  if (s.includes("no receipt")) return "red";
  if (s.includes("awaiting")) return "amber";
  if (s.includes("not reimbursed")) return "blue";
  if (s.includes("over $")) return "orange";
  return "gray";
}
async function tabReimbursement(body) {
  const x = await api(`/api/events/${S.evId}/expenses`);
  if (!x.rows.length) { body.innerHTML = `<div class="card">${emptyState("receipt", "No expenses found", "The Finance Clerk reads the budget / reimbursement sheet in your folder (columns like Item, Cost, POC, Receipt, Status) after the agents run.")}</div>`; return; }
  const cny = x.rows.filter((r) => r.currency === "CNY");
  const noReceipt = x.rows.filter((r) => (r.flags || []).some((f) => /no receipt/i.test(f))).length;
  body.innerHTML = `<div class="kpis">
      <div class="kpi accent"><div class="k">${icon("dollar")}Total (USD)</div><div class="v">${fmtUSD(x.total_usd)}</div><div class="s">${plural(x.rows.length, "item")}</div></div>
      <div class="kpi ${x.needs_action ? "alert" : ""}"><div class="k">${icon("alert")}Needs action</div><div class="v">${x.needs_action}</div><div class="s">flagged items</div></div>
      <div class="kpi"><div class="k">${icon("receipt")}Missing receipts</div><div class="v">${noReceipt}</div><div class="s">upload before submitting</div></div>
      <div class="kpi"><div class="k">${icon("globe")}CNY items</div><div class="v">${cny.length}</div><div class="s">converted at 7.1 CNY/USD for tracking</div></div>
    </div>
    <div class="card"><div class="card-head"><h3>${icon("receipt")}Reimbursement check</h3><span class="small muted">Finance Clerk · deterministic, no AI</span></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Item</th><th>POC</th><th class="num">Amount</th><th>Cur.</th><th class="num">USD</th><th>Receipt</th><th>Finance status</th><th>Flags</th></tr></thead><tbody>
      ${x.rows.map((r) => `<tr><td style="min-width:180px;max-width:300px" class="strong">${esc(r.item)}</td><td class="small nowrap">${esc(r.poc || "")}</td><td class="num">${num(r.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td><td>${chip(esc(r.currency), r.currency === "CNY" ? "orange" : "gray", "sq")}</td><td class="num strong">${fmtUSD(r.amount_usd)}</td>
        <td>${/^(yes|y)$/i.test(r.receipt || "") ? chip(icon("check") + "Yes", "green") : chip(esc(r.receipt || "No"), "red")}</td><td class="small">${esc(r.finance_status || "—")}</td>
        <td><div class="row wrap" style="gap:4px;max-width:360px">${(r.flags || []).map((f) => `<span class="chip sq wrap tone-${flagTone(f)}" title="${esc(f)}">${esc(/^CNY amount/i.test(f) ? "CNY → USD at 7.1 · finance to confirm rate" : f)}</span>`).join("") || chip(icon("check") + "OK", "green")}</div></td></tr>`).join("")}
    </tbody><tfoot><tr><td colspan="4">Total</td><td class="num">${fmtUSD(x.total_usd)}</td><td colspan="3" class="small muted" style="font-weight:500">${x.needs_action} item(s) need action before finance can reimburse</td></tr></tfoot></table></div></div>`;
}

/* ---------------------------------------------------------------- drive */

function b64utf8(b) { try { const bin = atob(b.replace(/\s+/g, "")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } catch { return b; } }
function qpDecode(t) {
  const bytes = []; t = t.replace(/=\r?\n/g, "");
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "=" && /^[0-9A-F]{2}$/i.test(t.substr(i + 1, 2))) { bytes.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; }
    else bytes.push(...new TextEncoder().encode(t[i]));
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
function decodeWords(v) {
  return v.replace(/=\?([\w-]+)\?([BbQq])\?([^?]*)\?=\s*/g, (m, cs, enc, txt) => (enc.toUpperCase() === "B" ? b64utf8(txt) : qpDecode(txt.replace(/_/g, " "))));
}
function parseEml(raw) {
  const i = raw.search(/\r?\n\r?\n/);
  const head = i < 0 ? raw : raw.slice(0, i), body = i < 0 ? "" : raw.slice(i).replace(/^\s+/, "");
  const h = {};
  head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/).forEach((l) => { const k = l.indexOf(":"); if (k > 0) h[l.slice(0, k).toLowerCase()] = decodeWords(l.slice(k + 1).trim()); });
  const cte = (h["content-transfer-encoding"] || "").toLowerCase();
  const text = cte === "base64" ? b64utf8(body) : cte === "quoted-printable" ? qpDecode(body) : body;
  return { h, text };
}


async function tabDrive(body) {
  const files = await api(`/api/events/${S.evId}/drive`);
  S.driveFiles = files;
  if (!files.length) { body.innerHTML = `<div class="card">${emptyState("cloud", "Drive folder is empty", "The desk exports the Fact Sheet, roster, drafts, audit, reimbursements and approved .eml files here after each run.")}</div>`; return; }
  let sel = S.route.query.get("f") || "";
  if (!files.find((f) => f.path === sel)) sel = (files.find((f) => f.path.startsWith(sel) && sel) || files[0]).path;
  const groups = {};
  files.forEach((f) => { const i = f.path.indexOf("/"); const g = i < 0 ? "" : f.path.slice(0, i); (groups[g] = groups[g] || []).push(f); });
  const fIcon = (p) => /\.csv$/.test(p) ? "grid" : /\.eml$/.test(p) ? "mail" : /\.html?$/.test(p) ? "sparkle" : "file";
  const order = ["", "drafts", "outbox", "assets", ...Object.keys(groups).filter((g) => !["", "drafts", "outbox", "assets"].includes(g))];
  const label = { "": "Event folder", drafts: "drafts", outbox: "outbox (approved, ready to send)", assets: "assets (cards)" };
  body.innerHTML = `<div class="callout plain mb16">${icon("cloud")}<div class="small">This is the event's <b>Drive folder</b> on this computer (<code>workspace/events/${S.evId}/drive</code>). Every file is generated from the same Fact Sheet, so they all say the same thing. Sync it with the Google Drive desktop app to share with your team.</div></div>
    <div class="two-pane" style="grid-template-columns:300px minmax(0,1fr)"><div class="card list-pane tree">
    ${order.filter((g) => groups[g]).map((g) => `<div class="folder">${icon("folder")}${esc(label[g] || g)}</div>${groups[g].map((f) => `<button class="file ${f.path === sel ? "active" : ""}" data-act="drive-open" data-path="${esc(f.path)}">${icon(fIcon(f.path))}<span class="nm">${esc(f.path.slice(g ? g.length + 1 : 0))}</span><span class="sz">${f.bytes < 1024 ? f.bytes + " B" : (f.bytes / 1024).toFixed(1) + " KB"}</span></button>`).join("")}`).join("")}
    </div><div class="card preview"><div class="card-head"><h3>${icon(fIcon(sel))}<span class="ellipsis">${esc(sel)}</span></h3><a class="btn sm" href="/api/events/${S.evId}/drive/${sel.split("/").map(encodeURIComponent).join("/")}" target="_blank" rel="noopener">${icon("external")}Open raw</a></div><div class="card-body" data-preview>${skel()}</div></div></div>`;
  const url = `/api/events/${S.evId}/drive/${sel.split("/").map(encodeURIComponent).join("/")}`;
  const pv = $("[data-preview]");
  try {
    if (/\.html?$/.test(sel)) { pv.innerHTML = `<div class="card-frame"><iframe src="${url}" sandbox="allow-same-origin" title="Card preview"></iframe></div><p class="hint mt8">1080×1350 card generated from the Fact Sheet — open raw to save or screenshot it.</p>`; return; }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load the file (${res.status}).`);
    const text = await res.text();
    if (/\.md$/.test(sel)) pv.innerHTML = renderMd(text);
    else if (/\.csv$/.test(sel)) {
      const rows = parseCSV(text);
      pv.innerHTML = rows.length ? `<div class="table-wrap" style="max-height:70vh;margin:-16px -18px"><table class="tbl"><thead><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td class="small" style="max-width:260px">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="muted">Empty file.</p>';
    } else if (/\.eml$/.test(sel)) {
      const { h, text: bodyText } = parseEml(text);
      pv.innerHTML = `<div class="callout ok mb12">${icon("mail")}<div class="small">Approved message, ready in the outbox. Open raw → save → double-click to open it in your mail client, then press send yourself. InviteDesk never sends.</div></div>
        <dl class="facts mb12">${["to", "from", "subject"].map((k) => `<dt>${k[0].toUpperCase() + k.slice(1)}</dt><dd>${esc(h[k] || "—")}</dd>`).join("")}</dl><pre>${esc(bodyText)}</pre>`;
    } else pv.innerHTML = `<pre>${esc(text)}</pre>`;
  } catch (e) { pv.innerHTML = emptyState("alert", "Preview failed", esc(e.message), "", true); }
}

/* ---------------------------------------------------------------- documents */

async function tabDocuments(body, sub) {
  const docs = S.ev.documents || [];
  if (!docs.length) { body.innerHTML = `<div class="card">${emptyState("file", "No documents", "Re-import the event folder from the Overview tab.")}</div>`; return; }
  const sel = sub ? +sub : null;
  const kindTone = { invitation: "purple", sponsorship: "pink", roster: "blue", finance: "orange", promotion: "teal", planning: "green", sheet: "blue", other: "gray" };
  body.innerHTML = `<div class="two-pane" style="grid-template-columns:360px minmax(0,1fr)"><div class="card list-pane">
    <div class="group-h">${plural(docs.length, "document")} · ${fmtInt(docs.reduce((a, d) => a + num(d.chars), 0))} characters</div>
    ${docs.map((d) => `<a class="li ${d.id === sel ? "active" : ""}" href="${evHash(S.evId, "documents", d.id)}"><div class="t"><span class="ellipsis" style="flex:1">${esc(d.path)}</span>${(d.flags || []).length ? `<span title="Instruction-like text found">${chip(icon("shield") + "injection", "red")}</span>` : ""}</div>
      <div class="s row" style="gap:6px">${chip(esc(d.kind), kindTone[d.kind] || "gray", "sq")}<span>${fmtInt(d.chars)} chars</span></div></a>`).join("")}</div>
    <div data-doc-view>${sel ? `<div class="card">${skel()}</div>` : `<div class="card">${emptyState("file", "Pick a document", "These are the files the agents read. Instruction-like text (e.g. “ignore previous instructions”) is flagged and always treated as data.")}</div>`}</div></div>`;
  if (!sel) return;
  const d = await api(`/api/documents/${sel}`);
  let html = esc(d.text || "");
  for (const f of d.flags || []) {
    const core = esc(f.trim()).slice(0, 80);
    if (core.length > 12 && html.includes(core)) html = html.split(core).join(`<mark>${core}</mark>`);
  }
  $("[data-doc-view]").innerHTML = `<div class="card"><div class="card-head"><h3>${icon("file")}<span class="ellipsis">${esc(d.path)}</span></h3>${chip(esc(d.kind), kindTone[d.kind] || "gray", "sq")}</div><div class="card-body">
    ${(d.flags || []).length ? `<div class="callout danger mb12">${icon("shield")}<div class="small"><b>Instruction-like text found — treated as data, never obeyed.</b> Remove it before sharing this file.${d.flags.map((f) => `<div class="quote mt8">${esc(f)}</div>`).join("")}</div></div>` : ""}
    <pre class="doc-text">${html}</pre></div></div>`;
}

/* ---------------------------------------------------------------- trace polling */

async function ensureTrace(eid) {
  const t = (S.trace[eid] = S.trace[eid] || { entries: [], lastId: 0, loaded: false });
  for (let guard = 0; guard < 50; guard++) {
    const rows = await api(`/api/events/${eid}/trace?after=${t.lastId}&limit=300`);
    if (rows.length) { t.entries.push(...rows); t.lastId = rows[rows.length - 1].id; }
    if (rows.length < 300) break;
  }
  t.loaded = true;
  return t;
}

function startPoll(eid, transient = false) {
  if (S.poll && S.poll.eid === eid) { if (!transient) S.poll.run = true; return; }
  stopPoll();
  S.poll = { eid, run: !transient, timer: setInterval(() => pollTick(eid), 1500), busy: false };
}
function stopPoll() { if (S.poll) { clearInterval(S.poll.timer); S.poll = null; } }
function stopPollIfIdle(eid) {
  if (!S.poll || S.poll.eid !== eid) return;
  const anyPlanning = S.planning.size > 0, gen = S.generating && S.generating.eid === eid;
  if (!S.poll.run && !anyPlanning && !gen) stopPoll();
}

async function pollTick(eid) {
  if (!S.poll || S.poll.busy) return;
  S.poll.busy = true;
  try {
    const t = S.trace[eid] || (await ensureTrace(eid));
    const rows = await api(`/api/events/${eid}/trace?after=${t.lastId}&limit=300`);
    if (rows.length) {
      t.entries.push(...rows);
      t.lastId = rows[rows.length - 1].id;
      if (S.evId === eid && S.tab === "run") updateBoardLive(rows);
      if (S.evId === eid && rows.some((r) => r.kind === "done" && /^(Brief Analyst|Roster Analyst|Entity Resolver|Program Strategist|Talent Scout|Consistency Auditor)/.test(r.agent))) refreshHeader();
      const ended = rows.find((r) => r.kind === "end" && /coordinator/i.test(r.agent));
      if (ended) await onRunEnded(eid, ended);
    }
  } catch { /* transient network hiccup — try again next tick */ }
  if (S.poll) S.poll.busy = false;
}

async function onRunEnded(eid, entry) {
  if (S.poll && S.poll.eid === eid) S.poll.run = false;
  stopPollIfIdle(eid);
  const ok = /\bdone\b/.test(entry.message);
  toast(`${ok ? "Agents finished." : "Run stopped."} ${esc(entry.message)}`, ok ? "ok" : "info", 8000);
  await loadEvents();
  if (S.evId === eid) {
    if (S.tab === "run") { S.runs = null; }
    await refreshEventView();
  }
}

/* ---------------------------------------------------------------- agent board */

const NODES = {
  coord: ["Coordinator", ""], brief: ["Brief Analyst", ""], roster: ["Roster Analyst", ""], entity: ["Entity Resolver", ""],
  strategy: ["Program Strategist", ""], scout: ["Talent Scouts", ""], verifier: ["Verifier", ""],
  conn: ["Connection Finder", ""], research: ["Contact Researcher", ""], route: ["Route Planner", ""], drafter: ["Drafter", ""], reviewer: ["Reviewer", ""],
  audit: ["Consistency Auditor", ""], finance: ["Finance Clerk", ""], followup: ["Follow-up Planner", ""], drive: ["Drive export", ""],
  reply: ["Reply Interpreter", ""], cos: ["Chief of Staff", ""], budget: ["Budget Guard", ""],
};
const ON_DEMAND = ["reply", "cos", "budget"];
const LAYOUT = {
  coord: [20, 20, 136, 62], brief: [176, 20, 136, 62], roster: [332, 20, 136, 62], entity: [488, 20, 136, 62], strategy: [644, 20, 136, 62], scout: [800, 20, 136, 62],
  verifier: [800, 104, 136, 44],
  conn: [32, 214, 118, 62], research: [160, 214, 118, 62], route: [288, 214, 118, 62], drafter: [416, 214, 118, 62], reviewer: [544, 214, 118, 62],
  audit: [700, 176, 130, 40], finance: [700, 224, 130, 40], followup: [700, 272, 130, 40], drive: [846, 214, 94, 62],
  reply: [168, 336, 150, 40], cos: [330, 336, 150, 40], budget: [492, 336, 150, 40],
};
const EDGES = [
  ["M156,51 H174", "brief"], ["M312,51 H330", "roster"], ["M468,51 H486", "entity"], ["M624,51 H642", "strategy"], ["M780,51 H798", "scout"],
  ["M868,82 V102", "verifier"], ["M868,148 V164 H350 V176", "conn"],
  ["M150,245 H158", "research"], ["M278,245 H286", "route"], ["M406,245 H414", "drafter"], ["M534,245 H542", "reviewer"],
  ["M680,244 H689 V196 H698", "audit"], ["M680,244 H698", "finance"], ["M680,244 H689 V292 H698", "followup"],
  ["M830,196 H838 V245 H844", "drive"], ["M830,244 H844", "drive"], ["M830,292 H838 V245 H844", "drive"],
];
const NODE_LINK = { reply: "guests", cos: "#/today" };

function computeBoard(entries, run) {
  const N = {};
  Object.keys(NODES).forEach((k) => (N[k] = { state: "idle", stat: "" }));
  const set = (id, state, stat) => { if (state) N[id].state = state; if (stat != null) N[id].stat = stat; };
  let tools = 0, fan = 0, conn = 0, researched = 0, routed = 0, reviewed = 0, sStart = 0, sDone = 0, vTodo = 0, warns = 0, errors = 0, budget = false, ended = null;
  const short = (m, re, f) => { const x = (m || "").match(re); return x ? f(x) : null; };
  const closeFan = () => ["conn", "research", "route", "drafter", "reviewer", "verifier"].forEach((x) => N[x].state === "active" && (N[x].state = "done"));
  for (const e of entries) {
    const a = e.agent || "", k = e.kind, m = e.message || "";
    if (/^coordinator$/i.test(a)) {
      if (k === "start") set("coord", "active", "run started");
      else if (k === "handoff") {
        if (e.data && e.data.people) { fan = e.data.people.length; set("coord", null, `fan-out → ${fan} people`); set("conn", "active", `0/${fan}`); if (N.verifier.state === "active") N.verifier.state = "done"; }
        else if (e.data && e.data.briefs) { set("scout", "active", `0/${e.data.briefs.length} lists`); set("coord", null, `${e.data.briefs.length} scouts in parallel`); }
        else if (/^Verifier/i.test(m)) { vTodo += +(short(m, /(\d+)/, (x) => x[1]) || 0); set("verifier", "active", `checking ${vTodo}`); }
      } else if (k === "note" && /drive/i.test(m)) set("drive", "done", "folder updated");
      else if (k === "warning") warns++;
      else if (k === "error") errors++;
      else if (k === "end") ended = e;
    } else if (a === "Brief Analyst") set("brief", k === "done" ? "done" : k === "error" ? "error" : "active", k === "done" ? short(m, /(\d+) conflicts?/, (x) => `${x[1]} conflicts`) || "Fact Sheet ready" : "reading files…");
    else if (a === "Roster Analyst") { if (N.brief.state === "active") set("brief", "done"); set("roster", k === "done" ? "done" : "active", k === "done" ? short(m, /(\d+) people/, (x) => `${x[1]} people`) || "done" : k === "note" ? m : "extracting…"); }
    else if (a === "Entity Resolver") { if (N.roster.state === "active") N.roster.state = "done"; set("entity", k === "error" ? "error" : "done", short(m, /Merged (\d+)/, (x) => `merged ${x[1]} groups`) || "no duplicates"); }
    else if (a === "Program Strategist") set("strategy", k === "done" ? "done" : "active", k === "done" ? (short(m, /(\d+) slots/, (x) => `${x[1]} slots`) || "done") + (short(m, /ranked (\d+)/, (x) => ` · ${x[1]} ranked`) || "") : "ranking…");
    else if (/^Talent Scout/.test(a)) {
      if (k === "start") sStart++;
      if (k === "done") sDone++;
      if (k === "error") { sDone++; warns++; }
      if (k === "skip") set("scout", "skipped", "no briefs");
      else set("scout", sStart && sDone >= sStart ? "done" : "active", `${sDone}/${Math.max(sStart, sDone)} lists${tools ? ` · ${tools} searches` : ""}`);
    } else if (a === "Verifier") set("verifier", k === "error" ? "warn" : k === "done" ? "done" : "active", short(m, /(\d+)\/(\d+)/, (x) => `${x[1]}/${x[2]} confirmed`) || m);
    else if (k === "tool_call") { tools++; if (N.scout.state === "active") set("scout", null, `${sDone}/${sStart} lists · ${tools} searches`); }
    else if (a === "Connection Finder") { conn++; set("conn", fan && conn >= fan ? "done" : "active", `${conn}/${fan || "?"} mapped`); }
    else if (a === "Contact Researcher") { researched++; set("research", "active", `${researched} researched`); }
    else if (a === "Route Planner") { routed++; set("route", fan && routed >= fan ? "done" : "active", `${routed}/${fan || "?"} routed`); set("drafter", "active"); if (!fan && N.conn.state === "active") set("conn", "done"); }
    else if (a === "Reviewer") { reviewed++; set("drafter", null, `${reviewed} drafted`); set("reviewer", fan && reviewed >= fan ? "done" : "active", `${reviewed}/${fan || "?"} reviewed`); }
    else if (a === "Consistency Auditor") { closeFan(); set("audit", "done", short(m, /(\d+) issues/, (x) => `${x[1]} issues`) || "done"); }
    else if (a === "Finance Clerk") set("finance", "done", short(m, /(\d+) items? need/, (x) => `${x[1]} flagged`) || "done");
    else if (a === "Follow-up Planner") set("followup", "done", short(m, /(\d+) follow/, (x) => `${x[1]} scheduled`) || "done");
    else if (a === "Budget Guard") { budget = true; warns++; }
    else if (a === "Reply Interpreter") set("reply", "done", "reply interpreted");
    else if (a === "Chief of Staff") set("cos", "done", "brief written");
  }
  const status = run ? run.status : null;
  const finished = ended || (status && status !== "running");
  if (finished) {
    const bad = (ended && /error/.test(ended.message)) || status === "error";
    const stop = budget || status === "budget_stop";
    Object.keys(N).forEach((k) => {
      if (ON_DEMAND.includes(k)) return;
      if (N[k].state === "active") N[k].state = bad ? "error" : stop ? "warn" : "done";
      else if (N[k].state === "idle") { N[k].state = "skipped"; if (!N[k].stat) N[k].stat = k === "research" ? "not needed" : "not in this run"; }
    });
    N.coord.state = bad ? "error" : stop ? "warn" : "done";
    N.coord.stat = bad ? "run failed" : stop ? "stopped at budget" : "run complete";
  }
  if (budget) set("budget", "warn", "stopped the run");
  else set("budget", run && run.status === "running" ? "active" : "idle", run && run.budget_usd ? `cap ${fmtCost(run.budget_usd)}` : "caps every run");
  if (N.reply.state === "idle") N.reply.stat = "Log a reply · drawer";
  if (N.cos.state === "idle") N.cos.stat = "Daily brief · Today";
  return { N, fan, warns, errors, budget, ended, routed, reviewed };
}

function fitText(t, w, maxPx) {
  // rough width estimate: Latin ≈ 0.58em, CJK ≈ 1em
  let units = 0; for (const ch of t) units += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.58;
  return Math.max(10, Math.min(maxPx, Math.floor((w - 24) / Math.max(units, 1))));
}

function boardSvg(B) {
  const n = (id) => {
    const [x, y, w, h] = LAYOUT[id], st = B.N[id], [en, zh] = NODES[id];
    const small = h < 50;
    let stat = st.stat || "";
    const maxc = Math.floor((w - 22) / 6.3);
    if (stat) { let c = 0, out = ""; for (const ch of stat) { c += ch.charCodeAt(0) > 0x2e80 ? 1.8 : 1; if (c > maxc - 1) { out += "…"; break; } out += ch; } stat = out; }
    const tfs = fitText(en, w, small ? 12 : 13);
    const body = `<title>${esc(en)} — ${esc(st.state)}${st.stat ? ": " + esc(st.stat) : ""}</title>
      <rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
      <circle class="ind" cx="${x + w - 11}" cy="${y + 11}" r="4.5"/>
      ${small ? `<text class="title" x="${x + 11}" y="${y + 17}" style="font-size:${tfs}px">${esc(en)}</text><text class="stat" x="${x + 11}" y="${y + 32}">${esc(stat)}</text>`
        : `<text class="title" x="${x + 11}" y="${y + 26}" style="font-size:${tfs}px">${esc(en)}</text><text class="stat" x="${x + 11}" y="${y + 46}">${esc(stat)}</text>`}`;
    const link = NODE_LINK[id];
    const href = link ? (link.startsWith("#") ? link : evHash(S.evId, link)) : "";
    return href ? `<a href="${href}" class="node-link"><g class="node ${st.state} ondemand" data-node="${id}">${body}</g></a>` : `<g class="node ${st.state}${ON_DEMAND.includes(id) ? " ondemand" : ""}" data-node="${id}">${body}</g>`;
  };
  const edges = EDGES.map(([d, to]) => {
    const s = B.N[to].state;
    return `<path class="edge ${s === "active" ? "lit" : s === "done" ? "done" : ""}" d="${d}" marker-end="url(#ah)"/>`;
  }).join("");
  return `<svg class="board" viewBox="0 0 960 396" role="img" aria-label="Agent architecture diagram: which agent is working now">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah" d="M0,0 L10,5 L0,10 z"/></marker></defs>
    <rect class="grp" x="20" y="178" width="660" height="114" rx="12"/>
    <text class="grp-label" x="34" y="200">PER-PERSON FAN-OUT ${B.fan ? "× " + B.fan : ""}</text>
    <text class="grp-label" x="700" y="168">CHECKS (no AI)</text>
    <rect class="grp" x="20" y="326" width="634" height="60" rx="12"/>
    <text class="grp-label" x="34" y="352">ON</text><text class="grp-label" x="34" y="367">DEMAND</text>
    ${edges}${Object.keys(NODES).map(n).join("")}
  </svg>`;
}

function runEntries(eid, runId) {
  const all = (S.trace[eid] || { entries: [] }).entries;
  if (runId === "all") return all;
  return all.filter((e) => e.run_id === runId);
}

function partialUsage(entries) {
  const by = {};
  for (const e of entries) {
    const u = e.data && e.data.usage;
    if (!u) continue;
    const a = (by[e.agent] = by[e.agent] || { input_tokens: 0, cached_tokens: 0, cache_write_tokens: 0, output_tokens: 0, requests: 0, tool_calls: 0, cost_usd: 0, runs: 0 });
    for (const k of Object.keys(a)) if (k !== "runs") a[k] += num(u[k]);
    a.runs++;
  }
  const totals = { input_tokens: 0, cached_tokens: 0, output_tokens: 0, requests: 0, tool_calls: 0, cost_usd: 0 };
  Object.values(by).forEach((a) => Object.keys(totals).forEach((k) => (totals[k] += num(a[k]))));
  return { by_agent: by, totals };
}

async function tabRun(body) {
  const eid = S.evId;
  const [runs] = await Promise.all([api(`/api/events/${eid}/runs`), ensureTrace(eid)]);
  S.runs = runs;
  if (S.ev.running) startPoll(eid);
  if (S.runSel == null || (S.runSel !== "all" && !runs.find((r) => r.id === S.runSel))) S.runSel = runs.length ? runs[0].id : "all";
  body.innerHTML = `<div class="card" data-run-top><div class="card-head"><h3>${icon("activity")}Agent board</h3>
        <div class="row"><label class="small muted" for="run-sel">Run</label><select id="run-sel" class="select sm" style="width:auto;max-width:320px" data-act-change="run-sel">
          ${runs.map((r) => `<option value="${r.id}" ${S.runSel === r.id ? "selected" : ""}>#${r.id} · ${esc(fmtDateTime(r.started_at))} · ${esc(runLabel(r.status))}${r.note ? " · " + esc(r.note.slice(0, 40)) : ""}</option>`).join("")}
          <option value="all" ${S.runSel === "all" ? "selected" : ""}>All activity (incl. import)</option></select></div></div>
        <div class="board-wrap" data-board></div>
        <div class="board-legend"><span><i class="sw" style="background:var(--accent);box-shadow:0 0 6px var(--accent)"></i>working</span><span><i class="sw" style="background:var(--green-dot)"></i>done</span><span><i class="sw" style="background:var(--amber-dot)"></i>stopped / warning</span><span><i class="sw" style="background:var(--red-dot)"></i>error</span><span><i class="sw" style="background:#94A3B8"></i>idle / not in this run</span><span class="spacer"></span><span data-guards></span></div>
      </div>
    <div class="grid mt16" style="grid-template-columns:minmax(0,1.3fr) minmax(380px,1fr);align-items:start">
      <div class="card"><div class="card-head"><h3>${icon("list")}Live log</h3><span class="small muted" data-logcount></span></div><div class="log" data-log></div></div>
      <div class="stack"><div class="card" data-meter></div><div class="card" data-agent-usage></div>
        ${S.ev.running ? "" : `<div class="card"><div class="card-head"><h3>${icon("play")}Start a run</h3></div><div class="card-body">${runPanel(S.ev, true)}<div class="hint mt8">Pick stages on the <a href="${evHash(eid, "overview")}">Overview</a> tab.</div></div></div>`}</div>
    </div>`;
  paintRun(true);
}

function updateBoardLive() { paintRun(false); }

function paintRun(initial) {
  const eid = S.evId;
  const runs = S.runs || [];
  const sel = S.runSel;
  const run = sel === "all" ? null : runs.find((r) => r.id === sel) || null;
  let entries = runEntries(eid, sel);
  // a run started after the runs list was fetched: follow it automatically
  const all = (S.trace[eid] || { entries: [] }).entries;
  const newest = all.length ? all[all.length - 1] : null;
  if (newest && newest.run_id && sel !== "all" && !runs.find((r) => r.id === newest.run_id) && S.poll && S.poll.run) {
    S.runSel = newest.run_id;
    S.runs = [{ id: newest.run_id, status: "running", started_at: newest.ts, budget_usd: null }, ...runs];
    return paintRun(initial);
  }
  const B = computeBoard(entries, run && run.status !== "running" ? run : null);
  const boardEl = $("[data-board]");
  if (!boardEl) return;
  boardEl.innerHTML = boardSvg(B);
  $("[data-guards]").innerHTML = `${B.budget ? chip(icon("dollar") + "Budget Guard stopped the run", "amber") : ""} ${B.errors ? chip(`${B.errors} error(s)`, "red") : ""}`;

  // log
  const logEl = $("[data-log]");
  const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 60;
  const prevMax = +(logEl.dataset.max || 0);
  logEl.innerHTML = entries.length ? entries.map((e) => `<div class="log-row k-${esc(e.kind)} ${!initial && e.id > prevMax ? "fresh" : ""}"><span class="ts">${esc(fmtTime(e.ts))}</span><span class="ag"><span class="k"></span><span class="ellipsis">${esc(e.agent)}</span></span><span class="msg">${esc(e.message)}</span></div>`).join("")
    : emptyState("activity", "No activity yet", "Start a run to watch the Coordinator hand work from agent to agent.", "", true);
  logEl.dataset.max = entries.length ? entries[entries.length - 1].id : 0;
  if (initial || nearBottom) logEl.scrollTop = logEl.scrollHeight;
  $("[data-logcount]").textContent = plural(entries.length, "entry", "entries");

  // meter
  const live = run && run.status === "running" || (!run && S.ev.running);
  const usage = run && run.usage ? run.usage : partialUsage(entries);
  const t = usage.totals || {};
  const budget = run && run.budget_usd ? run.budget_usd : null;
  const pct = budget ? Math.min(100, (num(t.cost_usd) / budget) * 100) : 0;
  const cachePct = num(t.input_tokens) ? Math.round((num(t.cached_tokens) / num(t.input_tokens)) * 100) : 0;
  $("[data-meter]").innerHTML = `<div class="card-head"><h3>${icon("dollar")}Cost meter</h3>${live ? chip('<span class="dot"></span>live', "teal") : run ? runChip(run.status) : ""}</div>
    <div class="card-body"><div class="meter-big">${fmtCost(t.cost_usd)} <small>${budget ? "of " + fmtCost(budget) + " budget" : sel === "all" ? "" : ""}</small></div>
      ${budget ? `<div class="bar thick ${pct > 90 ? "red" : pct > 70 ? "amber" : ""}"><i style="width:${pct.toFixed(1)}%"></i></div>` : ""}
      <div class="tok-grid"><div class="tok"><div class="k"><i class="sw c-in" style="width:8px;height:8px;border-radius:2px;display:inline-block"></i>Input</div><div class="v">${fmtTok(t.input_tokens)}</div></div>
        <div class="tok"><div class="k"><i class="c-cached" style="width:8px;height:8px;border-radius:2px;display:inline-block"></i>Cached</div><div class="v">${fmtTok(t.cached_tokens)}</div></div>
        <div class="tok"><div class="k"><i class="c-out" style="width:8px;height:8px;border-radius:2px;display:inline-block"></i>Output</div><div class="v">${fmtTok(t.output_tokens)}</div></div></div>
      <div class="small muted mt12">${cachePct}% of input served from the prompt cache · ${fmtInt(t.requests)} requests${t.tool_calls ? " · " + fmtInt(t.tool_calls) + " tool calls" : ""}</div>
      ${live || (!run || !run.usage) ? `<div class="hint mt8">${live ? "Live estimate: fan-out agents report their usage when the run ends." : "Usage is recorded per run — pick a run above."}</div>` : ""}</div>`;

  // per-agent table
  const rows = Object.entries(usage.by_agent || {}).sort((a, b) => num(b[1].cost_usd) - num(a[1].cost_usd));
  $("[data-agent-usage]").innerHTML = `<div class="card-head"><h3>${icon("cpu")}Per-agent usage</h3></div>
    ${rows.length ? `<div class="table-wrap"><table class="tbl compact fixed"><thead><tr><th style="width:34%">Agent</th><th class="num">Calls</th><th class="num">In</th><th class="num">Cached</th><th class="num">Out</th><th class="num">Cost</th></tr></thead><tbody>
      ${rows.map(([a, u]) => `<tr><td class="small strong">${esc(a)}</td><td class="num">${fmtInt(u.runs)}</td><td class="num">${fmtTok(u.input_tokens)}</td><td class="num">${fmtTok(u.cached_tokens)}</td><td class="num">${fmtTok(u.output_tokens)}</td><td class="num strong">${fmtCost(u.cost_usd)}</td></tr>`).join("")}</tbody></table></div>`
      : emptyState("cpu", "No usage yet", live ? "Numbers appear as agents finish." : "This run has no recorded model usage.", "", true)}`;
}

/* ================================================================== directory */

async function viewDirectory() {
  const q = S.dirQ || "";
  $("#view").innerHTML = `<div class="page"><div class="page-head"><div><div class="page-title">Directory</div>
      <div class="page-sub">Everyone across all your events, merged by name and aliases — the organisation's memory of who you know and who owns each relationship.</div></div>
      <a class="btn" href="/api/directory/export.csv" download="integrated_directory.csv">${icon("download")}Export CSV</a></div>
    <div class="card"><div class="filters"><div class="search" style="width:340px">${icon("search")}<input class="input" placeholder="Search names, aliases (Chinese or English), roles…  ( / )" value="${esc(q)}" data-dir-q data-search aria-label="Search directory"></div><span class="spacer"></span><span class="small muted" data-dir-count></span></div>
    <div class="table-wrap" data-dir-table>${skel()}</div></div></div>`;
  await loadDirectory();
}
async function loadDirectory() {
  const el = $("[data-dir-table]");
  if (!el) return;
  try {
    const rows = await api(`/api/directory?q=${encodeURIComponent(S.dirQ || "")}`);
    $("[data-dir-count]").textContent = plural(rows.length, "person", "people");
    if (!rows.length) { el.innerHTML = S.dirQ ? emptyState("search", "No matches", "Try a Chinese or English name, or part of a role.", "", true) : emptyState("book", "Directory is empty", "People appear here once an event's roster has been extracted."); return; }
    el.innerHTML = `<table class="tbl fixed"><thead><tr><th style="width:31%">Name</th><th style="width:33%">Appears in</th><th>Owners</th><th style="width:15%">Contacts</th><th style="width:110px">Last touch</th></tr></thead><tbody>
      ${rows.map((g) => `<tr class="clickable" data-act="nav" data-href="#/directory/${g.id}">
        <td style="min-width:170px"><div class="person">${avatar(g.name)}<div style="min-width:0"><div class="row" style="gap:6px"><span class="nm">${esc(g.name)}</span>${g.internal ? chip("internal", "brass", "sq") : ""}${g.appearances.length > 1 ? chip(`${g.appearances.length} events`, "blue") : ""}</div>
          <div class="al" style="max-width:320px">${esc([(g.aliases || []).join(" · "), g.category].filter(Boolean).join(" — "))}</div></div></div></td>
        <td><div class="appear">${g.appearances.map((a) => `<span class="chip outline" title="${esc(a.event_name)} · ${esc(a.role || "")}">${a.tier ? `<b>${esc(a.tier)}</b>` : ""} ${esc(a.event_name)} · ${esc((PSTATUS[a.status] || [a.status])[0])}</span>`).join("")}</div></td>
        <td class="small">${esc(g.owners.join(", ")) || '<span class="faint">—</span>'}</td>
        <td><div class="row wrap" style="gap:4px">${(g.contacts || []).slice(0, 3).map((c) => `<span class="ch" title="${esc(c.value)}">${esc(shortCh(c.channel))}</span>`).join("")}${(g.contacts || []).length > 3 ? `<span class="xsmall muted">+${g.contacts.length - 3}</span>` : ""}</div></td>
        <td class="small nowrap">${g.last_touch ? esc(fmtDate(g.last_touch, { weekday: false })) : '<span class="faint">—</span>'}</td></tr>`).join("")}</tbody></table>`;
  } catch (e) { el.innerHTML = emptyState("alert", "Couldn't load the directory", esc(e.message), "", true); }
}

async function viewProfile(gid) {
  $("#view").innerHTML = `<div class="page">${skel()}</div>`;
  let g;
  try { g = await api(`/api/directory/${gid}`); } catch (e) {
    $("#view").innerHTML = `<div class="page">${emptyState("alert", "Profile not found", esc(e.message), `<a class="btn" href="#/directory">Back to Directory</a>`)}</div>`; return;
  }
  const apps = g.appearances || [];
  $("#view").innerHTML = `<div class="page" style="max-width:1200px">
    <div class="crumbs"><a href="#/directory">Directory</a>${icon("chevron").replace("<svg", '<svg style="width:12px;height:12px"')}<span>${esc(g.name)}</span></div>
    <div class="page-head"><div class="row" style="gap:14px">${avatar(g.name, "xl")}<div style="min-width:0">
      <div class="page-title">${esc(g.name)} ${g.internal ? chip("internal team member", "brass") : ""}</div>
      <div class="aliases">${(g.aliases || []).map((a) => `<span class="chip outline">${esc(a)}</span>`).join("")}</div>
      ${g.intro ? `<div class="page-sub">${esc(g.intro)}</div>` : ""}</div></div></div>
    <div class="split"><div class="stack">
      <div class="card"><div class="card-head"><h3>${icon("calendar")}Appearances by event</h3><span class="count-badge">${apps.length}</span></div>
        ${apps.map((a) => `<a class="li" href="${personHash(a.event_id, a.id)}"><div class="t">${tierBadge(a.tier)}${esc(a.event_name)} ${pStatusChip(a.status, false)}</div>
          <div class="s">${esc(a.role || "role tbd")}${a.owner ? " · owner <b>" + esc(a.owner) + "</b>" : ""}${a.org ? " · " + esc(a.org) : ""} — open in event ${icon("chevron").replace("<svg", '<svg style="width:11px;height:11px;vertical-align:-1px"')}</div></a>`).join("")}</div>
      <div class="card"><div class="card-head"><h3>${icon("clock")}Merged timeline</h3></div><div class="card-body">
        ${(g.timeline || []).length ? `<div class="vtl">${g.timeline.map((t) => `<div class="it k-${esc(t.kind)}"><div class="when">${esc(fmtDate(t.date))} · ${esc(t.actor || "")} ${chip(esc(t.event_name || ""), "purple", "sq")}</div><div class="note">${esc(t.note)}</div></div>`).join("")}</div>` : '<p class="small muted">No history yet.</p>'}</div></div>
    </div><div class="stack">
      <div class="card"><div class="card-head"><h3>${icon("user")}Relationship owners</h3></div><div class="card-body">${g.owners.length ? g.owners.map((o) => `<span class="chip outline lg" style="margin:2px">${esc(o)}</span>`).join("") : '<p class="small muted">Nobody owns this relationship yet.</p>'}</div></div>
      <div class="card"><div class="card-head"><h3>${icon("mail")}Contact points</h3></div>${(g.contacts || []).length ? g.contacts.map((c) => `<div class="contact"><span class="ch">${esc(shortCh(c.channel))}</span><div class="val">${linkify(c.value)}</div></div>`).join("") : `<div class="card-body small muted">None recorded.</div>`}</div>
    </div></div></div>`;
}

/* ================================================================== team */

async function viewTeam() {
  $("#view").innerHTML = `<div class="page">${skel()}</div>`;
  const [team, conns] = await Promise.all([api("/api/team"), api("/api/team/connections").catch(() => [])]);
  const byEvent = (owns) => { const m = {}; owns.forEach((o) => (m[o.event] = m[o.event] || []).push(o)); return m; };
  const evIdByName = (n) => (S.events.find((e) => e.name === n) || {}).id;
  $("#view").innerHTML = `<div class="page">
    <div class="page-head"><div><div class="page-title">Team</div>
      <div class="page-sub">Internal contacts and the relationships each person owns — the handover view when officers change.</div></div></div>
    <div class="split" style="grid-template-columns:minmax(0,1fr) 380px">
      <div>${team.length ? `<div class="team-grid">${team.map((m) => {
        const g = byEvent(m.owns || []);
        return `<div class="card"><div class="card-body"><div class="row" style="gap:12px;align-items:flex-start">${avatar(m.name, "lg")}<div style="min-width:0;flex:1">
          <div class="serif" style="font-size:18px;font-weight:600">${esc(m.name)}</div>
          <div class="xsmall muted">${(m.roles || []).map(esc).join("<br>")}</div>
          ${(m.emails || []).length ? `<div class="small mt8">${m.emails.map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join(" · ")}</div>` : ""}</div>
          <span class="count-badge accent" title="Relationships owned">${(m.owns || []).length}</span></div>
          ${(m.owns || []).length ? Object.entries(g).map(([ev, list]) => `<div class="subhead">${esc(ev)}</div>${list.map((o) => `<div class="own">${avatar(o.name, "xs")}${evIdByName(ev) ? `<a href="${personHash(evIdByName(ev), o.person_id)}">${esc(o.name)}</a>` : `<span>${esc(o.name)}</span>`}<span class="xsmall muted ellipsis" style="flex:1">${esc(o.role || "")}</span>${pStatusChip(o.status, false)}</div>`).join("")}`).join("")
            : '<p class="small muted mt12">Owns no relationships yet.</p>'}
        </div></div>`;
      }).join("")}</div>` : `<div class="card">${emptyState("users", "No team members yet", "Team members come from the Fact Sheet (organising team) and roster entries marked as team. Run the agents on an event first.")}</div>`}</div>
      <div class="stack"><div class="card"><div class="card-head"><h3>${icon("link")}Import LinkedIn connections</h3></div><div class="card-body">
        <p class="small muted">Lets the Connection Finder spot 1st-degree connections and colleagues at an invitee's company — warm intro paths you'd otherwise miss.</p>
        <div class="callout plain mt12">${icon("info")}<div class="xsmall">LinkedIn → Settings → Data privacy → Get a copy of your data → <b>Connections</b>. You'll get <code>Connections.csv</code> by email. It stays on this computer.</div></div>
        <div class="field mt12"><label for="li-owner">Team member</label><input id="li-owner" class="input" list="team-names" placeholder="Whose connections are these?" data-li-owner>
          <datalist id="team-names">${team.map((m) => `<option value="${esc(m.name)}">`).join("")}</datalist></div>
        <div class="field mt12"><label for="li-file">Connections.csv</label><input id="li-file" type="file" accept=".csv,text/csv" class="input" style="padding-top:5px" data-li-file></div>
        <button class="btn primary block mt12" data-act="li-import">${icon("upload")}Import connections</button>
        ${conns.length ? `<div class="subhead">Imported networks</div><table class="tbl"><thead><tr><th>Owner</th><th class="num">Connections</th><th class="num">Companies</th></tr></thead><tbody>
          ${conns.map((c) => `<tr><td class="small strong">${esc(c.owner)}</td><td class="num">${fmtInt(c.connections)}</td><td class="num">${fmtInt(c.companies)}</td></tr>`).join("")}</tbody></table>` : `<p class="hint mt12">No networks imported yet.</p>`}
      </div></div></div>
    </div></div>`;
}

async function importLinkedIn(btn) {
  const owner = $("[data-li-owner]").value.trim();
  const f = $("[data-li-file]").files[0];
  if (!owner) { toast("Enter whose connections these are.", "error"); return; }
  if (!f) { toast("Choose the Connections.csv file.", "error"); return; }
  const fd = new FormData(); fd.append("owner", owner); fd.append("file", f);
  setBusy(btn, true, "Importing…");
  try {
    const r = await api("/api/team/connections", { method: "POST", form: fd });
    toast(`Imported ${fmtInt(r.imported)} connections for ${esc(owner)}. Re-plan people to use them.`, "ok", 6000);
    S.mainKey = null; route();
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

/* ================================================================== usage */

async function viewUsage() {
  $("#view").innerHTML = `<div class="page">${skel()}</div>`;
  const { runs } = await api("/api/usage");
  const agg = {}, tot = { input_tokens: 0, cached_tokens: 0, output_tokens: 0, cost_usd: 0, requests: 0 };
  for (const r of runs) {
    const by = (r.usage && r.usage.by_agent) || {};
    for (const [a, u] of Object.entries(by)) {
      const x = (agg[a] = agg[a] || { input_tokens: 0, cached_tokens: 0, output_tokens: 0, cost_usd: 0, runs: 0, requests: 0 });
      Object.keys(x).forEach((k) => (x[k] += num(u[k])));
    }
    const t = (r.usage && r.usage.totals) || {};
    Object.keys(tot).forEach((k) => (tot[k] += num(t[k])));
  }
  const agents = Object.entries(agg).sort((a, b) => b[1].cost_usd - a[1].cost_usd);
  const maxCost = Math.max(...agents.map(([, u]) => u.cost_usd), 1e-9);
  const cachePct = tot.input_tokens ? Math.round((tot.cached_tokens / tot.input_tokens) * 100) : 0;
  $("#view").innerHTML = `<div class="page">
    <div class="page-head"><div><div class="page-title">Usage & cost</div>
      <div class="page-sub">Every agent call is metered. Runs stop cleanly at their budget; a shared handbook prefix keeps the prompt cache warm.</div></div></div>
    <div class="kpis">
      <div class="kpi accent"><div class="k">${icon("dollar")}Total spent</div><div class="v">${fmtCost(tot.cost_usd)}</div><div class="s">${plural(runs.length, "run")}</div></div>
      <div class="kpi"><div class="k">Input tokens</div><div class="v">${fmtTok(tot.input_tokens)}</div><div class="s">${fmtInt(tot.requests)} requests</div></div>
      <div class="kpi"><div class="k">Cached</div><div class="v">${fmtTok(tot.cached_tokens)}</div><div class="s">${cachePct}% of input from cache</div></div>
      <div class="kpi"><div class="k">Output tokens</div><div class="v">${fmtTok(tot.output_tokens)}</div><div class="s">${(S.health || {}).model || ""}</div></div>
      <div class="kpi"><div class="k">Avg per run</div><div class="v">${fmtCost(runs.length ? tot.cost_usd / runs.length : 0)}</div><div class="s">all events</div></div>
    </div>
    ${!runs.length ? `<div class="card">${emptyState("chart", "No runs yet", "Run the agents on an event and the cost of every agent shows up here.")}</div>` : `
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start">
      <div class="card"><div class="card-head"><h3>${icon("chart")}Cost per agent</h3><span class="small muted">all runs</span></div><div class="card-body">
        ${agents.map(([a, u]) => `<div class="hbar"><span class="small ellipsis" title="${esc(a)}">${esc(a)}</span><div class="track"><i class="cost" style="width:${((u.cost_usd / maxCost) * 100).toFixed(1)}%"></i></div><span class="v small">${fmtCost(u.cost_usd)}</span></div>`).join("")}
      </div></div>
      <div class="card"><div class="card-head"><h3>${icon("cpu")}Tokens per agent</h3><div class="legend"><span><i class="c-cached"></i>cached in</span><span><i class="c-in"></i>uncached in</span><span><i class="c-out"></i>out</span></div></div><div class="card-body">
        ${(() => { const maxT = Math.max(...agents.map(([, u]) => u.input_tokens + u.output_tokens), 1); return agents.map(([a, u]) => {
          const w = (v) => ((v / maxT) * 100).toFixed(2) + "%";
          return `<div class="hbar"><span class="small ellipsis">${esc(a)}</span><div class="track"><i class="c-cached" style="width:${w(u.cached_tokens)}"></i><i class="c-in" style="width:${w(Math.max(0, u.input_tokens - u.cached_tokens))}"></i><i class="c-out" style="width:${w(u.output_tokens)}"></i></div><span class="v small">${fmtTok(u.input_tokens + u.output_tokens)}</span></div>`; }).join(""); })()}
      </div></div>
    </div>
    <div class="card mt16"><div class="card-head"><h3>${icon("list")}Runs</h3><span class="small muted">click a row for the per-agent breakdown</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Run</th><th>Event</th><th>Started</th><th>Status</th><th>Note</th><th class="num">Budget</th><th class="num">Cost</th><th class="num">In</th><th class="num">Cached</th><th class="num">Out</th></tr></thead><tbody>
      ${runs.map((r) => { const t = (r.usage && r.usage.totals) || {}; const by = Object.entries((r.usage && r.usage.by_agent) || {});
        return `<tr class="clickable" data-act="toggle-run" data-id="${r.id}"><td class="strong">#${r.id}</td><td class="small">${r.event_id != null ? `<a href="${evHash(r.event_id, "run")}">${esc(r.event_name || "Event #" + r.event_id)}</a>` : `<span class="muted">${esc(r.event_name || "All events")}</span>`}</td><td class="small nowrap">${esc(fmtDateTime(r.started_at))}</td>
          <td>${runChip(r.status)}</td><td class="small muted" style="max-width:220px">${esc(r.note || "full pipeline")}</td>
          <td class="num">${r.budget_usd != null ? fmtCost(r.budget_usd) : "—"}</td><td class="num strong">${fmtCost(t.cost_usd)}</td><td class="num">${fmtTok(t.input_tokens)}</td><td class="num">${fmtTok(t.cached_tokens)}</td><td class="num">${fmtTok(t.output_tokens)}</td></tr>
          <tr hidden data-run-detail="${r.id}"><td colspan="10" style="background:var(--surface-2)">${by.length ? `<table class="tbl" style="background:var(--surface);border-radius:8px"><thead><tr><th>Agent</th><th class="num">Calls</th><th class="num">Requests</th><th class="num">Tool calls</th><th class="num">In</th><th class="num">Cached</th><th class="num">Out</th><th class="num">Cost</th></tr></thead><tbody>
            ${by.sort((a, b) => num(b[1].cost_usd) - num(a[1].cost_usd)).map(([a, u]) => `<tr><td class="small">${esc(a)}</td><td class="num">${fmtInt(u.runs)}</td><td class="num">${fmtInt(u.requests)}</td><td class="num">${fmtInt(u.tool_calls)}</td><td class="num">${fmtTok(u.input_tokens)}</td><td class="num">${fmtTok(u.cached_tokens)}</td><td class="num">${fmtTok(u.output_tokens)}</td><td class="num strong">${fmtCost(u.cost_usd)}</td></tr>`).join("")}</tbody></table>` : '<span class="small muted">No usage recorded for this run.</span>'}</td></tr>`; }).join("")}
      </tbody></table></div></div>`}
  </div>`;
}

/* ================================================================== actions (event delegation) */

function openRunModal() {
  openModal({
    title: "Run agents",
    sub: "The Coordinator hands work from agent to agent. Nothing is sent to anyone — every draft waits for your approval.",
    body: runPanel(S.ev),
  });
}

async function generateBrief(btn) {
  const lang = store.get("briefLang", "en");
  setBusy(btn, true, "Writing brief… 10–20 s");
  try {
    const r = await api("/api/today/brief", { method: "POST", body: { language: lang } });
    store.set("dailyBrief", { data: r, at: new Date().toISOString(), lang, done: [] });
    toast(`Daily brief ready${r.usage ? " (" + fmtCost(r.usage.cost_usd) + ")" : ""}.`, "ok");
  } catch (e) { toastErr(e); }
  const card = $("#brief-card");
  if (card) card.outerHTML = dailyBriefCard();
}

async function openPersonAnywhere(pid) {
  try {
    const p = await api(`/api/people/${pid}`);
    go(personHash(p.event_id, pid));
  } catch (e) { toastErr(e); }
}

const ACTIONS = {
  reload: () => location.reload(),
  "reload-tab": () => renderTab(),
  "close-modal": () => closeModal(),
  "new-event": (el) => newEventModal(el.dataset.mode),
  "load-demo": (el) => loadDemo(el),
  "wel-sample": (el) => importSample($("#wel-sample").value, el),
  "open-run": () => { if (S.ev) openRunModal(); },
  "run-agents": (el) => startRun(el),
  "conflict-use": (el) => { const i = $(`[data-conf-input="${el.dataset.i}"]`); if (i) { i.value = el.dataset.v; i.focus(); i.select(); } },
  "conflict-resolve": (el) => resolveConflict(el),
  reimport: (el) => reimport(el),
  "list-mode": (el) => {
    store.set("listMode", el.dataset.v);
    $$('[data-act="list-mode"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v));
    const h = $("[data-list-mode-hint]"); if (h) h.textContent = LIST_MODES[listMode()].hint + " · nothing is sent to anyone";
  },
  "list-example": (el) => { const t = $("[data-list-brief]"); t.value = el.dataset.v; store.set("listBrief", t.value); t.focus(); },
  "list-generate": (el) => generateList(el),
  "list-csv": (el, e) => { e.stopPropagation(); exportListCSV(+el.dataset.i); },
  "plan-person": (el, e) => { e.stopPropagation(); planPerson(+el.dataset.pid, el); },
  "open-person": (el) => {
    if (S.route.parts[0] === "event") setQuery("p", el.dataset.pid);
    else openPersonAnywhere(+el.dataset.pid);
  },
  "open-person-any": (el) => openPersonAnywhere(+el.dataset.pid),
  "close-drawer": () => closeDrawer(),
  "gf-entity": (el) => { S.guestsFilter.entity = el.dataset.v; store.set("guestsFilter", S.guestsFilter); $$('[data-act="gf-entity"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v)); renderGuestRows(); },
  "scroll-queue": () => { const q = $("#queue"); if (q) q.scrollIntoView({ behavior: "smooth", block: "start" }); },
  "g-view": (el) => { store.set("guestView", el.dataset.v); $$('[data-act="g-view"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v)); renderGuestRows(); },
  "gf-needs": (el) => { S.guestsFilter.needs = !S.guestsFilter.needs; el.setAttribute("aria-pressed", S.guestsFilter.needs); store.set("guestsFilter", S.guestsFilter); renderGuestRows(); },
  "gf-clear": () => { S.guestsFilter = { q: "", tier: "", status: "", slot: "", origin: "", entity: S.guestsFilter.entity, needs: false }; store.set("guestsFilter", S.guestsFilter); renderTab(); },
  copy: async (el, e) => {
    e.stopPropagation();
    const v = el.hasAttribute("data-copy-body") ? ($("[data-draft-field='body']") || {}).value || el.dataset.v : el.dataset.v;
    try { await navigator.clipboard.writeText(v); toast("Copied to clipboard.", "ok", 1800); }
    catch { toast("Couldn't access the clipboard — select the text and copy it manually.", "error"); }
  },
  "save-owner": () => patchPerson({ owner: $("[data-owner]").value.trim() }, "Owner saved."),
  "add-note": () => { const n = $("[data-note]").value.trim(); if (!n) { toast("Write a note first.", "error"); return; } patchPerson({ note: n }, "Note added to the timeline."); },
  "log-reply": (el) => logReply(el),
  "draft-serif": (el) => { store.set("letterSerif", el.dataset.v === "1"); $$('[data-act="draft-serif"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v)); $("[data-draft-field='body']")?.classList.toggle("serifed", el.dataset.v === "1"); },
  "draft-save": (el) => draftAction("save", el),
  "draft-status": (el) => draftAction("status", el),
  "draft-review": (el) => draftAction("review", el),
  "draft-comment": (el) => draftAction("comment", el),
  "if-status": (el) => { S.issueFilter.status = el.dataset.v; renderIssues(); },
  "if-kind": (el) => { S.issueFilter.kind = S.issueFilter.kind === el.dataset.v ? "" : el.dataset.v; renderIssues(); },
  "issue-set": async (el) => {
    setBusy(el, true, "");
    try {
      await api(`/api/issues/${el.dataset.id}`, { method: "PATCH", body: { status: el.dataset.s } });
      const i = (S.issues || []).find((x) => x.id === +el.dataset.id); if (i) i.status = el.dataset.s;
      renderIssues();
      toast({ resolved: "Marked resolved.", ignored: "Ignored.", open: "Reopened." }[el.dataset.s], "ok", 1800);
      loadEvent(S.evId).then(() => { const b = $$(".tab .count-badge.hot")[0]; if (b) b.textContent = S.ev.counts.issues || ""; }).catch(() => {});
    } catch (e) { toastErr(e); setBusy(el, false); }
  },
  "fu-done": async (el, e) => {
    e.stopPropagation();
    setBusy(el, true, "");
    try {
      await api(`/api/followups/${el.dataset.id}`, { method: "PATCH", body: { status: "done" } });
      toast("Follow-up done — logged on the person's timeline.", "ok", 2200);
      if (S.route.parts[0] === "today") { S.mainKey = null; route(); } else await refreshEventView();
    } catch (err) { toastErr(err); setBusy(el, false); }
  },
  "drive-open": (el) => setQuery("f", el.dataset.path, true),
  nav: (el) => go(el.dataset.href),
  "toggle-run": (el) => { const d = $(`[data-run-detail="${el.dataset.id}"]`); if (d) d.hidden = !d.hidden; },
  "li-import": (el) => importLinkedIn(el),
  "brief-gen": (el) => generateBrief(el),
  "brief-lang": (el) => { store.set("briefLang", el.dataset.lang); $$('[data-act="brief-lang"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === el.dataset.lang)); },
  "brief-check": (el) => {
    const s = store.get("dailyBrief", null); if (!s) return;
    const i = +el.dataset.i; s.done = s.done || [];
    s.done = el.checked ? [...new Set([...s.done, i])] : s.done.filter((x) => x !== i);
    store.set("dailyBrief", s);
    const card = $("#brief-card"); if (card) card.outerHTML = dailyBriefCard();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const a = e.target.closest("a[href]");
  if (a && a !== el && el.contains(a)) return; // let real links inside clickable rows work
  if (el.tagName === "INPUT" && el.type === "checkbox") { ACTIONS[el.dataset.act]?.(el, e); return; }
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "A" || el.tagName === "BUTTON" || el.tagName === "TR" || el.tagName === "SUMMARY" || el.classList.contains("kpi") || el.classList.contains("backdrop")) e.preventDefault();
  fn(el, e);
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.actChange === "p-status") patchPerson({ status: el.value }, `Status set to ${(PSTATUS[el.value] || [el.value])[0]}.`);
  else if (el.dataset.actChange === "p-tier" && el.value) patchPerson({ tier: el.value }, `Tier set to ${el.value}.`);
  else if (el.dataset.actChange === "run-sel") { S.runSel = el.value === "all" ? "all" : +el.value; paintRun(true); }
  else if (el.dataset.gf && el.dataset.gf !== "q") { S.guestsFilter[el.dataset.gf] = el.value; store.set("guestsFilter", S.guestsFilter); renderGuestRows(); }
});

const dirSearch = debounce(() => loadDirectory(), 250);
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.gf === "q") { S.guestsFilter.q = el.value; store.set("guestsFilter", S.guestsFilter); renderGuestRows(); }
  else if (el.hasAttribute("data-dir-q")) { S.dirQ = el.value; dirSearch(); }
  else if (el.dataset.draftField) onDraftInput();
  else if (el.hasAttribute("data-list-brief")) store.set("listBrief", el.value);
});

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if (e.key === "Escape") {
    if ($("#modal-root").innerHTML) { closeModal(); return; }
    if (S.drawerPid) { closeDrawer(); return; }
  }
  if (e.key === "/" && !typing) { const s = $("[data-search]"); if (s) { e.preventDefault(); s.focus(); s.select(); } }
  if (e.key === "Enter" && !typing && document.activeElement?.matches("tr[data-act]")) document.activeElement.click();
  if (e.key === "Enter" && document.activeElement?.matches("[data-owner]")) $('[data-act="save-owner"]')?.click();
  if (e.key === "Enter" && document.activeElement?.matches("[data-note]")) $('[data-act="add-note"]')?.click();
  if (e.key === "Enter" && document.activeElement?.matches("[data-c-text]")) $('[data-act="draft-comment"]')?.click();
  if ((e.metaKey || e.ctrlKey) && e.key === "s" && S.tab === "drafts" && S.draftDirty) { e.preventDefault(); $("[data-save-btn]")?.click(); }
});

window.addEventListener("beforeunload", (e) => { if (S.draftDirty) { e.preventDefault(); e.returnValue = ""; } });

/* ================================================================== boot */

async function boot() {
  try { S.health = await api("/api/health"); }
  catch (e) {
    $("#view").innerHTML = `<div class="page">${emptyState("alert", "Can't reach the InviteDesk server", "Start it with <code>uv run app.py</code> and reload this page.", `<button class="btn" data-act="reload">${icon("refresh")}Reload</button>`)}</div>`;
    return;
  }
  renderBanner();
  await loadEvents();
  window.addEventListener("hashchange", route);
  route();
  // keep sidebar "running" dots honest and catch runs that end while you look elsewhere
  setInterval(async () => {
    if (!S.events.some((e) => e.running)) return;
    const before = new Map(S.events.map((e) => [e.id, e.running]));
    await loadEvents();
    for (const e of S.events) {
      if (before.get(e.id) && !e.running && S.evId === e.id && !(S.poll && S.poll.eid === e.id)) refreshEventView();
    }
  }, 5000);
}
boot();
