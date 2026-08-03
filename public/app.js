/* ============================================================
   EDI 834 Generator & Interactive Editor — client application
   ============================================================ */

/* ---------- generic utils ---------- */

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escapeAttr(str) {
  // Used inside both double- and single-quoted attributes across the templates,
  // so both quote characters need escaping regardless of which wraps a given
  // attribute (e.g. an error message containing a literal " would otherwise
  // terminate a title="..." attribute early and truncate the tooltip).
  return String(str ?? "").replace(/['"]/g, (c) => (c === "'" ? "&#39;" : "&quot;"));
}

function pad(str, len, char = " ") {
  return String(str ?? "").slice(0, len).padEnd(len, char);
}

function padNum(str, len) {
  return String(str ?? "").replace(/\D/g, "").slice(-len).padStart(len, "0") || "0".repeat(len);
}

function getPath(obj, path) {
  if (!path) return obj;
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
}

function resolveArrayIndex(root, path) {
  const keys = path.split(".");
  const idx = Number(keys.pop());
  const arr = keys.reduce((acc, key) => acc[key], root);
  return { arr, idx };
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

/* ---------- caret helpers for contenteditable raw editor ---------- */

function getCaretCharOffset(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const preRange = document.createRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function setCaretCharOffset(el, offset) {
  const range = document.createRange();
  const sel = window.getSelection();
  let remaining = offset;
  let node = null;
  let nodeOffset = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const len = n.textContent.length;
    node = n;
    if (remaining <= len) {
      nodeOffset = remaining;
      break;
    }
    remaining -= len;
    nodeOffset = len;
  }
  if (!node) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    range.setStart(node, nodeOffset);
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ---------- blank data factories ---------- */

function createBlankCoverage() {
  return {
    lobKey: "",
    maintenanceTypeCode: "021",
    coverageLevelCode: "IND",
    startDate: "",
    endDate: "",
    customRefValue: "",
    // Loop 2300 AMT — premium/payment amount
    premiumAmount: "",
    // Loop 2310 — provider tied to this coverage
    providerName: "",
    providerNpi: "",
    providerPhone: "",
    // Loop 2320/2330 — coordination of benefits (other payer)
    cobPayerResponsibilityCode: "",
    cobOtherPayerName: "",
    cobOtherPayerId: "",
    // REF*18 — HIOS plan identifier (ACA marketplace plan ID)
    hiosId: "",
  };
}

function createBlankReportingCategory() {
  // DTP*007 here is this category's own effective date — distinct from the
  // member-level DTP*007 (maintenanceEffectiveDate) used outside any reporting category.
  return { description: "", refQualifier: "", refValue: "", effectiveDate: "" };
}

function createBlankAdditionalRef() {
  return { qualifier: "", value: "" };
}

function createBlankLanguages() {
  // LUI*LE*{code}**{5|6|7} — a fixed slot per proficiency type (5=Speak, 6=Write,
  // 7=Read), each independently emitted only if a language code is set.
  return { speak: "", write: "", read: "" };
}

function createBlankMember() {
  return {
    memberId: "",
    relationshipCode: "18",
    maintenanceTypeCode: "021",
    // DTP*007 — date this maintenance action (add/change/term) takes effect
    maintenanceEffectiveDate: "",
    firstName: "",
    lastName: "",
    middleName: "",
    ssn: "",
    gender: "U",
    dob: "",
    // LUI*LE — member's preferred language, one per proficiency type
    languages: createBlankLanguages(),
    address: { line1: "", city: "", state: "", zip: "" },
    // Loop 2100C — mailing address, only emitted if different from the address above
    mailingAddress: { line1: "", city: "", state: "", zip: "" },
    // Loop 2100F — guardian/financially-responsible party
    responsibleParty: { firstName: "", lastName: "", address: { line1: "", city: "", state: "", zip: "" } },
    // PER*IP — member's own contact info (distinct from the provider's PER*IC)
    phone: "",
    email: "",
    coverages: [createBlankCoverage()],
    dependents: [],
    // additional REF segments beyond REF*0F (group number, case number, etc.)
    additionalRefs: [],
    // Loop 2700/2750 — reporting categories
    reportingCategories: [],
  };
}

function createBlankDependent() {
  const m = createBlankMember();
  m.relationshipCode = "19";
  delete m.dependents;
  return m;
}

function createBlankEdi() {
  return {
    header: {
      senderId: "SENDERID",
      receiverId: "RECEIVERID",
      controlNumber: "1",
      usageIndicator: "T",
      sponsorName: "",
      sponsorId: "",
      payerName: "",
      payerId: "",
    },
    members: [createBlankMember()],
  };
}

// Fills in any fields missing from older-shaped data (saved files or localStorage
// snapshots written before a given field existed) with their blank-factory defaults,
// so loading legacy data never leaves e.g. `reportingCategories` undefined.
function normalizeCoverage(coverage) {
  return { ...createBlankCoverage(), ...coverage };
}
function normalizeReportingCategory(rc) {
  return { ...createBlankReportingCategory(), ...rc };
}
function normalizeAdditionalRef(ref) {
  return { ...createBlankAdditionalRef(), ...ref };
}
function normalizePerson(person, isDependent) {
  const blank = isDependent ? createBlankDependent() : createBlankMember();
  const merged = { ...blank, ...person };
  merged.address = { ...blank.address, ...(person.address || {}) };
  merged.mailingAddress = { ...blank.mailingAddress, ...(person.mailingAddress || {}) };
  merged.responsibleParty = {
    ...blank.responsibleParty,
    ...(person.responsibleParty || {}),
    address: { ...blank.responsibleParty.address, ...(person.responsibleParty?.address || {}) },
  };
  merged.coverages = (person.coverages && person.coverages.length > 0 ? person.coverages : blank.coverages).map(normalizeCoverage);
  merged.reportingCategories = (person.reportingCategories || []).map(normalizeReportingCategory);
  merged.additionalRefs = (person.additionalRefs || []).map(normalizeAdditionalRef);
  // Migrate through every historical language shape this app has used:
  //  v1: languageCode (single string)
  //  v2: languages: [{ code, proficiency }] (repeatable list)
  //  v3 (current): languages: { speak, write, read } (fixed slots)
  const blankLangs = createBlankLanguages();
  const upper = (v) => (v ? String(v).toUpperCase() : v);
  if (person.languages && !Array.isArray(person.languages) && typeof person.languages === "object") {
    const merged2 = { ...blankLangs, ...person.languages };
    merged.languages = { speak: upper(merged2.speak), write: upper(merged2.write), read: upper(merged2.read) };
  } else if (Array.isArray(person.languages) && person.languages.length > 0) {
    const migrated = { ...blankLangs };
    person.languages.forEach((lang) => {
      const prof = (lang.proficiency || "").toUpperCase();
      const code = upper(lang.code);
      if (prof === "SPEAK") migrated.speak = code || migrated.speak;
      else if (prof === "WRITE") migrated.write = code || migrated.write;
      else if (prof === "READ") migrated.read = code || migrated.read;
      else if (code) { migrated.speak ||= code; migrated.write ||= code; migrated.read ||= code; }
    });
    merged.languages = migrated;
  } else if (person.languageCode) {
    const code = upper(person.languageCode);
    merged.languages = { speak: code, write: code, read: code };
  } else {
    merged.languages = blankLangs;
  }
  delete merged.languageCode;
  if (!isDependent) {
    merged.dependents = (person.dependents || []).map((d) => normalizePerson(d, true));
  } else {
    delete merged.dependents;
  }
  return merged;
}
function normalizeEdi(edi) {
  const blank = createBlankEdi();
  if (!edi) return blank;
  const merged = { ...blank, ...edi };
  merged.header = { ...blank.header, ...(edi.header || {}) };
  merged.members = (edi.members && edi.members.length > 0 ? edi.members : blank.members).map((m) => normalizePerson(m, false));
  return merged;
}

function createTab(initial) {
  return {
    id: (initial && initial.id) || uuid(),
    meta: {
      title: (initial && initial.meta && initial.meta.title) || "New 834 Document",
      description: (initial && initial.meta && initial.meta.description) || "",
    },
    edi: normalizeEdi((initial && initial.edi) || createBlankEdi()),
    isDirty: false,
    rawText: "",
    fieldLineMap: {},
    lineSegments: [],
    uiState: { collapsed: new Set(), selectedPath: (initial && initial.selectedPath) || "header" },
  };
}

/* ---------- global app settings (theme + raw text display) ---------- */

const APP_SETTINGS_STORAGE_KEY = "edi834_app_settings_v1";

const appSettings = {
  theme: "system", // "light" | "dark" | "system" — app chrome (sidebar/tabs/form/modals)
  editorTheme: "system", // "light" | "dark" | "system" — raw editor pane, independent of theme above
  lineBreaksEnabled: false, // insert a line break after each segment's trailing ~
  wrapEnabled: true, // wrap long lines instead of scrolling horizontally
};

function loadAppSettings() {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system") {
      appSettings.theme = parsed.theme;
    }
    if (parsed.editorTheme === "light" || parsed.editorTheme === "dark" || parsed.editorTheme === "system") {
      appSettings.editorTheme = parsed.editorTheme;
    }
    if (typeof parsed.lineBreaksEnabled === "boolean") appSettings.lineBreaksEnabled = parsed.lineBreaksEnabled;
    if (typeof parsed.wrapEnabled === "boolean") appSettings.wrapEnabled = parsed.wrapEnabled;
  } catch {
    // localStorage unavailable or corrupt — fall back to defaults
  }
}

function persistAppSettings() {
  try {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
  } catch {
    // localStorage unavailable — settings still apply for this session, just won't persist
  }
}

const systemDarkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

// App chrome (.dark) and editor pane (.editor-dark) are independent classes on
// <html>, each driven by its own setting — either can be Light/Dark/System without
// affecting the other.
function applyTheme() {
  const isDark = appSettings.theme === "dark" || (appSettings.theme === "system" && systemDarkMediaQuery.matches);
  document.documentElement.classList.toggle("dark", isDark);
}

function applyEditorTheme() {
  const isDark = appSettings.editorTheme === "dark" || (appSettings.editorTheme === "system" && systemDarkMediaQuery.matches);
  document.documentElement.classList.toggle("editor-dark", isDark);
}

systemDarkMediaQuery.addEventListener("change", () => {
  if (appSettings.theme === "system") applyTheme();
  if (appSettings.editorTheme === "system") applyEditorTheme();
});

// These two prefs purely control how segments are joined/displayed in the raw
// editor pane (separate from its Light/Dark/System theme above).
function applyRawEditorDisplayPrefs() {
  if (!el.rawEditor) return;
  el.rawEditor.classList.toggle("no-line-breaks", !appSettings.lineBreaksEnabled);
  el.rawEditor.style.whiteSpace = appSettings.wrapEnabled ? "pre-wrap" : "pre";
  // Most segments (NM1*IL*1*Doe*Jane...) have no spaces at all, so pre-wrap alone
  // has no break opportunity and won't actually wrap them — only overflow-wrap lets
  // the browser break mid-segment when a line is wider than the container.
  el.rawEditor.style.overflowWrap = appSettings.wrapEnabled ? "anywhere" : "normal";
}

/* ---------- workspace persistence (localStorage) ---------- */
// Remembers every open tab — including unsaved edits and which tab is active —
// so a page reload restores the workspace exactly as it was left, not just
// whatever is on the server. Hooked into renderTabBar() since every tab
// mutation (open/close/switch/edit/save) already calls it.

const WORKSPACE_STORAGE_KEY = "edi834_workspace_v1";

function persistWorkspace() {
  try {
    const snapshot = {
      activeTabId: state.activeTabId,
      tabs: state.tabs.map((t) => ({
        id: t.id,
        meta: t.meta,
        edi: t.edi,
        isDirty: t.isDirty,
        collapsed: Array.from(t.uiState.collapsed),
        selectedPath: t.uiState.selectedPath,
      })),
    };
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage unavailable (private browsing, quota exceeded) — persistence is best-effort
  }
}

function restoreWorkspaceFromStorage() {
  let raw;
  try {
    raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    return;
  }
  if (!snapshot || !Array.isArray(snapshot.tabs)) return;

  state.tabs = snapshot.tabs.map((t) => {
    const tab = createTab({ id: t.id, meta: t.meta, edi: t.edi, selectedPath: t.selectedPath });
    tab.isDirty = !!t.isDirty;
    tab.uiState.collapsed = new Set(t.collapsed || []);
    return tab;
  });
  state.activeTabId = state.tabs.some((t) => t.id === snapshot.activeTabId)
    ? snapshot.activeTabId
    : (state.tabs[0] ? state.tabs[0].id : null);
}

/* ---------- LOB mappings (localStorage) ---------- */

const LOB_MAPPINGS_STORAGE_KEY = "edi834_lob_mappings_v1";

const DEFAULT_LOB_MAPPINGS = {
  rules: [
    { id: "medical", displayName: "Medical", code: "HLT", hasCustomRef: true, refQualifier: "CE", refLabel: "Class of Contract Code" },
    { id: "dental", displayName: "Dental", code: "DEN", hasCustomRef: false, refQualifier: "", refLabel: "" },
    { id: "vision", displayName: "Vision", code: "VIS", hasCustomRef: false, refQualifier: "", refLabel: "" },
  ],
};

function loadLobMappings() {
  try {
    const raw = localStorage.getItem(LOB_MAPPINGS_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_LOB_MAPPINGS));
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rules)) return parsed;
  } catch {
    // localStorage unavailable or corrupt — fall back to defaults
  }
  return JSON.parse(JSON.stringify(DEFAULT_LOB_MAPPINGS));
}

