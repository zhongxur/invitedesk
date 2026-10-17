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
function avatar(name, size = "", photo = "") {
  if (photo) return `<span class="av ${size} has-photo" style="--h:${hueOf(name)}" title="${esc(name || "")}" aria-hidden="true"><img src="${esc(photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('has-photo');this.remove()"><i>${esc(initials(name))}</i></span>`;
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
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
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


/* ================================================================== reused v3 blocks */

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
  toast(`${msg}. Next step: <b>Update with agents</b> to build the fact sheet and roster.`, "ok", 6000);
  await loadProjects(); renderSidebar();
  go(evHash(eid, "plan"));
}

async function loadDemo(btn) {
  if (btn) setBusy(btn, true, "Loading demo…");
  try {
    const r = await api("/api/demo/load", { method: "POST" });
    closeModal();
    await loadEvents();
    toast(`Demo loaded: ${plural((r.loaded || []).length, "event")} with a recorded agent run.`, "ok");
    await loadProjects(); renderSidebar();
    closeSheetDom(); S.sheetKey = null;
    S.mainKey = null; go("#/projects"); route();
  } catch (e) { toastErr(e); if (btn) setBusy(btn, false); }
}

async function importSample(name, btn) {
  setBusy(btn, true, "Importing…");
  try {
    const r = await api("/api/events/import_sample", { method: "POST", body: { sample: name, org: "" } });
    await afterImport(r.event_id, "Sample imported");
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

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

function factRow(label, x, opts = {}) {
  const v = fv(x);
  if (!v && !opts.always) return "";
  return `<dt>${label}</dt><dd>${v ? (opts.link ? linkify(v) : esc(v)) : '<span class="faint">—</span>'}${opts.extra || ""}${srcTip(x)}</dd>`;
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
    closeModal(); refreshHeader();
    const ev = S.events.find((e) => e.id === S.evId); if (ev) ev.running = true;
    S.runSel = null;
    startPoll(S.evId);
    go(evHash(S.evId, S.tab || "plan", "", "sheet=agent"));
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

async function resolveConflict(btn) {
  const i = +btn.dataset.i;
  const cf = S.ev.fact_sheet.conflicts[i];
  const input = btn.closest("[data-cf-box]").querySelector("[data-conf-input]");
  const value = input.value.trim();
  if (!value) { toast("Type or pick the correct value first.", "error"); input.focus(); return; }
  setBusy(btn, true, "Saving…");
  try {
    await api(`/api/events/${S.evId}/facts/resolve`, { method: "POST", body: { field: cf.field, value } });
    toast(`“${esc(cf.field)}” set to <b>${esc(value)}</b>. Files re-checked and Drive updated.`, "ok");
    await refreshEventView();
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

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
  paintFindBusy();
  const tick = setInterval(() => { const el = $("[data-list-progress]"); if (el && S.generating) el.innerHTML = listProgressHtml(); }, 1000);
  try {
    const r = await api(`/api/events/${eid}/lists/generate`, { method: "POST", body: { brief, count, mode: listMode() } });
    const n = (r.added || []).length;
    toast(n ? `Added <b>${n}</b> people to “${esc(r.list_name)}” (${fmtCost(r.cost_usd || 0)}).` : `“${esc(r.list_name || "List")}”: no new people with evidence were found${r.cost_usd != null ? ` (${fmtCost(r.cost_usd)})` : ""}. ${esc(r.warning || "Try a broader brief or Deep research.")}`, n ? "ok" : "info", 7000);
    if (n) { store.set("listBrief", ""); if (S.sheetKey === "sheet:find") closeSheet(); }
  } catch (e) { toastErr(e); }
  finally {
    clearInterval(tick);
    S.generating = null;
    stopPollIfIdle(eid);
    paintFindBusy();
    if (S.evId === eid) await refreshEventView();
  }
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

const PATH_KIND = {
  existing_thread: ["Existing thread", ""], owner: ["Relationship owner", ""], team_intro: ["Team member intro", ""],
  intermediary: ["Intermediary", ""], organisation: ["Through organisation", ""], past_event: ["Past event", ""],
  linkedin_1st: ["LinkedIn 1st-degree", ""], linkedin_colleague: ["LinkedIn colleague", ""],
};

const WARM_TONE = { hot: "orange", warm: "amber", cold: "slate" };

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

function draftEdits() {
  const d = S.draft, out = {};
  $$("[data-draft-field]").forEach((i) => { if (i.value !== (d[i.dataset.draftField] || "")) out[i.dataset.draftField] = i.value; });
  return out;
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

function flagTone(f) {
  const s = f.toLowerCase();
  if (s.includes("no receipt")) return "red";
  if (s.includes("awaiting")) return "amber";
  if (s.includes("not reimbursed")) return "blue";
  if (s.includes("over $")) return "orange";
  return "gray";
}

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
      if (S.evId === eid && S.sheetKey === "sheet:agent") updateBoardLive(rows);
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
    S.runs = null; loadProjects().then(renderSidebar);
    if (S.sheetKey === "sheet:agent") { try { S.runs = await api(`/api/events/${eid}/runs`); } catch { /* keep */ } paintRun(true); }
    await refreshEventView();
  }
}

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

const NODE_LINK = { reply: "people", cos: "#/projects?sheet=brief" };

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

async function loadDirectory() {
  const el = $("[data-dir-table]");
  if (!el) return;
  try {
    const rows = await api(`/api/directory?q=${encodeURIComponent(S.dirQ || "")}`);
    $("[data-dir-count]").textContent = plural(rows.length, "person", "people");
    if (!rows.length) { el.innerHTML = S.dirQ ? emptyState("search", "No matches", "Try a Chinese or English name, or part of a role.", "", true) : emptyState("book", "No people yet", "People appear here once the agents have read an event's files.", `<a class="btn" href="#/projects">${icon("grid")}Go to Projects</a>`); return; }
    el.innerHTML = `<table class="tbl fixed"><thead><tr><th style="width:31%">Name</th><th style="width:33%">Appears in</th><th>Owners</th><th style="width:15%">Contacts</th><th style="width:110px">Last touch</th></tr></thead><tbody>
      ${rows.map((g) => `<tr class="clickable" data-act="open-profile" data-gid="${g.id}" tabindex="0">
        <td style="min-width:170px"><div class="person">${avatar(g.name, "", g.photo_url || "")}<div style="min-width:0"><div class="row" style="gap:6px"><span class="nm">${esc(g.name)}</span>${g.internal ? chip("internal", "brass", "sq") : ""}${g.appearances.length > 1 ? chip(`${g.appearances.length} events`, "blue") : ""}</div>
          <div class="al" style="max-width:320px">${esc([(g.aliases || []).join(" · "), g.category].filter(Boolean).join(" — "))}</div></div></div></td>
        <td><div class="appear">${g.appearances.map((a) => `<span class="chip outline" title="${esc(a.event_name)} · ${esc(a.role || "")}">${a.tier ? `<b>${esc(a.tier)}</b>` : ""} ${esc(a.event_name)} · ${esc((PSTATUS[a.status] || [a.status])[0])}</span>`).join("")}</div></td>
        <td class="small">${esc(g.owners.join(", ")) || '<span class="faint">—</span>'}</td>
        <td><div class="row wrap" style="gap:4px">${(g.contacts || []).slice(0, 3).map((c) => `<span class="ch" title="${esc(c.value)}">${esc(shortCh(c.channel))}</span>`).join("")}${(g.contacts || []).length > 3 ? `<span class="xsmall muted">+${g.contacts.length - 3}</span>` : ""}</div></td>
        <td class="small nowrap">${g.last_touch ? esc(fmtDate(g.last_touch, { weekday: false })) : '<span class="faint">—</span>'}</td></tr>`).join("")}</tbody></table>`;
  } catch (e) { el.innerHTML = emptyState("alert", "Couldn't load the directory", esc(e.message), "", true); }
}

async function importLinkedIn(btn) {
  const owner = $("[data-li-owner]").value.trim();
  const f = $("[data-li-file]").files[0];
  if (!owner) { toast("Enter whose connections these are.", "error"); return; }
  if (!f) { toast("Choose the CSV file.", "error"); return; }
  const fd = new FormData(); fd.append("owner", owner); fd.append("file", f);
  setBusy(btn, true, "Importing…");
  try {
    const r = await api("/api/team/connections", { method: "POST", form: fd });
    toast(`Imported ${fmtInt(r.imported)} contacts for ${esc(owner)}. Re-plan people to use them.`, "ok", 6000);
    if (S.sheetKey === "sheet:settings") openSettingsSheet();
  } catch (e) { toastErr(e); setBusy(btn, false); }
}

async function usageHtml() {
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
  return `<p class="small muted mb12">Every agent call is metered. Runs stop cleanly at their budget; a shared handbook prefix keeps the prompt cache warm.</p>
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
        return `<tr class="clickable" data-act="toggle-run" data-id="${r.id}"><td class="strong">#${r.id}</td><td class="small">${r.event_id != null ? `<a href="${evHash(r.event_id, "plan", "", "sheet=agent")}">${esc(r.event_name || "Event #" + r.event_id)}</a>` : `<span class="muted">${esc(r.event_name || "All events")}</span>`}</td><td class="small nowrap">${esc(fmtDateTime(r.started_at))}</td>
          <td>${runChip(r.status)}</td><td class="small muted" style="max-width:220px">${esc(r.note || "full pipeline")}</td>
          <td class="num">${r.budget_usd != null ? fmtCost(r.budget_usd) : "—"}</td><td class="num strong">${fmtCost(t.cost_usd)}</td><td class="num">${fmtTok(t.input_tokens)}</td><td class="num">${fmtTok(t.cached_tokens)}</td><td class="num">${fmtTok(t.output_tokens)}</td></tr>
          <tr hidden data-run-detail="${r.id}"><td colspan="10" style="background:var(--surface-2)">${by.length ? `<table class="tbl" style="background:var(--surface);border-radius:8px"><thead><tr><th>Agent</th><th class="num">Calls</th><th class="num">Requests</th><th class="num">Tool calls</th><th class="num">In</th><th class="num">Cached</th><th class="num">Out</th><th class="num">Cost</th></tr></thead><tbody>
            ${by.sort((a, b) => num(b[1].cost_usd) - num(a[1].cost_usd)).map(([a, u]) => `<tr><td class="small">${esc(a)}</td><td class="num">${fmtInt(u.runs)}</td><td class="num">${fmtInt(u.requests)}</td><td class="num">${fmtInt(u.tool_calls)}</td><td class="num">${fmtTok(u.input_tokens)}</td><td class="num">${fmtTok(u.cached_tokens)}</td><td class="num">${fmtTok(u.output_tokens)}</td><td class="num strong">${fmtCost(u.cost_usd)}</td></tr>`).join("")}</tbody></table>` : '<span class="small muted">No usage recorded for this run.</span>'}</td></tr>`; }).join("")}
      </tbody></table></div></div>`}`;
}


/* ================================================================== state & routing (v4: projects · people · 4 event tabs) */

const S = {
  health: null,
  events: [],
  projects: null,
  today: null,
  route: { parts: [], query: new URLSearchParams() },
  mainKey: null,
  ev: null, evId: null, tab: null, sub: null,
  evPeople: [], evFollowups: [], evProj: null,
  trace: {},
  poll: null,
  planning: new Set(),
  generating: null,
  draftDirty: false,
  runSel: null,
  sheetKey: null,
  pf: Object.assign({ q: "", tier: "", list: "", source: "", orgs: false, team: false }, store.get("peopleFilter", {})),
  peopleMore: {},
  showDeclined: false,
  openRows: new Set(),
};
const TABS = [["plan", "Plan"], ["people", "People"], ["messages", "Messages"], ["files", "Files"]];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || "") };
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function hashWith(parts, query) { const qs = query.toString(); return "#/" + parts.map(encodeURIComponent).join("/") + (qs ? "?" + qs : ""); }
function setQuery(key, val, replace = false) {
  const { parts, query } = parseHash();
  if (val == null || val === "") query.delete(key); else query.set(key, val);
  const h = hashWith(parts, query);
  if (replace) { history.replaceState(null, "", h); route(); } else location.hash = h;
}
const evHash = (eid, tab = "plan", sub = "", q = "") => `#/event/${eid}/${tab}${sub ? "/" + encodeURIComponent(sub) : ""}${q ? "?" + q : ""}`;
const personHash = (eid, pid, tab = "people") => evHash(eid, tab, "", "p=" + pid);

/** Old routes keep working: they are redirected to where the capability now lives. */
function legacyRedirect(parts, q) {
  const [h, a, b, c] = parts;
  if (!h || h === "today") return "#/projects" + (q.toString() ? "?" + q.toString() : "");
  if (h === "directory") return a ? `#/people?g=${a}` : "#/people";
  if (h === "team") return "#/people?view=team";
  if (h === "usage") return "#/projects?sheet=settings";
  if (h === "event" && a) {
    if (!b) return `#/event/${a}/plan`;
    const map = { overview: "plan", consistency: "plan", reimbursement: "plan", lists: "people", guests: "people", drafts: "messages", followups: "messages", drive: "files", documents: "files", run: "plan" };
    if (map[b]) {
      const qs = new URLSearchParams(q);
      let sub = "";
      if (b === "drafts" && c) sub = "/" + c;
      if (b === "drive") qs.set("seg", "produced");
      if (b === "documents") { qs.set("seg", "received"); if (c) qs.set("doc", c); }
      if (b === "run") qs.set("sheet", "agent");
      if (b === "consistency") qs.set("sheet", "review");
      const s = qs.toString();
      return `#/event/${a}/${map[b]}${sub}${s ? "?" + s : ""}`;
    }
  }
  return null;
}

const SHEET_PARAMS = ["p", "g", "sheet", "doc"];
async function route() {
  const r = parseHash();
  const red = legacyRedirect(r.parts, r.query);
  if (red && red !== location.hash) { history.replaceState(null, "", red); return route(); }
  S.route = r;
  const [head, a, b, c] = r.parts;
  const q2 = new URLSearchParams(r.query); SHEET_PARAMS.forEach((k) => q2.delete(k));
  const key = r.parts.join("/") + "?" + q2.toString();
  if (S.draftDirty && key !== S.mainKey && !(await confirmLeaveDraft())) { history.replaceState(null, "", "#/" + S.mainKey.replace(/\?$/, "")); return; }
  const changed = key !== S.mainKey;
  S.mainKey = key;
  renderSidebar();
  if (changed) {
    $("#main").scrollTop = 0;
    try {
      if (head === "projects") await viewProjects();
      else if (head === "welcome") viewWelcome();
      else if (head === "people") await viewGlobalPeople();
      else if (head === "event" && a) await viewEvent(+a, b || "plan", c);
      else go("#/projects");
    } catch (e) {
      $("#view").innerHTML = `<div class="page">${emptyState("alert", "Something went wrong", esc(e.message || e), `<button class="btn" data-act="reload">${icon("refresh")}Retry</button>`)}</div>`;
      if (e.status !== 404) console.warn(e);
    }
  }
  syncSheets();
}

async function confirmLeaveDraft() {
  const ok = await confirmBox("Discard unsaved edits?", "You edited this message but didn't save. Leave without saving?", "Discard edits", true);
  if (ok) S.draftDirty = false;
  return ok;
}

/* ================================================================== sheets (depth on demand) */

function openSheetShell(key, inner, cls = "") {
  S.sheetKey = key;
  $("#drawer-root").innerHTML = `<div class="backdrop" data-act="close-sheet"></div><aside class="drawer sheet ${cls}" role="dialog" aria-modal="true">
    <button class="btn ghost sm close" data-act="close-sheet" aria-label="Close (Esc)">${icon("x")}</button><div data-drawer>${inner}</div></aside>`;
  setTimeout(() => { const f = $("#drawer-root .drawer [data-autofocus]") || $("#drawer-root .drawer .close"); if (f) f.focus(); }, 30);
}
function closeSheetDom() {
  S.sheetKey = null; S.drawerPid = null;
  $("#drawer-root").innerHTML = "";
  $$("tr.selected, .pcard2.selected").forEach((x) => x.classList.remove("selected"));
}
function closeSheet() {
  const { parts, query } = parseHash();
  let had = false;
  SHEET_PARAMS.forEach((k) => { if (query.has(k)) { query.delete(k); had = true; } });
  if (had) location.hash = hashWith(parts, query); else closeSheetDom();
}
function sheetBody(title, sub, body, eyebrow = "") {
  return `<div class="drawer-head">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h2 class="sheet-title">${title}</h2>${sub ? `<div class="small muted mt8">${sub}</div>` : ""}</div><div class="drawer-body">${body}</div>`;
}

function syncSheets() {
  const q = S.route.query, [head] = S.route.parts;
  let want = null;
  if (q.get("p") && head === "event") want = "p:" + q.get("p");
  else if (q.get("g") && head === "people") want = "g:" + q.get("g");
  else if (q.get("doc") && head === "event") want = "doc:" + q.get("doc");
  else if (q.get("sheet")) want = "sheet:" + q.get("sheet");
  if (want === S.sheetKey) return;
  if (!want) { if (S.sheetKey) closeSheetDom(); return; }
  const [kind, val] = want.split(/:(.*)/s);
  if (kind === "p") openPersonSheet(+val);
  else if (kind === "g") openProfileSheet(+val);
  else if (kind === "doc") openDocSheet(+val);
  else if (val === "agent" && head === "event") openAgentSheet();
  else if (val === "run" && head === "event") openRunSheet();
  else if (val === "review" && head === "event") openReviewSheet();
  else if (val === "find" && head === "event") openFindSheet();
  else if (val === "brief") openBriefSheet();
  else if (val === "settings") openSettingsSheet();
  else closeSheetDom();
}

/* ================================================================== sidebar & banner */

async function loadEvents() {
  try { S.events = await api("/api/events"); } catch (e) { toastErr(e); }
  renderSidebar();
}
const shortEventName = (n) => { const s = String(n || ""); const i = s.indexOf(" — "); return i > 0 && s.length > 28 ? s.slice(i + 3) : s; };
function defaultTabFor(eid) {
  const p = S.projects && S.projects.events.find((e) => e.id === eid);
  if (!p) return "plan";
  return p.decisions > 0 || (p.next && p.next.kind === "run") ? "plan" : "people";
}

function renderSidebar() {
  const [head, a] = S.route.parts;
  const evs = S.events.map((e) => {
    const act = head === "event" && +a === e.id;
    return `<a class="nav-sub ${act ? "active" : ""}" href="${evHash(e.id, defaultTabFor(e.id))}" title="${esc(e.name)}" style="--h:${hueOf(e.name)}" ${act ? 'aria-current="page"' : ""}>
      <span class="edot"></span><span class="ellipsis">${esc(shortEventName(e.name))}</span>${e.running ? '<span class="live-dot" title="Agents running"></span>' : ""}</a>`;
  }).join("");
  $("#sidebar").innerHTML = `
    <div class="brand"><span class="brand-mark">${SEAL}</span><span><div class="brand-name">InviteDesk</div><div class="brand-sub">Outreach desk</div></span></div>
    <nav class="nav">
      <a class="nav-item ${head === "projects" || head === "welcome" || head === "event" ? "active" : ""}" href="#/projects">${icon("grid")}<span>Projects</span></a>
      <div class="nav-subs">${evs}</div>
      <a class="nav-item ${head === "people" ? "active" : ""}" href="#/people">${icon("users")}<span>People</span></a>
    </nav>
    <div class="spacer"></div>
    <div class="sidebar-foot">
      <button class="btn ghost block nav-new" data-act="new-event">${icon("plus")}New event</button>
      <button class="nav-item" data-act="open-sheet" data-sheet="settings">${icon("cpu")}<span>Settings</span>${S.health && !S.health.key_present ? '<span class="count hot" title="No API key">!</span>' : ""}</button>
    </div>`;
}

function renderBanner() {
  const h = S.health;
  $("#banner").innerHTML = h && !h.key_present
    ? `<div class="banner">${icon("alert")}<span><b>No API key found.</b> Browsing works; agents need <code>PORTKEY_API_KEY</code> in <code>.env</code>.</span></div>`
    : "";
}


/* ================================================================== projects home */

async function loadProjects() {
  try { S.projects = await api("/api/projects"); } catch (e) { S.projects = S.projects || { events: [], waiting: 0 }; }
  return S.projects;
}

function daysLine(e) {
  if (!e.date) return "Date to be confirmed";
  const d = e.days_to_go;
  const rel = d == null ? "" : d === 0 ? " · today" : d > 0 ? ` · ${plural(d, "day")} to go` : ` · ${plural(-d, "day")} ago`;
  return `${fmtDate(e.date)}${rel}`;
}

function projCard(e) {
  const tab = e.decisions > 0 || (e.next && e.next.kind === "run") ? "plan" : "people";
  const n = e.next || { kind: "ok", text: "On track — nothing is waiting on you" };
  const pct = e.needed > 0 ? Math.min(100, Math.round((e.confirmed / e.needed) * 100)) : 0;
  const progress = e.needed > 0
    ? `<div class="pc-progress"><div class="bar"><i style="width:${pct}%"></i></div><div class="small"><b class="serif">${e.confirmed}</b> confirmed <span class="muted">· of ${e.needed} needed</span></div></div>`
    : `<div class="pc-progress"><div class="small muted">${e.found > 0 ? plural(e.found, "candidate") + " found" : plural(e.people, "person", "people")}</div></div>`;
  const badges = [];
  if (e.to_review > 0) badges.push(`${e.to_review} to review`);
  if (e.decisions > 0) badges.push({ t: `${e.decisions} to confirm`, href: evHash(e.id, "plan", "", "sheet=review") });
  if (n.kind === "run") badges.push("Not started");
  else if (!badges.length && !e.overdue) badges.push("On track");
  const lead = (n.kind === "person" || n.kind === "draft") && n.name ? avatar(n.name, "sm")
    : `<span class="av sm ic">${icon({ decision: "alert", find: "search", run: "play", ok: "check" }[n.kind] || "zap")}</span>`;
  return `<article class="card proj-card" data-eid="${e.id}" style="--h:${hueOf(e.name)}">
    <div class="eyebrow ellipsis">${esc(e.org || "Event")}${e.demo ? ` <span class="demo-tag">Demo</span>` : ""}</div>
    <h3 class="pc-title"><a href="${evHash(e.id, tab)}">${esc(e.name)}</a></h3>
    <div class="small muted">${esc(daysLine(e))}</div>
    ${progress}
    <button class="pc-next" data-act="go-next" data-eid="${e.id}" data-kind="${esc(n.kind)}" data-pid="${n.person_id || ""}" data-did="${n.draft_id || ""}">
      ${lead}<span class="pc-next-t"><span class="eyebrow">Next</span><span class="ellipsis" title="${esc(n.text)}">${esc(n.text)}</span></span>${icon("chevron")}</button>
    <div class="pc-badges">${badges.slice(0, 2).map((b) => typeof b === "string" ? `<span class="qbadge">${esc(b)}</span>` : `<a class="qbadge amber" data-rv-badge="${e.id}" href="${b.href}"><span class="adot"></span>${esc(b.t)}</a>`).join("")}</div>
  </article>`;
}

async function viewProjects() {
  if (!S.events.length) { await loadEvents(); if (!S.events.length) { viewWelcome(); return; } }
  $("#view").innerHTML = `<div class="page">${skel(2)}</div>`;
  const pj = await loadProjects();
  renderSidebar();
  const evs = pj.events || [];
  const attn = evs.filter((e) => e.overdue > 0 || e.to_review > 0 || e.decisions > 0).length;
  $("#view").innerHTML = `<div class="page">
    <div class="page-head"><div><h1 class="page-title">Your events</h1>
      <div class="page-sub">${plural(evs.length, "event")} · ${attn ? `${attn} need${attn === 1 ? "s" : ""} your attention` : "nothing needs you right now"}</div></div>
      <div class="btn-row"><button class="btn ghost" data-act="open-sheet" data-sheet="brief">${icon("sparkle")}Brief me</button>
        <button class="btn primary" data-act="new-event">${icon("plus")}New event</button></div></div>
    <div class="proj-grid">${evs.map(projCard).join("")}
      <button class="proj-new" data-act="new-event">${icon("plus")}<span>New event</span><small>Import a folder, try a sample, or start from a public event</small></button>
    </div></div>`;
  syncReviewBadges(evs);
}

async function syncReviewBadges(evs) {
  await Promise.all(evs.filter((e) => e.next && e.next.kind !== "run").map(async (e) => {
    try {
      const [ev, issues] = await Promise.all([api(`/api/events/${e.id}`), api(`/api/events/${e.id}/issues`)]);
      const n = reviewModel(ev, issues).count;
      const card = $(`.proj-card[data-eid="${e.id}"] .pc-badges`); if (!card) return;
      let b = $(`[data-rv-badge="${e.id}"]`, card);
      if (!n) { if (b) b.remove(); return; }
      if (!b) {
        $$(".qbadge:not(a)", card).forEach((x) => { if (/On track/.test(x.textContent)) x.remove(); });
        if ($$(".qbadge", card).length >= 2) return;
        card.insertAdjacentHTML("beforeend", `<a class="qbadge amber" data-rv-badge="${e.id}" href="${evHash(e.id, "plan", "", "sheet=review")}"><span class="adot"></span></a>`);
        b = $(`[data-rv-badge="${e.id}"]`, card);
      }
      b.innerHTML = `<span class="adot"></span>${n} to confirm`;
    } catch { /* keep the server count */ }
  }));
}
function goNext(el) {
  const eid = +el.dataset.eid, k = el.dataset.kind;
  if (k === "person" && el.dataset.pid) go(personHash(eid, +el.dataset.pid));
  else if (k === "draft" && el.dataset.did) go(evHash(eid, "messages", el.dataset.did));
  else if (k === "find") go(evHash(eid, "people", "", "sheet=find"));
  else if (k === "run") go(evHash(eid, "plan", "", "sheet=run"));
  else if (k === "decision") go(evHash(eid, "plan", "", "sheet=review"));
  else go(evHash(eid, "plan"));
}

/* ---------------------------------------------------------------- brief me (Chief of Staff) as a sheet */

async function openBriefSheet() {
  openSheetShell("sheet:brief", sheetBody("Brief me", "", `<div data-brief-slot>${dailyBriefCard()}</div>`, "Chief of Staff"), "wide");
  if (!S.today) { try { S.today = await api("/api/today"); const slot = $("[data-brief-slot]"); if (slot) slot.innerHTML = dailyBriefCard(); } catch { /* names are optional */ } }
}


/* ================================================================== event page */

async function loadEvent(eid) {
  const [ev, ppl, fus, drafts, issues] = await Promise.all([
    api(`/api/events/${eid}`),
    api(`/api/events/${eid}/people`).catch(() => []),
    api(`/api/events/${eid}/followups`).catch(() => []),
    api(`/api/events/${eid}/drafts`).catch(() => []),
    api(`/api/events/${eid}/issues`).catch(() => []),
  ]);
  S.ev = ev; S.evId = eid;
  S.evPeople = ppl; S.evFollowups = fus; S.evDrafts = drafts; S.evIssues = issues; S.issues = issues;
  S.review = reviewModel(ev, issues);
  const t = todayISO();
  S.evBadges = {
    review: drafts.filter((d) => ["needs_changes", "ready_for_review", "in_review"].includes(d.status)).length,
    due: fus.filter((f) => f.status === "open" && f.due <= t).length,
  };
  const row = S.events.find((e) => e.id === eid);
  if (row && row.running !== ev.running) { row.running = ev.running; renderSidebar(); }
  if (ev.running) startPoll(eid);
  return ev;
}

function statusPill(ev) {
  const cost = fmtCost(ev.spent_usd);
  if (ev.running) return [`<span class="live-dot"></span>Running…`, "run"];
  const lr = ev.last_run;
  if (!lr && !ev.fact_sheet) return ["Agents not run yet", "idle"];
  const st = lr ? lr.status : ev.status;
  if (st === "budget_stop") return [`Stopped at budget cap · ${cost}`, "warn"];
  if (st === "error") return [`Error · ${cost}`, "err"];
  if (st === "running") return [`Run interrupted · ${cost}`, "warn"];
  return [`Agents done · ${cost}`, "ok"];
}
const neverRun = (ev) => !ev.last_run && !ev.fact_sheet;

function eventHeader(ev, tab) {
  const fs = ev.fact_sheet || {};
  const title = fv(fs.event_name) || ev.name;
  const zh = fv(fs.event_name_zh);
  const date = fv(fs.date);
  const venue = (fv(fs.venue) || fv(fs.city_region) || "").split(";")[0].split(",").slice(0, 2).join(",").trim();
  const meta = [date ? (isISODate(date) ? asDate(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : date) : "Date to be confirmed", venue, fv(fs.org_name_en) || ev.org].filter(Boolean);
  const [pill, pk] = statusPill(ev);
  const noKey = S.health && !S.health.key_present;
  let primary = "";
  if (tab === "plan" && neverRun(ev)) primary = `<button class="btn primary" data-act="open-sheet" data-sheet="run" ${noKey ? "disabled" : ""}>${icon("play")}Update with agents</button>`;
  else if (tab === "people") primary = `<button class="btn primary" data-act="open-sheet" data-sheet="find" ${noKey ? "disabled" : ""}>${icon("search")}Find people</button>`;
  const ghost = tab === "plan" && neverRun(ev) ? "" : `<button class="btn ghost" data-act="open-sheet" data-sheet="run" ${noKey || ev.running ? "disabled" : ""}>${icon("refresh")}Update with agents</button>`;
  const b = S.evBadges || {};
  const msgBadge = (b.review || 0) + (b.due || 0);
  return `<div class="ev-hero v4"><div class="ev-hero-in">
      <div class="crumbs"><a href="#/projects">Projects</a>${icon("chevron").replace("<svg", '<svg style="width:12px;height:12px"')}</div>
      <div class="evh-row"><div class="evh-l"><h1 class="evh-name" title="${esc(title)}">${esc(title)}${zh ? `<span class="zh2">${esc(zh)}</span>` : ""}</h1>
          <div class="evh-meta">${meta.map(esc).join(" · ")}</div></div>
        <div class="evh-r"><button class="spill ${pk}" data-act="open-sheet" data-sheet="agent" title="Open the agent run">${pill}</button>${(S.review || {}).count ? `<button class="spill warn review" data-act="open-sheet" data-sheet="review" title="Facts and file checks waiting for you">${S.review.count} to confirm</button>` : ""}${ghost}${primary}</div></div>
    </div></div>
    <div class="ev-sticky"><div class="segtabs" role="tablist">
      ${TABS.map(([id, label]) => `<a class="segtab ${tab === id ? "active" : ""}" role="tab" aria-selected="${tab === id}" href="${evHash(ev.id, id)}">${label}${id === "messages" && msgBadge ? `<span class="count-badge">${msgBadge}</span>` : ""}</a>`).join("")}
    </div></div>`;
}

async function viewEvent(eid, tab, sub) {
  if (!TABS.find((t) => t[0] === tab)) tab = "plan";
  const notFound = () => { $("#view").innerHTML = `<div class="page">${emptyState("alert", "Event not found", "It may have been removed from this workspace.", `<a class="btn" href="#/projects">Back to Projects</a>`)}</div>`; };
  if (S.events.length && !S.events.some((e) => e.id === eid)) { await loadEvents(); if (!S.events.some((e) => e.id === eid)) { notFound(); return; } }
  if (S.evId !== eid || !S.ev) $("#view").innerHTML = `<div class="page">${skel(2)}</div>`;
  try { await loadEvent(eid); } catch (e) {
    if (e.status === 404) { $("#view").innerHTML = `<div class="page">${emptyState("alert", "Event not found", "It may have been removed from this workspace.", `<a class="btn" href="#/projects">Back to Projects</a>`)}</div>`; return; }
    throw e;
  }
  S.tab = tab; S.sub = sub;
  $("#view").innerHTML = eventHeader(S.ev, tab) + `<div class="page" id="tab-body">${skel(2)}</div>`;
  await renderTab();
}

async function renderTab() {
  const body = $("#tab-body");
  if (!body) return;
  const fn = { plan: tabPlan, people: tabPeople, messages: tabMessages, files: tabFiles }[S.tab];
  try { await fn(body, S.sub); }
  catch (e) { body.innerHTML = `<div class="card">${emptyState("alert", "Couldn't load this tab", esc(e.message), `<button class="btn" data-act="reload-tab">${icon("refresh")}Retry</button>`)}</div>`; console.warn(e); }
}

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
async function refreshEventView() {
  if (!S.evId || !$("#tab-body")) return;
  await refreshHeader();
  await renderTab();
  repaintOpenSheets();
}

/* ---------------------------------------------------------------- plan tab */

/* ---------------------------------------------------------------- review model (facts + document checks, shown in place) */

function reviewModel(ev, issues) {
  const fs = (ev && ev.fact_sheet) || {};
  const conflicts = (fs.conflicts || []).map((c, i) => ({ ...c, i })).filter((c) => !c.resolved);
  const cfAll = new Set((fs.conflicts || []).map((c) => (c.field || "").toLowerCase()));
  const isFactIssue = (i) => i.kind === "conflict" && cfAll.has((i.field || "").toLowerCase());
  const open = (issues || []).filter((i) => i.status === "open");
  const high = open.filter((i) => i.severity === "high" && !isFactIssue(i));
  // a disagreement you already settled on the fact stays visible as a minor note on the file that still says otherwise
  const other = open.filter((i) => i.severity !== "high" || (isFactIssue(i) && !conflicts.some((c) => (c.field || "").toLowerCase() === (i.field || "").toLowerCase())));
  const budget = !!(fs.budget_assumed && fv(fs.budget));
  return { conflicts, high, other, budget, count: conflicts.length + high.length + (budget ? 1 : 0) };
}
const isAsk = (c) => /ASK/i.test(c.recommended || "") || !c.recommended;
function conflictBox(c) {
  const vals = (c.values || []).map((v) => `<div class="cval"><div class="q"><span class="doc">${esc(v.document)}</span><span class="quote">“${esc(v.quote)}”</span></div>
      <button class="btn xs" data-act="conflict-use" data-v="${esc(v.value || v.quote)}">Use this</button></div>`).join("");
  return `<div class="cf-box" data-cf-box>${vals}${c.reason ? `<div class="xsmall muted mt8">${esc(c.reason)}</div>` : ""}
    <div class="row mt12"><input class="input sm" value="${isAsk(c) ? "" : esc(c.recommended)}" placeholder="Type the correct value" data-conf-input="${c.i}" aria-label="Correct value for ${esc(c.field)}">
      <button class="btn sm" data-act="conflict-resolve" data-i="${c.i}">${icon("check")}Confirm</button></div></div>`;
}
function decisionConflictRow(c) {
  return `<details class="drow"><summary><span class="adot" aria-hidden="true"></span>
      <span class="drow-t"><b>${esc(c.field)}</b><span class="drow-s">${isAsk(c) ? "Your files disagree — pick the right value" : `Showing ${esc(c.recommended)} · ${plural((c.values || []).length, "version")} in your files`}</span></span>
      <span class="qbtn">Decide</span></summary><div class="drow-body">${conflictBox(c)}</div></details>`;
}
function issueSentence(i) {
  if (i.kind === "injection") return `<b>Instruction-like text</b> in ${esc(i.document)} — treated as data, never obeyed`;
  return `<b>${esc(i.field)}</b>: “${esc((i.found || "").slice(0, 70))}”${i.expected ? ` → ${esc(i.expected)}` : ""}`;
}
function decisionIssueRow(i) {
  return `<div class="drow flat"><span class="adot ${i.kind === "injection" ? "red" : ""}" aria-hidden="true"></span>
    <span class="drow-t">${issueSentence(i)}${i.suggestion ? `<span class="drow-s">${esc(i.suggestion)}</span>` : ""}</span>
    <span class="drow-a"><button class="btn xs" data-act="issue-set" data-id="${i.id}" data-s="resolved">Resolve</button><button class="btn xs ghost" data-act="issue-set" data-id="${i.id}" data-s="ignored">Ignore</button></span></div>`;
}
function otherChecksHtml(list) {
  const byDoc = {};
  list.forEach((i) => (byDoc[i.document] = byDoc[i.document] || []).push(i));
  return Object.entries(byDoc).map(([doc, items]) => `<div class="subhead">${esc(doc)}</div>${items.map((i) => `<div class="drow flat compact"><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span>
      <span class="drow-t">${esc(i.field)}: <span class="muted">“${esc((i.found || "").slice(0, 80))}”${i.expected ? ` → ${esc(i.expected)}` : ""}</span></span>
      <span class="drow-a"><button class="btn xs" data-act="issue-set" data-id="${i.id}" data-s="resolved">Resolve</button><button class="btn xs ghost" data-act="issue-set" data-id="${i.id}" data-s="ignored">Ignore</button></span></div>`).join("")}`).join("");
}
const docIdOf = (path) => (((S.ev && S.ev.documents) || []).find((d) => d.path === path) || {}).id;
function reviewSheetBody() {
  const R = S.review || reviewModel(S.ev, S.evIssues);
  const fs = (S.ev && S.ev.fact_sheet) || {};
  if (!R.count) return `${emptyState("check", "All clear", "Nothing is waiting for your confirmation.", `<button class="btn" data-act="close-sheet">Back to the plan</button>`)}
    ${R.other.length ? `<details class="disc"><summary>Show ${plural(R.other.length, "minor check")}</summary>${otherChecksHtml(R.other)}</details>` : ""}`;
  const byDoc = {};
  R.high.forEach((i) => (byDoc[i.document] = byDoc[i.document] || []).push(i));
  const facts = [...R.conflicts.map(decisionConflictRow),
    ...(R.budget ? [`<details class="drow"><summary><span class="adot" aria-hidden="true"></span><span class="drow-t"><b>Budget</b> · ${esc(fv(fs.budget))}<span class="drow-s">Assumed — no document states a budget</span></span><span class="qbtn">Details</span></summary>
      <div class="drow-body small">${esc(fs.budget_basis || "No basis recorded.")}<div class="muted mt8">To confirm or change it, add the budget to your planning document and re-import the folder (Files › Re-import).</div></div></details>`] : [])];
  return `${facts.length ? `<div class="rv-group"><div class="mono-label">Facts · ${facts.length}</div>${facts.join("")}</div>` : ""}
    ${R.high.length ? `<div class="rv-group"><div class="mono-label">Documents · ${R.high.length}</div>${Object.entries(byDoc).map(([doc, items]) => {
      const id = docIdOf(doc);
      return `<div class="rv-doc"><div class="rv-doc-h">${icon("file")}<span class="ellipsis">${esc(doc)}</span>${id ? `<a class="qlink" href="${evHash(S.evId, "files", "", "seg=received&doc=" + id)}">Open</a>` : ""}</div>${items.map(decisionIssueRow).join("")}</div>`;
    }).join("")}</div>` : ""}
    ${R.other.length ? `<details class="disc"><summary>Show ${plural(R.other.length, "minor check")}</summary>${otherChecksHtml(R.other)}</details>` : ""}`;
}
function openReviewSheet() {
  if (!S.ev) return;
  const R = S.review || reviewModel(S.ev, S.evIssues);
  openSheetShell("sheet:review", sheetBody("Review", R.count ? `${plural(R.count, "item")} to confirm — facts where your files disagree, and checks on the files themselves. Each also shows in place on Plan and Files.` : "",
    `<div data-review>${reviewSheetBody()}</div>`, esc(shortEventName(S.ev.name))));
}
function repaintOpenSheets() {
  if (S.sheetKey === "sheet:review") { const r = $("[data-review]"); if (r) r.innerHTML = reviewSheetBody(); }
  else if (S.sheetKey && S.sheetKey.startsWith("doc:")) openDocSheet(+S.sheetKey.slice(4));
}

/* facts shown in place: amber dot + recommended value + "N versions" popover */
const FACT_MATCH = [["Date", /\bdate\b|weekday|\bday\b/i], ["Time", /\btime\b|start|doors|schedule/i], ["Venue", /venue|location|address|room|hall/i],
  ["Website", /website|url|event page|\blink\b/i], ["Contact", /contact|e-?mail/i], ["Budget", /budget/i], ["Organiser", /organi[sz]er|organi[sz]ation name|host/i], ["Guest policy", /guest policy|dress|age limit|rsvp/i]];
function factKeyFor(c) { const m = FACT_MATCH.find(([, re]) => re.test(c.field || "")); return m ? m[0] : null; }
function factConflictHtml(c) {
  const n = (c.values || []).length || 2;
  return `<span class="fact-cf"><span class="adot" title="Your files disagree"></span><span class="fv">${isAsk(c) ? '<span class="muted">Needs your choice</span>' : esc(c.recommended)}</span>
    <span class="pop-wrap"><button class="vbtn" data-act="pop-toggle" data-pop="cf${c.i}" aria-label="${n} versions of ${esc(c.field)}">${n} versions</button>
      <div class="popover wide-pop" data-popover="cf${c.i}" hidden><div class="mono-label">${esc(c.field)}</div>${conflictBox(c)}</div></span></span>`;
}
function assumedTag(fs) {
  return `<span class="pop-wrap"><button class="vbtn amber" data-act="pop-toggle" data-pop="assumed" title="${esc(fs.budget_basis || "No document states a budget")}">assumed</button>
    <div class="popover wide-pop" data-popover="assumed" hidden><div class="mono-label">Why this is assumed</div><p class="small">${esc(fs.budget_basis || "No document states a budget — the Brief Analyst estimated it.")}</p>
      <p class="xsmall muted mt8">To confirm or change it, add the budget to your planning document and re-import the folder (Files › Re-import).</p></div></span>`;
}

function expensesTableHtml(x) {
  if (!x.rows.length) return `<p class="small muted">No expense sheet was found in the files.</p>`;
  return `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>Item</th><th>POC</th><th class="num">USD</th><th>Receipt</th><th>Status</th><th>Flags</th></tr></thead><tbody>
    ${x.rows.map((r) => `<tr><td class="small strong">${esc(r.item)}${r.currency === "CNY" ? ` <span class="muted">(${num(r.amount).toLocaleString("en-US")} CNY)</span>` : ""}</td><td class="small nowrap">${esc(r.poc || "")}</td><td class="num">${fmtUSD(r.amount_usd)}</td>
      <td>${/^(yes|y)$/i.test(r.receipt || "") ? chip("Yes", "green") : chip(esc(r.receipt || "No"), "red")}</td><td class="small">${esc(r.finance_status || "—")}</td>
      <td><div class="row wrap" style="gap:4px">${(r.flags || []).map((f) => `<span class="chip sq wrap tone-${flagTone(f)}" title="${esc(f)}">${esc(/^CNY amount/i.test(f) ? "CNY → USD at 7.1 · confirm rate" : f)}</span>`).join("") || chip("OK", "green")}</div></td></tr>`).join("")}
  </tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${fmtUSD(x.total_usd)}</td><td colspan="3"></td></tr></tfoot></table></div>`;
}

async function tabPlan(body) {
  const ev = S.ev, fs = ev.fact_sheet, st = ev.strategy || {};
  if (!fs) {
    body.innerHTML = `<div class="card">${emptyState("sparkle", "No plan yet", `The agents read your ${plural((ev.documents || []).length, "file")} and write the plan: key facts, the program, and who you still need.`, `<a class="btn ghost" href="${evHash(ev.id, "files")}">${icon("file")}See your files</a>`)}</div>`;
    return;
  }
  const ex = await api(`/api/events/${ev.id}/expenses`).catch(() => ({ rows: [], total_usd: 0, needs_action: 0 }));
  const R = S.review || reviewModel(ev, S.evIssues);
  const budgetV = fv(fs.budget);
  const weekday = fs.weekday || weekdayOf(fv(fs.date));
  const kf = [
    ["Date", fv(fs.date) ? `${esc(fv(fs.date))}${weekday ? ` <span class="muted">· ${esc(weekday)}</span>` : ""}` : ""],
    ["Time", esc(fv(fs.main_time) || fv(fs.vip_time))],
    ["Venue", esc(fv(fs.venue))],
    ["Organiser", esc(fv(fs.org_name_en))],
    ["Website", linkify(fv(fs.website) || fv(fs.event_page))],
    ["Contact", linkify(fv(fs.contact_email))],
    ["Budget", budgetV ? `${esc(budgetV)}${fs.budget_assumed ? " " + assumedTag(fs) : ""}` : ""],
    ["Guest policy", fs.guest_policy ? `<span class="clamp2" title="${esc(fs.guest_policy)}">${esc(fs.guest_policy)}</span>` : ""],
  ];
  // put each disagreement where it belongs: on the matching fact, or as its own fact row
  const used = new Set();
  for (const c of R.conflicts) {
    const k = factKeyFor(c);
    const row = k && !used.has(k) && kf.find((r) => r[0] === k);
    if (row) { row[1] = factConflictHtml(c); row[2] = true; used.add(k); }
    else kf.push([c.field.charAt(0).toUpperCase() + c.field.slice(1), factConflictHtml(c), true]);
  }
  const rows = kf.filter(([, v]) => v);
  const prog = fs.program || [];
  const facts = `<section class="card facts-card"><div class="card-head"><h3>${icon("file")}Event facts</h3>${R.conflicts.length ? `<span class="xsmall muted"><span class="adot"></span> ${plural(R.conflicts.length, "fact")} with more than one version</span>` : ""}</div><div class="card-body">
    <dl class="kf">${rows.map(([k, v, cf]) => `<div class="${cf ? "has-cf" : ""}"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <details class="disc"><summary>All facts &amp; sources</summary>
      <dl class="facts">${factRow("Event", fs.event_name)}${factRow("Chinese name", fs.event_name_zh)}${factRow("Organiser", fs.org_name_en)}${factRow("Organiser (Chinese)", fs.org_name_zh)}
        ${factRow("Date", fs.date)}${factRow("VIP reception", fs.vip_time)}${factRow("Main program", fs.main_time)}${factRow("Venue", fs.venue)}${factRow("City / region", fs.city_region)}
        ${fs.budget && budgetV ? factRow("Budget", fs.budget) : ""}${factRow("Website", fs.website, { link: true })}${factRow("Event page", fs.event_page, { link: true })}${factRow("Contact", fs.contact_email, { link: true })}${factRow("Instagram", fs.instagram)}
        ${fs.audience ? `<dt>Audience</dt><dd>${esc(fs.audience)}</dd>` : ""}</dl>
      ${fs.org_description ? `<div class="subhead">About the organiser</div><p class="small">${esc(fs.org_description)}</p>` : ""}
      ${prog.length ? `<div class="subhead">Program timeline</div><div class="timeline-prog">${prog.map((s) => `<div class="seg"><span class="time">${esc(s.time || "—")}</span><span>${esc(s.segment)}</span></div>`).join("")}</div>` : ""}
      ${(fs.ticket_tiers || []).length ? `<div class="subhead">Tickets</div><div class="tiers">${fs.ticket_tiers.map((t) => `<div class="tier-card"><div class="n">${esc(t.name)}</div><div class="p">${esc(t.price)}</div><div class="i">${esc(t.includes || "")}</div></div>`).join("")}</div>` : ""}
      ${(fs.sponsorship_tiers || []).length ? `<div class="subhead">Sponsorship</div><div class="tiers">${fs.sponsorship_tiers.map((t) => `<div class="tier-card"><div class="n">${esc(t.name)}</div><div class="p">${esc(t.price)}</div><div class="i">${esc(t.includes || "")}</div></div>`).join("")}</div>` : ""}
      ${(fs.key_messages || []).length ? `<div class="subhead">Key messages</div><ul class="bullets small">${fs.key_messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${(fs.team || []).length ? `<div class="subhead">Organising team</div><ul class="bullets small">${fs.team.map((t) => `<li>${esc(t.name)} — ${esc(t.role)}</li>`).join("")}</ul>` : ""}
      ${(fs.open_questions || []).length ? `<div class="subhead">Open questions</div><ul class="bullets small">${fs.open_questions.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${(fs.conflicts || []).some((c) => c.resolved) ? `<div class="subhead">Confirmed by you</div><ul class="bullets small">${(fs.conflicts || []).filter((c) => c.resolved).map((c) => `<li>${esc(c.field)} → <b>${esc(c.recommended)}</b></li>`).join("")}</ul>` : ""}
    </details></div></section>`;

  const slots = st.slots || [];
  const rub = st.rubric || [];
  const slotHtml = (s) => {
    const filled = (s.filled_by || []).length, need = Math.max(s.needed || 0, filled, 1);
    const segs = Array.from({ length: Math.min(need, 12) }, (_, i) => `<i class="${i < filled ? "on" : s.gap > 0 && i < filled + s.gap ? "gap" : ""}"></i>`).join("");
    return `<div class="slot"><div class="top"><span class="ellipsis" title="${esc(s.name)}">${esc(s.name)}</span>${s.gap > 0 ? `<button class="qlink" data-act="find-slot" data-slot="${esc(s.name)}">Find people</button>` : `<span class="small" style="color:var(--green-fg)">filled</span>`}</div>
      <div class="segbar" title="${filled} of ${s.needed} named">${segs}</div>${s.gap > 0 ? `<div class="xsmall muted">${s.gap} open${filled ? ` · ${esc(s.filled_by.join(", "))}` : ""}</div>` : ""}</div>`;
  };
  const ord = [...slots].sort((a, b) => (b.gap > 0) - (a.gap > 0));
  const program = `<section class="card"><div class="card-head"><h3>${icon("grid")}Program</h3><span class="small muted">${slots.reduce((a, s) => a + (s.gap > 0 ? s.gap : 0), 0)} places open</span></div><div class="card-body">
    ${slots.length ? ord.slice(0, 6).map(slotHtml).join("") + (ord.length > 6 ? `<details class="disc"><summary>Show ${ord.length - 6} more slots</summary>${ord.slice(6).map(slotHtml).join("")}</details>` : "") : `<p class="small muted">Slots appear after the Program Strategist runs.</p>`}
    ${rub.length ? `<details class="disc"><summary>How priorities are set</summary>
      ${rub.map((r) => `<div class="hbar" style="grid-template-columns:140px minmax(0,1fr) 44px" title="${esc(r.description)}"><span class="small ellipsis">${esc(r.name)}</span><div class="track" style="height:9px"><i class="cost" style="width:${Math.round(num(r.weight) * 100)}%"></i></div><span class="v small">${Math.round(num(r.weight) * 100)}%</span></div>`).join("")}
      ${(st.scouting_briefs || []).length ? `<div class="subhead">Scouting briefs</div><ul class="bullets small">${st.scouting_briefs.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}</details>` : ""}
  </div></section>`;

  const budget = `<section class="card facts-card"><div class="card-head"><h3>${icon("dollar")}Budget</h3></div><div class="card-body">
    <dl class="kf one"><div><dt>Budget</dt><dd>${budgetV ? esc(budgetV) : '<span class="muted">Not stated</span>'}${fs.budget_assumed && budgetV ? ' <span class="chip tone-amber" title="' + esc(fs.budget_basis || "Estimated by the Brief Analyst") + '">Assumed</span>' : ""}</dd></div>
      <div><dt>Expenses tracked</dt><dd>${fmtUSD(ex.total_usd)} <span class="muted">· ${plural(ex.rows.length, "item")}</span></dd></div>
      <div><dt>Need action</dt><dd>${ex.needs_action ? `<span style="color:var(--amber-fg)">${ex.needs_action}</span>` : '<span class="muted">none</span>'}</dd></div></dl>
    ${ex.rows.length ? `<details class="disc"><summary>Show reimbursements</summary>${expensesTableHtml(ex)}</details>` : ""}</div></section>`;

  body.innerHTML = `<div class="plan-grid">${facts}<div class="stack">${program}${budget}</div></div>`;
}

/* ---------------------------------------------------------------- run options + agent sheets */

function runOptionsHtml() {
  const stages = [["brief", "Brief Analyst", "Fact Sheet + conflicts"], ["roster", "Roster Analyst", "people, aliases, contacts"], ["strategy", "Program Strategist", "slots, rubric, tiers"],
    ["scout", "Talent Scouts", "new candidates, cited URLs"], ["outreach", "Routes → drafts → review", "for the top N people"]];
  const saved = store.get("runOpts", { budget: 0.5, top: 12, stages: stages.map((s) => s[0]) });
  return `<div class="grid cols-2" style="gap:12px">
      <div class="field"><label for="rp-budget">Budget cap (USD)</label><input id="rp-budget" class="input" type="number" min="0.05" max="5" step="0.05" value="${saved.budget}" data-budget></div>
      <div class="field"><label for="rp-top">Draft for the top N people</label><input id="rp-top" class="input" type="number" min="1" max="40" step="1" value="${saved.top}" data-top></div></div>
    <div class="label mt16 mb8">Stages</div><div class="stages">${stages.map(([id, n, d]) => `<label class="check"><input type="checkbox" value="${id}" data-stage ${saved.stages.includes(id) ? "checked" : ""}><span>${n}<small>${d}</small></span></label>`).join("")}</div>
    <p class="hint mt12">The consistency audit, reimbursement check, follow-ups and the Drive export always run (no AI cost).</p>`;
}
function openRunSheet() {
  const ev = S.ev; if (!ev) return;
  const noKey = S.health && !S.health.key_present;
  const body = ev.running
    ? `<div class="working">${'<span class="spinner"></span>'}<div><b>The agents are working on this event.</b><div class="small muted">You can keep using InviteDesk meanwhile.</div></div></div>
       <div class="mt16"><button class="btn primary" data-act="open-sheet" data-sheet="agent">${icon("activity")}Watch the agents</button></div>`
    : `<div data-runpanel><p class="lead-p">The agents re-read your files, update the plan and the guest list, research the best way in for your top people and draft reviewed messages. <b>Nothing is sent.</b></p>
       ${noKey ? `<div class="callout warn mt12">${icon("alert")}<div>Agents need <code>PORTKEY_API_KEY</code> in <code>.env</code>.</div></div>` : ""}
       <details class="disc"><summary>Options</summary>${runOptionsHtml()}</details>
       <div class="mt24"><button class="btn primary lg" data-act="run-agents" ${noKey ? "disabled" : ""}>${icon("play")}Run agents</button></div></div>`;
  openSheetShell("sheet:run", sheetBody("Update with agents", "A full run usually costs $0.05–0.60 and takes a few minutes.", body, esc(shortEventName(ev.name))));
}

async function openAgentSheet() {
  const ev = S.ev; if (!ev) return;
  openSheetShell("sheet:agent", sheetBody("Agent run", "", `<div data-agent-body>${skel(2)}</div>`, "Behind the scenes"), "wide");
  const eid = ev.id;
  const [runs] = await Promise.all([api(`/api/events/${eid}/runs`), ensureTrace(eid)]);
  if (S.sheetKey !== "sheet:agent") return;
  S.runs = runs;
  if (S.ev.running) startPoll(eid);
  if (S.runSel == null || (S.runSel !== "all" && !runs.find((r) => r.id === S.runSel))) S.runSel = runs.length ? runs[0].id : "all";
  const el = $("[data-agent-body]");
  el.innerHTML = `<div class="row wrap mb16"><label class="small muted" for="run-sel">Run</label><select id="run-sel" class="select sm" style="width:auto;max-width:360px" data-act-change="run-sel">
        ${runs.map((r) => `<option value="${r.id}" ${S.runSel === r.id ? "selected" : ""}>#${r.id} · ${esc(fmtDateTime(r.started_at))} · ${esc(runLabel(r.status))}${r.note ? " · " + esc(r.note.slice(0, 40)) : ""}</option>`).join("")}
        <option value="all" ${S.runSel === "all" ? "selected" : ""}>All activity (incl. import)</option></select>
      <span class="spacer"></span>${ev.running ? "" : `<button class="btn ghost sm" data-act="open-sheet" data-sheet="run">${icon("refresh")}Update with agents</button>`}</div>
    <div class="card"><div class="board-wrap" data-board></div>
      <div class="board-legend"><span><i class="sw" style="background:var(--accent);box-shadow:0 0 6px var(--accent)"></i>working</span><span><i class="sw" style="background:var(--green-dot)"></i>done</span><span><i class="sw" style="background:var(--amber-dot)"></i>stopped / warning</span><span><i class="sw" style="background:var(--red-dot)"></i>error</span><span><i class="sw" style="background:#94A3B8"></i>idle</span><span class="spacer"></span><span data-guards></span></div></div>
    <div class="grid mt16" style="grid-template-columns:minmax(0,1.25fr) minmax(320px,1fr);align-items:start">
      <div class="card"><div class="card-head"><h3>${icon("list")}Live log</h3><span class="small muted" data-logcount></span></div><div class="log" data-log></div></div>
      <div class="stack"><div class="card" data-meter></div><div class="card" data-agent-usage></div></div></div>`;
  paintRun(true);
}


/* ================================================================== people tab */

function routeSentence(p, r) {
  r = r || p.best_route;
  const name = p.name;
  if (!r) return `Plan the best way to reach ${shortName(name)}`;
  const via = ((r.via || "").split(";")[0] || "").split(/[,(（]/)[0].trim(), ch = r.channel || "";
  switch (r.route_type) {
    case "intermediary_intro": return via ? `Ask ${via} to introduce ${shortName(name)}` : `Find someone to introduce ${shortName(name)}`;
    case "existing_thread": return `Follow up on the existing ${ch || "thread"}`;
    case "official_management": return `Contact ${shortName(name)}'s management`;
    case "partner_org": return via ? `Reach them through ${via}` : "Reach them through a partner organisation";
    case "public_contact": return "Use their official contact channel";
    case "direct_dm": return `Message them directly on ${ch || "social media"}`;
    default: return `Reach them via ${ch || r.route_type}`;
  }
}
function cardLine(p) {
  if (["needs_changes", "ready_for_review", "in_review"].includes(p.draft_status)) return ["Message ready to review", "warm"];
  if (p.draft_status === "blocked") return ["Message on hold — the reviewer blocked it", "hot"];
  if (p.status === "confirmed") return [p.draft_status === "approved" ? "Approved message — send it yourself" : "All set", "ok"];
  if (p.status === "declined") return ["Declined", "cold"];
  return [routeSentence(p), (p.best_route && p.best_route.warmth) || "cold"];
}
const PCOLS = [
  ["find", "To find", (p) => p.origin === "scout" && ["not_started", "unknown", "backup"].includes(p.status)],
  ["reach", "To reach", (p) => p.origin !== "scout" && ["not_started", "unknown", "backup"].includes(p.status)],
  ["invited", "Invited", (p) => ["contacted_no_reply", "pending", "likely"].includes(p.status)],
  ["confirmed", "Confirmed", (p) => p.status === "confirmed"],
];
const peopleView = () => (store.get("peopleView", "board") === "list" ? "list" : "board");
function savePf() { store.set("peopleFilter", S.pf); }
function activeFilterCount() { const f = S.pf; return [f.tier, f.list, f.source].filter(Boolean).length + (f.orgs ? 1 : 0) + (f.team ? 1 : 0); }
function filteredPeople2() {
  const f = S.pf, q = (f.q || "").trim().toLowerCase();
  return (S.evPeople || []).filter((p) => {
    if (!f.orgs && (p.entity || "person") === "organization") return false;
    if (!f.team && p.relationship === "team_member") return false;
    if (f.tier && (f.tier === "none" ? p.tier : p.tier !== f.tier)) return false;
    if (f.list && (p.slot || "") !== f.list) return false;
    if (f.source && (p.origin || "roster") !== f.source) return false;
    if (q && ![p.name, ...(p.aliases || []), p.role, p.slot, p.owner, p.intro].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

async function tabPeople(body) {
  S.evPeople = await api(`/api/events/${S.evId}/people`);
  const n = activeFilterCount();
  body.innerHTML = `<div class="ptool">
      <div class="search">${icon("search")}<input class="input" placeholder="Search people  ( / )" value="${esc(S.pf.q)}" data-pf="q" data-search aria-label="Search people"></div>
      <div class="pop-wrap"><button class="btn ghost" data-act="pop-toggle" data-pop="filter" aria-haspopup="true">${icon("list")}Filter${n ? `<span class="count-badge accent">${n}</span>` : ""}</button>
        <div class="popover" data-popover="filter" hidden>${filterPopoverHtml()}</div></div>
      <span class="spacer"></span><span class="small muted" data-pcount></span>
      <div class="seg-ctl" role="group" aria-label="View">${[["board", "columns", "Board"], ["list", "table", "List"]].map(([v, ic, l]) => `<button data-act="p-view" data-v="${v}" aria-pressed="${peopleView() === v}">${icon(ic)}${l}</button>`).join("")}</div>
      <div class="pop-wrap"><button class="btn ghost icon-only" data-act="pop-toggle" data-pop="pmenu" aria-label="More">${icon("more")}</button>
        <div class="popover right" data-popover="pmenu" hidden><button class="menu-item" data-act="people-csv">${icon("download")}Export this view as CSV</button><button class="menu-item" data-act="people-photos">${icon("camera")}Find public photos</button></div></div>
    </div><div data-pview></div>`;
  renderPeopleView();
}
function filterPopoverHtml() {
  const f = S.pf, ppl = S.evPeople || [];
  const lists = [...new Set(ppl.map((p) => p.slot).filter(Boolean))].sort();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`;
  return `<div class="field"><label>Tier</label><select class="select sm" data-pf="tier">${opt("", "Any tier", f.tier)}${["A", "B", "C"].map((t) => opt(t, "Tier " + t, f.tier)).join("")}${opt("none", "Not tiered", f.tier)}</select></div>
    <div class="field mt12"><label>List / slot</label><select class="select sm" data-pf="list">${opt("", "All lists", f.list)}${lists.map((s) => opt(s, s, f.list)).join("")}</select></div>
    <div class="field mt12"><label>Source</label><select class="select sm" data-pf="source">${opt("", "From files + scouted", f.source)}${opt("roster", "From your files", f.source)}${opt("scout", "Scouted by agents", f.source)}</select></div>
    <label class="check mt12"><input type="checkbox" data-pf="orgs" ${f.orgs ? "checked" : ""}><span>Include organisations</span></label>
    <label class="check mt8"><input type="checkbox" data-pf="team" ${f.team ? "checked" : ""}><span>Include your team</span></label>
    <button class="btn ghost sm block mt12" data-act="pf-clear">Clear filters</button>`;
}
function personCard(p) {
  const [line, warm] = cardLine(p);
  return `<button class="pcard2 ${S.drawerPid === p.id ? "selected" : ""}" data-act="open-person" data-pid="${p.id}" title="${esc(p.name)}">
    <div class="pc2-top">${avatar(p.name, "sm", p.photo_url)}<div class="pc2-n"><div class="nm">${esc(p.name)}</div><div class="rl">${esc(p.role || p.slot || "Role to be decided")}</div></div>${p.tier === "A" ? '<span class="amark" title="Tier A">A</span>' : ""}</div>
    <div class="pc2-line"><span class="wdot ${warm}"></span><span class="ellipsis">${esc(line)}</span></div>${["confirmed", "declined"].includes(p.status) ? "" : routeLineHtml(p)}</button>`;
}
function renderPeopleView() {
  const el = $("[data-pview]"); if (!el) return;
  const rows = filteredPeople2();
  const total = (S.evPeople || []).length;
  const cnt = $("[data-pcount]"); if (cnt) cnt.textContent = plural(rows.length, "person", "people");
  if (!total) { el.innerHTML = `<div class="card">${emptyState("users", "No people yet", "Run the agents to read your files, or find people with a short description.", `<button class="btn" data-act="open-sheet" data-sheet="find">${icon("search")}Find people</button>`)}</div>`; return; }
  if (peopleView() === "list") {
    el.innerHTML = rows.length ? `<div class="card"><div class="table-wrap"><table class="tbl fixed rows"><thead><tr><th style="width:30%">Name</th><th style="width:20%">Role</th><th style="width:130px">Status</th><th>Best way in</th><th style="width:130px">Owner</th></tr></thead><tbody>
      ${rows.map((p) => `<tr class="clickable ${S.drawerPid === p.id ? "selected" : ""}" data-act="open-person" data-pid="${p.id}" tabindex="0">
        <td><div class="person">${avatar(p.name, "", p.photo_url)}<div style="min-width:0"><div class="nm">${esc(p.name)}${p.tier === "A" ? ' <span class="amark">A</span>' : ""}</div>${(p.aliases || []).length ? `<div class="al">${esc(p.aliases.join(" · "))}</div>` : ""}</div></div></td>
        <td title="${esc(p.role || "")}"><span class="small">${esc(p.role || p.slot || "—")}</span></td><td>${pStatusChip(p.status, false)}</td>
        <td title="${esc(cardLine(p)[0])}"><span class="small"><span class="wdot ${cardLine(p)[1]}"></span> ${esc(cardLine(p)[0])}</span></td><td class="small">${esc(p.owner || "—")}</td></tr>`).join("")}</tbody></table></div></div>`
      : `<div class="card">${emptyState("search", "No matches", "Nobody matches these filters.", `<button class="btn" data-act="pf-clear">Clear filters</button>`)}</div>`;
    return;
  }
  const declined = rows.filter((p) => p.status === "declined");
  el.innerHTML = `<div class="kanban v4">${PCOLS.map(([k, label, test]) => {
    const list = rows.filter(test), max = S.peopleMore[k] ? list.length : 5;
    return `<div class="kcol"><div class="kcol-h"><span class="eyebrow">${label}</span><span class="spacer"></span><span class="count-badge">${list.length}</span></div>
      <div class="kcards">${list.slice(0, max).map(personCard).join("") || `<div class="kempty">${k === "find" ? "New candidates land here" : "Nobody here yet"}</div>`}
      ${list.length > max ? `<button class="qlink center" data-act="p-more" data-col="${k}">Show ${list.length - max} more</button>` : ""}
      ${k === "find" ? `<button class="qlink center" data-act="open-sheet" data-sheet="find">${icon("plus")}Find people</button>` : ""}</div></div>`;
  }).join("")}</div>
  ${declined.length ? `<div class="mt16"><button class="qlink" data-act="p-declined">${S.showDeclined ? "Hide" : "Show"} declined (${declined.length})</button>
    ${S.showDeclined ? `<div class="declined-row mt12">${declined.map(personCard).join("")}</div>` : ""}</div>` : ""}`;
}
function exportPeopleCSV() {
  const rows = [["name", "aliases", "tier", "status", "role", "list", "owner", "source", "best_way_in", "warmth", "contacts"]];
  for (const p of filteredPeople2()) rows.push([p.name, (p.aliases || []).join("; "), p.tier || "", p.status, p.role || "", p.slot || "", p.owner || "", p.origin || "", routeSentence(p), (p.best_route || {}).warmth || "", (p.contacts || []).map((c) => `${c.channel}:${c.value}`).join("; ")]);
  downloadText(`${(S.ev.name || "event").replace(/[^\w\u4e00-\u9fff]+/g, "_")}__people.csv`, toCSV(rows));
}

/* ---------------------------------------------------------------- find people sheet */

function findChips() {
  const slots = ((S.ev && S.ev.strategy) || {}).slots || [];
  const open = slots.filter((s) => (s.gap || 0) > 0).slice(0, 3);
  return [
    ...open.map((s) => `People for “${s.name.replace(/\s*\([^)]*\)\s*$/, "")}”, ${Math.max(3, Math.min(8, (s.gap || 2) + 2))} names`),
    "Keynote speakers who fit the event theme, 5 names",
    "Sponsors with a track record at similar events",
    "Alumni founders or investors for networking",
  ].slice(0, 5);
}
function openFindSheet() {
  const ev = S.ev; if (!ev) return;
  const pre = S.findPrefill || store.get("listBrief", "");
  S.findPrefill = null;
  const gen = S.generating && S.generating.eid === S.evId;
  const noKey = S.health && !S.health.key_present;
  const body = `<div class="field"><label for="find-brief">Who do you need?</label>
      <textarea id="find-brief" class="textarea" rows="3" data-list-brief data-autofocus placeholder="e.g. Panelists for the main panel, 6 names, ideally based nearby and bilingual" ${gen ? "disabled" : ""}>${esc(gen ? S.generating.brief : pre)}</textarea></div>
    <div class="row wrap mt12" style="gap:6px">${findChips().map((x) => `<button class="chip outline" style="cursor:pointer;border:0" data-act="list-example" data-v="${esc(x)}" ${gen ? "disabled" : ""}>${esc(x)}</button>`).join("")}</div>
    <div class="row wrap mt16"><label class="small muted" for="list-count">How many</label>
      <select id="list-count" class="select sm" style="width:80px" data-list-count ${gen ? "disabled" : ""}>${[3, 5, 6, 8, 10, 12, 15].map((n) => `<option ${n === 8 ? "selected" : ""}>${n}</option>`).join("")}</select>
      <div class="seg-ctl" role="group" aria-label="Research mode">${Object.entries(LIST_MODES).map(([k, m]) => `<button data-act="list-mode" data-v="${k}" aria-pressed="${listMode() === k}" title="${esc(m.help)}" ${gen ? "disabled" : ""}>${m.label}</button>`).join("")}</div></div>
    <p class="hint mt8" data-list-mode-hint>${esc(LIST_MODES[listMode()].hint)} · nothing is sent to anyone</p>
    <div class="mt16"><button class="btn primary lg" data-act="list-generate" ${gen || noKey ? "disabled" : ""}>${gen ? '<span class="spinner"></span>Researching…' : icon("search") + "Find people"}</button></div>
    <div data-list-progress>${gen ? listProgressHtml() : ""}</div>`;
  openSheetShell("sheet:find", sheetBody("Find people", "A Talent Scout researches the web and adds people with cited evidence to the “To find” column.", body, esc(shortEventName(ev.name))));
}
function paintFindBusy() {
  const b = $('[data-act="list-generate"]'); if (b) { b.disabled = true; b.innerHTML = '<span class="spinner"></span>Researching…'; }
  $$("[data-list-brief], [data-list-count], [data-act='list-example'], [data-act='list-mode']").forEach((x) => (x.disabled = true));
  const p = $("[data-list-progress]"); if (p) p.innerHTML = listProgressHtml();
}

/* ---------------------------------------------------------------- person sheet */

async function openPersonSheet(pid) {
  S.drawerPid = pid;
  openSheetShell("p:" + pid, `<div class="drawer-body">${skel(2)}</div>`, "profile");
  $$("[data-pid]").forEach((x) => x.classList && x.classList.toggle("selected", +x.dataset.pid === pid));
  await loadPersonSheet(pid);
}
async function loadPersonSheet(pid) {
  try {
    const [p, paths, best] = await Promise.all([api(`/api/people/${pid}`), api(`/api/people/${pid}/paths`).catch(() => []), api(`/api/people/${pid}/best`).catch(() => null)]);
    if (S.drawerPid !== pid) return;
    S.drawer = p; S.paths = paths; S.best = best;
    renderPersonSheet();
    if (!p.photo_url && !p.photo_checked) lookupPhoto(p);
  } catch (e) {
    const el = $("[data-drawer]"); if (el) el.innerHTML = `<div class="drawer-body">${emptyState("alert", "Couldn't load this person", esc(e.message))}</div>`;
  }
}
const loadDrawer = loadPersonSheet;
const renderDrawer = () => renderPersonSheet();
const renderDrawerPlanState = () => renderPersonSheet();
const refreshBehindDrawer = debounce(() => { if (["people", "messages", "plan"].includes(S.tab)) refreshEventView(); }, 300);

function miniChain(names) {
  const n = names.length;
  return `<div class="chain big">${names.map((name, i) => `${i ? `<span class="carrow">${icon("chevron")}</span>` : ""}<span class="cnode ${i === 0 ? "team" : i === n - 1 ? "target" : "via"}">${avatar(name, "sm")}<span class="ellipsis">${esc(i === 0 && /^you$/i.test(name) ? "You" : shortName(name))}</span></span>`).join("")}</div>`;
}
function prow(key, label, count, inner) {
  const open = S.openRows.has(key);
  return `<details class="prow" data-row="${key}" ${open ? "open" : ""}><summary><span>${label}</span>${count != null ? `<span class="muted small">${count}</span>` : ""}${icon("chevron")}</summary><div class="prow-body">${inner}</div></details>`;
}



/* ================================================================== messages tab (inbox) */

const REVIEW_ORDER = ["needs_changes", "blocked", "ready_for_review", "in_review"];
function msgSections() {
  const drafts = S.drafts || [], fus = S.evFollowups || [], t = todayISO();
  const st = Object.fromEntries((S.evPeople || []).map((p) => [p.id, p.status]));
  const review = drafts.filter((d) => REVIEW_ORDER.includes(d.status)).sort((a, b) => REVIEW_ORDER.indexOf(a.status) - REVIEW_ORDER.indexOf(b.status));
  const due = fus.filter((f) => f.status === "open" && f.due <= t).sort((a, b) => (a.due < b.due ? -1 : 1));
  const waiting = drafts.filter((d) => d.status === "sent" && !["confirmed", "declined"].includes(st[d.person_id]));
  const done = drafts.filter((d) => ["approved", "discarded"].includes(d.status) || (d.status === "sent" && !waiting.includes(d)));
  return { review, due, waiting, done };
}
function msgItem(d, did) {
  return `<a class="li ${d.id === did ? "active" : ""}" href="${evHash(S.evId, "messages", d.id)}"><div class="mli">${avatar(d.name, "", photoOf(d.person_id))}<div style="min-width:0">
    <div class="l1"><span class="nm">${esc(d.name)}</span>${dStatusChip(d.status)}</div>
    <div class="subj" title="${esc(draftTitle(d))}">${esc(draftTitle(d))}</div></div></div></a>`;
}
function msgListHtml(did) {
  const s = msgSections();
  const sec = (label, n, inner) => `<div class="group-h"><span class="eyebrow">${label}</span><span class="count-badge">${n}</span></div>${inner}`;
  return `${sec("To review", s.review.length, s.review.map((d) => msgItem(d, did)).join("") || '<div class="li-empty">Nothing to review.</div>')}
    ${sec("Follow up", s.due.length, s.due.map((f) => `<div class="li fu-li ${f.due < todayISO() ? "overdue" : ""}"><div class="mli">${avatar(f.name, "", photoOf(f.person_id))}<div style="min-width:0">
        <div class="l1"><a class="nm" href="${personHash(S.evId, f.person_id, "messages")}">${esc(f.name)}</a><span class="xsmall ${f.due < todayISO() ? "late" : "muted"}">${esc(relDue(f.due))}</span></div>
        <div class="subj" title="${esc(f.action)}">${esc(f.action)}</div>
        <div class="row mt8" style="gap:6px"><button class="btn xs" data-act="plan-person" data-pid="${f.person_id}">Draft follow-up</button><button class="btn xs ghost" data-act="fu-done" data-id="${f.id}">Done</button></div></div></div></div>`).join("") || '<div class="li-empty">No follow-ups due.</div>')}
    ${sec("Waiting for reply", s.waiting.length, s.waiting.map((d) => msgItem(d, did)).join("") || '<div class="li-empty">Nothing outstanding.</div>')}
    ${s.done.length ? `<details class="disc in-list"><summary>Done (${s.done.length})</summary>${s.done.map((d) => msgItem(d, did)).join("")}</details>` : ""}`;
}

async function tabMessages(body, sub) {
  const [drafts, fus] = await Promise.all([api(`/api/events/${S.evId}/drafts`), api(`/api/events/${S.evId}/followups`).catch(() => [])]);
  S.drafts = drafts; S.evDrafts = drafts; S.evFollowups = fus;
  const s = msgSections();
  let did = sub ? +sub : null;
  if (!did || !drafts.find((d) => d.id === did)) {
    const first = s.review[0] || s.waiting[0];
    did = first ? first.id : null;
    if (did) { history.replaceState(null, "", evHash(S.evId, "messages", did, S.route.query.toString())); S.mainKey = `event/${S.evId}/messages/${did}?` + (() => { const q = new URLSearchParams(S.route.query); SHEET_PARAMS.forEach((k) => q.delete(k)); return q.toString(); })(); }
  }
  if (!drafts.length && !s.due.length) {
    body.innerHTML = `<div class="card">${emptyState("mail", "No messages yet", "Messages appear when the agents draft outreach for your people.", `<a class="btn" href="${evHash(S.evId, "people")}">${icon("users")}Go to People</a>`)}</div>`;
    return;
  }
  body.innerHTML = `<div class="mail v4"><div class="card list-pane" aria-label="Inbox">${msgListHtml(did)}</div>
    <div data-draft-detail>${did ? skel(1) : `<div class="card">${emptyState("inbox", "Inbox zero", "Nothing is waiting for your review.", `<a class="btn" href="${evHash(S.evId, "people")}">${icon("users")}Go to People</a>`)}</div>`}</div></div>`;
  if (did) await loadDraftDetail(did);
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
  const issues = (rv && rv.issues) || [];
  const busy = S.draftBusy;
  const blocked = d.status === "blocked", isSent = d.status === "sent", isDisc = d.status === "discarded";
  const verdict = !rv ? "Not reviewed yet" : rv.verdict === "pass" ? "Reviewer: passed" : rv.verdict === "block" ? "Reviewer: blocked — fix it before approving" : `Reviewer: ${plural(issues.length, "suggestion")}`;
  const vtone = !rv ? "gray" : rv.verdict === "pass" ? "green" : rv.verdict === "block" ? "red" : "amber";
  const serif = store.get("letterSerif", false);
  const canApprove = !(blocked || isSent || busy || d.status === "approved" || isDisc);
  el.innerHTML = `<div class="letter">
    <div class="letter-head">
      <div class="row" style="gap:10px;margin-bottom:10px">${avatar(d.name, "sm", photoOf(d.person_id))}<button class="qlink strong" data-act="open-person" data-pid="${d.person_id}">${esc(d.name)}</button>${dStatusChip(d.status)}
        <span class="xsmall muted ellipsis">${esc(DKIND[d.kind] || d.kind)} · ${esc(LANGS[d.language] || d.language || "")} · ${esc(CHANNELS[d.channel] || d.channel || "")}</span><span class="spacer"></span>
        <div class="pop-wrap"><button class="btn ghost sm icon-only" data-act="pop-toggle" data-pop="dmenu" aria-label="More actions">${icon("more")}</button>
          <div class="popover right" data-popover="dmenu" hidden>
            <button class="menu-item" data-act="draft-edit">${icon("edit")}Edit</button>
            <button class="menu-item" data-act="draft-status" data-s="needs_changes" ${isSent ? "disabled" : ""}>${icon("flag")}Request changes</button>
            <button class="menu-item" data-act="draft-review" ${busy || isSent || !(S.health || {}).key_present ? "disabled" : ""}>${icon("refresh")}Re-run review</button>
            <button class="menu-item" data-act="draft-status" data-s="sent" ${d.status !== "approved" ? "disabled" : ""}>${icon("send")}Mark as sent</button>
            <button class="menu-item" data-act="copy" data-v="${esc(d.body || "")}" data-copy-body>${icon("file")}Copy text</button>
            <button class="menu-item danger" data-act="draft-status" data-s="discarded" ${isDisc ? "disabled" : ""}>${icon("trash")}Discard</button></div></div>
        <button class="btn primary" data-act="draft-status" data-s="approved" ${canApprove ? "" : "disabled"} title="${blocked ? "Blocked by the reviewer — fix and re-run review first" : "Approve: exports an .eml to Files › Produced › outbox"}">${busy === "review" ? '<span class="spinner"></span>Reviewing…' : icon("check") + (d.status === "approved" ? "Approved" : "Approve")}</button></div>
      <div class="hrow"><span>To</span><input class="input" value="${esc(d.recipient || "")}" data-draft-field="recipient" placeholder="address / handle" aria-label="Recipient"></div>
      ${!d.subject && !isEmailDraft(d) ? `<div class="hrow"><span>Channel</span><div class="small ch-line">${chIco(d.channel)}${esc(CHANNELS[d.channel] || d.channel)} <span class="muted">— no subject line; send it as a ${esc(chKind(d.channel) === "person" ? "talking script" : chKind(d.channel) === "phone" ? "call script" : "direct message")}</span></div></div>`
        : `<div class="hrow"><span>Subject</span><input class="input subject-input" value="${esc(d.subject || "")}" data-draft-field="subject" aria-label="Subject"></div>`}
    </div>
    ${d.status === "approved" ? `<div class="callout ok slim">${icon("check")}<div class="small">Approved and exported as an .eml to <a class="link" href="${evHash(S.evId, "files", "", "seg=produced&f=" + encodeURIComponent("outbox/"))}">Files › outbox</a>. Send it from your own mail client, then choose <b>Mark as sent</b> in the … menu.</div></div>` : ""}
    <div class="paper"><textarea class="textarea body-input ${serif ? "serifed" : ""}" data-draft-field="body" aria-label="Message body">${esc(d.body || "")}</textarea></div>
    <div class="paper-foot"><span class="xsmall muted">v${d.version || 1} · ${esc(fmtDateTime(d.updated_at))}</span><span class="xsmall" style="color:var(--amber-fg)" data-dirty-note></span><span class="spacer"></span>
      <button class="btn sm" data-act="draft-save" data-save-btn hidden>${icon("check")}Save edits</button>
      <div class="seg-ctl" role="group" aria-label="Letter typeface"><button data-act="draft-serif" data-v="0" aria-pressed="${!serif}">Sans</button><button data-act="draft-serif" data-v="1" aria-pressed="${serif}">Letter</button></div></div>
    <details class="disc rv"><summary><span class="wdot ${vtone === "green" ? "ok" : vtone === "red" ? "hot" : vtone === "amber" ? "warm" : "cold"}"></span>${esc(verdict)}</summary>
      ${issues.map((i) => `<div class="issue"><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span><div><div>${esc(i.text)}</div>${i.fix ? `<div class="fix"><b>Fix:</b> ${esc(i.fix)}</div>` : ""}</div></div>`).join("")}
      ${hist.length > 1 ? `<div class="xsmall muted mt8">History: ${hist.map((h) => `v${h.version} ${esc((VERDICT[h.verdict] || [h.verdict])[0])}`).join(" → ")}</div>` : ""}
      ${(d.claims || []).length ? `<div class="subhead">Personal claims</div>${d.claims.map((c) => `<div class="small mt8">${esc(c.claim)} <span class="muted">— ${isURL(c.evidence) ? `<a class="link" href="${esc(c.evidence)}" target="_blank" rel="noopener noreferrer">${esc(domainOf(c.evidence))}</a>` : esc(c.evidence)}</span></div>`).join("")}` : ""}
    </details>
    <details class="disc"><summary>Comments (${(d.comments || []).length})</summary>
      ${(d.comments || []).map((c) => `<div class="comment"><div class="row">${avatar(c.author, "xs")}<span class="who">${esc(c.author)}</span><span class="xsmall muted">${esc(fmtDateTime(c.created_at))}</span></div><div class="mt8">${esc(c.text)}</div></div>`).join("")}
      <div class="row mt8"><input class="input sm" style="width:96px" value="${esc(store.get("author", ""))}" placeholder="Name" data-c-author aria-label="Your name"><input class="input sm" placeholder="Write a comment…" data-c-text aria-label="Comment"><button class="btn sm" data-act="draft-comment">Post</button></div>
    </details></div>`;
}
async function refreshDraftsList() {
  try {
    const [drafts, fus] = await Promise.all([api(`/api/events/${S.evId}/drafts`), api(`/api/events/${S.evId}/followups`).catch(() => S.evFollowups)]);
    S.drafts = drafts; S.evDrafts = drafts; S.evFollowups = fus;
  } catch { /* keep */ }
  const pane = $(".list-pane");
  if (pane && S.draft) pane.innerHTML = msgListHtml(S.draft.id);
  refreshHeader();
}

/* ================================================================== files tab */

const KIND_TONE = { invitation: "purple", sponsorship: "pink", roster: "blue", finance: "orange", promotion: "teal", planning: "green", sheet: "blue", other: "gray" };
async function tabFiles(body) {
  const seg = S.route.query.get("seg") === "produced" ? "produced" : "received";
  const docs = S.ev.documents || [];
  body.innerHTML = `<div class="row mb16 wrap"><div class="seg-ctl" role="group" aria-label="Files">
      <button data-act="files-seg" data-v="received" aria-pressed="${seg === "received"}">Received <span class="faint">${docs.length}</span></button>
      <button data-act="files-seg" data-v="produced" aria-pressed="${seg === "produced"}">Produced</button></div><span class="spacer"></span>
      ${seg === "received" ? `<label class="btn ghost" tabindex="0">${icon("upload")}Re-import updated folder<input type="file" accept=".zip" class="sr-only" data-act-change="reimport"></label>` : ""}</div>
    <div data-files></div>`;
  const el = $("[data-files]");
  if (seg === "produced") { await tabDrive(el); return; }
  if (!docs.length) { el.innerHTML = `<div class="card">${emptyState("file", "No documents", "Re-import your event folder as a .zip.")}</div>`; return; }
  el.innerHTML = `<div class="card"><div class="card-head"><h3>${icon("inbox")}What came in</h3><span class="small muted">${plural(docs.length, "document")} · ${fmtInt(docs.reduce((a, d) => a + num(d.chars), 0))} characters</span></div>
    ${docs.map((d) => {
      const iss = docIssues(d), inj = (d.flags || []).length || iss.some((i) => i.kind === "injection"), hi = iss.filter((i) => i.severity === "high").length;
      const flag = inj ? `<span class="fflag red">${icon("shield")}instruction-like text${iss.length > 1 ? ` · ${iss.length}` : ""}</span>`
        : iss.length ? `<span class="fflag ${hi ? "amber" : ""}"><span class="adot ${hi ? "" : "grey"}"></span>${plural(iss.length, "check")}</span>` : `<span class="xsmall muted">${fmtInt(d.chars)} chars</span>`;
      return `<button class="file-row" data-act="open-doc" data-id="${d.id}">${icon("file")}<span class="nm ellipsis">${esc(d.path)}</span>${chip(esc(d.kind), KIND_TONE[d.kind] || "gray", "sq")}${flag}</button>`;
    }).join("")}</div>
    <p class="hint mt12">Open a file to see its checks. Instruction-like text (e.g. “ignore previous instructions”) is flagged and always treated as data by every agent.</p>`;
}
function docIssues(d) {
  const base = (d.path || "").split("/").pop();
  return (S.evIssues || []).filter((i) => i.status === "open" && i.document && (i.document === d.path || i.document.includes(d.path) || (base.length > 6 && i.document.includes(base))));
}
async function openDocSheet(id) {
  openSheetShell("doc:" + id, `<div class="drawer-body">${skel(2)}</div>`, "wide");
  try {
    const d = await api(`/api/documents/${id}`);
    if (S.sheetKey !== "doc:" + id) return;
    let html = esc(d.text || "");
    for (const f of d.flags || []) { const core = esc(f.trim()).slice(0, 80); if (core.length > 12 && html.includes(core)) html = html.split(core).join(`<mark>${core}</mark>`); }
    $("[data-drawer]").innerHTML = sheetBody(esc(d.path), `${esc(d.kind)} · ${fmtInt(d.chars)} characters`,
      `${(() => { const doc = ((S.ev && S.ev.documents) || []).find((x) => x.id === id) || d; const iss = docIssues(doc); return iss.length ? `<div class="rv-group"><div class="mono-label">Checks on this file · ${iss.length}</div>${iss.map((i) => i.severity === "high" ? decisionIssueRow(i) : otherChecksHtml([i]).replace(/<div class="subhead">.*?<\/div>/, "")).join("")}</div>` : `<div class="quiet-ok">${icon("check")}No open checks on this file.</div>`; })()}
      ${(d.flags || []).length ? `<div class="callout danger mb12">${icon("shield")}<div class="small"><b>Instruction-like text found — treated as data, never obeyed.</b> Remove it before sharing this file.${d.flags.map((f) => `<div class="quote mt8">${esc(f)}</div>`).join("")}</div></div>` : ""}<pre class="doc-text">${html}</pre>`, "Received file");
  } catch (e) { $("[data-drawer]").innerHTML = `<div class="drawer-body">${emptyState("alert", "Couldn't open the file", esc(e.message))}</div>`; }
}
async function reimportFile(input) {
  const f = input.files[0];
  if (!f) return;
  if (!/\.zip$/i.test(f.name)) { toast("Please choose a .zip of the event folder.", "error"); return; }
  const fd = new FormData();
  fd.append("file", f); fd.append("name", S.ev.name || ""); fd.append("org", S.ev.org || ""); fd.append("event_id", S.evId);
  toast("Uploading the updated folder…", "info", 2500);
  try {
    await api("/api/events/import", { method: "POST", form: fd });
    toast("Documents refreshed. Choose “Update with agents” to pick up the changes.", "ok", 6000);
    await refreshEventView();
  } catch (e) { toastErr(e); }
}


/* ================================================================== v5 profile: channels, routes, rich person sheet */

function chKind(t) {
  const s = String(t || "").toLowerCase();
  if (/wechat|\u5fae\u4fe1|weixin/.test(s)) return "wechat";
  if (/linkedin/.test(s)) return "linkedin";
  if (/instagram|\bdm\b|direct message|xiaohongshu|weibo/.test(s)) return "dm";
  if (/phone|telephone|call|\u7535\u8bdd/.test(s)) return "phone";
  if (/in person|in-person|dinner|meeting|face/.test(s)) return "person";
  if (/manage|agency|agent|publicist|\bpr\b/.test(s)) return "management";
  if (/mail|\u7535\u90ae|\u90ae\u4ef6|letter/.test(s)) return "email";
  if (/web|page|site|form/.test(s)) return "web";
  return s ? "other" : "";
}
const CHK = {
  email: ["mail", "Email"], wechat: ["msg", "WeChat"], dm: ["camera", "DM"], phone: ["phone", "Phone"], person: ["users", "In person"],
  management: ["briefcase", "Management"], linkedin: ["link", "LinkedIn"], web: ["globe", "Web"], other: ["link", "Other"],
};
const chIco = (t) => icon((CHK[chKind(t)] || CHK.other)[0]);
const chName = (t) => (CHK[chKind(t)] || [0, t || ""])[1];
function draftTitle(d) {
  if (d.subject) return d.subject;
  const first = String(d.body || "").split(/\n/).map((x) => x.trim()).find(Boolean) || "";
  const lbl = CHANNELS[d.channel] || chName(d.channel) || "Message";
  return `${lbl} · ${first.length > 72 ? first.slice(0, 72) + "…" : first}`;
}
const isEmailDraft = (d) => !d.channel || chKind(d.channel) === "email";
function warmBars(w) {
  const n = { hot: 3, warm: 2, cold: 1 }[w] || 0;
  return `<span class="wbars ${esc(w || "none")}" title="${esc(w || "unknown")} route" aria-label="${esc(w || "unknown")} route"><i class="${n >= 1 ? "on" : ""}"></i><i class="${n >= 2 ? "on" : ""}"></i><i class="${n >= 3 ? "on" : ""}"></i></span>`;
}
const cleanVia = (v) => String(v || "").split(/[;(（]/)[0].split(/,\s/)[0].trim();
function ownerFromVia(v) { const m = String(v || "").match(/\(([^)]*?)\s+owns/i); return m ? m[1].trim() : ""; }
function routeNodes(p, r, paths) {
  const owner = (p.owner || "").split(/[;,]/)[0].trim();
  if (!r) return [{ n: owner || "You", k: owner ? "Owner" : "Your team" }, { n: p.name, k: "Invitee", t: 1 }];
  const via = cleanVia(r.via);
  if (["intermediary_intro", "partner_org"].includes(r.route_type) && via) {
    const path = (paths || []).find((x) => (x.chain || []).some((c) => c && via && (c.includes(via) || via.includes(c))));
    const first = path && path.chain && path.chain.length > 2 ? path.chain[0] : ownerFromVia(r.via) || owner || "You";
    return [{ n: first, k: "Your team" }, { n: via, k: r.route_type === "partner_org" ? "Partner" : "Introducer" }, { n: p.name, k: "Invitee", t: 1 }];
  }
  const from = via && r.route_type === "existing_thread" ? via : owner || "You";
  return [{ n: from, k: from === "You" ? "Your team" : "Owner" }, { n: p.name, k: "Invitee", t: 1 }];
}
function photoOf(pid) { const x = (S.evPeople || []).find((q) => q.id === pid); return (x && x.photo_url) || ""; }
function photoByName(n) {
  const k = String(n || "").toLowerCase(); if (!k || k === "you") return "";
  const x = (S.evPeople || []).find((q) => q.photo_url && (q.name.toLowerCase() === k || shortName(q.name).toLowerCase() === k || (q.aliases || []).some((a) => a.toLowerCase() === k)));
  return x ? x.photo_url : "";
}
async function lookupPhoto(p) {
  try {
    const r = await api(`/api/people/${p.id}/photo`);
    p.photo_checked = true;
    const row = (S.evPeople || []).find((q) => q.id === p.id);
    if (row) Object.assign(row, { photo_url: r.url || null, photo_source: r.source || null, photo_checked: true });
    if (!r || !r.url) return;
    p.photo_url = r.url; p.photo_source = r.source;
    if (S.drawer === p && S.sheetKey === "p:" + p.id) renderPersonSheet();
    else if (S.sheetKey && S.sheetKey.startsWith("g:")) { const ring = $(".pf-ring"); if (ring) { const w = document.createElement("span"); w.innerHTML = avatar(p.name, "xl", r.url); $(".pf-ring .av").replaceWith(w.firstElementChild); } }
    const card = $(`.pcard2[data-pid="${p.id}"] .av`); if (card) { const w = document.createElement("span"); w.innerHTML = avatar(p.name, "sm", r.url); card.replaceWith(w.firstElementChild); }
  } catch { /* the initials stay */ }
}
function routeLineHtml(p) {
  const r = p.best_route; if (!r) return "";
  const via = cleanVia(r.via) || (p.owner || "").split(/[;,]/)[0].trim();
  const txt = via ? `via ${shortName(via)} · ${chName(r.channel) || ROUTE_TYPES[r.route_type] || ""}` : `${ROUTE_TYPES[r.route_type] || r.route_type} · ${chName(r.channel)}`;
  return `<div class="pc2-route">${chIco(r.channel)}<span class="ellipsis">${esc(txt)}</span></div>`;
}
function srcChip(s, eid) {
  if (!s) return "";
  if (isURL(s)) return `<a class="src" href="${esc(s)}" target="_blank" rel="noopener noreferrer">${icon("external")}${esc(domainOf(s))}</a>`;
  const id = docIdOf(s);
  return id ? `<a class="src" href="${evHash(eid, "files", "", "seg=received&doc=" + id)}">${icon("file")}${esc(s.split("/").pop())}</a>` : `<span class="src">${icon("file")}${esc(s)}</span>`;
}
function evidenceSources(text) {
  const urls = String(text || "").match(/https?:\/\/[^\s)"'，。]+/g) || [];
  const docs = String(text || "").match(/[\w\u4e00-\u9fff .&'’-]+\.(?:xlsx|docx|pptx|pdf|csv|md|txt)/gi) || [];
  return [...new Set([...urls, ...docs.map((d) => d.trim())])].slice(0, 3);
}
function uniqSrc(list) { const seen = new Set(); return list.filter(Boolean).filter((x) => { const k = isURL(x) ? domainOf(x) : x.split("/").pop(); if (seen.has(k)) return false; seen.add(k); return true; }); }

function profileHero(p, o) {
  const fit = p.priority_score != null ? Math.max(0, Math.min(100, Math.round(num(p.priority_score)))) : null;
  const statusOpts = Object.entries(PSTATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? "selected" : ""}>${v[0]}</option>`).join("");
  const sub = [p.role || p.slot || "Role to be decided", p.category, p.location].filter(Boolean).map((x) => String(x).split(";")[0].trim());
  const ctl = o.readonly ? `${pStatusChip(p.status, false)}${p.tier ? chip("Tier " + esc(p.tier), "teal", "sq") : ""}`
    : `<label class="chip-sel"><span class="dot st-${esc(p.status)}"></span><select data-act-change="p-status" aria-label="Status">${statusOpts}</select></label>
       <label class="chip-sel"><select data-act-change="p-tier" aria-label="Tier">${["A", "B", "C"].map((t) => `<option value="${t}" ${p.tier === t ? "selected" : ""}>Tier ${t}</option>`).join("")}${!p.tier ? '<option selected value="">No tier</option>' : ""}</select></label>`;
  return `<div class="pf-hero"><div class="pf-hero-in">
      <div class="pf-ring-wrap"><div class="pf-ring ${fit == null ? "nofit" : ""}" style="--fit:${fit || 0}">${avatar(p.name, "xl", p.photo_url)}${fit != null ? `<span class="pf-fit"><b>${fit}</b>FIT</span>` : ""}</div>
        ${p.photo_url ? `<a class="pf-photo-src" href="${esc(p.photo_source || p.photo_url)}" target="_blank" rel="noopener noreferrer" title="Public photo — check it is the right person">Photo · Wikimedia Commons</a>` : ""}</div>
      <div class="pf-id"><div class="mono-label">${esc(o.eyebrow || "")}</div>
        <h2 class="pf-name">${esc(p.name)}</h2>
        ${(p.aliases || []).length ? `<div class="pf-alias">${esc(p.aliases.slice(0, 2).join(" · "))}</div>` : ""}
        <div class="pf-role" title="${esc(p.role || "")}">${esc(sub.join(" · "))}</div>
        <div class="pf-ctl">${ctl}</div></div></div></div>`;
}

function routeViz(p, routes, paths, o) {
  const top = routes[0];
  const nodes = routeNodes(p, top, paths);
  const sentence = (o.best && o.best.sentence) || routeSentence(p, top);
  const drafts = (p.drafts || []).filter((d) => d.status !== "superseded");
  const openDraft = drafts.find((d) => ["needs_changes", "ready_for_review", "in_review", "blocked", "approved"].includes(d.status));
  const noKey = !(S.health || {}).key_present;
  let cta = "";
  if (!o.readonly) {
    if (S.planning.has(p.id)) cta = `<div class="working"><span class="spinner"></span><div><b>Planning &amp; drafting…</b><div class="steps">Connection Finder → Route Planner → Drafter → Reviewer · 30–120 s</div></div></div>`;
    else if (openDraft) cta = `<a class="btn primary" href="${evHash(p.event_id, "messages", openDraft.id)}">${icon("mail")}Open draft</a>`;
    else if (top && top.route_type === "intermediary_intro") cta = `<button class="btn primary" data-act="plan-person" data-pid="${p.id}" ${noKey ? "disabled" : ""}>${icon("send")}Draft intro request</button>`;
    else cta = `<button class="btn primary" data-act="plan-person" data-pid="${p.id}" ${noKey ? "disabled" : ""}>${icon("route")}Plan &amp; draft</button>`;
  } else cta = `<a class="btn primary" href="${personHash(p.event_id, p.id)}">${icon("external")}Open in ${esc(shortEventName((p.event || {}).name || "event"))}</a>`;
  const link = (i) => {
    const last = i === nodes.length - 1;
    const ico = last ? (top ? chIco(top.channel) : icon("route")) : icon("users");
    const lbl = last ? (top ? chName(top.channel) : "") : "intro";
    return `<div class="rlink ${esc(top ? top.warmth : "cold")}"><span class="rline"></span><span class="rch" title="${esc(last && top ? top.channel : "Introduction")}">${ico}<span>${esc(lbl)}</span></span></div>`;
  };
  const alts = routes.slice(1).map((r) => {
    const src = uniqSrc([r.source_url, ...evidenceSources(r.evidence)]).slice(0, 2);
    const label = r.route_type === "intermediary_intro" ? `Intro via ${cleanVia(r.via) || "intermediary"}` : `${ROUTE_TYPES[r.route_type] || r.route_type}${cleanVia(r.via) && r.route_type !== "public_contact" ? " · " + cleanVia(r.via) : ""}`;
    return `<div class="ralt"><span class="rk">${r.rank || ""}</span>${warmBars(r.warmth)}<span class="rch-i" title="${esc(r.channel || "")}">${chIco(r.channel)}</span>
      <div class="ralt-t"><div class="ellipsis" title="${esc(r.next_action || r.rationale || "")}">${esc(label)}</div>${src.length ? `<div class="srcs">${src.map((x) => srcChip(x, p.event_id)).join("")}</div>` : ""}</div>
      ${r.target ? `<button class="btn xs ghost" data-act="copy" data-v="${esc(r.target)}" title="Copy ${esc(r.target)}">Copy</button>` : ""}</div>`;
  }).join("");
  const topSrc = top ? uniqSrc([top.source_url, ...evidenceSources(top.evidence)]).slice(0, 3) : [];
  return `<section class="rviz">
    <div class="rviz-h"><span class="mono-label">Best way in</span>${top ? `${warmBars(top.warmth)}<span class="mono-meta">${esc(top.warmth)} · ${esc(ROUTE_TYPES[top.route_type] || top.route_type)}</span>` : `<span class="mono-meta">no route planned yet</span>`}</div>
    <div class="rnodes n${nodes.length}">${nodes.map((n, i) => `${i ? link(i) : ""}<div class="rnode ${n.t ? "target" : i === 0 ? "origin" : "via"}">${avatar(n.n === "You" ? "Y" : n.n, "md", n.t ? p.photo_url : photoByName(n.n))}<div class="rn-t"><div class="nm ellipsis" title="${esc(n.n)}">${esc(n.n === "You" ? "You" : shortName(n.n))}</div><div class="mono-meta">${esc(n.k)}</div></div></div>`).join("")}</div>
    <p class="bw-sentence">${esc(sentence)}</p>
    ${top && top.next_action ? `<p class="small muted rnext">${esc(top.next_action)}</p>` : ""}
    <div class="row wrap rviz-cta" style="gap:10px">${cta}${top && top.target ? `<button class="btn ghost sm" data-act="copy" data-v="${esc(top.target)}" title="Copy ${esc(top.target)}">${icon("file")}Copy ${esc({ email: "address", phone: "number", wechat: "handle", dm: "handle", linkedin: "profile" }[chKind(top.channel)] || "contact")}</button>` : ""}${topSrc.length ? `<span class="srcs">${topSrc.map((x) => srcChip(x, p.event_id)).join("")}</span>` : ""}</div>
    ${alts ? `<div class="ralts"><div class="mono-label">Other routes · ${routes.length - 1}</div>${alts}</div>` : ""}
  </section>`;
}

function profileColumns(p, o) {
  const evid = (p.evidence || []).filter(Boolean);
  const bullets = String(p.rationale || "").split(/(?<=[.!?。])\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
  const stats = [["Fit", p.priority_score != null ? Math.round(num(p.priority_score)) + " / 100" : "—"], ["Tier", p.tier || "—"], ["Source", p.origin === "scout" ? "Found by scout" : "Your files"],
    ["Slot", (p.slot || p.role || "—").split(";")[0]]];
  const mgmt = (p.contacts || []).filter((c) => ["management", "agency_email", "intermediary"].includes(c.channel));
  const direct = (p.contacts || []).filter((c) => !mgmt.includes(c));
  const crow = (c) => `<div class="crow">${chIco(c.channel === "website" ? "web" : c.channel === "instagram" ? "dm" : c.channel)}<div class="cv"><div class="v">${linkify(c.value)}</div><div class="mono-meta">${esc(CHANNELS[c.channel] || c.channel)}${c.label && c.label !== CHANNELS[c.channel] && !/public|verif/i.test(c.label) && c.label !== c.value ? " · " + esc(c.label) : ""} · ${c.verified ? "from your files" : "public — verify"}${c.source ? " · " : ""}${c.source ? (isURL(c.source) ? `<a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">${esc(domainOf(c.source))}</a>` : esc(c.source.split("/").pop())) : ""}</div></div>
      <button class="btn xs ghost icon-only" data-act="copy" data-v="${esc(c.value)}" aria-label="Copy ${esc(c.value)}" title="Copy">${icon("file")}</button></div>`;
  const others = p.other_events || [];
  return `<div class="pf-cols">
    <section class="pf-col"><div class="mono-label">Background</div>
      ${p.intro ? `<p class="pf-intro">${esc(p.intro)}</p>` : ""}
      <dl class="pf-stats">${stats.map(([k, v]) => `<div><dt class="mono-meta">${k}</dt><dd title="${esc(v)}">${esc(v)}</dd></div>`).join("")}</dl>
      ${bullets.length ? `<div class="mono-label sm">Why they fit</div><ul class="pf-bul">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${evid.length ? `<div class="srcs mt8">${evid.map((e) => srcChip(e, p.event_id)).join("")}</div>` : ""}
      ${!p.intro && !bullets.length && !evid.length ? `<p class="small muted">No background yet — the agents add it when they read your files or scout the web.</p>` : ""}
      ${others.length ? `<div class="mono-label sm">Also in other events</div><div class="row wrap" style="gap:6px">${others.map((x) => `<a class="ev-chip" href="${personHash(x.event_id, x.person_id)}" title="${esc(x.role || "")}"><span class="dot st-${esc(x.status)}"></span>${esc(shortEventName(x.event_name))}</a>`).join("")}</div>` : ""}
    </section>
    <section class="pf-col"><div class="mono-label">Contact · ${direct.length}</div>
      ${direct.length ? direct.map(crow).join("") : `<p class="small muted">No contact points on file.</p>`}
      <div class="mono-label sm">Management / agency</div>${mgmt.length ? mgmt.map(crow).join("") : `<p class="small muted">None on file.</p>`}
      <div class="mono-label sm">Relationship owner</div>
      ${o.readonly ? `<p class="small">${esc(p.owner || "Not set")}</p>` : `<div class="row" style="gap:6px"><input class="input sm" value="${esc(p.owner || "")}" placeholder="Who on the team owns this?" data-owner aria-label="Relationship owner"><button class="btn sm" data-act="save-owner">Save</button></div>`}
    </section></div>`;
}

function profileLower(p, o) {
  const drafts = (p.drafts || []).filter((d) => d.status !== "superseded");
  const tl = p.timeline || [];
  const all = S.histAll === p.id;
  const reply = (S.replyResult || {})[p.id];
  const noKey = !(S.health || {}).key_present;
  return `<div class="pf-cols">
    <section class="pf-col"><div class="mono-label">Messages · ${drafts.length}</div>
      ${drafts.length ? drafts.map((d) => `<a class="pf-msg" href="${evHash(p.event_id, "messages", d.id)}">${chIco(d.channel || "email")}<span class="ellipsis">${esc(draftTitle(d))}</span>${dStatusChip(d.status)}</a>`).join("") : `<p class="small muted">No messages yet.</p>`}
      ${o.readonly ? "" : `<div class="mono-label sm">Log a reply</div>
      <textarea class="textarea" rows="2" placeholder="Paste the reply you received — status, contacts and the next follow-up update automatically." data-reply-text></textarea>
      <div class="row mt8 wrap" style="gap:6px"><select class="select sm" style="width:118px" data-reply-ch aria-label="Channel">${["email", "wechat", "instagram", "linkedin", "phone", "xiaohongshu", "weibo", "other"].map((c) => `<option value="${c}">${esc(CHANNELS[c] || c)}</option>`).join("")}</select>
        <input type="date" class="input sm" style="width:140px" value="${todayISO()}" data-reply-date aria-label="Date received"><button class="btn sm" data-act="log-reply" ${noKey ? "disabled" : ""}>${icon("sparkle")}Interpret</button></div>${reply ? replyResultHtml(reply) : ""}`}
    </section>
    <section class="pf-col"><div class="mono-label">History · ${tl.length}</div>
      ${o.readonly ? "" : `<div class="row mb12" style="gap:6px"><input class="input sm" placeholder="Add a note…" data-note aria-label="Add a note"><button class="btn sm" data-act="add-note">Add</button></div>`}
      ${tl.length ? `<div class="gtl">${(all ? tl : tl.slice(0, 6)).map((t) => `<div class="gi k-${esc(t.kind)}"><div class="mono-meta">${esc(fmtDate(t.date))}${t.actor ? " · " + esc(t.actor) : ""}${t.event_name ? " · " + esc(shortEventName(t.event_name)) : ""}</div><div class="note">${esc(t.note)}</div></div>`).join("")}</div>
        ${tl.length > 6 ? `<button class="qlink mt8" data-act="hist-all" data-pid="${p.id}">${all ? "Show fewer" : `Show all ${tl.length}`}</button>` : ""}` : `<p class="small muted">No history yet.</p>`}
    </section></div>`;
}

function renderPersonSheet() {
  const p = S.drawer, el = $("[data-drawer]");
  if (!p || !el) return;
  const prevBody = $(".drawer-body", el);
  const keep = prevBody && S.drawerRendered === p.id ? prevBody.scrollTop : 0;
  S.drawerRendered = p.id;
  const o = { eyebrow: shortEventName((p.event || {}).name || (S.ev || {}).name || ""), best: S.best };
  el.innerHTML = `${profileHero(p, o)}<div class="drawer-body pf-body">${routeViz(p, p.routes || [], S.paths || [], o)}${profileColumns(p, o)}${profileLower(p, o)}</div>`;
  queueMicrotask(() => { const b = $(".drawer-body", el); if (b) b.scrollTop = keep; });
}

async function openProfileSheet(gid) {
  openSheetShell("g:" + gid, `<div class="drawer-body">${skel(2)}</div>`, "profile");
  let g, p = null, paths = [], best = null, apps = [];
  try {
    g = await api(`/api/directory/${gid}`);
    apps = g.appearances || [];
    const a = (g.appearances || [])[0];
    if (a) [p, paths, best] = await Promise.all([api(`/api/people/${a.id}`), api(`/api/people/${a.id}/paths`).catch(() => []), api(`/api/people/${a.id}/best`).catch(() => null)]);
    if (p && !p.photo_url) { const withPhoto = (await Promise.all(apps.slice(1, 4).map((x) => api(`/api/people/${x.id}`).catch(() => null)))).find((x) => x && x.photo_url); if (withPhoto) { p.photo_url = withPhoto.photo_url; p.photo_source = withPhoto.photo_source; } }
  } catch (e) { if (S.sheetKey === "g:" + gid) $("[data-drawer]").innerHTML = `<div class="drawer-body">${emptyState("alert", "Profile not found", esc(e.message), `<button class="btn" data-act="close-sheet">Close</button>`)}</div>`; return; }
  if (S.sheetKey !== "g:" + gid) return;
  if (!p) p = { id: 0, name: g.name, aliases: g.aliases, category: g.category, intro: g.intro, contacts: g.contacts, timeline: g.timeline, routes: [], drafts: [], other_events: [], owner: (g.owners || []).join(", ") };
  else { p.aliases = g.aliases && g.aliases.length ? g.aliases : p.aliases; p.timeline = g.timeline && g.timeline.length ? g.timeline : p.timeline; p.other_events = []; }
  const o = { readonly: true, eyebrow: g.internal ? "Internal team member" : `In ${plural(apps.length, "event")}`, best };
  $("[data-drawer]").innerHTML = `${profileHero(p, o)}<div class="drawer-body pf-body">
    <section class="pf-apps"><div class="mono-label">In your events · ${apps.length}</div>
      ${apps.map((a) => `<a class="pf-app" href="${personHash(a.event_id, a.id)}"><span class="dot st-${esc(a.status)}"></span><span class="ellipsis"><b>${esc(shortEventName(a.event_name))}</b> <span class="muted">· ${esc(String(a.role || "role to be decided").split(";")[0])}</span></span>${pStatusChip(a.status, false)}${icon("chevron")}</a>`).join("")}</section>
    ${p.id ? routeViz(p, p.routes || [], paths, o) : ""}${profileColumns(p, o)}${profileLower(p, o)}</div>`;
  if (p.id && !p.photo_url && !p.photo_checked) lookupPhoto(p);
}

/* ================================================================== global people (directory + team) */

async function viewGlobalPeople() {
  const view = S.route.query.get("view") === "team" ? "team" : "everyone";
  $("#view").innerHTML = `<div class="page">
    <div class="page-head"><div><h1 class="page-title">People</h1>
      <div class="page-sub">${view === "team" ? "Your team and the relationships each person owns — the handover view when officers change." : "Everyone across your events, merged by name and aliases (Chinese or English)."}</div></div>
      <div class="btn-row"><div class="seg-ctl" role="group" aria-label="Who"><a class="segbtn" href="#/people" aria-pressed="${view === "everyone"}">Everyone</a><a class="segbtn" href="#/people?view=team" aria-pressed="${view === "team"}">Team</a></div>
        <div class="pop-wrap"><button class="btn ghost icon-only" data-act="pop-toggle" data-pop="gmenu" aria-label="More">${icon("more")}</button>
          <div class="popover right" data-popover="gmenu" hidden><a class="menu-item" href="/api/directory/export.csv" download="integrated_directory.csv">${icon("download")}Export everyone as CSV</a></div></div></div></div>
    <div data-gp>${skel(2)}</div></div>`;
  const el = $("[data-gp]");
  if (view === "team") { el.innerHTML = await teamHtml(); return; }
  el.innerHTML = `<div class="card"><div class="filters"><div class="search" style="width:360px">${icon("search")}<input class="input" placeholder="Search names, aliases, roles…  ( / )" value="${esc(S.dirQ || "")}" data-dir-q data-search aria-label="Search people"></div><span class="spacer"></span><span class="small muted" data-dir-count></span></div>
    <div class="table-wrap" data-dir-table>${skel()}</div></div>`;
  await loadDirectory();
}

async function teamHtml() {
  const team = await api("/api/team");
  const byEvent = (owns) => { const m = {}; owns.forEach((o) => (m[o.event] = m[o.event] || []).push(o)); return m; };
  const evIdByName = (n) => (S.events.find((e) => e.name === n) || {}).id;
  if (!team.length) return `<div class="card">${emptyState("users", "No team members yet", "Team members come from your files once the agents have run.", `<a class="btn" href="#/projects">${icon("grid")}Go to Projects</a>`)}</div>`;
  return `<div class="team-grid">${team.map((m) => {
    const g = byEvent(m.owns || []);
    return `<div class="card"><div class="card-body"><div class="row" style="gap:12px;align-items:flex-start">${avatar(m.name, "lg")}<div style="min-width:0;flex:1">
      <div class="serif" style="font-size:18px;font-weight:600">${esc(m.name)}</div>
      <div class="xsmall muted clamp2" title="${esc((m.roles || []).join("\n"))}">${(m.roles || []).map(esc).join(" · ")}</div>
      ${(m.emails || []).length ? `<div class="small mt8">${m.emails.map((e) => `<a class="link" href="mailto:${esc(e)}">${esc(e)}</a>`).join(" · ")}</div>` : ""}</div>
      <span class="count-badge accent" title="Relationships owned">${(m.owns || []).length}</span></div>
      ${(m.owns || []).length ? `<details class="disc"><summary>Relationships owned (${m.owns.length})</summary>${Object.entries(g).map(([ev, list]) => `<div class="subhead">${esc(ev)}</div>${list.map((o) => `<div class="own">${avatar(o.name, "xs")}${evIdByName(ev) ? `<a href="${personHash(evIdByName(ev), o.person_id)}">${esc(o.name)}</a>` : `<span>${esc(o.name)}</span>`}<span class="xsmall muted ellipsis" style="flex:1">${esc(o.role || "")}</span>${pStatusChip(o.status, false)}</div>`).join("")}`).join("")}</details>` : '<p class="small muted mt12">Owns no relationships yet.</p>'}
    </div></div>`;
  }).join("")}</div>`;
}


/* ================================================================== settings sheet */

async function openSettingsSheet() {
  openSheetShell("sheet:settings", sheetBody("Settings", "", `<div data-settings>${skel(2)}</div>`), "wide");
  const [usage, conns, team] = await Promise.all([usageHtml().catch((e) => `<p class="small muted">${esc(e.message)}</p>`), api("/api/team/connections").catch(() => []), api("/api/team").catch(() => [])]);
  if (S.sheetKey !== "sheet:settings") return;
  const h = S.health || {};
  $("[data-settings]").innerHTML = `
    <section class="set-sec"><h3 class="sec-title">Model &amp; API key</h3>
      <div class="row small"><span class="model-dot ${h.key_present ? "" : "off"}"></span><b>${esc(h.model || "—")}</b><span class="muted">· ${h.key_present ? "API key found" : "No API key — browsing works; agents need PORTKEY_API_KEY in .env"}</span></div></section>
    <section class="set-sec"><h3 class="sec-title">Demo &amp; samples</h3>
      <p class="small muted">Load fictional sample events with a complete recorded agent run — instant and free.</p>
      <div class="btn-row mt12"><button class="btn ghost" data-act="load-demo" ${h.demo_snapshot ? "" : "disabled"}>${icon("sparkle")}Load demo</button><button class="btn ghost" data-act="new-event" data-mode="sample">${icon("folder")}Try a sample event</button></div></section>
    <section class="set-sec"><h3 class="sec-title">Import team contacts (CSV)</h3>
      <p class="small muted">A team member's LinkedIn <b>Connections.csv</b> lets the Connection Finder spot warm introductions. LinkedIn → Settings → Data privacy → Get a copy of your data → Connections. It stays on this computer.</p>
      <div class="grid cols-2 mt12" style="gap:12px"><div class="field"><label for="li-owner">Team member</label><input id="li-owner" class="input" list="team-names" placeholder="Whose contacts are these?" data-li-owner>
        <datalist id="team-names">${team.map((m) => `<option value="${esc(m.name)}">`).join("")}</datalist></div>
        <div class="field"><label for="li-file">CSV file</label><input id="li-file" type="file" accept=".csv,text/csv" class="input" style="padding-top:5px" data-li-file></div></div>
      <button class="btn ghost mt12" data-act="li-import">${icon("upload")}Import team contacts</button>
      ${conns.length ? `<table class="tbl compact mt12"><thead><tr><th>Owner</th><th class="num">Contacts</th><th class="num">Companies</th></tr></thead><tbody>${conns.map((c) => `<tr><td class="small strong">${esc(c.owner)}</td><td class="num">${fmtInt(c.connections)}</td><td class="num">${fmtInt(c.companies)}</td></tr>`).join("")}</tbody></table>` : `<p class="hint mt8">No contacts imported yet.</p>`}</section>
    <section class="set-sec"><h3 class="sec-title">Usage &amp; cost</h3>${usage}</section>`;
}

/* ================================================================== actions */

function closePopovers(except) { $$(".popover").forEach((p) => { if (p !== except) p.hidden = true; }); }
function onDraftInput() {
  const d = S.draft; if (!d) return;
  const dirty = Object.keys(draftEdits()).length > 0;
  S.draftDirty = dirty;
  const b = $("[data-save-btn]"); if (b) b.hidden = !dirty;
  const n = $("[data-dirty-note]"); if (n) n.textContent = dirty ? "Unsaved edits" : "";
}

async function generateBrief(btn) {
  const lang = store.get("briefLang", "en");
  setBusy(btn, true, "Writing brief… 10–20 s");
  try {
    const r = await api("/api/today/brief", { method: "POST", body: { language: lang } });
    store.set("dailyBrief", { data: r, at: new Date().toISOString(), lang, done: [] });
    toast(`Daily brief ready${r.usage ? " (" + fmtCost(r.usage.cost_usd) + ")" : ""}.`, "ok");
  } catch (e) { toastErr(e); }
  const card = $("#brief-card"); if (card) card.outerHTML = dailyBriefCard();
}
async function openPersonAnywhere(pid) {
  try { const p = await api(`/api/people/${pid}`); go(personHash(p.event_id, pid)); } catch (e) { toastErr(e); }
}

const ACTIONS = {
  reload: () => location.reload(),
  "reload-tab": () => renderTab(),
  "close-modal": () => closeModal(),
  "close-sheet": () => closeSheet(),
  "new-event": (el) => newEventModal(el.dataset.mode),
  "load-demo": (el) => loadDemo(el),
  "wel-sample": (el) => importSample($("#wel-sample").value, el),
  "open-sheet": (el) => { closePopovers(); setQuery("sheet", el.dataset.sheet); },
  "open-event": (el) => go(evHash(+el.dataset.eid, el.dataset.tab || "plan")),
  "go-next": (el, e) => { e.stopPropagation(); goNext(el); },
  "run-agents": (el) => startRun(el),
  "conflict-use": (el) => { const i = el.closest("[data-cf-box]")?.querySelector("[data-conf-input]"); if (i) { i.value = el.dataset.v; i.focus(); i.select(); } },
  "conflict-resolve": (el) => resolveConflict(el),
  "issue-set": async (el) => {
    setBusy(el, true, "");
    try {
      await api(`/api/issues/${el.dataset.id}`, { method: "PATCH", body: { status: el.dataset.s } });
      toast({ resolved: "Marked resolved.", ignored: "Ignored.", open: "Reopened." }[el.dataset.s], "ok", 1800);
      await refreshEventView();
    } catch (e) { toastErr(e); setBusy(el, false); }
  },
  "find-slot": (el) => {
    const slot = (el.dataset.slot || "").replace(/\s*\([^)]*\)\s*$/, "");
    const s = (((S.ev || {}).strategy || {}).slots || []).find((x) => x.name === el.dataset.slot) || {};
    S.findPrefill = `People for “${slot}”, ${Math.max(3, Math.min(8, (s.gap || 2) + 2))} names`;
    go(evHash(S.evId, "people", "", "sheet=find"));
  },
  "list-example": (el) => { const t = $("[data-list-brief]"); if (t) { t.value = el.dataset.v; store.set("listBrief", t.value); t.focus(); } },
  "list-generate": (el) => generateList(el),
  "list-mode": (el) => {
    store.set("listMode", el.dataset.v);
    $$('[data-act="list-mode"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v));
    const h = $("[data-list-mode-hint]"); if (h) h.textContent = LIST_MODES[listMode()].hint + " · nothing is sent to anyone";
  },
  "plan-person": (el, e) => { e.stopPropagation(); planPerson(+el.dataset.pid, el); },
  "open-person": (el) => { closePopovers(); if (S.route.parts[0] === "event") setQuery("p", el.dataset.pid); else openPersonAnywhere(+el.dataset.pid); },
  "open-person-any": (el) => openPersonAnywhere(+el.dataset.pid),
  "open-profile": (el) => setQuery("g", el.dataset.gid),
  copy: async (el, e) => {
    e.stopPropagation(); closePopovers();
    const v = el.hasAttribute("data-copy-body") ? ($("[data-draft-field='body']") || {}).value || el.dataset.v : el.dataset.v;
    try { await navigator.clipboard.writeText(v); toast("Copied to clipboard.", "ok", 1800); } catch { toast("Couldn't access the clipboard — select the text and copy it manually.", "error"); }
  },
  "save-owner": () => patchPerson({ owner: $("[data-owner]").value.trim() }, "Owner saved."),
  "add-note": () => { const n = $("[data-note]").value.trim(); if (!n) { toast("Write a note first.", "error"); return; } patchPerson({ note: n }, "Note added to the history."); },
  "log-reply": (el) => logReply(el),
  "draft-save": (el) => draftAction("save", el),
  "draft-status": (el) => { closePopovers(); draftAction("status", el); },
  "draft-review": (el) => { closePopovers(); draftAction("review", el); },
  "draft-comment": (el) => draftAction("comment", el),
  "draft-edit": () => { closePopovers(); const t = $("[data-draft-field='body']"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } },
  "draft-serif": (el) => { store.set("letterSerif", el.dataset.v === "1"); $$('[data-act="draft-serif"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v)); $("[data-draft-field='body']")?.classList.toggle("serifed", el.dataset.v === "1"); },
  "fu-done": async (el, e) => {
    e.stopPropagation(); setBusy(el, true, "");
    try {
      await api(`/api/followups/${el.dataset.id}`, { method: "PATCH", body: { status: "done" } });
      toast("Follow-up done — logged on the person's history.", "ok", 2200);
      if (S.tab === "messages") { await refreshDraftsList(); } else await refreshEventView();
    } catch (err) { toastErr(err); setBusy(el, false); }
  },
  "drive-open": (el) => setQuery("f", el.dataset.path, true),
  "files-seg": (el) => setQuery("seg", el.dataset.v, true),
  "open-doc": (el) => setQuery("doc", el.dataset.id),
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
  "pop-toggle": (el, e) => { e.stopPropagation(); const p = el.parentElement.querySelector(`[data-popover="${el.dataset.pop}"]`); if (!p) return; const show = p.hidden; closePopovers(p); p.hidden = !show; if (show) { const f = p.querySelector("select, input, button, a"); if (f) f.focus(); } },
  "pf-clear": () => { S.pf = { q: "", tier: "", list: "", source: "", orgs: false, team: false }; savePf(); closePopovers(); renderTab(); },
  "p-view": (el) => { store.set("peopleView", el.dataset.v); $$('[data-act="p-view"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v)); renderPeopleView(); },
  "p-more": (el) => { S.peopleMore[el.dataset.col] = true; renderPeopleView(); },
  "p-declined": () => { S.showDeclined = !S.showDeclined; renderPeopleView(); },
  "hist-all": (el) => { const pid = +el.dataset.pid; S.histAll = S.histAll === pid ? null : pid; if (S.sheetKey && S.sheetKey.startsWith("g:")) openProfileSheet(+S.sheetKey.slice(2)); else renderPersonSheet(); },
  "people-photos": async (el) => {
    closePopovers();
    toast("Looking up public photos on Wikimedia Commons… this can take a minute.", "info", 4000);
    try {
      const r = await api(`/api/events/${S.evId}/photos`, { method: "POST" });
      const n = r && (r.found ?? r.updated ?? (r.photos || []).length);
      toast(n != null ? `Found ${plural(n, "photo")}.` : "Photos updated.", "ok");
      await refreshEventView();
    } catch (e) { toastErr(e); }
  },
  "people-csv": () => { closePopovers(); exportPeopleCSV(); },
};

document.addEventListener("click", (e) => {
  if (!e.target.closest(".pop-wrap")) closePopovers();
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const a = e.target.closest("a[href]");
  if (a && a !== el && el.contains(a)) return;
  const btn = e.target.closest("button");
  if (btn && btn !== el && el.contains(btn)) return;
  if (el.tagName === "INPUT" && el.type === "checkbox") { ACTIONS[el.dataset.act]?.(el, e); return; }
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName !== "LABEL") e.preventDefault();
  fn(el, e);
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.actChange === "p-status") patchPerson({ status: el.value }, `Status set to ${(PSTATUS[el.value] || [el.value])[0]}.`);
  else if (el.dataset.actChange === "p-tier" && el.value) patchPerson({ tier: el.value }, `Tier set to ${el.value}.`);
  else if (el.dataset.actChange === "run-sel") { S.runSel = el.value === "all" ? "all" : +el.value; paintRun(true); }
  else if (el.dataset.actChange === "reimport") reimportFile(el);
  else if (el.dataset.pf && el.dataset.pf !== "q") {
    S.pf[el.dataset.pf] = el.type === "checkbox" ? el.checked : el.value; savePf();
    renderPeopleView();
    const fb = $('[data-pop="filter"]'); if (fb) { const n = activeFilterCount(); fb.innerHTML = `${icon("list")}Filter${n ? `<span class="count-badge accent">${n}</span>` : ""}`; }
  }
});

const dirSearch = debounce(() => loadDirectory(), 250);
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.pf === "q") { S.pf.q = el.value; savePf(); renderPeopleView(); }
  else if (el.hasAttribute("data-dir-q")) { S.dirQ = el.value; dirSearch(); }
  else if (el.dataset.draftField) onDraftInput();
  else if (el.hasAttribute("data-list-brief")) store.set("listBrief", el.value);
});

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if (e.key === "Escape") {
    const openPop = $$(".popover").find((p) => !p.hidden);
    if (openPop) { closePopovers(); return; }
    if ($("#modal-root").innerHTML) { closeModal(); return; }
    if (S.sheetKey) { closeSheet(); return; }
  }
  if (e.key === "/" && !typing) { const s = $("[data-search]"); if (s) { e.preventDefault(); s.focus(); s.select(); } }
  if (e.key === "Enter" && !typing && document.activeElement?.matches("tr[data-act], article[data-act]")) document.activeElement.click();
  if (e.key === "Enter" && document.activeElement?.matches("[data-owner]")) $('[data-act="save-owner"]')?.click();
  if (e.key === "Enter" && document.activeElement?.matches("[data-note]")) $('[data-act="add-note"]')?.click();
  if (e.key === "Enter" && document.activeElement?.matches("[data-c-text]")) $('[data-act="draft-comment"]')?.click();
  if ((e.metaKey || e.ctrlKey) && e.key === "s" && S.tab === "messages" && S.draftDirty) { e.preventDefault(); $("[data-save-btn]")?.click(); }
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
  loadProjects().then(() => renderSidebar());
  window.addEventListener("hashchange", route);
  route();
  setInterval(async () => {
    if (!S.events.some((e) => e.running)) return;
    const before = new Map(S.events.map((e) => [e.id, e.running]));
    await loadEvents();
    for (const e of S.events) if (before.get(e.id) && !e.running && S.evId === e.id && !(S.poll && S.poll.eid === e.id)) refreshEventView();
  }, 5000);
}
boot();
