/* GVC Broker Roster CRM — PREVIEW ONLY. localStorage is not the system of record. */
(function () {
  const STORAGE_KEY = "gvc-broker-roster-crm-preview-v1";
  const TODAY = (window.BROKER_ROSTER_SEED && window.BROKER_ROSTER_SEED.meta.today) || "2026-11-18";
  const TZ = (window.BROKER_ROSTER_SEED && window.BROKER_ROSTER_SEED.meta.timezoneLabel) || "ET (America/Indianapolis)";

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mergeSeedKpis(s) {
    const seed = window.BROKER_ROSTER_SEED;
    if (!seed || !Array.isArray(seed.brokers)) return s;
    const by = {};
    seed.brokers.forEach(b => { by[b.companyNmls] = b; });
    const fields = ["volumeLicensed3mo","volumeStateTotal3mo","volumeBackedOut3mo","loansLicensed3mo","loansStateTotal3mo","pctKept","topBackedOut","stateSplit","stateSplitNote","volume3mo","units3mo","volumeYtd","unitsYtd","productionStatus","productionLabel","activeLos","loCountOffice"];
    s.brokers.forEach(b => {
      const src = by[b.companyNmls];
      if (!src) return;
      fields.forEach(k => { if (Object.prototype.hasOwnProperty.call(src, k)) b[k] = src[k]; });
    });
    if (seed.approvedStates) s.approvedStates = clone(seed.approvedStates);
    s.meta = s.meta || {};
    if (seed.meta) {
      if (seed.meta.licensedStatesNote) s.meta.licensedStatesNote = seed.meta.licensedStatesNote;
      if (seed.meta.stateSplitSource) s.meta.stateSplitSource = seed.meta.stateSplitSource;
      if (seed.meta.today) s.meta.today = seed.meta.today;
    }
    s.brokers.forEach(b => {
      const src = by[b.companyNmls];
      if (src && src.firstFile) b.firstFile = clone(src.firstFile);
    });
    if (seed.playbookHtml) s.playbookHtml = seed.playbookHtml;
    if (seed.playbookMarkdown) s.playbookMarkdown = seed.playbookMarkdown;
    if (seed.firstFileMeta) s.firstFileMeta = clone(seed.firstFileMeta);
    return s;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.brokers) && s.meta) return mergeSeedKpis(s);
      }
    } catch (e) { /* ignore corrupted preview store */ }
    return clone(window.BROKER_ROSTER_SEED);
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Could not write preview localStorage"); }
  }

  let state = loadState();
  let customViews = loadCustomViews();
  const ui = {
    filters: { q: "", ae: "", stage: "", production: "", due: "", state: "", flagsOnly: false },
    activeView: "all",
    sort: { key: "name", dir: 1 },
    detailTab: "overview",
    firstFileMode: "quiet",
    firstFileAe: "",
    toastTimer: null
  };

  function loadCustomViews() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY + ":views") || "[]"); }
    catch (e) { return []; }
  }
  function saveCustomViews() {
    localStorage.setItem(STORAGE_KEY + ":views", JSON.stringify(customViews));
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function linksHtml(b) {
    const items = [];
    function add(href, label) {
      if (!href) return;
      items.push(`<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`);
    }
    add(b.website, "Website");
    add(b.nmlsConsumerAccess, "NMLS Consumer Access");
    add(b.linkedin, "LinkedIn");
    add(b.facebook, "Facebook");
    add(b.instagram, "Instagram");
    if (!items.length && !b.dba) return "";
    const dba = b.dba ? `<span class="muted">DBA ${esc(b.dba)}</span>` : "";
    return `<p class="shop-links">${items.join(" · ")}${items.length && dba ? " · " : ""}${dba}</p>`;
  }
  function money(n) {
    if (n == null || n === "") return "—";
    const v = Number(n);
    if (!isFinite(v)) return "—";
    if (Math.abs(v) >= 1000000) return "$" + (v / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (Math.abs(v) >= 1000) return "$" + Math.round(v).toLocaleString("en-US");
    return "$" + v.toLocaleString("en-US");
  }
  function moneyFull(n) {
    if (n == null || n === "") return "—";
    return "$" + Math.round(Number(n)).toLocaleString("en-US");
  }
  function hasLicensedKpi(b) {
    return b.stateSplit === "licensed" || b.stateSplit === "zero";
  }
  function kpiVolume(b) {
    if (hasLicensedKpi(b) && b.volumeLicensed3mo != null) return Number(b.volumeLicensed3mo) || 0;
    return b.volume3mo || b.volumeYtd || 0;
  }
  function firstFileOf(b) { return b.firstFile || {}; }
  function daysSinceApproval(b) {
    const ff = firstFileOf(b);
    if (ff.daysSinceApproval != null) return ff.daysSinceApproval;
    if (!b.initialApprovalDate) return null;
    const a = new Date(b.initialApprovalDate + "T00:00:00");
    const t = new Date(TODAY + "T00:00:00");
    return Math.round((t - a) / 86400000);
  }
  function isFirstFileShop(b) {
    const st = b.stage;
    if (st !== "approved" && st !== "activated") return false;
    return !firstFileOf(b).hasFundedGvcLoan;
  }
  function isQuietShop(b) {
    const ff = firstFileOf(b);
    if (ff.isQuiet != null) return !!ff.isQuiet;
    return isFirstFileShop(b) && !ff.firstFileSubmittedDate;
  }
  function sampleBadge(on) {
    return on ? `<span class="pill sample">SAMPLE</span>` : "";
  }
  function placeholderBadge() {
    return `<span class="pill placeholder">PLACEHOLDER</span>`;
  }
  function milestonePills(ff) {
    return (ff.milestones || []).map(m => {
      const sent = m.updateSent ? "Yes" : "No";
      const cls = m.updateSent ? "ok" : "warn";
      const when = m.occurredOn ? " · " + fmtDate(m.occurredOn) : " · not yet";
      return `<span class="pill ${cls} ms-pill">${esc(m.name)}: ${sent}${when}${m.isSample ? " · SAMPLE" : ""}</span>`;
    }).join("");
  }
  function milestoneCompact(ff) {
    return `<div class="ms-grid">${(ff.milestones || []).map(m => {
      const sent = m.updateSent ? "Yes" : "No";
      const cls = m.updateSent ? "ok" : "warn";
      return `<div class="ms-cell"><span class="ms-name">${esc(m.name)}</span><span class="pill ${cls}">${sent}</span>${m.isSample ? `<span class="pill sample">SAMPLE</span>` : ""}</div>`;
    }).join("")}</div>`;
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    if (!y) return iso;
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    const dt = new Date(iso);
    if (isNaN(dt)) return iso;
    return dt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + " " + TZ;
  }
  function daysFromToday(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    const a = Date.UTC(y, m - 1, d);
    const [ty, tm, td] = TODAY.split("-").map(Number);
    const b = Date.UTC(ty, tm - 1, td);
    return Math.round((a - b) / 86400000);
  }
  function dueClass(iso, completed) {
    if (completed) return "done";
    const d = daysFromToday(iso);
    if (d == null) return "";
    if (d < 0) return "overdue";
    if (d === 0) return "today";
    return "upcoming";
  }
  function dueLabel(iso, completed) {
    if (completed) return "Done";
    const d = daysFromToday(iso);
    if (d == null) return "";
    if (d < 0) return "Overdue " + Math.abs(d) + " day" + (Math.abs(d) === 1 ? "" : "s");
    if (d === 0) return "Due today";
    if (d === 1) return "Due tomorrow";
    return "Due " + fmtDate(iso);
  }
  function inThisWeek(iso) {
    const d = daysFromToday(iso);
    if (d == null) return false;
    // Calendar week of Nov 16–22, 2026 (Mon–Sun), plus remaining days from today.
    return d >= 0 && d <= 5; // today Tue Nov 17 through Sun Nov 22
  }
  function aeClass(name) {
    if (!name) return "";
    return name.indexOf("Ashley") >= 0 ? "ashley" : "jim";
  }
  function stageLabel(id) {
    const s = (state.stages || []).find(x => x.id === id);
    return s ? s.label : id;
  }
  function brokerByNmls(nmls) { return state.brokers.find(b => String(b.companyNmls) === String(nmls)); }
  function contactsFor(nmls) { return state.contacts.filter(c => String(c.companyNmls) === String(nmls)); }
  function activitiesFor(nmls) {
    return state.activities
      .filter(a => String(a.companyNmls) === String(nmls))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  function remindersFor(nmls, openOnly) {
    return state.reminders.filter(r => String(r.companyNmls) === String(nmls) && (!openOnly || !r.completedAt));
  }
  function leadersFor(nmls) {
    return (state.leaders || [])
      .filter(l => String(l.companyNmls) === String(nmls))
      .sort((a, b) => (a.rank || 999) - (b.rank || 999));
  }
  function openReminder(b) {
    return remindersFor(b.companyNmls, true).sort((a, c) => String(a.dueDate).localeCompare(String(c.dueDate)))[0] || null;
  }
  function counts() {
    const c = { prospect: 0, approved: 0, activated: 0, active: 0, dormant: 0 };
    state.brokers.forEach(b => { c[b.stage] = (c[b.stage] || 0) + 1; });
    return c;
  }
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function nextId(list) {
    return (list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) || 0) + 1;
  }
  function addActivity(nmls, type, body, seeded) {
    state.activities.push({
      id: nextId(state.activities),
      companyNmls: String(nmls),
      type: type || "note",
      body: body,
      createdAt: new Date().toISOString(),
      createdBy: seeded ? "Preview seed" : "Preview user",
      previewSeeded: !!seeded
    });
  }

  function route() {
    const hash = (location.hash || "#/pipeline").replace(/^#/, "");
    const parts = hash.split("/").filter(Boolean);
    const view = parts[0] || "pipeline";
    const id = parts[1];
    $all("nav a").forEach(a => a.classList.toggle("active", a.dataset.view === view && view !== "broker"));
    if (view === "broker" && id) renderDetail(id);
    else if (view === "roster") renderRoster();
    else if (view === "due") renderDue();
    else if (view === "first-file") {
      if (id === "all") ui.firstFileMode = "all";
      else ui.firstFileMode = "quiet";
      renderFirstFile();
    }
    else if (view === "playbook") renderPlaybook();
    else renderPipeline();
  }

  function funnelHtml() {
    const c = counts();
    const helps = {};
    (state.stages || []).forEach(s => { helps[s.id] = s.help; });
    return `<div class="funnel" data-shot="funnel">` +
      ["prospect", "approved", "activated", "active", "dormant"].map(id =>
        `<div class="funnel-card" data-stage="${id}" data-go-stage="${id}" title="${esc(helps[id] || "")}">
          <div class="k">${esc(stageLabel(id))}</div>
          <div class="n">${c[id] || 0}</div>
          <div class="h">${id === "approved" ? "Seeded from the approved list" : "None seeded"}</div>
        </div>`
      ).join("") + `</div>`;
  }

  function viewChipsHtml() {
    const views = (state.savedViews || []).concat(customViews);
    return `<div class="views" data-shot="views">` +
      views.map(v => `<button type="button" class="view-chip ${ui.activeView === v.id ? "active" : ""}" data-view-id="${esc(v.id)}">${esc(v.name)}</button>`).join("") +
      `<button type="button" class="view-chip" data-save-view="">+ Save current view</button>` +
      `</div>`;
  }

  function applyFilters(list) {
    const f = ui.filters;
    const q = (f.q || "").trim().toLowerCase();
    return list.filter(b => {
      if (f.ae && b.ae !== f.ae) return false;
      if (f.stage && b.stage !== f.stage) return false;
      if (f.production && b.productionStatus !== f.production) return false;
      if (f.state && b.state !== f.state) return false;
      if (f.flagsOnly && !(b.flags && b.flags.length)) return false;
      if (f.due) {
        const rem = openReminder(b);
        const dc = rem ? dueClass(rem.dueDate) : "";
        if (f.due === "overdue" && dc !== "overdue") return false;
        if (f.due === "today" && dc !== "today") return false;
        if (f.due === "week" && !(rem && (inThisWeek(rem.dueDate) || dc === "overdue"))) return false;
        if (f.due === "open" && !rem) return false;
      }
      if (q) {
        const blob = [b.name, b.companyNmls, b.ae, b.city, b.state, b.primaryContactName, b.statusNote, b.nextStep, b.website, b.dba, (b.aliases || []).join(" ")]
          .join(" ").toLowerCase();
        if (blob.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function applyView(id) {
    const v = (state.savedViews || []).concat(customViews).find(x => x.id === id);
    ui.activeView = id;
    if (!v) return;
    ui.filters = Object.assign({ q: "", ae: "", stage: "", production: "", due: "", state: "", flagsOnly: false }, clone(v.filters || {}));
  }

  function productionCell(b) {
    if (hasLicensedKpi(b)) {
      const faint = b.stateSplit === "zero"
        ? "Licensed 3-month volume"
        : `${money(b.volumeStateTotal3mo)} total · ${money(b.volumeBackedOut3mo)} backed out`;
      return `<div class="num">${money(b.volumeLicensed3mo)}</div><div class="faint">Licensed 3 mo · ${faint}</div>`;
    }
    if (b.productionStatus === "has_3mo") {
      const ytd = (b.volume3mo === 0 || b.volume3mo == null) && b.volumeYtd
        ? ` · 2026 YTD ${money(b.volumeYtd)}`
        : "";
      return `<div class="num">${money(b.volume3mo)}</div><div class="faint">${b.activeLos || 0} active LOs · ${Number(b.units3mo || 0).toLocaleString("en-US")} loans · 3 mo${ytd}</div><div class="faint">State split pending</div>`;
    }
    if (b.productionStatus === "has_ytd_only") {
      return `<div class="num">${money(b.volumeYtd)}</div><div class="faint">${b.loCountOffice || b.activeLos} LOs · ${Number(b.unitsYtd).toLocaleString("en-US")} loans · 2026 YTD</div><div class="faint">State split pending</div>`;
    }
    return `<span class="pill warn">Production pending</span><div class="faint">State split pending</div>`;
  }

  function renderPipeline() {
    const c = counts();
    const by = { prospect: [], approved: [], activated: [], active: [], dormant: [] };
    applyFilters(state.brokers).forEach(b => { (by[b.stage] || by.approved).push(b); });
    Object.keys(by).forEach(k => by[k].sort((a, b) => kpiVolume(b) - kpiVolume(a) || a.name.localeCompare(b.name)));

    $("#app").innerHTML = `
      <div class="wrap" data-view="pipeline">
        ${funnelHtml()}
        ${viewChipsHtml()}
        ${filterBar()}
        <div class="kanban" data-shot="kanban">
          ${["prospect", "approved", "activated", "active", "dormant"].map(stage => `
            <div class="col ${by[stage].length ? "" : "empty"}">
              <div class="col-h"><h3>${esc(stageLabel(stage))}</h3><span>${by[stage].length}</span></div>
              ${by[stage].length ? by[stage].map(cardHtml).join("") : `<div class="empty">No shops in this stage</div>`}
            </div>`).join("")}
        </div>
        ${aboutHtml()}
      </div>`;
    bindCommon();
  }

  function cardHtml(b) {
    const rem = openReminder(b);
    const dc = rem ? dueClass(rem.dueDate) : "";
    return `<div class="card" data-nmls="${esc(b.companyNmls)}">
      <div class="name">${esc(b.name)}</div>
      <div class="meta">
        <span class="ae-chip ${aeClass(b.ae)}">${esc(b.ae)}</span>
        <span>${esc(b.city)}, ${esc(b.state)}</span>
        ${b.flags && b.flags.length ? `<span class="pill warn">${b.flags.length} flag${b.flags.length > 1 ? "s" : ""}</span>` : ""}
      </div>
      <div class="next muted">${hasLicensedKpi(b) ? money(b.volumeLicensed3mo) + " licensed 3 mo" : (b.productionStatus === "pending" ? "Production pending" : (b.productionStatus === "has_3mo" ? money(b.volume3mo) + " · 3 mo · State split pending" : money(b.volumeYtd) + " · 2026 YTD · State split pending"))}</div>
      <div class="next">${esc(b.nextStep || "")}</div>
      ${rem ? `<div class="due ${dc}">${esc(dueLabel(rem.dueDate))}</div>` : ""}
    </div>`;
  }

  function filterBar() {
    const states = Array.from(new Set(state.brokers.map(b => b.state))).sort();
    const f = ui.filters;
    const sel = (name, val, opts) =>
      `<select data-filter="${name}">` + opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("") + `</select>`;
    return `<div class="toolbar" data-shot="filters">
      <input type="search" placeholder="Search shops, NMLS, AE, contact…" data-filter="q" value="${esc(f.q || "")}">
      ${sel("ae", f.ae || "", [["", "All AEs"], ...state.aes.map(a => [a, a])])}
      ${sel("stage", f.stage || "", [["", "All stages"], ...state.stages.map(s => [s.id, s.label])])}
      ${sel("production", f.production || "", [["", "All production"], ["has_3mo", "Has 3-month RETR"], ["has_ytd_only", "YTD office only"], ["pending", "Production pending"]])}
      ${sel("due", f.due || "", [["", "Any due date"], ["overdue", "Overdue"], ["today", "Due today"], ["week", "Due this week"], ["open", "Open reminder"]])}
      ${sel("state", f.state || "", [["", "All HQ states"], ...states.map(s => [s, s])])}
      <label class="muted" style="display:flex;gap:6px;align-items:center;font-weight:650">
        <input type="checkbox" data-filter="flagsOnly" ${f.flagsOnly ? "checked" : ""}> Data flags only
      </label>
    </div>`;
  }

  function renderRoster() {
    let rows = applyFilters(state.brokers);
    const { key, dir } = ui.sort;
    rows = rows.slice().sort((a, b) => {
      const va = sortVal(a, key), vb = sortVal(b, key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.name.localeCompare(b.name);
    });
    $("#app").innerHTML = `
      <div class="wrap" data-view="roster">
        ${funnelHtml()}
        ${viewChipsHtml()}
        ${filterBar()}
        <div class="muted" style="margin:-6px 0 8px">${rows.length} of ${state.brokers.length} shops · ${state.meta.contactCount} contacts in the seed</div>
        <div class="table-wrap" data-shot="roster-table">
          <table>
            <thead>
              <tr>
                ${[["name", "Shop"], ["ae", "AE / owner"], ["hq", "HQ"], ["stage", "Stage"], ["prod", "Production"], ["contacts", "Contacts"], ["next", "Next step"], ["due", "Due"]].map(([k, l]) =>
                  `<th data-sort="${k}" class="${k === "prod" || k === "contacts" ? "num" : ""}">${l}${ui.sort.key === k ? (ui.sort.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${rows.map(b => {
                const rem = openReminder(b);
                const dc = rem ? dueClass(rem.dueDate) : "";
                return `<tr class="clickable" data-nmls="${esc(b.companyNmls)}">
                  <td class="shop-cell">${esc(b.name)}<span class="sub">NMLS ${esc(b.companyNmls)}${b.statusNote ? " · " + esc(b.statusNote) : ""}${b.flags && b.flags.length ? " · " + b.flags.length + " flag" + (b.flags.length > 1 ? "s" : "") : ""}</span></td>
                  <td><span class="ae-chip ${aeClass(b.ae)}">${esc(b.ae)}</span></td>
                  <td>${esc(b.city)}, ${esc(b.state)}</td>
                  <td><span class="stage ${esc(b.stage)}">${esc(stageLabel(b.stage))}</span></td>
                  <td class="num">${productionCell(b)}</td>
                  <td class="num">${b.contactCount}</td>
                  <td>${esc(b.nextStep || "—")}</td>
                  <td><span class="due ${dc}">${rem ? esc(dueLabel(rem.dueDate)) : "—"}</span><div class="faint">${rem ? fmtDate(rem.dueDate) : ""}</div></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
        ${aboutHtml()}
      </div>`;
    bindCommon();
  }

  function sortVal(b, key) {
    if (key === "ae") return b.ae || "";
    if (key === "hq") return (b.state || "") + (b.city || "");
    if (key === "stage") return b.stage || "";
    if (key === "prod") return hasLicensedKpi(b) ? (Number(b.volumeLicensed3mo) || 0) : (b.volume3mo || b.volumeYtd || -1);
    if (key === "contacts") return b.contactCount || 0;
    if (key === "next") return b.nextStep || "";
    if (key === "due") return (openReminder(b) || {}).dueDate || "9999-99-99";
    return (b.name || "").toLowerCase();
  }

  function renderDue() {
    const open = state.reminders.filter(r => !r.completedAt).map(r => {
      const b = brokerByNmls(r.companyNmls);
      return { r, b, dc: dueClass(r.dueDate), days: daysFromToday(r.dueDate) };
    }).filter(x => x.b);
    const overdue = open.filter(x => x.dc === "overdue").sort((a, b) => a.days - b.days);
    const today = open.filter(x => x.dc === "today").sort((a, b) => a.b.name.localeCompare(b.b.name));
    const upcoming = open.filter(x => x.dc === "upcoming").sort((a, b) => a.days - b.days);
    const done = state.reminders.filter(r => r.completedAt).length;

    function section(title, cls, items, empty) {
      return `<section class="due-section">
        <h2>${title} <span class="pill ${cls === "overdue" ? "danger" : cls === "today" ? "warn" : "ok"}">${items.length}</span></h2>
        <div class="due-list">
          ${items.length ? items.map(({ r, b, dc }) => `
            <div class="due-row ${dc}" data-nmls="${esc(b.companyNmls)}">
              <div>
                <div class="due-date">${fmtDate(r.dueDate)}</div>
                <div class="due ${dc}">${esc(dueLabel(r.dueDate))}</div>
              </div>
              <div>
                <div class="shop-cell" style="cursor:pointer" data-nmls="${esc(b.companyNmls)}">${esc(b.name)}<span class="sub">NMLS ${esc(b.companyNmls)} · ${esc(b.city)}, ${esc(b.state)}</span></div>
                <div style="margin-top:6px">${esc(r.title)}</div>
                <div class="muted" style="margin-top:4px"><span class="ae-chip ${aeClass(b.ae)}">${esc(b.ae)}</span>
                  ${r.previewSeeded ? `<span class="seed-tag">Preview seed</span>` : ""}
                </div>
              </div>
              <div>
                <button type="button" class="btn small" data-complete="${r.id}">Mark done</button>
              </div>
            </div>`).join("") : `<div class="muted">${empty}</div>`}
        </div>
      </section>`;
    }

    $("#app").innerHTML = `
      <div class="wrap" data-view="due">
        ${funnelHtml()}
        <div class="kpis">
          <div class="kpi"><div class="k">Overdue</div><div class="v" style="color:var(--overdue)">${overdue.length}</div><div class="s">Open reminders before ${fmtDate(TODAY)}</div></div>
          <div class="kpi"><div class="k">Due today</div><div class="v" style="color:var(--today)">${today.length}</div><div class="s">${fmtDate(TODAY)} · ${TZ}</div></div>
          <div class="kpi"><div class="k">Upcoming</div><div class="v">${upcoming.length}</div><div class="s">Open, not yet due</div></div>
          <div class="kpi"><div class="k">Completed in preview</div><div class="v">${done}</div><div class="s">Stored in localStorage only</div></div>
        </div>
        ${section("Overdue", "overdue", overdue, "No overdue follow-ups")}
        ${section("Due today", "today", today, "Nothing due today")}
        ${section("Upcoming", "upcoming", upcoming, "No upcoming reminders")}
        ${aboutHtml()}
      </div>`;
    bindCommon();
  }

  function renderDetail(nmls) {
    const b = brokerByNmls(nmls);
    if (!b) {
      $("#app").innerHTML = `<div class="wrap"><p>Shop NMLS ${esc(nmls)} was not found in this preview.</p><p><a href="#/roster">Back to roster</a></p></div>`;
      return;
    }
    const tab = ui.detailTab;
    const rem = openReminder(b);
    const contacts = contactsFor(b.companyNmls);
    const acts = activitiesFor(b.companyNmls);
    const rems = remindersFor(b.companyNmls);
    const leaders = leadersFor(b.companyNmls);
    const offEmail = contacts.filter(c => c.emailDomainFlag);

    const flagsHtml = (b.flags || []).length
      ? `<div class="flags">${b.flags.map(f => `<div class="flag ${esc(f.severity)}">${esc(f.text)}</div>`).join("")}</div>`
      : "";

    let tabHtml = "";
    if (tab === "contacts") {
      tabHtml = `
        <div class="muted" style="margin-bottom:8px">${contacts.length} business contacts from the approved-list extracts.
          ${offEmail.length ? `<span class="pill warn">${offEmail.length} flagged email domain${offEmail.length > 1 ? "s" : ""}</span>` : ""}</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Title</th><th>NMLS</th><th>Email</th><th>Office</th><th>Cell</th><th>Licensed</th><th>Rate sheets</th></tr></thead>
            <tbody>
              ${contacts.map(c => `<tr>
                <td>${esc([c.firstName, c.middleName, c.lastName, c.suffix].filter(Boolean).join(" "))}${c.emailDomainFlag ? ` <span class="pill warn">Off-company email</span>` : ""}</td>
                <td>${esc(c.title || "—")}</td>
                <td>${esc(c.nmlsId || "—")}</td>
                <td>${esc(c.email || "—")}${c.emailDomainNote ? `<div class="faint">${esc(c.emailDomainNote)}</div>` : ""}</td>
                <td>${esc(c.officePhone || "—")}</td>
                <td>${esc(c.cellPhone || "—")}</td>
                <td>${esc(c.statesLicensed || "—")}</td>
                <td>${c.receiveRateSheets ? "Yes" : "—"}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    } else if (tab === "production") {
      if (b.productionStatus === "pending") {
        tabHtml = `<p class="muted">Production pending. No 3-month RETR or office YTD extract is in the preview seed for this shop.</p>`;
      } else {
        const basis = b.productionLabel;
        const missing = leaders.filter(l => l.onContactList === false);
        const splitLine = hasLicensedKpi(b)
          ? `<p>Licensed 3-month volume ${moneyFull(b.volumeLicensed3mo)} of ${moneyFull(b.volumeStateTotal3mo)} total (${moneyFull(b.volumeBackedOut3mo)} backed out)${b.topBackedOut ? ". Top backed-out states: " + esc(b.topBackedOut) : ""}.</p><p class="muted">${esc(b.stateSplitNote || "")}</p>`
          : `<p>State split pending.</p>`;
        tabHtml = `
          ${splitLine}
          <p class="muted">${esc(basis)}${b.productionAsOf ? " · as of " + fmtDate(b.productionAsOf) : ""}.
            Leader names and volumes are shop production figures, not LO personal recruiting files.
            ${missing.length ? `<span class="pill warn">${missing.length} not on the GVC contact list</span>` : ""}</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th class="num">Rank</th><th>Name</th><th>Branch</th><th class="num">${b.productionStatus === "has_3mo" ? "3-mo loans" : "2026 units"}</th><th class="num">${b.productionStatus === "has_3mo" ? "3-mo volume" : "2026 volume"}</th><th>On contact list</th></tr></thead>
              <tbody>
                ${leaders.map(l => `<tr>
                  <td class="num">${l.rank || ""}</td>
                  <td>${esc(l.name || "")}</td>
                  <td>${esc(l.branch || "—")}</td>
                  <td class="num">${b.productionStatus === "has_3mo" ? (l.units3mo ?? "—") : (l.unitsYtd ?? "—")}</td>
                  <td class="num">${moneyFull(b.productionStatus === "has_3mo" ? l.volume3mo : l.volumeYtd)}</td>
                  <td>${l.onContactList == null ? "—" : (l.onContactList ? "Yes" : "No")}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>`;
      }
    } else if (tab === "activity") {
      tabHtml = `
        <form id="add-activity" data-nmls="${esc(b.companyNmls)}" class="panel" style="margin-bottom:14px">
          <h3>Add a note or activity</h3>
          <div class="row-2">
            <div class="field"><label>Type</label>
              <select name="type"><option value="note">Note</option><option value="call">Call</option><option value="email">Email (logged, not sent)</option><option value="meeting">Meeting</option></select>
            </div>
          </div>
          <div class="field"><label>Details</label><textarea name="body" required placeholder="What happened? This stays in the preview only. The app does not send email or texts."></textarea></div>
          <button class="btn primary" type="submit">Add to log</button>
        </form>
        <div class="log" data-shot="activity-log">
          ${acts.map(a => `
            <div class="log-item ${esc(a.type)}">
              <div class="when">${esc(fmtDateTime(a.createdAt))} · ${esc(a.createdBy)} · ${esc(a.type)}${a.previewSeeded ? `<span class="seed-tag">Preview seed</span>` : ""}</div>
              <div class="body">${esc(a.body)}</div>
            </div>`).join("")}
        </div>`;
    } else if (tab === "reminders") {
      tabHtml = `
        <form id="add-reminder" data-nmls="${esc(b.companyNmls)}" class="panel" style="margin-bottom:14px">
          <h3>New follow-up reminder</h3>
          <div class="field"><label>Next step</label><input name="title" required placeholder="What should the AE do next?"></div>
          <div class="field"><label>Due date</label><input type="date" name="due" required></div>
          <button class="btn primary" type="submit">Add reminder</button>
        </form>
        <div class="due-list">
          ${rems.map(r => `<div class="due-row ${r.completedAt ? "" : dueClass(r.dueDate)}">
            <div><div class="due-date">${fmtDate(r.dueDate)}</div><div class="muted">${r.completedAt ? "Completed " + fmtDateTime(r.completedAt) : dueLabel(r.dueDate)}</div></div>
            <div>${esc(r.title)}${r.previewSeeded ? `<span class="seed-tag">Preview seed</span>` : ""}</div>
            <div>${r.completedAt ? "" : `<button type="button" class="btn small" data-complete="${r.id}">Mark done</button>`}</div>
          </div>`).join("")}
        </div>`;
    } else {
      tabHtml = `
        <div class="grid-2">
          <div class="panel">
            <h3>Shop</h3>
            <p>${esc(b.address || (b.city + ", " + b.state))}</p>
            <p class="muted">Company phone ${esc(b.companyPhone || "—")}</p>
            <p>Primary contact: <strong>${esc(b.primaryContactName || "—")}</strong><br>
              ${esc(b.primaryContactEmail || "")} · ${esc(b.primaryContactPhone || "")}</p>
            <p class="muted">Initial approval ${fmtDate(b.initialApprovalDate)}${b.statusNote ? " · Sheet note: " + esc(b.statusNote) : ""}</p>
            ${b.aliases && b.aliases.length ? `<p class="muted">Also on file as: ${esc(b.aliases.join("; "))}</p>` : ""}
            ${linksHtml(b)}
            ${b.licensedStatesNote ? `<p class="muted">Public / sheet licensing note: ${esc(b.licensedStatesNote)}</p>` : ""}
            <p class="muted">${esc((state.meta && state.meta.licensedStatesNote) || "GVC is licensed in 27 states. CA, NJ, WA, NV, NH, MD, UT and others are not licensed.")} This list is company-wide, not per-shop.</p>
          </div>
          <div class="panel">
            <h3>Next step</h3>
            <form id="edit-next" data-nmls="${esc(b.companyNmls)}">
              <div class="field"><label>Stage</label>
                <select name="stage">${state.stages.map(s => `<option value="${s.id}" ${s.id === b.stage ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>
              </div>
              <div class="field"><label>AE / owner</label>
                <select name="ae">${state.aes.map(a => `<option ${a === b.ae ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>
              </div>
              <div class="field"><label>Next step</label><textarea name="next">${esc(b.nextStep || "")}</textarea></div>
              <div class="field"><label>Due date</label><input type="date" name="due" value="${esc((rem && rem.dueDate) || b.nextDueDate || "")}"></div>
              <button class="btn primary" type="submit">Save changes</button>
              <p class="faint" style="margin-top:8px">Saves to preview localStorage only. Does not update the live roster.</p>
            </form>
          </div>
        </div>
        <div class="panel" style="margin-top:14px">
          <h3>Shop-level fee schedule (from the approved list)</h3>
          <p class="muted">These are shop business terms from the Oct 22 list, not LO or recruit compensation. Hidden from this pane if Brock wants them left out of the CRM.</p>
          <p>Shop comp ${b.shopCompPct != null ? b.shopCompPct.toFixed(2) + "%" : "—"} · UW fee ${b.uwFee != null ? moneyFull(b.uwFee) : "—"}</p>
          <p class="muted">Fees sent ${fmtDate(b.feesSentDate)} · Mortgagee sent ${fmtDate(b.mortgageeSentDate)} · Estimate CD ${fmtDate(b.estimateCdDate)} · CD received ${fmtDate(b.estCdReceivedDate)} · Branch licensing sent ${fmtDate(b.branchLicensingSentDate)}</p>
        </div>`;
    }

    let prodKpi;
    let splitPanel = "";
    if (hasLicensedKpi(b)) {
      const loanLine = b.stateSplit === "zero"
        ? "3-month RETR is $0"
        : `${Number(b.loansLicensed3mo || 0).toLocaleString("en-US")} of ${Number(b.loansStateTotal3mo || 0).toLocaleString("en-US")} loans kept${b.pctKept != null ? " · " + b.pctKept + "% kept" : ""}`;
      prodKpi = `<div class="kpi"><div class="k">Licensed 3-month volume</div><div class="v">${money(b.volumeLicensed3mo)}</div><div class="s">${loanLine}</div></div>`;
      const top = b.topBackedOut
        ? `<div class="backed-out"><strong>Top backed-out states:</strong> ${esc(b.topBackedOut)}</div>`
        : (b.volumeBackedOut3mo ? "" : `<div class="backed-out muted">No volume backed out (100% in licensed states).</div>`);
      splitPanel = `<div class="panel split-panel" style="margin:0 0 16px">
        <h3>Licensed-state backout</h3>
        <p>Total 3-month volume ${moneyFull(b.volumeStateTotal3mo)} · Backed out ${moneyFull(b.volumeBackedOut3mo)}</p>
        ${top}
        <p class="muted">${esc(b.stateSplitNote || (state.meta && state.meta.stateSplitSource) || "")}</p>
      </div>`;
    } else if (b.productionStatus === "has_3mo") {
      prodKpi = `<div class="kpi"><div class="k">3-month volume</div><div class="v">${money(b.volume3mo)}</div><div class="s">${b.activeLos || 0} active LOs · ${Number(b.units3mo || 0).toLocaleString("en-US")} loans</div></div>`;
      splitPanel = `<div class="panel split-panel" style="margin:0 0 16px"><h3>Licensed-state backout</h3><p>State split pending.</p><p class="muted">${esc(b.stateSplitNote || "")}</p></div>`;
    } else if (b.productionStatus === "has_ytd_only") {
      prodKpi = `<div class="kpi"><div class="k">2026 YTD volume</div><div class="v">${money(b.volumeYtd)}</div><div class="s">${b.loCountOffice || b.activeLos} LOs · ${Number(b.unitsYtd).toLocaleString("en-US")} loans · 3-mo pending</div></div>`;
      splitPanel = `<div class="panel split-panel" style="margin:0 0 16px"><h3>Licensed-state backout</h3><p>State split pending.</p><p class="muted">${esc(b.stateSplitNote || "")}</p></div>`;
    } else {
      prodKpi = `<div class="kpi"><div class="k">Production</div><div class="v" style="font-size:18px">Pending</div><div class="s">No RETR extract in this seed</div></div>`;
      splitPanel = `<div class="panel split-panel" style="margin:0 0 16px"><h3>Licensed-state backout</h3><p>State split pending.</p><p class="muted">${esc(b.stateSplitNote || "")}</p></div>`;
    }

    $("#app").innerHTML = `
      <div class="wrap" data-view="detail" data-nmls="${esc(b.companyNmls)}">
        <p class="muted"><a href="#/roster">← Roster</a> · Preview only</p>
        <div class="detail-head">
          <div>
            <h2>${esc(b.name)}</h2>
            <div class="sub">NMLS ${esc(b.companyNmls)} · ${esc(b.city)}, ${esc(b.state)}
              · <span class="stage ${esc(b.stage)}">${esc(stageLabel(b.stage))}</span>
              · <span class="ae-chip ${aeClass(b.ae)}">${esc(b.ae)}</span>
            </div>
            ${linksHtml(b)}
          </div>
        </div>
        ${flagsHtml}
        <div class="kpis">
          ${prodKpi}
          ${hasLicensedKpi(b) ? `<div class="kpi"><div class="k">Total / backed out</div><div class="v">${money(b.volumeBackedOut3mo)}</div><div class="s">backed out of ${moneyFull(b.volumeStateTotal3mo)} total 3 mo</div></div>` : ""}
          <div class="kpi"><div class="k">Contacts</div><div class="v">${b.contactCount}</div><div class="s">Business contacts on the approved list</div></div>
          <div class="kpi"><div class="k">Next due</div><div class="v" style="font-size:20px">${rem ? fmtDate(rem.dueDate) : "—"}</div><div class="s ${rem ? dueClass(rem.dueDate) : ""}">${rem ? dueLabel(rem.dueDate) : "No open reminder"}</div></div>
          ${hasLicensedKpi(b) ? "" : `<div class="kpi"><div class="k">Activity</div><div class="v">${acts.length}</div><div class="s">Notes and preview-seeded log rows</div></div>`}
        </div>
        ${splitPanel}
        ${firstFilePanel(b)}
        <div class="tabs">
          ${[["overview", "Overview"], ["contacts", "Contacts"], ["production", "Production"], ["activity", "Activity log"], ["reminders", "Reminders"]].map(([id, l]) =>
            `<button type="button" class="tab ${tab === id ? "active" : ""}" data-tab="${id}">${l}</button>`).join("")}
        </div>
        ${tabHtml}
      </div>`;
    bindCommon();
    const form = $("#edit-next");
    if (form) form.addEventListener("submit", onSaveNext);
    const af = $("#add-activity");
    if (af) af.addEventListener("submit", onAddActivity);
    const rf = $("#add-reminder");
    if (rf) rf.addEventListener("submit", onAddReminder);
  }


  function firstFilePanel(b) {
    if (!isFirstFileShop(b) && !firstFileOf(b).hasFundedGvcLoan) return "";
    const ff = firstFileOf(b);
    const days = daysSinceApproval(b);
    const quiet = isQuietShop(b);
    const submitted = ff.firstFileSubmittedDate
      ? `${fmtDate(ff.firstFileSubmittedDate)} ${sampleBadge(ff.firstFileSubmittedIsSample)}`
      : "— not submitted";
    return `<div class="panel split-panel first-file-panel" style="margin:0 0 16px">
      <h3>First-file tracker ${quiet ? `<span class="pill warn">Approved but quiet</span>` : `<span class="pill info">First file in process</span>`} ${sampleBadge(true)}</h3>
      <p>Assigned AE: <strong>${esc(ff.assignedAe || b.ae || "—")}</strong> · Days since approval: <strong>${days == null ? "—" : days}</strong> (from ${fmtDate(b.initialApprovalDate)} to ${fmtDate(TODAY)}).</p>
      <p>Target scenario or program to pitch: ${esc(ff.targetScenario || "—")} ${sampleBadge(ff.targetScenarioIsSample)}</p>
      <p>First file submitted: ${submitted}</p>
      <p>Agreed turn-time promise: ${esc(ff.turnTimePromise || "—")} ${placeholderBadge()}</p>
      <p>Direct UW contact: ${esc(ff.uwContactName || "—")} ${placeholderBadge()}</p>
      <p class="muted">Milestone update sent to the broker (yes / no):</p>
      ${milestoneCompact(ff)}
      <p class="muted" style="margin-top:8px">${esc(ff.incentiveNote || "")}</p>
    </div>`;
  }

  function renderFirstFile() {
    const mode = ui.firstFileMode === "all" ? "all" : "quiet";
    let rows = state.brokers.filter(b => mode === "all" ? isFirstFileShop(b) : isQuietShop(b));
    if (ui.firstFileAe) rows = rows.filter(b => b.ae === ui.firstFileAe);
    rows = rows.slice().sort((a, b) => {
      const da = daysSinceApproval(a), db = daysSinceApproval(b);
      if (db == null && da == null) return a.name.localeCompare(b.name);
      if (da == null) return 1;
      if (db == null) return -1;
      if (db !== da) return db - da;
      return a.name.localeCompare(b.name);
    });
    const meta = state.firstFileMeta || (window.BROKER_ROSTER_SEED && window.BROKER_ROSTER_SEED.firstFileMeta) || {};
    const quietCount = state.brokers.filter(isQuietShop).length;
    const allCount = state.brokers.filter(isFirstFileShop).length;
    const inProcess = allCount - quietCount;
    $("#app").innerHTML = `
      <div class="wrap" data-view="first-file" data-shot="first-file">
        <div class="page-head">
          <h2>${mode === "quiet" ? "Approved but quiet" : "First-file tracker"}</h2>
          <p class="muted">${esc(meta.quietRule || "")} Approval dates and AEs are real, including Casey’s nine shops. Target scenarios, sample first-file dates, milestone yes/no flags, the UW contact, and the turn-time promise are SAMPLE or PLACEHOLDER where no real data is on file. Incentives are a PLACEHOLDER pending Brandy and Kirk — do not offer them. No comp promises.</p>
        </div>
        <div class="views">
          <a class="view-chip ${mode === "quiet" ? "active" : ""}" href="#/first-file">Approved but quiet (${quietCount})</a>
          <a class="view-chip ${mode === "all" ? "active" : ""}" href="#/first-file/all">All first files, no funded GVC loan (${allCount})</a>
          <a class="view-chip" href="#/playbook">AE playbook</a>
        </div>
        <div class="filter-bar">
          <label class="muted">Assigned AE
            <select id="ff-ae">
              <option value="">All AEs</option>
              ${(state.aes || []).map(a => `<option value="${esc(a)}" ${ui.firstFileAe === a ? "selected" : ""}>${esc(a)}</option>`).join("")}
            </select>
          </label>
          <span class="muted">${rows.length} shops · ${inProcess} SAMPLE first files in process · 0 funded · oldest approvals first</span>
        </div>
        <div class="table-wrap" data-shot="quiet-table">
          <table class="first-file-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Assigned AE</th>
                <th>Approved</th>
                <th class="num">Days since approval</th>
                <th>Target scenario / program ${sampleBadge(true)}</th>
                <th>First file submitted</th>
                <th>Turn-time promise ${placeholderBadge()}</th>
                <th>Milestone update sent to broker ${sampleBadge(true)}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(b => {
                const ff = firstFileOf(b);
                const days = daysSinceApproval(b);
                const submitted = ff.firstFileSubmittedDate
                  ? `${fmtDate(ff.firstFileSubmittedDate)} ${sampleBadge(ff.firstFileSubmittedIsSample)}`
                  : "—";
                return `<tr data-nmls="${esc(b.companyNmls)}">
                  <td><strong>${esc(b.name)}</strong><div class="faint">NMLS ${esc(b.companyNmls)} · ${esc(b.city || "")}, ${esc(b.state || "")} · ${esc((b.stage || "").toUpperCase())}</div></td>
                  <td>${esc(ff.assignedAe || b.ae || "—")}</td>
                  <td>${fmtDate(b.initialApprovalDate)}</td>
                  <td class="num"><strong>${days == null ? "—" : days}</strong></td>
                  <td>${esc(ff.targetScenario || "—")} ${sampleBadge(ff.targetScenarioIsSample)}</td>
                  <td>${submitted}</td>
                  <td>${esc(ff.turnTimePromise || "—")} ${placeholderBadge()}</td>
                  <td>${milestoneCompact(ff)}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
        ${aboutHtml()}
      </div>`;
    bindCommon();
    const sel = $("#ff-ae");
    if (sel) sel.addEventListener("change", () => {
      ui.firstFileAe = sel.value;
      renderFirstFile();
    });
  }

  function renderPlaybook() {
    const html = (window.BROKER_ROSTER_SEED && window.BROKER_ROSTER_SEED.playbookHtml) || state.playbookHtml || "<p>Playbook is missing.</p>";
    $("#app").innerHTML = `
      <div class="wrap" data-view="playbook" data-shot="playbook">
        <div class="page-head">
          <p class="muted">Preview only. This is the AE talk track for first files and quiet approved shops. It does not send anything, and it is not a price, credit, or compensation promise.</p>
        </div>
        <div class="views">
          <a class="view-chip" href="#/first-file">Approved but quiet</a>
          <a class="view-chip" href="#/first-file/all">First-file tracker</a>
          <a class="view-chip active" href="#/playbook">AE playbook</a>
        </div>
        <article class="panel playbook">${html}</article>
      </div>`;
    bindCommon();
  }

  function aboutHtml() {
    const m = state.meta || {};
    return `<div class="about">
      <h3>About this preview</h3>
      <p>${esc(m.seedingRule)}</p>
      <p style="margin-top:8px">${esc(m.liveDeskNote)}</p>
      <p style="margin-top:8px">${esc((m.licensedStatesNote || "") + " " + (m.stateSplitSource || ""))}</p>
      <p style="margin-top:8px">The first-file tracker and AE playbook are preview tools for shops at Approved or Activated with no funded GVC loan. ${(state.firstFileMeta && state.firstFileMeta.quietRule) || ""}</p>
      <p style="margin-top:8px">localStorage key <code>${STORAGE_KEY}</code> is for this preview only. It is not the system of record. The ASP.NET MVC module uses on-prem MSSQL through Entity Framework. Today is ${fmtDate(TODAY)} ${TZ}.</p>
    </div>`;
  }

  function bindCommon() {
    $all("[data-nmls]").forEach(el => {
      if (el.tagName === "FORM") return;
      el.addEventListener("click", ev => {
        if (ev.target.closest("[data-complete]")) return;
        const id = el.getAttribute("data-nmls");
        if (id) location.hash = "#/broker/" + id;
      });
    });
    $all("[data-go-stage]").forEach(el => {
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        ui.filters.stage = el.getAttribute("data-go-stage");
        ui.activeView = "custom";
        location.hash = "#/roster";
        if ((location.hash || "") === "#/roster") renderRoster();
      });
    });
    $all("[data-view-id]").forEach(el => {
      el.addEventListener("click", () => {
        applyView(el.getAttribute("data-view-id"));
        if ((location.hash || "").indexOf("roster") < 0 && (location.hash || "").indexOf("pipeline") < 0) {
          location.hash = "#/roster";
        }
        route();
      });
    });
    const saveBtn = $("[data-save-view]");
    if (saveBtn) saveBtn.addEventListener("click", onSaveView);
    $all("[data-filter]").forEach(el => {
      const ev = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(ev, () => {
        const key = el.getAttribute("data-filter");
        ui.filters[key] = el.type === "checkbox" ? el.checked : el.value;
        ui.activeView = "custom";
        route();
        // restore focus on search
        if (key === "q") {
          const box = $("[data-filter=q]");
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        }
      });
    });
    $all("[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const k = th.getAttribute("data-sort");
        if (ui.sort.key === k) ui.sort.dir *= -1;
        else { ui.sort.key = k; ui.sort.dir = 1; }
        renderRoster();
      });
    });
    $all("[data-complete]").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.stopPropagation();
        completeReminder(Number(btn.getAttribute("data-complete")));
      });
    });
    $all("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        ui.detailTab = btn.getAttribute("data-tab");
        route();
      });
    });
  }

  function onSaveNext(ev) {
    ev.preventDefault();
    const form = ev.target;
    const nmls = form.getAttribute("data-nmls");
    const b = brokerByNmls(nmls);
    const stage = form.stage.value;
    const ae = form.ae.value;
    const next = form.next.value.trim();
    const due = form.due.value;
    const changes = [];
    if (stage !== b.stage) { changes.push("Stage " + stageLabel(b.stage) + " → " + stageLabel(stage)); b.stage = stage; }
    if (ae !== b.ae) { changes.push("AE " + b.ae + " → " + ae); b.ae = ae; }
    if (next !== (b.nextStep || "")) { changes.push("Next step updated"); b.nextStep = next; }
    b.nextDueDate = due || null;
    let rem = openReminder(b);
    if (due || next) {
      if (!rem) {
        rem = { id: nextId(state.reminders), companyNmls: String(nmls), title: next || "Follow up", dueDate: due || TODAY, completedAt: null, createdBy: "Preview user", previewSeeded: false };
        state.reminders.push(rem);
        changes.push("Reminder added");
      } else {
        rem.title = next || rem.title;
        rem.dueDate = due || rem.dueDate;
      }
    }
    if (changes.length) addActivity(nmls, "note", changes.join(". ") + ".");
    saveState();
    toast("Saved in preview localStorage only");
    route();
  }

  function onAddActivity(ev) {
    ev.preventDefault();
    const form = ev.target;
    const nmls = form.getAttribute("data-nmls");
    const body = form.body.value.trim();
    if (!body) return;
    addActivity(nmls, form.type.value, body, false);
    saveState();
    form.body.value = "";
    toast("Activity added in this preview");
    ui.detailTab = "activity";
    route();
  }

  function onAddReminder(ev) {
    ev.preventDefault();
    const form = ev.target;
    const nmls = form.getAttribute("data-nmls");
    const title = form.title.value.trim();
    const due = form.due.value;
    state.reminders.push({
      id: nextId(state.reminders), companyNmls: String(nmls), title, dueDate: due,
      completedAt: null, createdBy: "Preview user", previewSeeded: false
    });
    const b = brokerByNmls(nmls);
    if (b && !openReminder(b)) { /* already pushed as open */ }
    if (b) { b.nextStep = b.nextStep || title; b.nextDueDate = b.nextDueDate || due; }
    addActivity(nmls, "note", "Reminder added: " + title + " due " + fmtDate(due) + ".");
    saveState();
    toast("Reminder added in this preview");
    ui.detailTab = "reminders";
    route();
  }

  function completeReminder(id) {
    const r = state.reminders.find(x => Number(x.id) === Number(id));
    if (!r || r.completedAt) return;
    r.completedAt = new Date().toISOString();
    const b = brokerByNmls(r.companyNmls);
    if (b) {
      const next = openReminder(b);
      b.nextStep = next ? next.title : "";
      b.nextDueDate = next ? next.dueDate : null;
    }
    addActivity(r.companyNmls, "note", "Reminder completed: " + r.title);
    saveState();
    toast("Reminder marked done in this preview");
    route();
  }

  function onSaveView() {
    const name = prompt("Name this saved view (stored in preview localStorage only):");
    if (!name) return;
    const id = "custom-" + Date.now();
    customViews.push({ id, name: name.trim(), system: false, filters: clone(ui.filters) });
    saveCustomViews();
    ui.activeView = id;
    toast("View saved in this preview");
    route();
  }

  function resetPreview() {
    localStorage.removeItem(STORAGE_KEY);
    state = clone(window.BROKER_ROSTER_SEED);
    toast("Preview reset to the current seed");
    route();
  }

  function bindChrome() {
    $("#reset-preview").addEventListener("click", () => $("#reset-modal").classList.add("show"));
    $("#reset-cancel").addEventListener("click", () => $("#reset-modal").classList.remove("show"));
    $("#reset-ok").addEventListener("click", () => {
      $("#reset-modal").classList.remove("show");
      resetPreview();
    });
  }

  window.addEventListener("hashchange", route);
  if (!window.BROKER_ROSTER_SEED) {
    document.getElementById("app").innerHTML = "<div class='wrap'><p>Preview seed failed to load (seed.js).</p></div>";
    return;
  }
  bindChrome();
  if (!location.hash) location.hash = "#/pipeline";
  else route();
})();