function persistLobMappings(mappings) {
  try {
    localStorage.setItem(LOB_MAPPINGS_STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // localStorage unavailable — mappings still apply for this session, just won't persist
  }
}

// LUI*LE*{code}**{num} — fixed proficiency slots, shared by the compiler and parser.
const LANGUAGE_PROFICIENCY_TO_NUM = { speak: "5", write: "6", read: "7" };
const LANGUAGE_NUM_TO_PROFICIENCY = { 5: "speak", 6: "write", 7: "read" };

/* ============================================================
   EDI COMPILER  (structured state -> raw X12-ish text + line map)
   ============================================================ */

function compileEDI(edi, lobMappings) {
  const segments = []; // { text, fields: [[path, elementIndex], ...], valid: true }
  const fieldLineMap = {}; // path -> { lineIndex, elementIndex }

  function push(text, fields = [], colorIndex = null) {
    const lineIndex = segments.length;
    segments.push({ text, fields, valid: true, colorIndex });
    fields.forEach(([path, elementIndex]) => { fieldLineMap[path] = { lineIndex, elementIndex }; });
    return lineIndex;
  }

  const lobByKey = {};
  (lobMappings.rules || []).forEach((r) => { lobByKey[r.id] = r; });

  const h = edi.header || {};
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const MI = String(now.getMinutes()).padStart(2, "0");
  const isaDate = `${yy}${mm}${dd}`;
  const ccyymmdd = `${now.getFullYear()}${mm}${dd}`;
  const hhmm = `${HH}${MI}`;
  const controlPadded = padNum(h.controlNumber || "1", 9);

  push(
    `ISA*00*${pad("", 10)}*00*${pad("", 10)}*ZZ*${pad(h.senderId, 15)}*ZZ*${pad(h.receiverId, 15)}*${isaDate}*${hhmm}*^*00501*${controlPadded}*0*${h.usageIndicator || "T"}*:~`,
    [["header.senderId", 6], ["header.receiverId", 8], ["header.controlNumber", 13]]
  );
  push(
    `GS*BE*${h.senderId || ""}*${h.receiverId || ""}*${ccyymmdd}*${hhmm}*${padNum(h.controlNumber || "1", 1)}*X*005010X220A1~`,
    []
  );
  const stIndex = push(`ST*834*0001~`, []);
  push(`BGN*00*${padNum(h.controlNumber || "1", 1)}*${ccyymmdd}*${hhmm}***4~`, []);
  push(`N1*P5*${h.sponsorName || ""}*FI*${h.sponsorId || ""}~`, [["header.sponsorName", 2], ["header.sponsorId", 4]]);
  push(`N1*IN*${h.payerName || ""}*FI*${h.payerId || ""}~`, [["header.payerName", 2], ["header.payerId", 4]]);

  function emitCoverage(coverage, coveragePath, colorIndex) {
    const rule = lobByKey[coverage.lobKey];
    const lobCode = rule ? rule.code : "";
    const planDesc = rule ? rule.displayName : "";
    push(
      `HD*${coverage.maintenanceTypeCode || ""}**${lobCode}*${planDesc}*${coverage.coverageLevelCode || ""}~`,
      [[`${coveragePath}.maintenanceTypeCode`, 1], [`${coveragePath}.lobKey`, 3], [`${coveragePath}.coverageLevelCode`, 5]],
      colorIndex
    );
    if (coverage.startDate) {
      push(`DTP*348*D8*${coverage.startDate.replace(/-/g, "")}~`, [[`${coveragePath}.startDate`, 3]], colorIndex);
    }
    if (coverage.endDate) {
      push(`DTP*349*D8*${coverage.endDate.replace(/-/g, "")}~`, [[`${coveragePath}.endDate`, 3]], colorIndex);
    }
    if (rule && rule.hasCustomRef) {
      push(`REF*${rule.refQualifier || "ZZ"}*${coverage.customRefValue || ""}~`, [[`${coveragePath}.customRefValue`, 2]], colorIndex);
    }
    // REF*18 — HIOS plan identifier (ACA marketplace plan ID)
    if (coverage.hiosId) {
      push(`REF*18*${coverage.hiosId}~`, [[`${coveragePath}.hiosId`, 2]], colorIndex);
    }
    // AMT — premium/payment amount
    if (coverage.premiumAmount) {
      push(`AMT*P5*${coverage.premiumAmount}~`, [[`${coveragePath}.premiumAmount`, 2]], colorIndex);
    }
    // Loop 2310 — provider tied to this coverage
    if (coverage.providerName || coverage.providerNpi) {
      push(`LX*1~`, [], colorIndex);
      push(
        `NM1*P3*2*${coverage.providerName || ""}*****XX*${coverage.providerNpi || ""}~`,
        [[`${coveragePath}.providerName`, 3], [`${coveragePath}.providerNpi`, 9]],
        colorIndex
      );
      if (coverage.providerPhone) {
        push(`PER*IC**TE*${coverage.providerPhone}~`, [[`${coveragePath}.providerPhone`, 4]], colorIndex);
      }
    }
    // Loop 2320/2330 — coordination of benefits (other payer)
    if (coverage.cobPayerResponsibilityCode || coverage.cobOtherPayerName) {
      push(`COB*${coverage.cobPayerResponsibilityCode || ""}~`, [[`${coveragePath}.cobPayerResponsibilityCode`, 1]], colorIndex);
      push(
        `NM1*IN*2*${coverage.cobOtherPayerName || ""}*****PI*${coverage.cobOtherPayerId || ""}~`,
        [[`${coveragePath}.cobOtherPayerName`, 3], [`${coveragePath}.cobOtherPayerId`, 9]],
        colorIndex
      );
    }
  }

  function emitPerson(person, personPath, subscriberFlag, colorIndex) {
    push(
      `INS*${subscriberFlag}*${person.relationshipCode || ""}*${person.maintenanceTypeCode || ""}*AI***FT~`,
      [[`${personPath}.relationshipCode`, 2], [`${personPath}.maintenanceTypeCode`, 3]],
      colorIndex
    );
    if (person.maintenanceEffectiveDate) {
      push(
        `DTP*007*D8*${person.maintenanceEffectiveDate.replace(/-/g, "")}~`,
        [[`${personPath}.maintenanceEffectiveDate`, 3]],
        colorIndex
      );
    }
    push(`REF*0F*${person.memberId || ""}~`, [[`${personPath}.memberId`, 2]], colorIndex);
    (person.additionalRefs || []).forEach((ref, ri) => {
      if (!ref.qualifier && !ref.value) return;
      const refPath = `${personPath}.additionalRefs.${ri}`;
      push(`REF*${ref.qualifier || ""}*${ref.value || ""}~`, [[`${refPath}.qualifier`, 1], [`${refPath}.value`, 2]], colorIndex);
    });
    ["speak", "write", "read"].forEach((key) => {
      const code = person.languages?.[key];
      if (!code) return;
      push(
        `LUI*LE*${code}**${LANGUAGE_PROFICIENCY_TO_NUM[key]}~`,
        [[`${personPath}.languages.${key}`, 2]],
        colorIndex
      );
    });
    push(
      `NM1*IL*1*${person.lastName || ""}*${person.firstName || ""}*${person.middleName || ""}***34*${person.ssn || ""}~`,
      [[`${personPath}.lastName`, 3], [`${personPath}.firstName`, 4], [`${personPath}.middleName`, 5], [`${personPath}.ssn`, 9]],
      colorIndex
    );
    push(`DMG*D8*${(person.dob || "").replace(/-/g, "")}*${person.gender || ""}~`, [[`${personPath}.dob`, 2], [`${personPath}.gender`, 3]], colorIndex);
    push(`N3*${person.address?.line1 || ""}~`, [[`${personPath}.address.line1`, 1]], colorIndex);
    push(
      `N4*${person.address?.city || ""}*${person.address?.state || ""}*${person.address?.zip || ""}~`,
      [[`${personPath}.address.city`, 1], [`${personPath}.address.state`, 2], [`${personPath}.address.zip`, 3]],
      colorIndex
    );
    // Loop 2100C — mailing address, only if it differs from (or supplements) the address above
    const mail = person.mailingAddress;
    if (mail && (mail.line1 || mail.city || mail.state || mail.zip)) {
      push(`NM1*31*2~`, [], colorIndex);
      push(`N3*${mail.line1 || ""}~`, [[`${personPath}.mailingAddress.line1`, 1]], colorIndex);
      push(
        `N4*${mail.city || ""}*${mail.state || ""}*${mail.zip || ""}~`,
        [[`${personPath}.mailingAddress.city`, 1], [`${personPath}.mailingAddress.state`, 2], [`${personPath}.mailingAddress.zip`, 3]],
        colorIndex
      );
    }
    // Loop 2100F — guardian / financially-responsible party
    const resp = person.responsibleParty;
    if (resp && (resp.firstName || resp.lastName || resp.address?.line1 || resp.address?.city)) {
      push(
        `NM1*GD*1*${resp.lastName || ""}*${resp.firstName || ""}~`,
        [[`${personPath}.responsibleParty.lastName`, 3], [`${personPath}.responsibleParty.firstName`, 4]],
        colorIndex
      );
      push(`N3*${resp.address?.line1 || ""}~`, [[`${personPath}.responsibleParty.address.line1`, 1]], colorIndex);
      push(
        `N4*${resp.address?.city || ""}*${resp.address?.state || ""}*${resp.address?.zip || ""}~`,
        [
          [`${personPath}.responsibleParty.address.city`, 1],
          [`${personPath}.responsibleParty.address.state`, 2],
          [`${personPath}.responsibleParty.address.zip`, 3],
        ],
        colorIndex
      );
    }
    if (person.phone || person.email) {
      const parts = ["PER", "IP", ""];
      const contactFields = [];
      if (person.phone) {
        parts.push("TE", person.phone);
        contactFields.push([`${personPath}.phone`, parts.length - 1]);
      }
      if (person.email) {
        parts.push("EM", person.email);
        contactFields.push([`${personPath}.email`, parts.length - 1]);
      }
      push(`${parts.join("*")}~`, contactFields, colorIndex);
    }
    (person.coverages || []).forEach((coverage, ci) => {
      emitCoverage(coverage, `${personPath}.coverages.${ci}`, colorIndex);
    });

    // Loop 2700/2750 — reporting categories (wrapped in an LS...LE loop). Each
    // category starts with its own LX assigned number (1, 2, 3...) and ends with
    // an optional DTP*007 effective date, only emitted if one was entered.
    if ((person.reportingCategories || []).length > 0) {
      push(`LS*2700~`, [], colorIndex);
      person.reportingCategories.forEach((rc, rci) => {
        const rcPath = `${personPath}.reportingCategories.${rci}`;
        push(`LX*${rci + 1}~`, [], colorIndex);
        push(`N1*75*${rc.description || ""}~`, [[`${rcPath}.description`, 2]], colorIndex);
        push(`REF*${rc.refQualifier || ""}*${rc.refValue || ""}~`, [[`${rcPath}.refQualifier`, 1], [`${rcPath}.refValue`, 2]], colorIndex);
        if (rc.effectiveDate) {
          push(`DTP*007*D8*${rc.effectiveDate.replace(/-/g, "")}~`, [[`${rcPath}.effectiveDate`, 3]], colorIndex);
        }
      });
      push(`LE*2700~`, [], colorIndex);
    }
  }

  (edi.members || []).forEach((member, mi) => {
    const personPath = `members.${mi}`;
    emitPerson(member, personPath, "Y", mi);
    (member.dependents || []).forEach((dep, di) => {
      emitPerson(dep, `${personPath}.dependents.${di}`, "N", mi);
    });
  });

  const transactionSegCount = segments.length - stIndex + 1;
  push(`SE*${transactionSegCount}*0001~`, []);
  push(`GE*1*${padNum(h.controlNumber || "1", 1)}~`, []);
  push(`IEA*1*${controlPadded}~`, []);

  const text = segments.map((s) => s.text).join("\n");
  return { text, segments, fieldLineMap };
}

/* ============================================================
   EDI PARSER  (raw text -> structured state + line map + errors)
   ============================================================ */

// Splits raw EDI text into one entry per segment using the X12 segment terminator (~)
// rather than newlines, so parsing works identically whether the text has a line
// break after every segment, is one continuous line, or anything in between.
function tokenizeSegments(text) {
  const parts = text.split("~");
  const lines = [];
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const trimmed = parts[i].trim();
    if (isLast) {
      if (trimmed !== "") lines.push(trimmed);
    } else {
      lines.push(trimmed + "~");
    }
  }
  return lines;
}

function parseEDI(text, lobMappings) {
  const rawLines = tokenizeSegments(text);
  const edi = createBlankEdi();
  edi.members = [];
  const errors = [];
  const lineMeta = []; // { fields: [[path, elementIndex], ...], valid }

  const lobByCode = {};
  (lobMappings.rules || []).forEach((r) => { lobByCode[r.code] = r; });

  let currentMember = null;
  let memberIndex = -1;
  let currentPerson = null;
  let dependentIndex = -1;
  let currentCoverage = null;
  let coverageIndex = -1;
  let isDependentContext = false;
  let currentReportingCategory = null;
  let reportingCategoryIndex = -1;
  let addressTarget = "primary"; // "primary" | "mailing" | "responsible" — which N3/N4 pair is next

  function personPath() {
    return isDependentContext ? `members.${memberIndex}.dependents.${dependentIndex}` : `members.${memberIndex}`;
  }
  function coveragePath() {
    return `${personPath()}.coverages.${coverageIndex}`;
  }

  rawLines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/~\s*$/, "").trim();
    if (!line) {
      lineMeta[idx] = { fields: [], valid: true };
      return;
    }
    const elements = line.split("*");
    const tag = elements[0].toUpperCase();

    try {
      switch (tag) {
        case "ISA": {
          if (elements.length < 14) throw new Error("ISA segment is missing required elements");
          edi.header.senderId = (elements[6] || "").trim();
          edi.header.receiverId = (elements[8] || "").trim();
          edi.header.controlNumber = (elements[13] || "").replace(/^0+(?=\d)/, "");
          lineMeta[idx] = {
            fields: [["header.senderId", 6], ["header.receiverId", 8], ["header.controlNumber", 13]],
            valid: true,
          };
          break;
        }
        case "GS":
        case "ST":
        case "BGN":
        case "SE":
        case "GE":
        case "IEA":
          lineMeta[idx] = { fields: [], valid: true };
          break;
        case "N1": {
          if (elements.length < 3) throw new Error("N1 segment requires an entity identifier and name");
          if (elements[1] === "P5") {
            edi.header.sponsorName = elements[2] || "";
            edi.header.sponsorId = elements[4] || "";
            lineMeta[idx] = { fields: [["header.sponsorName", 2], ["header.sponsorId", 4]], valid: true };
          } else if (elements[1] === "IN") {
            edi.header.payerName = elements[2] || "";
            edi.header.payerId = elements[4] || "";
            lineMeta[idx] = { fields: [["header.payerName", 2], ["header.payerId", 4]], valid: true };
          } else if (elements[1] === "75") {
            if (!currentPerson) throw new Error("N1*75 (Reporting Category) segment found before any INS (member) segment");
            const rc = createBlankReportingCategory();
            rc.description = elements[2] || "";
            currentPerson.reportingCategories.push(rc);
            reportingCategoryIndex = currentPerson.reportingCategories.length - 1;
            currentReportingCategory = rc;
            lineMeta[idx] = {
              fields: [[`${personPath()}.reportingCategories.${reportingCategoryIndex}.description`, 2]],
              valid: true,
              colorIndex: memberIndex,
            };
          } else {
            lineMeta[idx] = { fields: [], valid: true };
          }
          break;
        }
        case "INS": {
          if (elements.length < 4) throw new Error("INS segment requires subscriber flag, relationship code, and maintenance type code");
          const subscriberFlag = elements[1];
          const person = {
            memberId: "", relationshipCode: elements[2] || "", maintenanceTypeCode: elements[3] || "",
            maintenanceEffectiveDate: "",
            firstName: "", lastName: "", middleName: "", ssn: "", gender: "", dob: "", languages: createBlankLanguages(),
            address: { line1: "", city: "", state: "", zip: "" },
            mailingAddress: { line1: "", city: "", state: "", zip: "" },
            responsibleParty: { firstName: "", lastName: "", address: { line1: "", city: "", state: "", zip: "" } },
            phone: "", email: "",
            coverages: [], additionalRefs: [], reportingCategories: [],
          };
          if (subscriberFlag === "Y" || !currentMember) {
            person.dependents = [];
            edi.members.push(person);
            memberIndex = edi.members.length - 1;
            currentMember = person;
            isDependentContext = false;
          } else {
            currentMember.dependents.push(person);
            dependentIndex = currentMember.dependents.length - 1;
            isDependentContext = true;
          }
          currentPerson = person;
          currentCoverage = null;
          coverageIndex = -1;
          currentReportingCategory = null;
          reportingCategoryIndex = -1;
          addressTarget = "primary";
          lineMeta[idx] = {
            fields: [[`${personPath()}.relationshipCode`, 2], [`${personPath()}.maintenanceTypeCode`, 3]],
            valid: true,
            colorIndex: memberIndex,
          };
          break;
        }
        case "LS": {
          if (!currentPerson) throw new Error("LS segment found before any INS (member) segment");
          currentReportingCategory = null;
          reportingCategoryIndex = -1;
          lineMeta[idx] = { fields: [], valid: true, colorIndex: memberIndex };
          break;
        }
        case "LE": {
          currentReportingCategory = null;
          reportingCategoryIndex = -1;
          lineMeta[idx] = { fields: [], valid: true, colorIndex: currentPerson ? memberIndex : null };
          break;
        }
        case "LX": {
          lineMeta[idx] = { fields: [], valid: true, colorIndex: currentPerson ? memberIndex : null };
          break;
        }
        case "LUI": {
          if (!currentPerson) throw new Error("LUI segment found before any INS (member) segment");
          if (elements[1] !== "LE") throw new Error(`Unsupported LUI qualifier "${elements[1] || ""}" (expected "LE")`);
          const profKey = LANGUAGE_NUM_TO_PROFICIENCY[elements[4]];
          if (!profKey) {
            throw new Error(`Unsupported LUI proficiency code "${elements[4] || ""}" (expected 5=Speak, 6=Write, 7=Read)`);
          }
          currentPerson.languages[profKey] = elements[2] || "";
          lineMeta[idx] = {
            fields: [[`${personPath()}.languages.${profKey}`, 2]],
            valid: true,
            colorIndex: memberIndex,
          };
          break;
        }
        case "REF": {
          if (!currentPerson) throw new Error("REF segment found before any INS (member) segment");
          if (elements[1] === "0F") {
            currentPerson.memberId = elements[2] || "";
            lineMeta[idx] = { fields: [[`${personPath()}.memberId`, 2]], valid: true, colorIndex: memberIndex };
          } else if (currentReportingCategory) {
            currentReportingCategory.refQualifier = elements[1] || "";
            currentReportingCategory.refValue = elements[2] || "";
            const rcPath = `${personPath()}.reportingCategories.${reportingCategoryIndex}`;
            lineMeta[idx] = {
              fields: [[`${rcPath}.refQualifier`, 1], [`${rcPath}.refValue`, 2]],
              valid: true,
              colorIndex: memberIndex,
            };
          } else if (currentCoverage) {
            if (elements[1] === "18") {
              currentCoverage.hiosId = elements[2] || "";
              lineMeta[idx] = { fields: [[`${coveragePath()}.hiosId`, 2]], valid: true, colorIndex: memberIndex };
            } else {
              currentCoverage.customRefValue = elements[2] || "";
              lineMeta[idx] = { fields: [[`${coveragePath()}.customRefValue`, 2]], valid: true, colorIndex: memberIndex };
            }
          } else {
            // A REF at the member level that isn't 0F, and isn't inside a coverage or
            // reporting-category context, is a generic additional reference (group
            // number, case number, etc.) — append it to the member's additionalRefs list.
            const ref = { qualifier: elements[1] || "", value: elements[2] || "" };
            currentPerson.additionalRefs.push(ref);
            const refIndex = currentPerson.additionalRefs.length - 1;
            const refPath = `${personPath()}.additionalRefs.${refIndex}`;
            lineMeta[idx] = {
              fields: [[`${refPath}.qualifier`, 1], [`${refPath}.value`, 2]],
              valid: true,
              colorIndex: memberIndex,
            };
          }
          break;
        }
        case "NM1": {
          if (!currentPerson) throw new Error("NM1 segment found before any INS (member) segment");
          if (elements[1] === "P3") {
            if (!currentCoverage) throw new Error("NM1*P3 (Provider) segment found outside of a coverage (HD) context");
            currentCoverage.providerName = elements[3] || "";
            currentCoverage.providerNpi = elements[9] || "";
            lineMeta[idx] = {
              fields: [[`${coveragePath()}.providerName`, 3], [`${coveragePath()}.providerNpi`, 9]],
              valid: true,
              colorIndex: memberIndex,
            };
          } else if (elements[1] === "IN") {
            if (!currentCoverage) throw new Error("NM1*IN (Coordination of Benefits payer) segment found outside of a coverage (HD) context");
            currentCoverage.cobOtherPayerName = elements[3] || "";
            currentCoverage.cobOtherPayerId = elements[9] || "";
            lineMeta[idx] = {
              fields: [[`${coveragePath()}.cobOtherPayerName`, 3], [`${coveragePath()}.cobOtherPayerId`, 9]],
              valid: true,
              colorIndex: memberIndex,
            };
          } else if (elements[1] === "31") {
            // Loop 2100C — marks that the next N3/N4 pair is the mailing address, not the primary one
            addressTarget = "mailing";
            lineMeta[idx] = { fields: [], valid: true, colorIndex: memberIndex };
          } else if (elements[1] === "GD") {
            // Loop 2100F — guardian / financially-responsible party
            currentPerson.responsibleParty.lastName = elements[3] || "";
            currentPerson.responsibleParty.firstName = elements[4] || "";
            addressTarget = "responsible";
            lineMeta[idx] = {
              fields: [
                [`${personPath()}.responsibleParty.lastName`, 3],
                [`${personPath()}.responsibleParty.firstName`, 4],
              ],
              valid: true,
              colorIndex: memberIndex,
            };
          } else {
            if (elements.length < 5) throw new Error("NM1 segment requires last name and first name elements");
            currentPerson.lastName = elements[3] || "";
            currentPerson.firstName = elements[4] || "";
            currentPerson.middleName = elements[5] || "";
            currentPerson.ssn = elements[9] || "";
            lineMeta[idx] = {
              fields: [
                [`${personPath()}.lastName`, 3],
                [`${personPath()}.firstName`, 4],
                [`${personPath()}.middleName`, 5],
                [`${personPath()}.ssn`, 9],
              ],
              valid: true,
              colorIndex: memberIndex,
            };
          }
          break;
        }
        case "PER": {
          if (elements[1] === "IP") {
            if (!currentPerson) throw new Error("PER*IP (member contact) segment found before any INS (member) segment");
            const fields = [];
            for (let i = 3; i < elements.length; i += 2) {
              const qualifier = elements[i];
              const value = elements[i + 1] || "";
              if (qualifier === "TE") {
                currentPerson.phone = value;
                fields.push([`${personPath()}.phone`, i + 1]);
              } else if (qualifier === "EM") {
                currentPerson.email = value;
                fields.push([`${personPath()}.email`, i + 1]);
              }
            }
            lineMeta[idx] = { fields, valid: true, colorIndex: memberIndex };
          } else {
            if (!currentCoverage) throw new Error("PER segment found outside of a coverage (HD) context");
            currentCoverage.providerPhone = elements[4] || "";
            lineMeta[idx] = { fields: [[`${coveragePath()}.providerPhone`, 4]], valid: true, colorIndex: memberIndex };
          }
          break;
        }
        case "COB": {
          if (!currentCoverage) throw new Error("COB segment found outside of a coverage (HD) context");
          currentCoverage.cobPayerResponsibilityCode = elements[1] || "";
          lineMeta[idx] = { fields: [[`${coveragePath()}.cobPayerResponsibilityCode`, 1]], valid: true, colorIndex: memberIndex };
          break;
        }
        case "AMT": {
          if (!currentCoverage) throw new Error("AMT segment found outside of a coverage (HD) context");
          currentCoverage.premiumAmount = elements[2] || "";
          lineMeta[idx] = { fields: [[`${coveragePath()}.premiumAmount`, 2]], valid: true, colorIndex: memberIndex };
          break;
        }
        case "DMG": {
          if (!currentPerson) throw new Error("DMG segment found before any INS (member) segment");
          currentPerson.dob = elements[2] || "";
          currentPerson.gender = elements[3] || "";
          lineMeta[idx] = { fields: [[`${personPath()}.dob`, 2], [`${personPath()}.gender`, 3]], valid: true, colorIndex: memberIndex };
          break;
        }
        case "N3": {
          if (!currentPerson) throw new Error("N3 segment found before any INS (member) segment");
          const n3PathPrefix =
            addressTarget === "mailing" ? `${personPath()}.mailingAddress`
            : addressTarget === "responsible" ? `${personPath()}.responsibleParty.address`
            : `${personPath()}.address`;
          const n3Target =
            addressTarget === "mailing" ? currentPerson.mailingAddress
            : addressTarget === "responsible" ? currentPerson.responsibleParty.address
            : currentPerson.address;
          n3Target.line1 = elements[1] || "";
          lineMeta[idx] = { fields: [[`${n3PathPrefix}.line1`, 1]], valid: true, colorIndex: memberIndex };
          break;
        }
        case "N4": {
          if (!currentPerson) throw new Error("N4 segment found before any INS (member) segment");
          const n4PathPrefix =
            addressTarget === "mailing" ? `${personPath()}.mailingAddress`
            : addressTarget === "responsible" ? `${personPath()}.responsibleParty.address`
            : `${personPath()}.address`;
          const n4Target =
            addressTarget === "mailing" ? currentPerson.mailingAddress
            : addressTarget === "responsible" ? currentPerson.responsibleParty.address
            : currentPerson.address;
          n4Target.city = elements[1] || "";
          n4Target.state = elements[2] || "";
          n4Target.zip = elements[3] || "";
          lineMeta[idx] = {
            fields: [[`${n4PathPrefix}.city`, 1], [`${n4PathPrefix}.state`, 2], [`${n4PathPrefix}.zip`, 3]],
            valid: true,
            colorIndex: memberIndex,
          };
          addressTarget = "primary"; // the mailing/responsible N3+N4 pair is always exactly one pair
          break;
        }
        case "HD": {
          if (!currentPerson) throw new Error("HD segment found before any INS (member) segment");
          if (elements.length < 4) throw new Error("HD segment requires a maintenance type code and LOB code");
          const lobCode = elements[3] || "";
          const rule = lobByCode[lobCode];
          const coverage = {
            lobKey: rule ? rule.id : "",
            maintenanceTypeCode: elements[1] || "",
            coverageLevelCode: elements[5] || "",
            startDate: "", endDate: "", customRefValue: "",
            premiumAmount: "", providerName: "", providerNpi: "", providerPhone: "",
            cobPayerResponsibilityCode: "", cobOtherPayerName: "", cobOtherPayerId: "",
          };
          currentPerson.coverages.push(coverage);
          coverageIndex = currentPerson.coverages.length - 1;
          currentCoverage = coverage;
          if (!rule && lobCode) {
            errors.push({ lineIndex: idx, message: `Unknown LOB code "${lobCode}" — no matching mapping rule in settings` });
          }
          lineMeta[idx] = {
            fields: [
              [`${coveragePath()}.maintenanceTypeCode`, 1],
              [`${coveragePath()}.lobKey`, 3],
              [`${coveragePath()}.coverageLevelCode`, 5],
            ],
            valid: !!rule || !lobCode,
            colorIndex: memberIndex,
          };
          break;
        }
        case "DTP": {
          const isoDate = (elements[3] || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
          if (elements[1] === "007") {
            if (currentReportingCategory) {
              // DTP*007 inside an LS...LE block is this reporting category's own
              // effective date, not the member-level maintenance effective date.
              currentReportingCategory.effectiveDate = isoDate;
              const rcPath = `${personPath()}.reportingCategories.${reportingCategoryIndex}`;
              lineMeta[idx] = { fields: [[`${rcPath}.effectiveDate`, 3]], valid: true, colorIndex: memberIndex };
            } else {
              if (!currentPerson) throw new Error("DTP*007 segment found before any INS (member) segment");
              currentPerson.maintenanceEffectiveDate = isoDate;
              lineMeta[idx] = { fields: [[`${personPath()}.maintenanceEffectiveDate`, 3]], valid: true, colorIndex: memberIndex };
            }
          } else {
            if (!currentCoverage) throw new Error("DTP segment found outside of a coverage (HD) context");
            let path = null;
            if (elements[1] === "348") { currentCoverage.startDate = isoDate; path = `${coveragePath()}.startDate`; }
            else if (elements[1] === "349") { currentCoverage.endDate = isoDate; path = `${coveragePath()}.endDate`; }
            lineMeta[idx] = { fields: path ? [[path, 3]] : [], valid: true, colorIndex: memberIndex };
          }
          break;
        }
        default:
          throw new Error(`Unrecognized segment tag "${tag}"`);
      }
    } catch (err) {
      errors.push({ lineIndex: idx, message: err.message });
      lineMeta[idx] = { fields: [], valid: false, colorIndex: currentPerson ? memberIndex : null };
    }
  });

  if (edi.members.length === 0) edi.members.push(createBlankMember());

  const fieldLineMap = {};
  lineMeta.forEach((meta, idx) => {
    (meta?.fields || []).forEach(([path, elementIndex]) => { fieldLineMap[path] = { lineIndex: idx, elementIndex }; });
  });

  return { edi, errors, lineMeta, fieldLineMap, lines: rawLines };
}

/* ============================================================
   RAW EDITOR RENDERING (syntax coloring + invalid-line flags)
   ============================================================ */

function buildLineSpanHtml(lineText, elementPathMap = {}) {
  let body = lineText;
  let tail = "";
  if (body.endsWith("~")) {
    tail = `<span class="seg-delim">~</span>`;
    body = body.slice(0, -1);
  }
  const parts = body.split("*");
  const html = parts
    .map((p, i) => {
      if (i === 0) return `<span class="seg-id">${escapeHtml(p)}</span>`;
      const path = elementPathMap[i];
      const pathAttr = path ? ` data-path="${escapeAttr(path)}"` : "";
      const cls = path ? "seg-elem seg-elem-target" : "seg-elem";
      return `<span class="seg-delim">*</span><span class="${cls}"${pathAttr}>${escapeHtml(p)}</span>`;
    })
    .join("");
  return html + tail;
}

function renderRawEditorLines(lines, metaForLine) {
  const html = lines
    .map((lineText, idx) => {
      const meta = metaForLine(idx, lineText) || { fields: [], valid: true, error: null, colorIndex: null };
      const fields = meta.fields || [];
      const paths = fields.map(([path]) => path);
      const elementPathMap = {};
      fields.forEach(([path, elementIndex]) => { elementPathMap[elementIndex] = path; });
      const colorCls = meta.colorIndex != null ? ` ${memberColor(meta.colorIndex).raw}` : "";
      // Even with line breaks off (compact/continuous mode), each member's Loop 2000
      // still gets its own visual line — .member-start overrides the inline display
      // that "no line breaks" mode otherwise applies to every segment (see styles.css).
      const isMemberStart = /^INS\*/.test(lineText);
      const cls = "seg-line" + colorCls + (isMemberStart ? " member-start" : "") + (meta.valid === false ? " seg-invalid" : "");
      const titleAttr = meta.error ? ` title="${escapeAttr(meta.error)}"` : "";
      return `<span class="${cls}" data-line="${idx}" data-paths='${escapeAttr(JSON.stringify(paths))}'${titleAttr}>${buildLineSpanHtml(lineText, elementPathMap)}</span>`;
    })
    .join("");
  return html;
}

/* ============================================================
   APPLICATION STATE + RENDERING
   ============================================================ */

const state = {
  tabs: [],
  activeTabId: null,
  lobMappings: { rules: [] },
};

function getActiveTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}

/* ---------- DOM refs ---------- */

const el = {
  sidebarNav: document.getElementById("sidebar-nav"),
  headerNavRow: document.getElementById("header-nav-row"),
  memberTree: document.getElementById("member-tree"),
  tabBar: document.getElementById("tab-bar"),
  emptyState: document.getElementById("empty-state"),
  workspace: document.getElementById("workspace"),
  formPane: document.getElementById("form-pane"),
  rawEditor: document.getElementById("raw-editor"),
  errorBadge: document.getElementById("raw-error-badge"),
  settingsModal: document.getElementById("settings-modal"),
  lobRuleList: document.getElementById("lob-rule-list"),
  downloadModal: document.getElementById("download-modal"),
  splitContainer: document.getElementById("split-container"),
  paneResizer: document.getElementById("pane-resizer"),
  rawPane: document.getElementById("raw-pane"),
  appSettingsModal: document.getElementById("app-settings-modal"),
  editorSettingsModal: document.getElementById("editor-settings-modal"),
  settingLineBreaks: document.getElementById("setting-line-breaks"),
  settingWrapLines: document.getElementById("setting-wrap-lines"),
};

/* ---------- draggable split-pane resizer ---------- */

const PANE_WIDTH_STORAGE_KEY = "edi834_pane_width_v1";

(function setupPaneResizer() {
  if (!el.paneResizer) return;
  let dragging = false;
  let lastPct = 50;

  try {
    const stored = parseFloat(localStorage.getItem(PANE_WIDTH_STORAGE_KEY));
    if (!Number.isNaN(stored) && stored >= 20 && stored <= 80) {
      lastPct = stored;
      el.formPane.style.width = `${lastPct}%`;
      el.rawPane.style.width = `${100 - lastPct}%`;
    }
  } catch {
    // localStorage unavailable — fall back to the default 50/50 split
  }

  el.paneResizer.addEventListener("mousedown", (e) => {
    dragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = el.splitContainer.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.min(80, Math.max(20, pct));
    lastPct = pct;
    el.formPane.style.width = `${pct}%`;
    el.rawPane.style.width = `${100 - pct}%`;
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    try {
      localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(lastPct));
    } catch {
      // localStorage unavailable — resizing still works, it just won't persist
    }
  });
})();

/* ---------- tab bar ---------- */

function renderTabBar() {
  persistWorkspace();
  if (state.tabs.length === 0) {
    el.tabBar.innerHTML = "";
    el.emptyState.classList.remove("hidden");
    el.workspace.classList.add("hidden");
    renderMemberTree();
    return;
  }
  el.emptyState.classList.add("hidden");
  el.workspace.classList.remove("hidden");
  el.tabBar.innerHTML = state.tabs
    .map((t) => `
      <div class="tab-item ${t.id === state.activeTabId ? "active" : ""}" data-tab-id="${t.id}">
        <span>${escapeHtml(t.meta.title || "Untitled 834")}</span>
        <span class="tab-close" data-close-tab="${t.id}">&times;</span>
      </div>
    `)
    .join("");
  renderMemberTree();
}

/* ---------- sidebar member tree ---------- */
// Replaces the old "Saved Files" list. Shows a 2-level tree (member ->
// their dependents) for the active tab, and drives which single person's
// card renderForm() shows — see resolvePersonSelection()/selectSidebarItem().

function resolvePersonSelection(tab, path) {
  const match = /^members\.(\d+)(?:\.dependents\.(\d+))?$/.exec(path || "");
  if (!match) return null;
  const memberIndex = Number(match[1]);
  const member = tab.edi.members[memberIndex];
  if (!member) return null;
  if (match[2] !== undefined) {
    const dependent = (member.dependents || [])[Number(match[2])];
    if (!dependent) return null;
    return { person: dependent, path, isDependent: true, colorIndex: memberIndex };
  }
  return { person: member, path, isDependent: false, colorIndex: memberIndex };
}

function selectSidebarItem(path) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.uiState.selectedPath = path;
  renderForm(tab);
  renderMemberTree();
  persistWorkspace();
}

function renderMemberTree() {
  if (!el.memberTree) return;
  const tab = getActiveTab();
  if (el.headerNavRow) {
    const headerSelected = !!tab && tab.uiState.selectedPath === "header";
    el.headerNavRow.classList.toggle("bg-slate-800", headerSelected);
    el.headerNavRow.classList.toggle("text-emerald-400", headerSelected);
    el.headerNavRow.classList.toggle("font-semibold", headerSelected);
    el.headerNavRow.classList.toggle("text-slate-200", !headerSelected);
  }
  if (!tab) {
    el.memberTree.innerHTML = `<div class="p-3 text-xs text-slate-500">Open a document to see its members here.</div>`;
    return;
  }
  const selectedPath = tab.uiState.selectedPath;
  el.memberTree.innerHTML =
    tab.edi.members
      .map((m, mi) => {
        const memberPath = `members.${mi}`;
        const memberNumber = String(mi + 1).padStart(2, "0");
        const namePart = `${m.firstName || ""} ${m.lastName || ""}`.trim();
        const dot = memberColor(mi).dot;
        const depRows = (m.dependents || [])
          .map((d, di) => {
            const depPath = `${memberPath}.dependents.${di}`;
            const depName = `${d.firstName || ""} ${d.lastName || ""}`.trim();
            return `
              <div class="member-tree-row flex items-center gap-2 pl-8 pr-3 py-1.5 cursor-pointer text-xs ${depPath === selectedPath ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-300 hover:bg-slate-800"}" data-select-path="${depPath}">
                <span class="truncate">${escapeHtml(depName || "Dependent")}</span>
              </div>
            `;
          })
          .join("");
        return `
          <div class="member-tree-row flex items-center gap-2 px-3 py-2 cursor-pointer text-xs ${memberPath === selectedPath ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-200 hover:bg-slate-800"}" data-select-path="${memberPath}">
            <span class="w-2 h-2 rounded-full shrink-0 ${dot}"></span>
            <span class="truncate">Member ${memberNumber}${namePart ? `: ${namePart}` : ""}</span>
          </div>
          ${depRows}
        `;
      })
      .join("") +
    `<div class="px-3 py-2">
      <button data-action="add-member" class="w-full text-[11px] text-emerald-500 hover:text-emerald-400">+ Add Member</button>
    </div>`;
}

// A mousedown here blurs whatever form field currently has focus, which
// fires a synchronous "change" event that rebuilds this tree's innerHTML
// (see the change listener below) — before the browser gets to mouseup. If
// that happens, the click's original target is detached mid-gesture and the
// click event never fires at all (per DOM click semantics). Since neither
// the sidebar nav nor the tab bar contain focusable inputs of their own,
// preventing mousedown's default focus-shift avoids the whole race without
// losing anything.
el.sidebarNav.addEventListener("mousedown", (e) => e.preventDefault());

el.sidebarNav.addEventListener("click", (e) => {
  const addBtn = e.target.closest('[data-action="add-member"]');
  if (addBtn) {
    handleStructuralAction("add-member", "");
    return;
  }
  const row = e.target.closest("[data-select-path]");
  if (row) selectSidebarItem(row.dataset.selectPath);
});

el.tabBar.addEventListener("mousedown", (e) => e.preventDefault());

el.tabBar.addEventListener("click", (e) => {
  const closeBtn = e.target.closest("[data-close-tab]");
  if (closeBtn) {
    e.stopPropagation();
    closeTab(closeBtn.dataset.closeTab);
    return;
  }
  const tabEl = e.target.closest("[data-tab-id]");
  if (tabEl) switchTab(tabEl.dataset.tabId);
});

function switchTab(tabId) {
  state.activeTabId = tabId;
  const tab = getActiveTab();
  if (!tab) { renderTabBar(); return; }
  renderForm(tab); // resolves/defaults tab.uiState.selectedPath before the tree renders
  renderTabBar();
  if (!tab.rawText) compileTabAndCacheRaw(tab);
  renderRawEditorFromTab(tab);
}

function closeTab(tabId) {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (tab.isDirty && !confirm(`Close "${tab.meta.title}"? It will be removed from this browser's storage.`)) return;
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  state.tabs.splice(idx, 1);
  if (state.activeTabId === tabId) {
    const next = state.tabs[idx] || state.tabs[idx - 1] || null;
    state.activeTabId = next ? next.id : null;
    if (next) {
      switchTab(next.id);
      return;
    }
  }
  renderTabBar();
}

function openNewTab() {
  const tab = createTab();
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  compileTabAndCacheRaw(tab);
  renderForm(tab); // resolves/defaults tab.uiState.selectedPath before the tree renders
  renderTabBar();
  renderRawEditorFromTab(tab);
}

document.getElementById("btn-new-file").addEventListener("click", openNewTab);

/* ---------- compiling + raw editor rendering ---------- */

function compileTabAndCacheRaw(tab) {
  const result = compileEDI(tab.edi, state.lobMappings);
  tab.lineSegments = result.segments;
  tab.fieldLineMap = result.fieldLineMap;
  // tab.rawText is the flat string used for copy/download/save — its segment
  // separator follows the "line breaks after ~" preference. The DOM rendering
  // below never depends on this string; it renders straight from tab.lineSegments.
  tab.rawText = result.segments.map((s) => s.text).join(appSettings.lineBreaksEnabled ? "\n" : "");
}

function renderRawEditorFromTab(tab) {
  if (!tab || tab.id !== state.activeTabId) return;
  const lines = tab.lineSegments.map((s) => s.text);
  const html = renderRawEditorLines(lines, (idx) => {
    const seg = tab.lineSegments[idx];
    return { fields: (seg && seg.fields) || [], valid: true, colorIndex: seg ? seg.colorIndex : null };
  });
  el.rawEditor.innerHTML = html;
  el.errorBadge.classList.add("hidden");
  if (focusedFieldPath) applyRawHighlight(focusedFieldPath);
}

const scheduleCompile = debounce((tabId) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  compileTabAndCacheRaw(tab);
  renderRawEditorFromTab(tab);
}, 300);

let suppressRawInput = false;

const scheduleParseFromRaw = debounce((tabId) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab || tab.id !== state.activeTabId) return;

  const caretOffset = getCaretCharOffset(el.rawEditor);
  const text = el.rawEditor.innerText.replace(/ /g, " ");
  const { edi, errors, lineMeta, fieldLineMap, lines } = parseEDI(text, state.lobMappings);

  tab.edi = edi;
  tab.rawText = text;
  tab.fieldLineMap = fieldLineMap;
  tab.isDirty = true;
  renderTabBar();
  renderForm(tab);

  const errorsByLine = {};
  errors.forEach((e) => { errorsByLine[e.lineIndex] = e.message; });
  const html = renderRawEditorLines(lines, (idx) => {
    const meta = lineMeta[idx] || { fields: [], valid: true, colorIndex: null };
    return { fields: meta.fields || [], valid: meta.valid, error: errorsByLine[idx], colorIndex: meta.colorIndex };
  });

  suppressRawInput = true;
  el.rawEditor.innerHTML = html;
  if (caretOffset != null) setCaretCharOffset(el.rawEditor, caretOffset);
  suppressRawInput = false;
  if (focusedFieldPath) applyRawHighlight(focusedFieldPath);

  if (errors.length > 0) {
    el.errorBadge.textContent = `${errors.length} line${errors.length > 1 ? "s" : ""} with errors`;
    el.errorBadge.title = errors.map((e) => `Line ${e.lineIndex + 1}: ${e.message}`).join("\n");
    el.errorBadge.classList.remove("hidden");
  } else {
    el.errorBadge.classList.add("hidden");
  }
}, 300);

el.rawEditor.addEventListener("input", () => {
  if (suppressRawInput) return;
  if (!state.activeTabId) return;
  scheduleParseFromRaw(state.activeTabId);
});

/* ---------- form rendering ---------- */

const RELATIONSHIP_CODES = [
  ["18", "Self"], ["01", "Spouse"], ["19", "Child"], ["53", "Domestic Partner"], ["G8", "Other Dependent"],
];
const MAINTENANCE_TYPE_CODES = [
  ["021", "Addition"], ["001", "Change"], ["024", "Termination"], ["025", "Reinstatement"], ["030", "Audit"],
];
const COVERAGE_LEVEL_CODES = [
  ["IND", "Individual"], ["ESP", "Employee and Spouse"], ["ECH", "Employee and Children"], ["FAM", "Family"], ["EMP", "Employee Only"],
];
const GENDER_CODES = [["U", "Unknown"], ["M", "Male"], ["F", "Female"]];
const COB_PAYER_RESPONSIBILITY_CODES = [["", "N/A"], ["P", "Primary"], ["S", "Secondary"], ["T", "Tertiary"]];
const LANGUAGE_CODES = [
  ["", "Not specified"], ["ENG", "English"], ["SPA", "Spanish"], ["FRA", "French"], ["DEU", "German"],
  ["ZHO", "Chinese"], ["VIE", "Vietnamese"], ["KOR", "Korean"], ["TGL", "Tagalog"], ["ARA", "Arabic"],
  ["RUS", "Russian"], ["POR", "Portuguese"], ["HIN", "Hindi"],
];
const LANGUAGE_PROFICIENCY_SLOTS = [
  ["speak", "Speak"], ["write", "Write"], ["read", "Read"],
];

// One hue per top-level member, shared with its dependents. `raw` is the CSS class
// applied to that member's segment lines in styles.css (#raw-editor .seg-line.member-color-N).
const MEMBER_COLORS = [
  { form: "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800", formNested: "bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700", raw: "member-color-0", dot: "bg-blue-500" },
  { form: "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800", formNested: "bg-green-100 border-green-300 dark:bg-green-900/40 dark:border-green-700", raw: "member-color-1", dot: "bg-green-500" },
  { form: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800", formNested: "bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700", raw: "member-color-2", dot: "bg-amber-500" },
  { form: "bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:border-purple-800", formNested: "bg-purple-100 border-purple-300 dark:bg-purple-900/40 dark:border-purple-700", raw: "member-color-3", dot: "bg-purple-500" },
  { form: "bg-pink-50 border-pink-200 dark:bg-pink-950/40 dark:border-pink-800", formNested: "bg-pink-100 border-pink-300 dark:bg-pink-900/40 dark:border-pink-700", raw: "member-color-4", dot: "bg-pink-500" },
  { form: "bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800", formNested: "bg-teal-100 border-teal-300 dark:bg-teal-900/40 dark:border-teal-700", raw: "member-color-5", dot: "bg-teal-500" },
  { form: "bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800", formNested: "bg-orange-100 border-orange-300 dark:bg-orange-900/40 dark:border-orange-700", raw: "member-color-6", dot: "bg-orange-500" },
  { form: "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800", formNested: "bg-indigo-100 border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-700", raw: "member-color-7", dot: "bg-indigo-500" },
];
function memberColor(index) {
  return MEMBER_COLORS[((index % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length];
}

const FIELD_INPUT_CLASSES =
  "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md px-2 py-1 text-xs";

function selectHtml(path, value, options) {
  return `<select data-path="${escapeAttr(path)}" class="${FIELD_INPUT_CLASSES}">
    ${options.map(([v, label]) => `<option value="${escapeAttr(v)}" ${v === value ? "selected" : ""}>${escapeHtml(label)}${v ? ` (${escapeHtml(v)})` : ""}</option>`).join("")}
  </select>`;
}

function textInputHtml(path, value, placeholder = "", type = "text") {
  return `<input type="${type}" data-path="${escapeAttr(path)}" value="${escapeAttr(value || "")}" placeholder="${escapeAttr(placeholder)}"
    class="${FIELD_INPUT_CLASSES}" />`;
}

function fieldGroup(label, inputHtml) {
  return `<label class="block">
    <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">${escapeHtml(label)}</span>
    ${inputHtml}
  </label>`;
}

function coverageFormHtml(coverage, coveragePath) {
  const rule = state.lobMappings.rules.find((r) => r.id === coverage.lobKey);
  const lobOptions = [["", "Select LOB..."]].concat(state.lobMappings.rules.map((r) => [r.id, r.displayName]));
  return `
    <div class="border border-slate-200 dark:border-slate-700 rounded-md p-2.5 mb-2 bg-slate-50 dark:bg-slate-800/60">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Coverage</span>
        <button data-action="remove-coverage" data-path="${coveragePath}" class="text-[11px] text-red-500 hover:text-red-700 dark:hover:text-red-400">Remove</button>
      </div>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
        ${fieldGroup("Line of Business", `<select data-path="${coveragePath}.lobKey" data-rerender="true" class="${FIELD_INPUT_CLASSES}">
          ${lobOptions.map(([v, label]) => `<option value="${escapeAttr(v)}" ${v === (coverage.lobKey || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
        </select>`)}
        ${fieldGroup("Coverage Level (HD05)", selectHtml(`${coveragePath}.coverageLevelCode`, coverage.coverageLevelCode, COVERAGE_LEVEL_CODES))}
        ${fieldGroup("Maintenance Type (HD01)", selectHtml(`${coveragePath}.maintenanceTypeCode`, coverage.maintenanceTypeCode, MAINTENANCE_TYPE_CODES))}
        ${fieldGroup("Start Date", textInputHtml(`${coveragePath}.startDate`, coverage.startDate, "", "date"))}
        ${fieldGroup("End Date", textInputHtml(`${coveragePath}.endDate`, coverage.endDate, "", "date"))}
        ${fieldGroup("HIOS Plan ID (REF*18)", textInputHtml(`${coveragePath}.hiosId`, coverage.hiosId, "e.g. 12345OH1234567"))}
        ${rule && rule.hasCustomRef ? fieldGroup(rule.refLabel || "Reference Value", textInputHtml(`${coveragePath}.customRefValue`, coverage.customRefValue)) : ""}
      </div>

      <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Payment (AMT)</span>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 mt-1">
          ${fieldGroup("Premium Amount", textInputHtml(`${coveragePath}.premiumAmount`, coverage.premiumAmount, "0.00"))}
        </div>
      </div>

      <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Provider (Loop 2310)</span>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 mt-1">
          ${fieldGroup("Provider Name", textInputHtml(`${coveragePath}.providerName`, coverage.providerName))}
          ${fieldGroup("Provider NPI", textInputHtml(`${coveragePath}.providerNpi`, coverage.providerNpi))}
          ${fieldGroup("Provider Phone", textInputHtml(`${coveragePath}.providerPhone`, coverage.providerPhone))}
        </div>
      </div>

      <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coordination of Benefits (Loop 2320/2330)</span>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 mt-1">
          ${fieldGroup("Payer Responsibility", selectHtml(`${coveragePath}.cobPayerResponsibilityCode`, coverage.cobPayerResponsibilityCode, COB_PAYER_RESPONSIBILITY_CODES))}
          ${fieldGroup("Other Payer Name", textInputHtml(`${coveragePath}.cobOtherPayerName`, coverage.cobOtherPayerName))}
          ${fieldGroup("Other Payer ID", textInputHtml(`${coveragePath}.cobOtherPayerId`, coverage.cobOtherPayerId))}
        </div>
      </div>
    </div>
  `;
}

// Same compact spreadsheet-style table as Additional References, plus a date
// column for each category's optional DTP*007 effective date.
function reportingCategoriesTableHtml(categories, personPath) {
  if (!categories || categories.length === 0) {
    return `<p class="text-[11px] text-slate-400 dark:text-slate-500 italic py-1">No reporting categories</p>`;
  }
  const rows = categories.map((rc, rci) => {
    const rcPath = `${personPath}.reportingCategories.${rci}`;
    return `
      <tr class="border-t border-slate-200 dark:border-slate-700">
        <td class="py-0.5 pr-1"><input type="text" data-path="${rcPath}.description" value="${escapeAttr(rc.description)}" placeholder="e.g. Division" class="${TABLE_CELL_INPUT_CLASSES}" /></td>
        <td class="py-0.5 pr-1"><input type="text" data-path="${rcPath}.refQualifier" value="${escapeAttr(rc.refQualifier)}" class="${TABLE_CELL_INPUT_CLASSES}" /></td>
        <td class="py-0.5 pr-1"><input type="text" data-path="${rcPath}.refValue" value="${escapeAttr(rc.refValue)}" class="${TABLE_CELL_INPUT_CLASSES}" /></td>
        <td class="py-0.5 pr-1"><input type="date" data-path="${rcPath}.effectiveDate" value="${escapeAttr(rc.effectiveDate)}" class="${TABLE_CELL_INPUT_CLASSES}" /></td>
        <td class="py-0.5 text-right w-6">
          <button data-action="remove-reporting-category" data-path="${rcPath}" class="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-xs leading-none" title="Remove">&times;</button>
        </td>
      </tr>
    `;
  }).join("");
  return `
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="text-left text-slate-500 dark:text-slate-400">
          <th class="font-semibold pb-1">Description</th>
          <th class="font-semibold pb-1">Qualifier</th>
          <th class="font-semibold pb-1">Value</th>
          <th class="font-semibold pb-1">Effective Date</th>
          <th class="w-6"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// One compact line: a checkbox + small language dropdown per proficiency slot
// (Speak/Write/Read). Checking the box defaults the dropdown to English; the LUI
// segment for that slot is only emitted while its code is non-empty.
function languagesRowHtml(languages, personPath) {
  const cells = LANGUAGE_PROFICIENCY_SLOTS.map(([key, label]) => {
    const code = languages[key] || "";
    const fieldPath = `${personPath}.languages.${key}`;
    return `
      <label class="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
        <input type="checkbox" data-lang-checkbox="${fieldPath}" class="accent-emerald-600" ${code ? "checked" : ""} />
        ${label}
        <select data-path="${fieldPath}" class="text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1 py-0.5 w-24" ${code ? "" : "disabled"}>
          ${LANGUAGE_CODES.filter(([v]) => v).map(([v, l]) => `<option value="${escapeAttr(v)}" ${v === code ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}
        </select>
      </label>
    `;
  }).join("");
  return `
    <div>
      <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1 block">Languages (LUI)</span>
      <div class="flex flex-wrap items-center gap-4">${cells}</div>
    </div>
  `;
}

// A compact spreadsheet-like editable table (rather than a repeating card per
// row) — cells are borderless until hovered/focused so the whole thing reads as
// one dense table instead of repeating box chrome and labels per entry.
const TABLE_CELL_INPUT_CLASSES =
  "w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 " +
  "focus:border-slate-400 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 rounded px-1.5 py-1 text-xs outline-none";

function additionalRefsTableHtml(refs, personPath) {
  if (!refs || refs.length === 0) {
    return `<p class="text-[11px] text-slate-400 dark:text-slate-500 italic py-1">No additional references</p>`;
  }
  const rows = refs.map((ref, ri) => {
    const refPath = `${personPath}.additionalRefs.${ri}`;
    return `
      <tr class="border-t border-slate-200 dark:border-slate-700">
        <td class="py-0.5 pr-1"><input type="text" data-path="${refPath}.qualifier" value="${escapeAttr(ref.qualifier)}" placeholder="e.g. 1L" class="${TABLE_CELL_INPUT_CLASSES}" /></td>
        <td class="py-0.5 pr-1"><input type="text" data-path="${refPath}.value" value="${escapeAttr(ref.value)}" class="${TABLE_CELL_INPUT_CLASSES}" /></td>
        <td class="py-0.5 text-right w-6">
          <button data-action="remove-additional-ref" data-path="${refPath}" class="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-xs leading-none" title="Remove">&times;</button>
        </td>
      </tr>
    `;
  }).join("");
  return `
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="text-left text-slate-500 dark:text-slate-400">
          <th class="font-semibold pb-1">Qualifier</th>
          <th class="font-semibold pb-1">Value</th>
          <th class="w-6"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function personFormHtml(person, personPath, isDependent, collapsedSet, colorIndex) {
  const namePart = `${person.firstName || ""} ${person.lastName || ""}`.trim();
  const memberNumber = String((colorIndex ?? 0) + 1).padStart(2, "0");
  const label = isDependent
    ? (namePart ? `Dependent: ${namePart}` : "Dependent")
    : (namePart ? `Member ${memberNumber}: ${namePart}` : `Member ${memberNumber}`);
  const isOpen = !collapsedSet.has(personPath);
  const color = memberColor(colorIndex);
  const cardColorClasses = isDependent ? color.formNested : color.form;
  return `
    <details class="border ${cardColorClasses} rounded-md mb-2" data-collapse-path="${personPath}" ${isOpen ? "open" : ""}>
      <summary class="accordion-header flex justify-between items-center px-3 py-2 ${cardColorClasses} rounded-t-md text-xs font-semibold text-slate-700 dark:text-slate-100">
        <span>${escapeHtml(label)}</span>
        <button data-action="${isDependent ? "remove-dependent" : "remove-member"}" data-path="${personPath}" class="text-[11px] font-normal text-red-500 hover:text-red-700 dark:hover:text-red-400">Remove</button>
      </summary>
      <div class="p-3 space-y-3">
        ${isDependent ? `<div class="text-[11px] text-slate-500 dark:text-slate-400">Dependent of: <span class="font-semibold text-slate-700 dark:text-slate-200">Member ${memberNumber}</span></div>` : ""}
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
          ${fieldGroup("Member ID (REF*0F)", textInputHtml(`${personPath}.memberId`, person.memberId))}
          ${fieldGroup("Relationship Code", selectHtml(`${personPath}.relationshipCode`, person.relationshipCode, RELATIONSHIP_CODES))}
          ${fieldGroup("Maintenance Type", selectHtml(`${personPath}.maintenanceTypeCode`, person.maintenanceTypeCode, MAINTENANCE_TYPE_CODES))}
          ${fieldGroup("Maintenance Effective Date (DTP*007)", textInputHtml(`${personPath}.maintenanceEffectiveDate`, person.maintenanceEffectiveDate, "", "date"))}
          ${fieldGroup("Gender", selectHtml(`${personPath}.gender`, person.gender, GENDER_CODES))}
          ${fieldGroup("First Name", textInputHtml(`${personPath}.firstName`, person.firstName))}
          ${fieldGroup("Middle Name", textInputHtml(`${personPath}.middleName`, person.middleName))}
          ${fieldGroup("Last Name", textInputHtml(`${personPath}.lastName`, person.lastName))}
          ${fieldGroup("SSN", textInputHtml(`${personPath}.ssn`, person.ssn))}
          ${fieldGroup("Date of Birth", textInputHtml(`${personPath}.dob`, person.dob, "", "date"))}
        </div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
          ${fieldGroup("Address Line 1", textInputHtml(`${personPath}.address.line1`, person.address.line1))}
          ${fieldGroup("City", textInputHtml(`${personPath}.address.city`, person.address.city))}
          ${fieldGroup("State", textInputHtml(`${personPath}.address.state`, person.address.state))}
          ${fieldGroup("Zip", textInputHtml(`${personPath}.address.zip`, person.address.zip))}
        </div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
          ${fieldGroup("Phone (PER*IP*TE)", textInputHtml(`${personPath}.phone`, person.phone))}
          ${fieldGroup("Email (PER*IP*EM)", textInputHtml(`${personPath}.email`, person.email))}
        </div>

        <div>
          <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mailing Address (Loop 2100C)</span>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 mb-1">Only emitted if different from the address above.</p>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
            ${fieldGroup("Address Line 1", textInputHtml(`${personPath}.mailingAddress.line1`, person.mailingAddress.line1))}
            ${fieldGroup("City", textInputHtml(`${personPath}.mailingAddress.city`, person.mailingAddress.city))}
            ${fieldGroup("State", textInputHtml(`${personPath}.mailingAddress.state`, person.mailingAddress.state))}
            ${fieldGroup("Zip", textInputHtml(`${personPath}.mailingAddress.zip`, person.mailingAddress.zip))}
          </div>
        </div>

        <div>
          <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Responsible Party (Loop 2100F)</span>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
            ${fieldGroup("First Name", textInputHtml(`${personPath}.responsibleParty.firstName`, person.responsibleParty.firstName))}
            ${fieldGroup("Last Name", textInputHtml(`${personPath}.responsibleParty.lastName`, person.responsibleParty.lastName))}
            ${fieldGroup("Address Line 1", textInputHtml(`${personPath}.responsibleParty.address.line1`, person.responsibleParty.address.line1))}
            ${fieldGroup("City", textInputHtml(`${personPath}.responsibleParty.address.city`, person.responsibleParty.address.city))}
            ${fieldGroup("State", textInputHtml(`${personPath}.responsibleParty.address.state`, person.responsibleParty.address.state))}
            ${fieldGroup("Zip", textInputHtml(`${personPath}.responsibleParty.address.zip`, person.responsibleParty.address.zip))}
          </div>
        </div>

        ${languagesRowHtml(person.languages, personPath)}

        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Additional References</span>
            <button data-action="add-additional-ref" data-path="${personPath}" class="text-[11px] text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-400">+ Add Reference</button>
          </div>
          ${additionalRefsTableHtml(person.additionalRefs, personPath)}
        </div>

        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coverages (Loop 2300)</span>
            <button data-action="add-coverage" data-path="${personPath}" class="text-[11px] text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-400">+ Add Coverage</button>
          </div>
          ${(person.coverages || []).map((c, ci) => coverageFormHtml(c, `${personPath}.coverages.${ci}`)).join("")}
        </div>

        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reporting Categories (Loop 2700/2750)</span>
            <button data-action="add-reporting-category" data-path="${personPath}" class="text-[11px] text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-400">+ Add Reporting Category</button>
          </div>
          ${reportingCategoriesTableHtml(person.reportingCategories, personPath)}
        </div>

        ${!isDependent ? `
        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dependents</span>
            <button data-action="add-dependent" data-path="${personPath}" class="text-[11px] text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-400">+ Add Dependent</button>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 italic py-1">
            ${(person.dependents || []).length === 0 ? "No dependents" : `${person.dependents.length} dependent${person.dependents.length > 1 ? "s" : ""} — select one from the sidebar tree to view/edit`}
          </p>
        </div>` : ""}
      </div>
    </details>
  `;
}

// Like the member tree, the form pane shows exactly one thing at a time:
// either the document header/title section, or one member/dependent card
// — whichever the sidebar currently has selected — rather than everything
// stacked in one long scroll.
function renderForm(tab) {
  if (!tab || tab.id !== state.activeTabId) return;
  el.formPane.innerHTML =
    tab.uiState.selectedPath === "header" ? renderHeaderSectionHtml(tab) : renderSelectedPersonHtml(tab);
}

function renderHeaderSectionHtml(tab) {
  return `
    <div class="space-y-2 border-b border-slate-200 dark:border-slate-700 pb-3">
      ${fieldGroup("Custom Title", textInputHtml("meta.title", tab.meta.title))}
      <label class="block">
        <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">Description</span>
        <textarea data-path="meta.description" rows="2" class="${FIELD_INPUT_CLASSES}">${escapeHtml(tab.meta.description)}</textarea>
      </label>
    </div>

    <details class="border border-slate-200 dark:border-slate-700 rounded-md" open>
      <summary class="accordion-header px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-t-md text-xs font-semibold text-slate-700 dark:text-slate-200">Header (Loop 1000A / 1000B)</summary>
      <div class="p-3 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
        ${fieldGroup("Sender ID (ISA06)", textInputHtml("header.senderId", tab.edi.header.senderId))}
        ${fieldGroup("Receiver ID (ISA08)", textInputHtml("header.receiverId", tab.edi.header.receiverId))}
        ${fieldGroup("Control Number", textInputHtml("header.controlNumber", tab.edi.header.controlNumber))}
        ${fieldGroup("Sponsor Name (1000A)", textInputHtml("header.sponsorName", tab.edi.header.sponsorName))}
        ${fieldGroup("Sponsor ID", textInputHtml("header.sponsorId", tab.edi.header.sponsorId))}
        ${fieldGroup("Payer Name (1000B)", textInputHtml("header.payerName", tab.edi.header.payerName))}
        ${fieldGroup("Payer ID", textInputHtml("header.payerId", tab.edi.header.payerId))}
      </div>
    </details>
  `;
}

// Shows exactly one member (or one dependent) at a time — whichever the
// sidebar member tree currently has selected.
function renderSelectedPersonHtml(tab) {
  let selection = resolvePersonSelection(tab, tab.uiState.selectedPath);
  if (!selection && tab.edi.members.length > 0) {
    tab.uiState.selectedPath = "members.0";
    selection = resolvePersonSelection(tab, tab.uiState.selectedPath);
  }
  if (!selection) {
    // Nothing valid selected at all (e.g. a brand-new tab) — default to the header.
    tab.uiState.selectedPath = "header";
    return renderHeaderSectionHtml(tab);
  }
  return `
    <div>
      <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Members (Loop 2000)</span>
      <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-2">Pick a member or dependent from the tree on the left to view/edit them here.</p>
      ${personFormHtml(selection.person, selection.path, selection.isDependent, tab.uiState.collapsed, selection.colorIndex)}
    </div>
  `;
}

el.formPane.addEventListener("input", (e) => {
  const path = e.target.dataset.path;
  if (!path) return;
  handleFormFieldChange(path, e.target.value);
});

el.formPane.addEventListener("change", (e) => {
  const langPath = e.target.dataset.langCheckbox;
  if (langPath) {
    const tab = getActiveTab();
    if (!tab) return;
    setPath(tab.edi, langPath, e.target.checked ? (getPath(tab.edi, langPath) || "ENG") : "");
    tab.isDirty = true;
    renderTabBar();
    renderForm(tab);
    scheduleCompile(tab.id);
    return;
  }
  const path = e.target.dataset.path;
  if (!path) return;
  handleFormFieldChange(path, e.target.value);
  if (e.target.dataset.rerender === "true") {
    const tab = getActiveTab();
    if (tab) renderForm(tab);
  }
});

function handleFormFieldChange(path, value) {
  const tab = getActiveTab();
  if (!tab) return;
  if (path.startsWith("meta.")) setPath(tab, path, value);
  else setPath(tab.edi, path, value);
  tab.isDirty = true;
  renderTabBar();
  scheduleCompile(tab.id);
}

el.formPane.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  handleStructuralAction(btn.dataset.action, btn.dataset.path);
});

function handleStructuralAction(action, path) {
  const tab = getActiveTab();
  if (!tab) return;
  switch (action) {
    case "add-member":
      tab.edi.members.push(createBlankMember());
      tab.uiState.selectedPath = `members.${tab.edi.members.length - 1}`;
      break;
    case "remove-member": {
      if (tab.edi.members.length <= 1) { toast("At least one member is required"); return; }
      const { arr, idx } = resolveArrayIndex(tab.edi, path);
      arr.splice(idx, 1);
      // Indices shift on removal, so any previously selected path (including
      // one belonging to a different member) may now be stale — jump back
      // to the first member rather than risk pointing at the wrong person.
      tab.uiState.selectedPath = "members.0";
      break;
    }
    case "add-dependent": {
      const dependents = getPath(tab.edi, path).dependents;
      dependents.push(createBlankDependent());
      tab.uiState.selectedPath = `${path}.dependents.${dependents.length - 1}`;
      break;
    }
    case "remove-dependent": {
      const { arr, idx } = resolveArrayIndex(tab.edi, path);
      arr.splice(idx, 1);
      // Same staleness concern as remove-member — fall back to the parent
      // member, which is always valid.
      tab.uiState.selectedPath = path.replace(/\.dependents\.\d+$/, "");
      break;
    }
    case "add-coverage":
      getPath(tab.edi, path).coverages.push(createBlankCoverage());
      break;
    case "remove-coverage": {
      const { arr, idx } = resolveArrayIndex(tab.edi, path);
      arr.splice(idx, 1);
      break;
    }
    case "add-reporting-category":
      getPath(tab.edi, path).reportingCategories.push(createBlankReportingCategory());
      break;
    case "remove-reporting-category": {
      const { arr, idx } = resolveArrayIndex(tab.edi, path);
      arr.splice(idx, 1);
      break;
    }
    case "add-additional-ref":
      getPath(tab.edi, path).additionalRefs.push(createBlankAdditionalRef());
      break;
    case "remove-additional-ref": {
      const { arr, idx } = resolveArrayIndex(tab.edi, path);
      arr.splice(idx, 1);
      break;
    }
    default:
      return;
  }
  tab.isDirty = true;
  renderTabBar();
  renderForm(tab);
  compileTabAndCacheRaw(tab);
  renderRawEditorFromTab(tab);
}

/* preserve <details> open/collapsed state across re-renders */
el.formPane.addEventListener(
  "toggle",
  (e) => {
    const details = e.target;
    const path = details.dataset && details.dataset.collapsePath;
    if (!path) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (details.open) tab.uiState.collapsed.delete(path);
    else tab.uiState.collapsed.add(path);
  },
  true
);

/* ---------- field <-> raw-line highlight sync ---------- */

let focusedFieldPath = null;

function clearRawHighlight() {
  el.rawEditor.querySelectorAll(".seg-highlight").forEach((n) => n.classList.remove("seg-highlight"));
  el.rawEditor.querySelectorAll(".seg-elem-highlight").forEach((n) => n.classList.remove("seg-elem-highlight"));
}

// Re-applies the highlight for `path` against whatever raw-editor DOM currently exists.
// Called both on focus AND after every raw-editor re-render, since a debounced
// recompile/reparse replaces the raw editor's innerHTML wholesale and would
// otherwise silently drop the highlight classes mid-edit.
function applyRawHighlight(path, { scroll = false } = {}) {
  const tab = getActiveTab();
  if (!tab || !path) return;
  clearRawHighlight();
  const loc = tab.fieldLineMap[path];
  if (!loc) return;
  const lineEl = el.rawEditor.querySelector(`[data-line="${loc.lineIndex}"]`);
  if (!lineEl) return;
  lineEl.classList.add("seg-highlight");
  const elemEl = lineEl.querySelector(`[data-path="${path}"]`);
  if (elemEl) elemEl.classList.add("seg-elem-highlight");
  if (scroll) lineEl.scrollIntoView({ block: "center", behavior: "smooth" });
}

el.formPane.addEventListener("focusin", (e) => {
  const path = e.target.dataset.path;
  if (!path) {
    focusedFieldPath = null;
    return;
  }
  focusedFieldPath = path;
  applyRawHighlight(path, { scroll: true });
});

el.formPane.addEventListener("focusout", () => {
  focusedFieldPath = null;
  clearRawHighlight();
});

el.rawEditor.addEventListener("click", (e) => {
  const lineEl = e.target.closest(".seg-line");
  if (!lineEl) return;
  const elemEl = e.target.closest("[data-path]");
  let paths = [];
  if (elemEl && elemEl.dataset.path) {
    paths = [elemEl.dataset.path];
  } else {
    try { paths = JSON.parse(lineEl.dataset.paths || "[]"); } catch { paths = []; }
  }
  for (const p of paths) {
    const target = el.formPane.querySelector(`[data-path="${p}"]`);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.focus();
      target.classList.add("field-highlight");
      setTimeout(() => target.classList.remove("field-highlight"), 1200);
      break;
    }
  }
});

/* ---------- copy / download ---------- */

document.getElementById("btn-copy").addEventListener("click", async () => {
  const tab = getActiveTab();
  if (!tab) return;
  await navigator.clipboard.writeText(tab.rawText);
  toast("Copied to clipboard");
});

document.getElementById("btn-download").addEventListener("click", () => {
  if (!getActiveTab()) return;
  el.downloadModal.classList.remove("hidden");
});
document.getElementById("btn-cancel-download").addEventListener("click", () => {
  el.downloadModal.classList.add("hidden");
});
document.getElementById("btn-confirm-download").addEventListener("click", () => {
  const tab = getActiveTab();
  if (!tab) return;
  const name = document.getElementById("download-filename").value || "edi_834_export";
  const ext = document.getElementById("download-extension").value;
  const blob = new Blob([tab.rawText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ext;
  a.click();
  URL.revokeObjectURL(url);
  el.downloadModal.classList.add("hidden");
});

/* ---------- LOB mapping settings modal ---------- */

function renderLobRuleList() {
  el.lobRuleList.innerHTML = state.lobMappings.rules
    .map((rule, i) => `
      <div class="border border-slate-200 dark:border-slate-700 rounded-md p-3" data-rule-index="${i}">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 mb-2">
          <label class="block">
            <span class="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 mb-0.5">UI Display Name</span>
            <input type="text" data-field="displayName" value="${escapeAttr(rule.displayName)}" class="${FIELD_INPUT_CLASSES}" />
          </label>
          <label class="block">
            <span class="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 mb-0.5">X12 Code (HD03)</span>
            <input type="text" data-field="code" value="${escapeAttr(rule.code)}" class="${FIELD_INPUT_CLASSES}" />
          </label>
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mb-2">
          <input type="checkbox" data-field="hasCustomRef" class="accent-emerald-600" ${rule.hasCustomRef ? "checked" : ""} />
          Enable custom REF segment
        </label>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 lob-ref-fields" style="${rule.hasCustomRef ? "" : "display:none"}">
          <label class="block">
            <span class="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 mb-0.5">REF Qualifier</span>
            <input type="text" data-field="refQualifier" value="${escapeAttr(rule.refQualifier)}" class="${FIELD_INPUT_CLASSES}" />
          </label>
          <label class="block">
            <span class="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 mb-0.5">REF Label</span>
            <input type="text" data-field="refLabel" value="${escapeAttr(rule.refLabel)}" class="${FIELD_INPUT_CLASSES}" />
          </label>
        </div>
        <div class="text-right mt-2">
          <button data-remove-rule="${i}" class="text-[11px] text-red-500 hover:text-red-700 dark:hover:text-red-400">Remove Rule</button>
        </div>
      </div>
    `)
    .join("");
}

document.getElementById("btn-open-settings").addEventListener("click", () => {
  renderLobRuleList();
  el.settingsModal.classList.remove("hidden");
});
document.getElementById("btn-close-settings").addEventListener("click", () => {
  el.settingsModal.classList.add("hidden");
});
document.getElementById("btn-add-lob-rule").addEventListener("click", () => {
  state.lobMappings.rules.push({ id: uuid(), displayName: "", code: "", hasCustomRef: false, refQualifier: "", refLabel: "" });
  renderLobRuleList();
});

el.lobRuleList.addEventListener("input", (e) => {
  const row = e.target.closest("[data-rule-index]");
  if (!row) return;
  const rule = state.lobMappings.rules[Number(row.dataset.ruleIndex)];
  const field = e.target.dataset.field;
  if (!field) return;
  rule[field] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  if (field === "hasCustomRef") {
    row.querySelector(".lob-ref-fields").style.display = rule.hasCustomRef ? "" : "none";
  }
});

el.lobRuleList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove-rule]");
  if (!btn) return;
  state.lobMappings.rules.splice(Number(btn.dataset.removeRule), 1);
  renderLobRuleList();
});

document.getElementById("btn-save-lob-mappings").addEventListener("click", () => {
  persistLobMappings(state.lobMappings);
  el.settingsModal.classList.add("hidden");
  toast("LOB mappings saved");
  state.tabs.forEach((t) => compileTabAndCacheRaw(t));
  const tab = getActiveTab();
  if (tab) { renderForm(tab); renderRawEditorFromTab(tab); }
});

/* ---------- app / display settings modal (theme) ---------- */

function renderAppSettingsModal() {
  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.checked = input.value === appSettings.theme;
  });
  document.querySelectorAll('input[name="editorTheme"]').forEach((input) => {
    input.checked = input.value === appSettings.editorTheme;
  });
}

document.getElementById("btn-open-app-settings").addEventListener("click", () => {
  renderAppSettingsModal();
  el.appSettingsModal.classList.remove("hidden");
});
document.getElementById("btn-close-app-settings").addEventListener("click", () => {
  el.appSettingsModal.classList.add("hidden");
});

document.querySelectorAll('input[name="theme"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    appSettings.theme = input.value;
    persistAppSettings();
    applyTheme();
  });
});

document.querySelectorAll('input[name="editorTheme"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    appSettings.editorTheme = input.value;
    persistAppSettings();
    applyEditorTheme();
  });
});

/* ---------- editor settings modal (raw text display) ---------- */

function renderEditorSettingsModal() {
  el.settingLineBreaks.checked = appSettings.lineBreaksEnabled;
  el.settingWrapLines.checked = appSettings.wrapEnabled;
}

document.getElementById("btn-open-editor-settings").addEventListener("click", () => {
  renderEditorSettingsModal();
  el.editorSettingsModal.classList.remove("hidden");
});
document.getElementById("btn-close-editor-settings").addEventListener("click", () => {
  el.editorSettingsModal.classList.add("hidden");
});

el.settingLineBreaks.addEventListener("change", () => {
  appSettings.lineBreaksEnabled = el.settingLineBreaks.checked;
  persistAppSettings();
  applyRawEditorDisplayPrefs();
  const tab = getActiveTab();
  if (tab) { compileTabAndCacheRaw(tab); renderRawEditorFromTab(tab); }
});

el.settingWrapLines.addEventListener("change", () => {
  appSettings.wrapEnabled = el.settingWrapLines.checked;
  persistAppSettings();
  applyRawEditorDisplayPrefs();
});

/* ---------- init ---------- */

function init() {
  loadAppSettings();
  applyTheme();
  applyEditorTheme();
  applyRawEditorDisplayPrefs();

  state.lobMappings = loadLobMappings();

  restoreWorkspaceFromStorage();

  if (state.activeTabId) {
    switchTab(state.activeTabId);
  } else {
    renderTabBar();
  }
}

init();
