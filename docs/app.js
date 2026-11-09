import { disconnectPin, insertReroute, reconnectEdge, alignNodes } from "./graph-edit.js";
import { CLIP_KEY, CLIP_TAG, nodeClip, importClipDependencies } from "./node-clipboard.js";
import { pinColor as uePinColor, nodeAppearance, dynamicPinSpec, canRemoveDynamicPin, addDynamicPin, removeDynamicPin, applyUEPalette } from "./ue-node-features.js";
import { setUiLanguage, tr } from "./ui-i18n.js";
import { createWorkspace } from "./workspace.js";
import { makeZip, readZip } from "./zip.js";
import { entriesSince, isOutdated, isStamped } from "./update.js";
import { expandEnumExecs as expandEnumPins } from "./enum-tools.js";
import {
  FORMAT,
  VERSION,
  uid,
  clone,
  builtins,
  makeNode,
  makeProject,
  pinKind,
  defaultValue,
  connect,
  validateProject,
  setTypeHierarchy,
  setEnumTable,
  matchingPin,
  compatible,
} from "./model.js";
import { typeNodes, engineClasses } from "./ue-nodes.js";
import { nodeIcon, nodeTier, pinEnglish, kindEnglish } from "./node-look.js";
import {
  allowedInGraph,
  arrayOf,
  buildExport,
  checkName,
  customEventDefinition,
  defaultValueFor,
  dynamicDefinitions,
  elementType,
  isArrayType,
  makeFunctionGraph,
  makeMacroGraph,
  resultDefinition,
  makeVariable,
  newParam,
  overridableMembers,
  overrideSignature,
  syncDefinitions,
  typeChoices,
} from "./blueprint.js";
import {
  translate,
  nodeKind,
  nodeEnglish,
  nodeChinese,
  kindLabels,
} from "./i18n.js";
// A missing element (an out-of-date cached index.html next to a newer script) must never take the
// whole app down: lookups then return an inert stand-in that swallows every call and assignment.
const inert = (() => {
  const handler = {
    get: (_, key) =>
      key === Symbol.toPrimitive
        ? () => ""
        : ["open", "hidden", "disabled", "checked", "length"].includes(key)
          ? false
          : ["value", "textContent", "innerHTML", "innerText"].includes(key)
            ? ""
            : key === "classList" || key === "style" || key === "dataset"
              ? inert
              : key === "getBoundingClientRect"
                ? () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 })
                : key === "querySelector" || key === "closest"
                  ? () => null
                  : key === "querySelectorAll"
                    ? () => []
                    : () => inert,
    set: () => true,
    apply: () => inert,
  };
  const target = function () {};
  return new Proxy(target, handler);
})();
const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) console.debug(`missing #${id}`);
    return el ?? inert;
  },
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
// Display language: "both" (中文 + English), "zh" or "en". Elements marked .zh / .en are hidden by CSS.
const LANG_KEY = "kards-blueprint-studio.lang";
let langMode = "both";
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (["both", "zh", "en"].includes(saved)) langMode = saved;
} catch {
  /* storage unavailable: keep the default */
}
document.documentElement.dataset.lang = langMode;
const bi = (zh, en) =>
  `<span class="zh">${zh}</span> <span class="en">${en}</span>`;
const CAT = {
    all: bi("全部", "All"),
    events: bi("事件", "Events"),
    combat: bi("战斗", "Combat"),
    cards: bi("卡牌", "Cards"),
    effects: bi("效果", "Effects"),
    queries: bi("查询", "Queries"),
    match: bi("对局", "Match"),
    flow: bi("流程", "Flow"),
    variables: bi("变量", "Variables"),
    utilities: bi("工具", "Utilities"),
    properties: bi("属性", "Properties"),
    math: bi("运算", "Math"),
    arrays: bi("数组", "Array"),
    conversion: bi("转换", "Cast"),
    strings: bi("字符串", "String"),
    random: bi("随机", "Random"),
    functions: bi("函数", "Functions"),
    macros: bi("宏", "Macros"),
  };
applyUEPalette(document.documentElement);
const PINCOLORS = Object.fromEntries(Object.entries({exec: "exec", object: "UObject*", int: "int32", bool: "bool", string: "FString", enum: "uint8", float: "float", name: "FName", text: "FText", vector: "FVector", rotator: "FRotator", delegate: "Delegate<void>", wildcard: "$T"}).map(([name, type]) => [name, uePinColor(type)]));
const pinColor = (type) => uePinColor(type, enums);
const PIN_LEGEND = [
  ["exec", "执行"],
  ["object", "对象"],
  ["bool", "布尔"],
  ["int", "整数"],
  ["float", "浮点"],
  ["string", "字符串"],
  ["name", "Name"],
  ["text", "Text"],
  ["enum", "枚举"],
  ["vector", "向量"],
  ["rotator", "旋转"],
  ["delegate", "委托"],
];
$("pin-legend").innerHTML = PIN_LEGEND.map(
  ([kind, label]) =>
    `<span class="pin-legend"><i style="background:${PINCOLORS[kind]}"></i> ${label}</span>`,
).join("") +
  '<span class="pin-legend" title="数组颜色随元素类型变化"><i class="legend-square" style="background:none;border:1.5px solid #9fb3a6"></i> 数组·随元素类型</span>';
const LABELS = {
  OnPlayedFromHand: "从手牌打出",
  OnStartOfTurn: "回合开始",
  OnStartOfGame: "对局开始",
  OnOtherCardDestroyed: "其他卡牌被摧毁",
  OnReceiveDamage: "受到伤害",
  OnSuppressed: "被压制",
  GiveBlitz: "赋予闪击",
  GiveGuard: "赋予守护",
  GiveAmbush: "赋予伏击",
  GiveFury: "赋予奋战",
  GiveSmokescreen: "赋予烟幕",
  GiveKreditsBySide: "给予指挥点",
  DamageCard: "对卡牌造成伤害",
  DamageMultipleCards: "造成群体伤害",
  DrawCardsFromDeckBySide: "从牌组抽牌",
  SpawnCardOnBattlefield: "在战场生成卡牌",
  SpawnCardInHandBySide: "在手牌生成卡牌",
  ShuffleDeckBySide: "洗牌",
  SuppressUnit: "压制单位",
  TriggerDestruction: "触发亡语",
  TriggerDeployment: "触发部署",
  Branch: "条件分支",
  Sequence: "顺序执行",
  Boolean: "布尔变量",
  Integer: "整数变量",
  String: "文本变量",
  TakeControlOfEnemyUnit: "控制敌方单位",
  RemoveCardFromBoard: "移除战场卡牌",
  SetCountdown: "设置倒计时",
  RevealCard: "揭示卡牌",
  ResetUnitOperations: "重置行动",
  ShowNotification: "显示通知",
};
// Card type and rarity as the game shows them (the rarity metal is the card frame colour).
const TYPE_LABELS = {
  NotAvailable: "无 / None",
  infantry: "步兵 / Infantry",
  tank: "坦克 / Tank",
  artillery: "炮兵 / Artillery",
  fighter: "战斗机 / Fighter",
  bomber: "轰炸机 / Bomber",
  antiair: "防空炮 / Anti-Air",
  antitank: "反坦克炮 / Anti-Tank",
  tankdestroyer: "坦克歼击车 / Tank Destroyer",
  order: "指令 / Order",
  gotcha: "反制 / Countermeasure",
  location: "地点 / Location",
  wildcard: "万能牌 / Wildcard",
};
const RARITY_LABELS = {
  NotAvailable: "无稀有度 / No rarity",
  Common: "普通（铁） / Standard (Common)",
  Uncommon: "稀有（铜） / Limited (Uncommon)",
  Rare: "特殊（银） / Special (Rare)",
  Unique: "精英（金） / Elite (Unique)",
  Legendary: "传奇 / Legendary",
};
const labelled = (labels, values) => values.map((value) => ({ value, label: labels[value] || value }));
const FACTIONS = {
  Germany: "德国",
  Britain: "英国",
  Japan: "日本",
  Soviet: "苏联",
  USA: "美国",
  France: "法国",
  Italy: "意大利",
  Poland: "波兰",
  Finland: "芬兰",
  Anzac: "澳新军团",
  Allies: "盟军",
  Neutral: "中立",
  NotAvailable: "未指定",
};
let catalog = [],
  repository = null,
  enums = {},
  catalogEnums = {},
  project,
  category = "all",
  selection = new Set(),
  selectedEdge = null,
  pending = null,
  history = [],
  future = [],
  toastTimer,
  saveTimer,
  drag = null,
  space = false,
  placement = null,
  placementAuto = false,
  reasons = [],
  properties = [],
  cdQuery = "",
  cdOpen = false,
  pickerContext = null,
  classes = {};
const graph = () => project.graphs.find((g) => g.id === project.activeGraph),
  // Static catalog plus this project's variables, functions, macros and custom events,
  // limited to what the active graph may contain.
  fullCatalog = () =>
    [...catalog, ...dynamicDefinitions(project, graph())].filter((d) =>
      allowedInGraph(d, graph()) && (!d.event || canImplementEvent(d)) && !(d.callVariant && d.callable === false),
    ),
  color = (d) => nodeAppearance(d, enums).color,
  icon = nodeIcon,
  title = (n) =>
    n.title
      ? (nodeKind(n.definition) === "event" && !n.title.startsWith("事件")
          ? "事件 · "
          : "") + n.title
      : nodeChinese(n.definition);
// Primary node name for the current language; a custom title the user typed is always shown.
const nodeHeading = (n) =>
  langMode === "en" && !n.title ? nodeEnglish(n.definition) : title(n);
function toast(message, error = false) {
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4200);
}
// Every card lives in the browser's storage; a throwaway in-memory store is the fallback
// when storage is blocked (private windows, some embedded browsers).
const workspace = createWorkspace(
  (() => {
    try {
      localStorage.getItem("kards-blueprint-studio.probe");
      return localStorage;
    } catch {
      const memory = new Map();
      return {
        getItem: (k) => (memory.has(k) ? memory.get(k) : null),
        setItem: (k, v) => memory.set(k, String(v)),
        removeItem: (k) => memory.delete(k),
      };
    }
  })(),
);
let dirty = false; // edits waiting for the debounced save
let inspectorFieldTap = false;
function persist() {
  dirty = false;
  try {
    workspace.save(project);
    $("save-state").textContent = "本地已保存";
  } catch {
    $("save-state").textContent = "存储空间不足，请导出";
  }
  renderWorkspace();
}
function scheduleSave() {
  dirty = true;
  $("save-state").textContent = "正在保存…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
}
function checkpoint(snapshot = JSON.stringify(project)) {
  history.push(snapshot);
  if (history.length > 70) history.shift();
  future = [];
}
function mutate(fn) {
  checkpoint();
  fn();
  syncDefinitions(project);
  pending = null;
  render();
  persist();
}
function undo() {
  if (!history.length) return;
  future.push(JSON.stringify(project));
  project = JSON.parse(history.pop());
  enums = { ...catalogEnums, ...project.enums }; setEnumTable(enums); setTypeHierarchy({ ...classes, ...project.types });
  selection.clear();
  pending = null;
  selectedEdge = null;
  render();
  persist();
}
function redo() {
  if (!future.length) return;
  history.push(JSON.stringify(project));
  project = JSON.parse(future.pop());
  enums = { ...catalogEnums, ...project.enums }; setEnumTable(enums); setTypeHierarchy({ ...classes, ...project.types });
  selection.clear();
  pending = null;
  selectedEdge = null;
  render();
  persist();
}
function openModal(name, body, subtitle = "") {
  $("modal").classList.remove("context-menu");
  $("modal").style.cssText = "";
  $("modal-content").innerHTML =
    `<div class="modal-head"><div><h2>${esc(name)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button class="icon-button" id="close-modal" aria-label="关闭">×</button></div><div class="modal-body">${body}</div>`;
  $("close-modal").onclick = () => $("modal").close();
  if (!$("modal").open) $("modal").showModal();
}
function render() {
  enums = { ...catalogEnums, ...(project.enums || {}) };
  setEnumTable(enums);
  project.types = { ...classes, ...project.types };
  setTypeHierarchy(project.types);
  $("project-name").value = project.name;
  renderWorkspace();
  $("toggle-library").innerHTML = `☰ <span class="toggle-name">${esc(project.name)}</span>`;
  $("project-label").textContent = project.card.title;
  $("card-breadcrumb").textContent = project.card.title;
  $("graph-breadcrumb").textContent = graph().name;
  $("canvas-title").textContent = graph().name;
  $("graph-list").innerHTML = myBlueprintMarkup();
  $("tabs").innerHTML =
    project.graphs
      .map(
        (g) =>
          `<button class="tab ${g.id === project.activeGraph ? "active" : ""}" data-graph="${esc(g.id)}"><span class="graph-icon">${GRAPH_ICON[g.kind]}</span><span class="tab-name">${esc(g.name)}</span><span class="tab-dot"></span></button>`,
      )
      .join("") +
    '<button class="tab add-tab" id="tab-add" title="新建函数 / 宏 / 变量">＋</button>';
  {
    // keep the active tab in view when many graphs make the strip scroll
    const strip = $("tabs"),
      active = strip.querySelector(".tab.active");
    if (active) {
      const left = active.offsetLeft,
        right = left + active.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollLeft = left - 8;
      else if (right > strip.scrollLeft + strip.clientWidth - 44)
        strip.scrollLeft = right - strip.clientWidth + 52;
    }
  }
  $("canvas-subtitle").textContent = GRAPH_SUBTITLE[graph().kind];
  document
    .querySelectorAll("[data-graph]")
    .forEach((b) => (b.onclick = () => switchGraph(b.dataset.graph)));
  $("tab-add").onclick = newItemMenu;
  document.querySelectorAll("[data-class-defaults]").forEach((b) => (b.onclick = () => openClassDefaults("class-defaults")));
  document.querySelectorAll("[data-open-details]").forEach((b) => (b.onclick = () => openClassDefaults(b.dataset.openDetails)));
  for (const b of $("tabs").querySelectorAll("[data-graph]")) b.title = b.querySelector(".tab-name").textContent;
  $("tabs")
    .querySelectorAll("[data-graph]")
    .forEach((b) => (b.ondblclick = () => editGraph(b.dataset.graph)));
  bindMyBlueprint();
  renderNodes();
  // Tapping from one field of the Details panel to the next fires "change" on the first one just
  // before focus moves; rebuilding the panel then would swallow the tap and close the keyboard.
  if (inspectorFieldTap) inspectorFieldTap = false;
  else renderInspector();
  updateView();
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
  $("graph-stats").textContent =
    `${graph().nodes.length} 个节点 · ${graph().edges.length} 条连接`;
  $("empty-state").hidden = graph().nodes.length > 0;
  updateSelectionStatus();
  requestAnimationFrame(() => {
    drawEdges();
    drawMinimap();
  });
}
$("tabs").addEventListener(
  "wheel",
  (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }
  },
  { passive: false },
);
function switchGraph(id) {
  hintPaste();
  project.activeGraph = id;
  selection.clear();
  selectedEdge = null;
  pending = null;
  render();
  persist();
}
// ---------------------------------------------------------------- workspace (several cards)
let wsHtml = "",
  wsScrolledTo = "";
function renderWorkspace() {
  const list = $("workspace-list");
  if (!list) return;
  const html = workspace
    .list()
    .map(
      (c) =>
        `<div class="ws-row ${c.id === project?.id ? "active" : ""}"><button class="ws-open" data-card="${esc(c.id)}" title="${esc(c.name)}"><span class="ws-icon">▣</span><span class="ws-text"><strong>${esc(c.name)}</strong><small>${esc(c.title)}${c.faction ? ` · ${esc(FACTIONS[c.faction] || c.faction)}` : ""}</small></span></button><span class="ws-actions"><button class="tiny-button" data-ws="rename" data-card="${esc(c.id)}" title="重命名卡牌">✎</button><button class="tiny-button" data-ws="duplicate" data-card="${esc(c.id)}" title="复制卡牌">⧉</button><button class="tiny-button" data-ws="delete" data-card="${esc(c.id)}" title="删除卡牌">×</button></span></div>`,
    )
    .join("");
  // Saving re-renders this on every edit: skip identical markup, and only scroll on a card change.
  if (html === wsHtml) return;
  wsHtml = html;
  list.innerHTML = html;
  list.querySelectorAll(".ws-open").forEach(
    (b) =>
      (b.onclick = () => {
        openCard(b.dataset.card);
        if (window.innerWidth <= 800) setDrawer(false);
      }),
  );
  list.querySelectorAll("[data-ws]").forEach(
    (b) =>
      (b.onclick = () =>
        ({ rename: renameCard, duplicate: duplicateCard, delete: deleteCard })[
          b.dataset.ws
        ](b.dataset.card)),
  );
  if (wsScrolledTo !== project?.id) {
    wsScrolledTo = project?.id;
    list.querySelector(".ws-row.active")?.scrollIntoView({ block: "nearest" });
  }
}
// Makes `next` the card on screen (the previous one is saved first).
function loadProject(next, { fitView = true, save = true } = {}) {
  if (save) hintPaste();
  project = next;
  project.types = { ...classes, ...project.types };
  history = [];
  future = [];
  selection.clear();
  selectedEdge = null;
  pending = null;
  setTypeHierarchy(project.types);
  render();
  if (save) persist();
  if (fitView) requestAnimationFrame(fit);
}
function openCard(id) {
  if (project?.id === id) return;
  let next;
  try {
    const raw = workspace.read(id);
    if (!raw) throw new Error("找不到这张卡牌的数据");
    setTypeHierarchy({ ...classes, ...raw.types });
    next = validateProject(raw);
  } catch (error) {
    setTypeHierarchy(project.types);
    return toast(`无法打开这张卡牌：${error.message}`, true);
  }
  if (project) persist();
  loadProject(next);
}
// Gives an incoming card its own id and a free asset name before it joins the workspace.
function adoptCard(p) {
  if (workspace.has(p.id)) p.id = uid();
  p.name = workspace.uniqueName(p.name, p.id);
  return p;
}
function addCard(p) {
  adoptCard(p);
  if (project) persist();
  loadProject(p);
}
function readCard(id) {
  if (id === project?.id) {
    persist();
    return clone(project);
  }
  const raw = workspace.read(id);
  setTypeHierarchy({ ...classes, ...raw?.types });
  try {
    return validateProject(raw);
  } finally {
    setTypeHierarchy(project.types);
  }
}
function renameCard(id) {
  const meta = workspace.meta(id);
  openModal(
    "重命名卡牌",
    `<div class="field"><label class="detail-label" for="rc-name">资源名称</label><input id="rc-name" maxlength="64" value="${esc(meta.name)}"><p class="detail-description">名称只能包含英文字母、数字和下划线，不能以数字开头（不支持中文）。</p></div><div class="field"><label class="detail-label" for="rc-title">卡牌标题</label><input id="rc-title" maxlength="100" value="${esc(meta.title)}"></div><div class="modal-actions"><button id="rc-save" class="primary-button">保存</button></div>`,
  );
  $("rc-save").onclick = () => {
    const name = $("rc-name").value.trim(),
      title = $("rc-title").value.trim() || meta.title,
      error = checkName(name) || (workspace.nameTaken(name, id) ? "资源名称已被工作区里的另一张卡牌使用" : null);
    if (error) return toast(error, true);
    if (id === project.id) mutate(() => {
      project.name = name;
      project.card.title = title;
    });
    else {
      try {
        const other = readCard(id);
        other.name = name;
        other.card.title = title;
        workspace.save(other, { activate: false });
      } catch (e) {
        return toast(e.message, true);
      }
      renderWorkspace();
    }
    $("modal").close();
  };
}
function duplicateCard(id) {
  try {
    const copy = readCard(id);
    copy.id = uid();
    copy.name = workspace.uniqueName(`${copy.name}_Copy`.slice(0, 64));
    addCard(copy);
    toast(`已复制为 ${copy.name}`);
  } catch (e) {
    toast(e.message, true);
  }
}
function deleteCard(id) {
  const meta = workspace.meta(id);
  if (!confirm(tr(`删除卡牌“${meta.name}”？这不能撤销，建议先导出。`))) return;
  const wasActive = id === project.id;
  workspace.remove(id);
  if (wasActive) {
    const nextId = workspace.active();
    if (nextId) {
      const raw = workspace.read(nextId);
      try {
        setTypeHierarchy({ ...classes, ...raw?.types });
        project = null;
        loadProject(validateProject(raw));
      } catch (e) {
        toast(e.message, true);
      }
    } else {
      project = null;
      const blank = makeProject();
      blank.name = workspace.uniqueName(blank.name);
      loadProject(blank);
    }
  } else renderWorkspace();
}
// Imports .kardsbp.json files and .zip bundles; every card is added to the workspace.
async function importFiles(files) {
  const cards = [],
    problems = [];
  const take = (text, label) => {
    try {
      const parsed = JSON.parse(text);
      setTypeHierarchy({ ...classes, ...parsed.types });
      cards.push(validateProject(parsed));
    } catch (error) {
      problems.push(
        `${label}：${error instanceof SyntaxError ? "JSON 格式错误，无法导入" : error.message}`,
      );
    }
  };
  for (const file of files) {
    if (file.size > 32 * 1024 * 1024) {
      problems.push(`${file.name}：文件超过 32 MB 限制`);
      continue;
    }
    try {
      if (/\.zip$/i.test(file.name))
        for (const entry of await readZip(await file.arrayBuffer()))
          if (/\.json$/i.test(entry.name)) take(entry.text, entry.name);
          else continue;
      else take(await file.text(), file.name);
    } catch (error) {
      problems.push(`${file.name}：${error.message}`);
    }
  }
  if (project) setTypeHierarchy(project.types);
  if (cards.length) {
    if (project) persist();
    for (const c of cards) {
      adoptCard(c);
      workspace.save(c, { activate: false });
    }
    loadProject(cards[cards.length - 1]);
    toast(
      cards.length === 1
        ? `已导入 ${cards[0].name} · ${cards[0].graphs.length} 个图表`
        : `已导入 ${cards.length} 张卡牌`,
    );
  }
  if (problems.length) toast(problems.join("；"), true);
}
async function exportAllZip() {
  persist();
  try {
    const entries = workspace.ids().map((id) => {
      const p = readCard(id);
      return {
        name: `${p.name}.kardsbp.json`,
        data: JSON.stringify(
          buildExport(p, { classes: { ...classes, ...p.types }, enums, repository }),
          null,
          2,
        ),
      };
    });
    const day = new Date().toISOString().slice(0, 10);
    download(
      `kards-workspace-${day}.zip`,
      new Blob([makeZip(entries)], { type: "application/zip" }),
    );
    toast(`已导出 ${entries.length} 张卡牌（ZIP）`);
  } catch (error) {
    toast(`导出失败：${error.message}`, true);
  }
}

// ---------------------------------------------------------------- blueprint structure UI
const GRAPH_ICON = { event: "⌘", function: "ƒ", macro: "⧉" };
const GRAPH_SUBTITLE = {
  event: "Event Graph · 卡牌事件图",
  function: "Function · 函数",
  macro: "Macro · 宏",
};
const graphById = (id) => project.graphs.find((g) => g.id === id);
// Every top-level name already in use (variables, graphs, dispatchers, custom events, parent members).
const usedNames = ({ graph: g, variable: v, dispatcher: d, events = true } = {}) => [
  ...project.variables.filter((x) => x !== v).map((x) => x.name),
  ...project.graphs.filter((x) => x !== g).map((x) => x.name),
  ...project.dispatchers.filter((x) => x !== d).map((x) => x.name),
  ...(events
    ? project.graphs[0].nodes
        .filter((n) => n.definition.bp?.type === "customEvent")
        .map((n) => n.definition.name)
    : []),
  ...parentMembers(),
];
// The blueprint's own type, used to decide which object pins may default to Self.
const selfType = () => `${project.asset.parentClass}*`;
const pinDefault = (p) => defaultValue(p.type, enums, selfType());
const classMap = () => ({ ...classes, ...project.types });
// Names already used by the parent class; a blueprint may not redefine them.
const parentMembers = () =>
  catalog.filter((d) => d.class === project.asset.parentClass).map((d) => d.name);
const bi2 = (zh, en) => `<span class="zh">${zh}</span><span class="en">${en}</span>`;

function myBlueprintMarkup() {
  const head = (zh, en, buttons = "") =>
    `<div class="bp-head"><span>${bi2(zh, en)}</span><span class="bp-actions">${buttons}</span></div>`;
  const add = (kind, title, icon = "＋") =>
    `<button class="tiny-button" data-new="${kind}" title="${title}">${icon}</button>`;
  const row = (g) =>
    `<div class="bp-row"><button class="graph-link ${g.id === project.activeGraph ? "active" : ""}" data-graph="${esc(g.id)}"><span class="graph-icon">${GRAPH_ICON[g.kind]}</span>${esc(g.name)}${g.override ? '<em class="bp-tag">override</em>' : ""}<span>${g.nodes.length}</span></button>${g.kind === "event" ? "" : `<button class="tiny-button" data-edit-graph="${esc(g.id)}" title="编辑">✎</button>`}</div>`;
  const events = project.graphs[0].nodes.filter(
    (n) => n.definition.bp?.type === "customEvent",
  );
  const local = (v) =>
    `<div class="bp-row"><button class="graph-link var-link" data-edit-graph="${esc(graph().id)}" title="${esc(v.type)}"><i class="var-dot" style="background:${pinColor(v.type)}"></i>${esc(v.name)}<span class="var-type">${esc(v.type)}</span></button><button class="tiny-button" data-add-var="getLocal:${esc(v.id)}" title="获取">G</button><button class="tiny-button" data-add-var="setLocal:${esc(v.id)}" title="设置">S</button></div>`;
  const dispatcher = (d) =>
    `<div class="bp-row"><button class="graph-link var-link" data-dispatcher="${esc(d.id)}" title="${esc(d.description || d.name)}"><span class="graph-icon">◉</span>${esc(d.name)}<span class="var-type">${d.params.length}</span></button><button class="tiny-button" data-add-dispatch="call:${esc(d.id)}" title="调用">C</button><button class="tiny-button" data-add-dispatch="bind:${esc(d.id)}" title="绑定事件">B</button><button class="tiny-button" data-add-dispatch="unbind:${esc(d.id)}" title="解除绑定">U</button></div>`;
  const variable = (v) =>
    `<div class="bp-row"><button class="graph-link var-link" data-var="${esc(v.id)}" title="${esc(v.tooltip || v.type)}"><i class="var-dot" style="background:${pinColor(v.type)}"></i>${esc(v.name)}<span class="var-type">${esc(v.type)}</span></button><button class="tiny-button" data-add-var="get:${esc(v.id)}" title="获取">G</button><button class="tiny-button" data-add-var="set:${esc(v.id)}" title="设置">S</button></div>`;
  return (
    `<div class="bp-row"><button class="graph-link" data-open-details="card-data" title="名称、阵营、类型、稀有度、费用、攻击、防御、文字"><span class="graph-icon">▣</span>${bi2("卡牌信息", "Card Data")}</button></div>` +
    `<div class="bp-row"><button class="graph-link" data-class-defaults title="编辑父类属性的默认值"><span class="graph-icon">⚙</span>${bi2("类默认值", "Class Defaults")}${Object.keys(project.classDefaults).length ? `<em class="bp-tag">${Object.keys(project.classDefaults).length}</em>` : ""}</button></div>` +
    head("图表", "Graphs") +
    row(project.graphs[0]) +
    events
      .map(
        (n) =>
          `<div class="bp-row bp-sub"><button class="graph-link" data-event-node="${esc(n.id)}"><span class="graph-icon">ϟ</span>${esc(n.definition.name)}</button></div>`,
      )
      .join("") +
    head(
      "函数",
      "Functions",
      add("function", "新建函数") + add("override", "覆写函数与事件", "⤴"),
    ) +
    project.graphs.filter((g) => g.kind === "function").map(row).join("") +
    head("宏", "Macros", add("macro", "新建宏")) +
    project.graphs.filter((g) => g.kind === "macro").map(row).join("") +
    head("变量", "Variables", add("variable", "新建变量")) +
    project.variables.map(variable).join("") +
    (graph().kind === "function"
      ? head("局部变量", "Local variables") +
        graph().locals.map(local).join("")
      : "") +
    head("事件分发器", "Event dispatchers", add("dispatcher", "新建事件分发器")) +
    project.dispatchers.map(dispatcher).join("")
  );
}
function bindMyBlueprint() {
  document
    .querySelectorAll("[data-new]")
    .forEach((b) => (b.onclick = () => newItem(b.dataset.new)));
  document
    .querySelectorAll("[data-edit-graph]")
    .forEach((b) => (b.onclick = () => editGraph(b.dataset.editGraph)));
  document
    .querySelectorAll("[data-var]")
    .forEach((b) => (b.onclick = () => variableDialog(b.dataset.var)));
  document
    .querySelectorAll("[data-dispatcher]")
    .forEach((b) => (b.onclick = () => dispatcherDialog(b.dataset.dispatcher)));
  document.querySelectorAll("[data-add-dispatch]").forEach(
    (b) =>
      (b.onclick = () => {
        const [action, id] = b.dataset.addDispatch.split(":");
        addBlueprintNode(`bp.dispatch.${action}.${id}`);
        if (window.innerWidth <= 800) setDrawer(false);
      }),
  );
  document.querySelectorAll("[data-add-var]").forEach(
    (b) =>
      (b.onclick = () => {
        const [kind, id] = b.dataset.addVar.split(":");
        addVariableNode(kind, id);
        if (window.innerWidth <= 800) setDrawer(false);
      }),
  );
  document.querySelectorAll("[data-event-node]").forEach(
    (b) =>
      (b.onclick = () => {
        project.activeGraph = project.graphs[0].id;
        selection = new Set([b.dataset.eventNode]);
        selectedEdge = null;
        render();
        persist();
      }),
  );
}
function addBlueprintNode(defId) {
  if (!fullCatalog().some((d) => d.id === defId))
    return toast("当前图表不能使用此节点", true);
  addNode(defId);
}
const addVariableNode = (kind, id) =>
  addBlueprintNode(`bp.${kind.toLowerCase()}.${id}`);
function newItem(kind) {
  if ($("modal").open) $("modal").close();
  if (kind === "function" || kind === "macro") functionDialog(null, kind);
  else if (kind === "override") overrideDialog();
  else if (kind === "dispatcher") dispatcherDialog(null);
  else variableDialog(null);
}
function newItemMenu() {
  const item = (kind, zh, en) =>
    `<button class="secondary-button new-item" data-new-item="${kind}">${bi2(zh, en)}</button>`;
  openModal(
    "新建",
    `<div class="new-menu">${item("function", "新建函数", "New function")}${item("override", "覆写函数与事件", "Override functions and events")}${item("macro", "新建宏", "New macro")}${item("variable", "新建变量", "New variable")}${item("dispatcher", "新建事件分发器", "New event dispatcher")}</div><p class="detail-description">EventGraph 是唯一的事件图，不能再新建。更多逻辑请写在函数、宏或自定义事件里。</p>`,
  );
  $("modal-content")
    .querySelectorAll("[data-new-item]")
    .forEach((b) => (b.onclick = () => newItem(b.dataset.newItem)));
}
function editGraph(id) {
  const g = graphById(id);
  if (!g) return;
  if (g.kind === "event")
    return openModal(
      "EventGraph",
      "<p>EventGraph 是蓝图唯一的事件图，不能新建、重命名或删除。</p><p>事件（如“从手牌打出”）和自定义事件都放在这里；更多逻辑请新建函数或宏。</p>",
    );
  functionDialog(id, g.kind);
}

// ---- parameter lists (functions, macros, custom events)
function typeSelect(current, { allowExec = false, locked = false } = {}) {
  const base = elementType(current);
  const choices = [
    ...(allowExec ? ["exec"] : []),
    ...typeChoices(enums, classMap()),
  ];
  if (!choices.includes(base)) choices.push(base);
  return `<select class="param-type" ${locked ? "disabled" : ""}>${choices.map((t) => `<option ${t === base ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><label class="param-array"><input type="checkbox" ${isArrayType(current) ? "checked" : ""} ${locked ? "disabled" : ""}> ${bi2("数组", "Array")}</label>`;
}
function paramRow(p, opts) {
  return `<div class="param-row" data-param="${esc(p.id)}"><input class="param-name" maxlength="64" value="${esc(p.name)}" placeholder="Name" ${opts.locked ? "disabled" : ""}>${typeSelect(p.type, opts)}${opts.withDefault ? defaultControl(p.type, p.default ?? defaultValueFor(p.type, enums), 'class="param-default"') : ""}${opts.locked ? "" : '<button type="button" class="tiny-button param-del" title="删除">×</button>'}</div>`;
}
function paramEditor(listId, zh, en, params, opts = {}) {
  return `<div class="field"><div class="detail-label">${bi2(zh, en)}</div><div id="${listId}" class="param-list" data-allow-exec="${opts.allowExec ? 1 : 0}" data-with-default="${opts.withDefault ? 1 : 0}">${params.map((p) => paramRow(p, opts)).join("")}</div>${opts.locked ? "" : `<button type="button" class="secondary-button param-add" data-list="${listId}">＋ ${bi2("添加参数", "Add parameter")}</button>`}</div>`;
}
function bindParamEditors() {
  const root = $("modal-content");
  root.onchange = (e) => {
    const row = e.target.closest(".param-row");
    if (!row || !row.querySelector(".param-default")) return;
    if (!e.target.matches(".param-type, .param-array input")) return;
    const base = row.querySelector(".param-type").value,
      type = row.querySelector(".param-array input").checked ? arrayOf(base) : base;
    row.querySelector(".param-default").outerHTML = defaultControl(
      type,
      defaultValueFor(type, enums),
      'class="param-default"',
    );
  };
  root.onclick = (e) => {
    const del = e.target.closest(".param-del");
    if (del) return del.closest(".param-row").remove();
    const add = e.target.closest(".param-add");
    if (!add) return;
    const list = $(add.dataset.list),
      n = list.querySelectorAll(".param-row").length + 1;
    list.insertAdjacentHTML(
      "beforeend",
      paramRow(newParam(list.dataset.withDefault === "1" ? `Local${n}` : `Param${n}`, "bool"), {
        allowExec: list.dataset.allowExec === "1",
        withDefault: list.dataset.withDefault === "1",
      }),
    );
  };
}
function readParams(listId, label) {
  const seen = [],
    out = [];
  for (const row of $(listId).querySelectorAll(".param-row")) {
    const name = row.querySelector(".param-name").value.trim(),
      error = checkName(name, seen);
    if (error) {
      toast(`${label}：${error}`, true);
      return null;
    }
    seen.push(name);
    const base = row.querySelector(".param-type").value,
      array = row.querySelector(".param-array input").checked && base !== "exec";
    const type = array ? arrayOf(base) : base,
      entry = { id: row.dataset.param, name, type };
    if ($(listId).dataset.withDefault === "1")
      entry.default = parseDefaultValue(type, row.querySelector(".param-default").value);
    out.push(entry);
  }
  return out;
}

// ---- functions and macros
function functionDialog(id, kind = "function") {
  const g = id ? graphById(id) : null;
  kind = g ? g.kind : kind;
  const locked = !!g?.override,
    isFn = kind === "function",
    draft = g || {
      description: "",
      pure: false,
      access: "Public",
      category: "Default",
      inputs: [],
      outputs: [],
    };
  const title = g
    ? isFn
      ? "编辑函数"
      : "编辑宏"
    : isFn
      ? "新建函数"
      : "新建宏";
  openModal(
    title,
    `<div class="field"><label class="detail-label" for="fn-name">名称</label><input id="fn-name" maxlength="64" value="${esc(g ? g.name : isFn ? "NewFunction" : "NewMacro")}" ${locked ? "disabled" : ""}><p class="detail-description">名称只能包含英文字母、数字和下划线，不能以数字开头（不支持中文）。</p></div><div class="field"><label class="detail-label" for="fn-desc">说明</label><textarea id="fn-desc" placeholder="可以用中文写说明">${esc(draft.description)}</textarea></div>${isFn ? `<div class="field-grid"><div class="field"><label class="detail-label" for="fn-access">访问</label><select id="fn-access">${["Public", "Protected", "Private"].map((v) => `<option ${v === draft.access ? "selected" : ""}>${v}</option>`).join("")}</select></div><div class="field"><label class="detail-label" for="fn-category">分类</label><input id="fn-category" maxlength="64" value="${esc(draft.category)}"></div></div>${locked ? "" : `<label class="check-row"><input type="checkbox" id="fn-pure" ${draft.pure ? "checked" : ""}> 纯函数（没有执行引脚）</label>`}` : ""}${paramEditor("fn-inputs", "输入参数", "Inputs", draft.inputs, { allowExec: !isFn, locked })}${paramEditor("fn-outputs", "输出参数", "Outputs", draft.outputs, { allowExec: !isFn, locked })}${isFn ? paramEditor("fn-locals", "局部变量", "Local variables", draft.locals || [], { withDefault: true }) : ""}<div class="modal-actions">${g ? '<button id="fn-delete" class="danger-button" style="width:auto;margin:0">删除</button>' : ""}<button id="fn-save" class="primary-button">${g ? "保存" : "创建"}</button></div>`,
  );
  bindParamEditors();
  $("fn-save").onclick = () => {
    const name = $("fn-name").value.trim();
    if (!locked) {
      const taken = [
        ...usedNames({ graph: g }),
      ];
      const error = checkName(name, taken);
      if (error) return toast(error, true);
    }
    const inputs = readParams("fn-inputs", "输入参数");
    if (!inputs) return;
    const outputs = readParams("fn-outputs", "输出参数");
    if (!outputs) return;
    const common = {
      description: $("fn-desc").value.trim(),
      inputs,
      outputs,
    };
    if (isFn) {
      const locals = readParams("fn-locals", "局部变量");
      if (!locals) return;
      const used = new Set([...inputs, ...outputs].map((p) => p.name.toLowerCase()));
      if (locals.some((l) => used.has(l.name.toLowerCase())))
        return toast("局部变量不能和输入、输出参数重名", true);
      common.locals = locals;
      common.access = $("fn-access").value;
      common.category = $("fn-category").value.trim() || "Default";
      common.pure = locked ? g.pure : $("fn-pure").checked;
    }
    mutate(() => {
      if (g) Object.assign(g, { name, ...common });
      else {
        const ng = isFn
          ? makeFunctionGraph(name, common)
          : makeMacroGraph(name, common);
        project.graphs.push(ng);
        project.activeGraph = ng.id;
        selection.clear();
      }
    });
    $("modal").close();
  };
  if ($("fn-delete"))
    $("fn-delete").onclick = () => {
      if (!confirm(tr(`删除“${g.name}”？调用它的节点也会被一并删除，可使用撤销恢复。`)))
        return;
      mutate(() => {
        project.graphs = project.graphs.filter((x) => x !== g);
        if (project.activeGraph === g.id)
          project.activeGraph = project.graphs[0].id;
        selection.clear();
      });
      $("modal").close();
    };
}
$("open-overrides").onclick = () => overrideDialog();
function overrideDialog() {
  const parent = project.asset.parentClass,
    all = overridableMembers(catalog, parent, { ...classes, ...project.types });
  if (!all.length)
    return openModal("覆写函数与事件 / Overrides & Events", "<p>没有可以重载的父类函数。</p>");
  const paramText = (d) => {
    const s = overrideSignature(d),
      list = (a) => a.map((p) => `${p.type} ${p.name}`).join(", ");
    if (d.event) return `Event (${list(s.outputs)})`;
    return `${s.pure ? "pure " : ""}(${list(s.inputs)})${s.outputs.length ? ` → (${list(s.outputs)})` : ""}`;
  };
  const text = new Map(
    all.map((d) => [d.id, `${d.name} ${nodeChinese(d)} ${paramText(d)}`.toLowerCase()]),
  );
  let query = "";
  openModal(
    "覆写函数与事件 / Overrides & Events",
    `<input id="ovr-search" class="modal-search" placeholder="搜索重载 / Search overrides…" autocomplete="off" aria-label="搜索重载"><div id="ovr-count" class="ovr-count"></div><div id="ovr-list" class="ovr-list"></div><p class="detail-description">${bi2("事件（无输出）添加到 EventGraph；带输出的覆写创建函数图。列表包含已知父类继承成员，已有实现会定位到原节点或函数。", "Events without outputs go to EventGraph; overrides with outputs create function graphs. Inherited members are included; existing implementations are opened.")}</p>`,
    parent,
  );
  const used = (d) => project.graphs.some((g) => g.override?.function === d.name || g.nodes.some((n) => n.definition.event && n.definition.name === d.name));
  const visible = () =>
    all.filter(
      (d) =>
        query.split(/\s+/).every((w) => text.get(d.id).includes(w)),
    );
  function draw() {
    const list = visible();
    $("ovr-count").textContent = `${list.length} / ${all.length}`;
    $("ovr-list").innerHTML = list.length
      ? list
          .map(
            (d) =>
              `<button type="button" class="ovr-row ${d.event ? "is-event" : "is-fn"}" data-ovr="${esc(d.id)}" title="${esc(d.signature || d.name)}"><span class="ovr-icon">${d.event ? "ϟ" : "ƒ"}</span><span class="ovr-main"><strong>${esc(d.name)}</strong><small>${esc(nodeChinese(d))}</small><code>${esc(paramText(d))}</code></span><span class="ovr-state ${used(d) ? "done" : ""}">${used(d) ? bi2("已实现", "Implemented") : d.event ? bi2("事件", "Event") : bi2("函数", "Function")}</span></button>`,
          )
          .join("")
      : `<p class="detail-description">${bi2("没有匹配的项。", "No matches.")}</p>`;
    $("ovr-list")
      .querySelectorAll("[data-ovr]")
      .forEach((b) => (b.onclick = () => pick(all.find((d) => d.id === b.dataset.ovr))));
  }
  function pick(def) {
    $("modal").close();
    const known = project.graphs.find((g) => g.override?.function === def.name);
    if (known) {
      project.activeGraph = known.id;
      render();
      persist();
      return;
    }
    if (def.event) {
      const eventGraph = project.graphs.find((g) => g.kind === "event");
      const existing = eventGraph.nodes.find((n) => n.definition.event && n.definition.name === def.name);
      project.activeGraph = eventGraph.id;
      if (existing) { selection = new Set([existing.id]); render(); persist(); return; }
      addNode(def.id);
      return;
    }
    const sig = overrideSignature(def);
    mutate(() => {
      const g = makeFunctionGraph(def.name, {
        override: { class: def.class, function: def.name, source: def.source || null },
        pure: sig.pure,
        inputs: sig.inputs,
        outputs: sig.outputs,
        description: `Override of ${def.class}::${def.name}`,
      });
      project.graphs.push(g);
      project.activeGraph = g.id;
      selection.clear();
    });
  }
  $("ovr-search").oninput = (e) => {
    query = e.target.value.trim().toLowerCase();
    draw();
  };
  $("ovr-search").onkeydown = (e) => {
    if (e.key === "Enter" && visible().length) pick(visible()[0]);
  };
  draw();
  if (window.innerWidth > 800) $("ovr-search").focus();
}

// ---- variables
// Input for a default value that matches the type: switch for bool, list for enums,
// number box for int/float, text otherwise. `attrs` is e.g. `id="var-default"`.
function defaultControl(type, value, attrs = 'id="var-default"') {
  const base = elementType(type),
    kind = pinKind(base);
  if (isArrayType(type)) return `<input ${attrs} value="${esc(value)}">`;
  const list = kind === "bool" ? ["false", "true"] : enums[base];
  if (list)
    return `<select ${attrs}>${list.map((v) => `<option ${String(value) === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
  if (kind === "int" || kind === "float")
    return `<input ${attrs} type="number" step="${kind === "int" ? 1 : "any"}" value="${esc(value)}">`;
  return `<input ${attrs} value="${esc(value)}">`;
}
function parseDefaultValue(type, raw) {
  const base = elementType(type),
    kind = pinKind(base);
  if (isArrayType(type)) return raw;
  if (kind === "bool") return raw === "true";
  if (kind === "int" || kind === "float") {
    const n = Number(raw);
    return Number.isFinite(n) ? (kind === "int" ? Math.trunc(n) : n) : 0;
  }
  return raw;
}
const readDefault = (type) => parseDefaultValue(type, $("var-default").value);
function variableDialog(id) {
  const v = id ? project.variables.find((x) => x.id === id) : null;
  let n = project.variables.length + 1,
    suggestion = `NewVar${n}`;
  while (project.variables.some((x) => x.name === suggestion))
    suggestion = `NewVar${++n}`;
  const draft = v || makeVariable(suggestion, "bool", enums);
  openModal(
    v ? "编辑变量" : "新建变量",
    `<div class="field"><label class="detail-label" for="var-name">名称</label><input id="var-name" maxlength="64" value="${esc(draft.name)}"><p class="detail-description">名称只能包含英文字母、数字和下划线，不能以数字开头（不支持中文）。</p></div><div class="field-grid"><div class="field"><div class="detail-label">${bi2("类型", "Type")}</div><div class="param-row">${typeSelect(draft.type)}</div></div></div><div class="field"><div class="detail-label">${bi2("默认值", "Default value")}</div><div id="var-default-wrap">${defaultControl(draft.type, draft.default)}</div></div><div class="field"><label class="detail-label" for="var-category">分类</label><input id="var-category" maxlength="64" value="${esc(draft.category)}"></div><div class="field"><label class="detail-label" for="var-tip">说明</label><textarea id="var-tip" placeholder="可以用中文写说明">${esc(draft.tooltip)}</textarea></div><label class="check-row"><input type="checkbox" id="var-editable" ${draft.instanceEditable ? "checked" : ""}> 实例可编辑</label><label class="check-row"><input type="checkbox" id="var-expose" ${draft.exposeOnSpawn ? "checked" : ""}> 生成时公开</label><div class="modal-actions">${v ? '<button id="var-delete" class="danger-button" style="width:auto;margin:0">删除</button>' : ""}<button id="var-save" class="primary-button">${v ? "保存" : "创建"}</button></div>`,
  );
  const typeNow = () => {
    const root = $("modal-content"),
      base = root.querySelector(".param-type").value;
    return root.querySelector(".param-array input").checked ? arrayOf(base) : base;
  };
  const refreshDefault = () => {
    const type = typeNow();
    $("var-default-wrap").innerHTML = defaultControl(type, defaultValueFor(type, enums));
  };
  $("modal-content").querySelector(".param-type").onchange = refreshDefault;
  $("modal-content").querySelector(".param-array input").onchange = refreshDefault;
  $("var-save").onclick = () => {
    const name = $("var-name").value.trim(),
      taken = usedNames({ variable: v }),
      error = checkName(name, taken);
    if (error) return toast(error, true);
    const type = typeNow(),
      values = {
        name,
        type,
        default: readDefault(type),
        category: $("var-category").value.trim() || "Default",
        tooltip: $("var-tip").value.trim(),
        instanceEditable: $("var-editable").checked,
        exposeOnSpawn: $("var-expose").checked,
      };
    mutate(() => {
      if (v) Object.assign(v, values);
      else project.variables.push({ ...draft, ...values });
    });
    $("modal").close();
  };
  if ($("var-delete"))
    $("var-delete").onclick = () => {
      if (!confirm(tr(`删除“${v.name}”？使用它的获取/设置节点也会被一并删除，可使用撤销恢复。`)))
        return;
      mutate(() => {
        project.variables = project.variables.filter((x) => x !== v);
      });
      $("modal").close();
    };
}

// ---- custom events
function customEventDialog(node, point) {
  const params = node ? node.definition.bp.params : [];
  openModal(
    node ? "编辑自定义事件" : "添加自定义事件",
    `<div class="field"><label class="detail-label" for="ce-name">名称</label><input id="ce-name" maxlength="64" value="${esc(node ? node.definition.name : "NewEvent")}"><p class="detail-description">名称只能包含英文字母、数字和下划线，不能以数字开头（不支持中文）。</p></div>${paramEditor("ce-params", "参数", "Parameters", params)}<div class="modal-actions"><button id="ce-save" class="primary-button">${node ? "保存" : "创建"}</button></div>`,
  );
  bindParamEditors();
  $("ce-save").onclick = () => {
    const name = $("ce-name").value.trim(),
      events = project.graphs[0].nodes.filter(
        (n) => n.definition.bp?.type === "customEvent" && n !== node,
      ),
      taken = [
        ...usedNames({ events: false }),
        ...events.map((n) => n.definition.name),
      ],
      error = checkName(name, taken);
    if (error) return toast(error, true);
    const list = readParams("ce-params", "参数");
    if (!list) return;
    mutate(() => {
      if (node) node.definition = customEventDefinition(name, list, node.definition);
      else {
        const at = point || freeSpotNearCenter();
        const n = makeNode(
          customEventDefinition(name, list),
          Math.round(at.x / 10) * 10,
          Math.round(at.y / 10) * 10,
        );
        graph().nodes.push(n);
        selection = new Set([n.id]);
        selectedEdge = null;
      }
    });
    $("modal").close();
  };
}

// ---- event dispatchers
function dispatcherDialog(id) {
  const d = id ? project.dispatchers.find((x) => x.id === id) : null;
  openModal(
    d ? "编辑事件分发器" : "新建事件分发器",
    `<div class="field"><label class="detail-label" for="ed-name">名称</label><input id="ed-name" maxlength="64" value="${esc(d ? d.name : `OnEvent${project.dispatchers.length + 1}`)}"><p class="detail-description">名称只能包含英文字母、数字和下划线，不能以数字开头（不支持中文）。</p></div><div class="field"><label class="detail-label" for="ed-desc">说明</label><textarea id="ed-desc" placeholder="可以用中文写说明">${esc(d?.description || "")}</textarea></div>${paramEditor("ed-params", "参数", "Parameters", d ? d.params : [])}<div class="modal-actions">${d ? '<button id="ed-delete" class="danger-button" style="width:auto;margin:0">删除</button>' : ""}<button id="ed-save" class="primary-button">${d ? "保存" : "创建"}</button></div>`,
  );
  bindParamEditors();
  $("ed-save").onclick = () => {
    const name = $("ed-name").value.trim(),
      error = checkName(name, usedNames({ dispatcher: d }));
    if (error) return toast(error, true);
    const params = readParams("ed-params", "参数");
    if (!params) return;
    const values = { name, params, description: $("ed-desc").value.trim() };
    mutate(() => {
      if (d) Object.assign(d, values);
      else project.dispatchers.push({ id: uid(), ...values });
    });
    $("modal").close();
  };
  if ($("ed-delete"))
    $("ed-delete").onclick = () => {
      if (!confirm(tr(`删除“${d.name}”？使用它的调用、绑定节点也会被一并删除，可使用撤销恢复。`)))
        return;
      mutate(() => {
        project.dispatchers = project.dispatchers.filter((x) => x !== d);
      });
      $("modal").close();
    };
}

// ---- inspector helpers
function assetSection() {
  const a = project.asset;
  return `<section class="detail-section"><h3 class="detail-heading">资源 <span>ASSET</span></h3>${field("资源名称", "asset.name", project.name)}<div class="field"><label class="detail-label">父类<input value="${esc(a.parentClass)}" disabled></label></div>${field("包路径", "asset.packagePath", a.packagePath)}<div class="field"><label class="detail-label">说明<textarea data-field="asset.description" placeholder="可以用中文写说明">${esc(a.description)}</textarea></label></div></section>`;
}
function graphSection() {
  const g = graph(),
    sig = (list) => list.map((p) => `${p.type} ${p.name}`).join(", ") || "—";
  if (g.kind === "event")
    return `<section class="detail-section"><h3 class="detail-heading">图表 <span>GRAPH</span></h3><p class="detail-description">EventGraph 是蓝图唯一的事件图，不能新建、重命名或删除。点击节点可编辑参数和注释。</p></section>`;
  return `<section class="detail-section"><h3 class="detail-heading">${g.kind === "macro" ? "宏" : "函数"} <span>${g.kind === "macro" ? "MACRO" : "FUNCTION"}</span></h3><div class="detail-source">${esc(g.name)}${g.override ? `\n(override ${esc(g.override.class)}::${esc(g.override.function)})` : ""}\n in: ${esc(sig(g.inputs))}\nout: ${esc(sig(g.outputs))}</div><button class="secondary-button" id="graph-settings" style="width:100%">编辑</button></section>`;
}
function bpNodeSection(n) {
  const t = n.definition.bp?.type;
  if (!t) return "";
  const label = {
    customEvent: "编辑自定义事件",
    entry: "编辑函数签名",
    result: "编辑函数签名",
    macroEntry: "编辑宏签名",
    macroExit: "编辑宏签名",
    call: "转到函数",
    macro: "转到宏",
    callEvent: "转到事件",
    get: "编辑变量",
    set: "编辑变量",
    getLocal: "编辑函数（局部变量）",
    setLocal: "编辑函数（局部变量）",
    dispatcher: "编辑事件分发器",
  }[t];
  return `<section class="detail-section"><h3 class="detail-heading">蓝图 <span>BLUEPRINT</span></h3><button class="secondary-button" id="bp-edit" style="width:100%">${label}</button></section>`;
}
function editBlueprintNode(n) {
  const bp = n.definition.bp;
  if (bp.type === "customEvent") return customEventDialog(n);
  if (["entry", "result", "macroEntry", "macroExit"].includes(bp.type))
    return functionDialog(bp.graphId, graphById(bp.graphId).kind);
  if (bp.type === "call" || bp.type === "macro") return switchGraph(bp.graphId);
  if (bp.type === "getLocal" || bp.type === "setLocal")
    return functionDialog(bp.graphId, "function");
  if (bp.type === "dispatcher") return dispatcherDialog(bp.dispatcherId);
  if (bp.type === "callEvent") {
    project.activeGraph = project.graphs[0].id;
    selection = new Set([bp.eventNodeId]);
    render();
    return persist();
  }
  return variableDialog(bp.variableId);
}
function libraryItem(d) {
  return `<button class="library-node" draggable="true" data-def="${esc(d.id)}" title="${esc(d.signature || nodeEnglish(d))}" style="--node-color:${color(d)}"><span class="lib-icon">${icon(d)}</span><span><strong>${esc(langMode === "zh" ? nodeChinese(d) : nodeEnglish(d))}</strong><small>${langMode === "both" ? esc(nodeChinese(d)) + " " : ""}<span class="lib-owner">${esc((d.class || "UE").replace(/^[UA](?=[A-Z][a-z])/, "").replace("Stub", ""))}</span></small></span></button>`;
}
function filterCatalog(q, cat = "all") {
  q = q.trim().toLowerCase();
  const items = fullCatalog().filter(
    (d) =>
      (cat === "all" || d.category === cat) &&
      `${nodeEnglish(d)} ${d.class} ${nodeChinese(d)} ${d.aliases || ""} ${d.pins.map((p) => p.name).join(" ")}`
        .toLowerCase()
        .includes(q),
  );
  return items.sort(
    (a, b) => Number(!!LABELS[b.name]) - Number(!!LABELS[a.name]),
  );
}
// "Show more" footer shared by the node library and the node picker. The step is chosen
// in a drop-down (50 … 1000, or all) and clicking keeps expanding until everything is shown.
let moreStep = "100";
const MORE_STEPS = ["50", "100", "200", "500", "1000", "all"];
const moreAmount = (shown, total) =>
  moreStep === "all"
    ? total - shown
    : Math.min(Number(moreStep), total - shown);
function moreMarkup(shown, total) {
  return `<div class="more-row" data-shown="${shown}" data-total="${total}"><span class="more-count">${shown} / ${total}</span><select class="more-step" aria-label="每次显示的数量">${MORE_STEPS.map((v) => `<option value="${v}" ${v === moreStep ? "selected" : ""}>${v === "all" ? "全部" : v}</option>`).join("")}</select><button type="button" class="secondary-button more-btn">${bi2("显示更多", "Show more")} (+<span class="more-n">${moreAmount(shown, total)}</span>)</button><button type="button" class="secondary-button more-all">${bi2("展开全部", "Show all")}</button></div>`;
}
// `grow(amount)` receives how many extra rows to show; Infinity expands everything.
function bindMore(container, grow) {
  const row = container.querySelector(".more-row");
  if (!row) return;
  const shown = Number(row.dataset.shown),
    total = Number(row.dataset.total);
  row.querySelector(".more-step").onchange = (e) => {
    moreStep = e.target.value;
    row.querySelector(".more-n").textContent = moreAmount(shown, total);
  };
  row.querySelector(".more-btn").onclick = () => grow(moreAmount(shown, total));
  row.querySelector(".more-all").onclick = () => grow(Infinity);
}
// Re-render a scrolling list without jumping back to the top.
function keepScroll(el, render) {
  const top = el.scrollTop;
  render();
  el.scrollTop = top;
}
let libraryLimit = 120;
function renderLibrary() {
  const results = filterCatalog($("node-search").value, category);
  $("category-list").innerHTML = Object.entries(CAT)
    .map(
      ([key, label]) =>
        `<button class="category ${category === key ? "active" : ""}" data-category="${key}">${label}</button>`,
    )
    .join("");
  $("category-list")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          category = b.dataset.category;
          libraryLimit = 120;
          renderLibrary();
        }),
    );
  $("library-label").innerHTML = `${CAT[category]} · ${results.length}`;
  $("node-list").innerHTML = results.length
    ? results.slice(0, libraryLimit).map(libraryItem).join("") +
      (results.length > libraryLimit
        ? moreMarkup(libraryLimit, results.length)
        : "")
    : '<div class="no-results">没有匹配的节点</div>';
  bindMore($("node-list"), (amount) => {
    libraryLimit = Math.min(results.length, libraryLimit + amount);
    keepScroll($("node-list"), renderLibrary);
  });
  bindLibrary($("node-list"));
}
function bindLibrary(container) {
  container.querySelectorAll("[data-def]").forEach((b) => {
    b.ondragstart = (e) => {
      e.dataTransfer.setData("application/x-kards-node", b.dataset.def);
      e.dataTransfer.effectAllowed = "copy";
    };
    b.ondblclick = () => addNode(b.dataset.def);
    b.onclick = () => {
      if (window.innerWidth <= 800) {
        addNode(b.dataset.def);
        setDrawer(false);
      } else $("selection-status").textContent = "双击添加节点，或拖入画布";
    };
  });
}
// Centre of the view, moved to the nearest spot that does not cover an existing node.
// On-screen size of a node that is not drawn yet: copy a node of the same kind when there is
// one, otherwise estimate from its pin rows and the length of its pin names.
function estimateSize(def) {
  const twin = graph().nodes.find((n) => n.definition.id === def?.id);
  const el = twin && document.querySelector(`[data-node-id="${CSS.escape(twin.id)}"]`);
  if (el) return { w: el.offsetWidth, h: el.offsetHeight };
  const side = (dir) => (def?.pins || []).filter((p) => p.direction === dir),
    longest = (list) => Math.max(0, ...list.map((p) => String(p.name).length));
  return {
    w: Math.max(240, 210 + 12 * (longest(side("in")) + longest(side("out")))),
    h: 56 + Math.max(side("in").length, side("out").length, 1) * 30,
  };
}
function freeSpotNearCenter(size = { w: 240, h: 130 }) {
  const base = centerPoint();
  base.x = Math.round(base.x / 10) * 10;
  base.y = Math.round(base.y / 10) * 10;
  const boxes = graph().nodes.map((n) => {
      const el = document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`);
      return { x: n.x, y: n.y, w: el?.offsetWidth || 240, h: el?.offsetHeight || 120 };
    }),
    free = (x, y) =>
      !boxes.some(
        (b) => x < b.x + b.w + 20 && b.x < x + size.w && y < b.y + b.h + 20 && b.y < y + size.h,
      );
  const viewport = $("viewport"), view = graph().view;
  const visible = (x, y) => x * view.zoom + view.x >= 8 && y * view.zoom + view.y >= 8 && (x + size.w) * view.zoom + view.x <= viewport.clientWidth - 8 && (y + size.h) * view.zoom + view.y <= viewport.clientHeight - 8;
  for (const preferVisible of [true, false])
  for (let ring = 0; ring < 12; ring++)
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = base.x + dx * (size.w + 30),
          y = base.y + dy * (size.h + 20);
        if (free(x, y) && (!preferVisible || visible(x, y))) return { x, y };
      }
  return base;
}
// Tidy the graph the way a person would draw it: execution flows left to right, pure value
// nodes sit just left of the node that uses them and line up with the pin they feed, a node's
// branches (True / False, Then 0 / Then 1 …) follow the pin order, unrelated graphs get their
// own band, and nodes with no wires are parked in a tidy grid below.
function arrangeNodes() {
  const g = graph();
  if (!g.nodes.length) return;
  const zoom = g.view.zoom || 1,
    GAP = 30,
    M = new Map();
  for (const n of g.nodes) {
    const el = document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`),
      box = el?.getBoundingClientRect(),
      pinY = {};
    if (el)
      for (const pe of el.querySelectorAll(".pin")) {
        const r = pe.getBoundingClientRect();
        pinY[pe.dataset.pin] = (r.top + r.height / 2 - box.top) / zoom;
      }
    M.set(n.id, {
      w: el?.offsetWidth || 240,
      h: el?.offsetHeight || 120,
      pinY,
      pure: !n.definition.pins.some((p) => p.type === "exec"),
    });
  }
  const pinOffset = (id, pin) => M.get(id).pinY[pin] ?? 24;
  const edges = g.edges.filter(
    (e) => M.has(e.from.node) && M.has(e.to.node) && e.from.node !== e.to.node,
  );
  // Connected components (wires in either direction).
  const parent = new Map(g.nodes.map((n) => [n.id, n.id])),
    find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  for (const e of edges) parent.set(find(e.from.node), find(e.to.node));
  const wired = new Set(edges.flatMap((e) => [e.from.node, e.to.node])),
    groups = new Map();
  for (const n of g.nodes) {
    if (!wired.has(n.id)) continue;
    const k = find(n.id);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  const pos = new Map();
  let bandTop = 0,
    maxRight = 0;
  const comps = [...groups.values()].sort(
    (a, b) => Math.min(...a.map((n) => n.y)) - Math.min(...b.map((n) => n.y)),
  );
  for (const comp of comps) {
    const ids = new Set(comp.map((n) => n.id)),
      ce = edges.filter((e) => ids.has(e.from.node)),
      outs = (id) => ce.filter((e) => e.from.node === id),
      // A pure node that feeds something is laid out in a "gutter" in front of its consumer.
      gutter = new Set(
        comp.filter((n) => M.get(n.id).pure && outs(n.id).length).map((n) => n.id),
      );
    if (gutter.size === comp.length) gutter.clear();
    const body = comp.filter((n) => !gutter.has(n.id)),
      flow = ce.filter((e) => !gutter.has(e.from.node) && !gutter.has(e.to.node)),
      col = new Map(body.map((n) => [n.id, 0]));
    for (let pass = 0; pass < body.length; pass++) {
      let changed = false;
      for (const e of flow) {
        const d = col.get(e.from.node) + 1;
        if (d > col.get(e.to.node) && d <= body.length) {
          col.set(e.to.node, d);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const level = new Map(),
      gcol = new Map();
    for (const id of gutter) {
      level.set(id, 1);
      gcol.set(id, Infinity);
    }
    for (let pass = 0; pass <= gutter.size + 1; pass++) {
      let changed = false;
      for (const id of gutter)
        for (const e of outs(id)) {
          const c = e.to.node,
            cc = gutter.has(c) ? gcol.get(c) : col.get(c),
            cl = gutter.has(c) ? level.get(c) + 1 : 1;
          if (cc < gcol.get(id)) (gcol.set(id, cc), (changed = true));
          if (cl > level.get(id) && cl <= gutter.size + 1) (level.set(id, cl), (changed = true));
        }
      if (!changed) break;
    }
    for (const id of gutter) if (!Number.isFinite(gcol.get(id))) gcol.set(id, 0);
    const maxCol = Math.max(0, ...col.values()),
      slots = new Map(), // "col:level" -> gutter nodes
      width = (list) => Math.max(0, ...list.map((n) => M.get(n.id).w));
    for (const id of gutter) {
      const k = `${gcol.get(id)}:${level.get(id)}`;
      if (!slots.has(k)) slots.set(k, []);
      slots.get(k).push(byIdNode(id));
    }
    function byIdNode(id) {
      return g.nodes.find((n) => n.id === id);
    }
    // x positions: for every column its gutter levels (farthest first), then the column itself.
    const colX = new Map(),
      slotX = new Map();
    let x = 0;
    for (let d = 0; d <= maxCol; d++) {
      const top = Math.max(0, ...[...gutter].filter((id) => gcol.get(id) === d).map((id) => level.get(id)));
      for (let k = top; k >= 1; k--) {
        slotX.set(`${d}:${k}`, x);
        x += width(slots.get(`${d}:${k}`) || []) + 70;
      }
      colX.set(d, x);
      x += width(body.filter((n) => col.get(n.id) === d)) + 100;
    }
    const local = new Map(),
      place = (list, desired) => {
        // keep the given order, push down only as far as needed to avoid overlap
        let bottom = -Infinity;
        for (const n of list) {
          const want = desired(n),
            y = bottom === -Infinity ? (Number.isFinite(want) ? want : 0) : Math.max(want, bottom + GAP);
          local.set(n.id, { x: local.get(n.id)?.x ?? 0, y });
          bottom = y + M.get(n.id).h;
        }
      };
    for (let d = 0; d <= maxCol; d++) {
      const column = body.filter((n) => col.get(n.id) === d),
        want = new Map();
      for (const n of column) {
        const ups = flow
          .filter((e) => e.to.node === n.id && col.get(e.from.node) < d && local.has(e.from.node))
          .map((e) => local.get(e.from.node).y + pinOffset(e.from.node, e.from.pin) - pinOffset(n.id, e.to.pin));
        want.set(n.id, ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : null);
      }
      const placed = column.filter((n) => want.get(n.id) !== null).sort((a, b) => want.get(a.id) - want.get(b.id)),
        roots = column.filter((n) => want.get(n.id) === null).sort((a, b) => a.y - b.y || a.x - b.x),
        ordered = [...placed, ...roots];
      for (const n of column) local.set(n.id, { x: colX.get(d), y: 0 });
      place(ordered, (n) => want.get(n.id) ?? -Infinity);
      // pure value nodes feeding this column, nearest level first
      for (let k = 1; ; k++) {
        const list = slots.get(`${d}:${k}`);
        if (!list) {
          if (k > gutter.size + 1) break;
          continue;
        }
        const wantG = new Map();
        for (const n of list) {
          const downs = outs(n.id)
            .filter((e) => local.has(e.to.node))
            .map((e) => local.get(e.to.node).y + pinOffset(e.to.node, e.to.pin) - pinOffset(n.id, e.from.pin));
          wantG.set(n.id, downs.length ? downs.reduce((a, b) => a + b, 0) / downs.length : 0);
        }
        for (const n of list) local.set(n.id, { x: slotX.get(`${d}:${k}`), y: 0 });
        place([...list].sort((a, b) => wantG.get(a.id) - wantG.get(b.id)), (n) => wantG.get(n.id));
      }
    }
    // Gutter nodes of later levels may feed gutter nodes placed in the same pass: settle once more.
    const top = Math.min(...[...local.values()].map((p) => p.y)),
      bottom = Math.max(...comp.map((n) => local.get(n.id).y + M.get(n.id).h));
    for (const n of comp) {
      const p = local.get(n.id);
      pos.set(n.id, { x: p.x, y: p.y - top + bandTop });
      maxRight = Math.max(maxRight, p.x + M.get(n.id).w);
    }
    bandTop += bottom - top + 110;
  }
  // Nodes without any wire: a grid below, left to right then down.
  const loose = g.nodes
    .filter((n) => !wired.has(n.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rowWidth = Math.max(1200, maxRight);
  let gx = 0,
    gy = bandTop,
    rowH = 0;
  for (const n of loose) {
    const { w, h } = M.get(n.id);
    if (gx > 0 && gx + w > rowWidth) {
      gx = 0;
      gy += rowH + GAP;
      rowH = 0;
    }
    pos.set(n.id, { x: gx, y: gy });
    gx += w + 40;
    rowH = Math.max(rowH, h);
  }
  mutate(() => {
    for (const n of g.nodes) {
      const p = pos.get(n.id);
      n.x = Math.round(p.x / 10) * 10;
      n.y = Math.round(p.y / 10) * 10;
    }
  });
  fit();
  toast("已整理节点布局");
}
function centerPoint() {
  const r = $("viewport").getBoundingClientRect(),
    v = graph().view;
  return {
    x: (r.width / 2 - v.x) / v.zoom - 140,
    y: (r.height / 2 - v.y) / v.zoom - 70,
  };
}
function canImplementEvent(def) {
  if (!def.event) return true;
  const seen = new Set(), hierarchy = { ...classes, ...project.types };
  for (let owner = project.asset.parentClass; owner && !seen.has(owner); owner = hierarchy[owner]?.parent) { if (def.class === owner) return true; seen.add(owner); }
  return false;
}
function addNode(id, point, sourceEndpoint = null) {
  const def = fullCatalog().find((d) => d.id === id);
  if (!def) return;
  if (def.event) {
    const existing = graph().nodes.find((n) => n.definition.event && n.definition.name === def.name);
    if (existing) { selection = new Set([existing.id]); render(); toast("此事件已有实现，已选中原节点。"); return; }
  }
  point = point || freeSpotNearCenter(estimateSize(def));
  if (def.action === "newCustomEvent") return customEventDialog(null, point);
  mutate(() => {
    const n = makeNode(
      def,
      Math.round(point.x / 10) * 10,
      Math.round(point.y / 10) * 10,
    );
    graph().nodes.push(n);
    if (sourceEndpoint) {
      const sourceNode = graph().nodes.find(
        (node) => node.id === sourceEndpoint.node,
      );
      const sourcePin = sourceNode?.definition.pins.find(
        (p) => p.id === sourceEndpoint.pin,
      );
      const targetPin = sourcePin && matchingPin(n.definition, sourcePin);
      if (targetPin) {
        connect(graph(), sourceEndpoint, { node: n.id, pin: targetPin.id });
        if (sourcePin.direction === "out" && sourcePin.type !== "exec") {
          const exec = sourceNode.definition.pins.find(
            (p) =>
              p.direction === "out" && p.type === "exec" && p.id !== "Failed",
          );
          const into = n.definition.pins.find(
            (p) => p.direction === "in" && p.type === "exec",
          );
          if (
            exec &&
            into &&
            !graph().edges.some(
              (e) => e.from.node === sourceNode.id && e.from.pin === exec.id,
            )
          )
            connect(
              graph(),
              { node: sourceNode.id, pin: exec.id },
              { node: n.id, pin: into.id },
            );
        }
      }
    }
    selection = new Set([n.id]);
    selectedEdge = null;
  });
}
function picker(point, sourceEndpoint = null) {
  placementAuto = !point;
  placement = point || freeSpotNearCenter();
  pickerContext = sourceEndpoint ? clone(sourceEndpoint) : null;
  const sourceNode =
    sourceEndpoint && graph().nodes.find((n) => n.id === sourceEndpoint.node);
  const sourcePin = sourceNode?.definition.pins.find(
    (p) => p.id === sourceEndpoint.pin,
  );
  openModal(
    sourcePin
      ? "此引脚的可用操作 / Actions for this Pin"
      : "添加节点 / All Actions",
    `${sourcePin ? `<div class="context-type"><i style="background:${pinColor(sourcePin.type)}"></i><strong>${esc(sourcePin.type)}</strong><span>${esc(translate(sourcePin.name))} · ${esc(sourcePin.name)}</span></div>` : ""}<input id="picker-search" class="modal-search" placeholder="搜索 / Search actions…" aria-label="搜索可添加节点"><div class="context-options"><label><input type="checkbox" id="context-sensitive" checked> 上下文关联 / Context Sensitive</label>${sourcePin ? '<select id="context-scope"><option value="all">所有兼容操作 / All Compatible</option><option value="members">属性和成员 / Members</option><option value="functions">成员函数 / Functions</option><option value="properties">读取/写入属性 / Properties</option><option value="casts">类型转换 / Cast & Convert</option></select>' : ""}</div><div id="picker-count"></div><div id="picker-results" class="picker-results"></div><div class="modal-actions"><button id="custom-node" class="secondary-button">＋ 自定义节点 / Custom Node</button></div>`,
    sourcePin
      ? "选择节点后自动连接此引脚 / Automatically connect compatible pins"
      : `${fullCatalog().length} 个节点 · KARDS + Unreal Blueprint`,
  );
  let limit = 100;
  const update = (keepLimit = false) => {
    if (keepLimit !== true) limit = 100;
    let matches = filterCatalog($("picker-search").value);
    if (sourcePin && $("context-sensitive").checked)
      matches = matches.filter((d) => matchingPin(d, sourcePin));
    const scope = $("context-scope")?.value;
    if (scope === "members")
      matches = matches.filter((d) => d.pins.some((p) => p.id === "target"));
    if (scope === "functions")
      matches = matches.filter(
        (d) => !d.property && d.pins.some((p) => p.id === "target"),
      );
    if (scope === "properties") matches = matches.filter((d) => d.property);
    if (scope === "casts")
      matches = matches.filter((d) =>
        ["cast", "conversion"].includes(nodeKind(d)),
      );
    if (sourcePin) {
      const rank = (d) =>
        matchingPin(d, sourcePin)?.id === "target"
          ? d.property
            ? 2
            : 3
          : nodeKind(d) === "cast"
            ? 1
            : 0;
      matches.sort((a, b) => rank(b) - rank(a));
    }
    $("picker-count").textContent = `${matches.length} 个操作 / Actions`;
    $("picker-results").innerHTML =
      (matches.slice(0, limit).map(libraryItem).join("") +
        (matches.length > limit ? moreMarkup(limit, matches.length) : "")) ||
      '<div class="no-results">无兼容操作 / No compatible actions</div>';
    bindMore($("picker-results"), (amount) => {
      limit = Math.min(matches.length, limit + amount);
      keepScroll($("picker-results"), () => update(true));
    });
    $("picker-results")
      .querySelectorAll("[data-def]")
      .forEach((b) => {
        b.draggable = false;
        b.onclick = () => {
          if (Date.now() < ignoreBackdropUntil) return;
          $("modal").close();
          addNode(b.dataset.def, placementAuto ? null : placement, pickerContext);
        };
      });
  };
  $("picker-search").oninput = () => update();
  $("context-sensitive").onchange = () => update();
  if ($("context-scope")) $("context-scope").onchange = () => update();
  $("picker-search").onkeydown = (e) => {
    if (e.key === "Enter") $("picker-results").querySelector("button")?.click();
  };
  $("custom-node").onclick = customNode;
  update();
  const r = viewport.getBoundingClientRect(),
    view = graph().view,
    w = Math.min(490, window.innerWidth - 24),
    h = Math.min(620, window.innerHeight - 32);
  const screenX = r.left + placement.x * view.zoom + view.x,
    screenY = r.top + placement.y * view.zoom + view.y;
  $("modal").classList.add("context-menu");
  $("modal").style.cssText =
    `margin:0;width:${w}px;max-height:${h}px;left:${Math.max(12, Math.min(screenX, window.innerWidth - w - 12))}px;top:${Math.max(12, Math.min(screenY, window.innerHeight - h - 12))}px;`;
  $("picker-search").focus();
}
function customNode() {
  openModal(
    "自定义节点",
    `<div class="field"><label class="detail-label" for="custom-name">节点名称</label><input id="custom-name" value="CustomAction" maxlength="100"></div><div class="field"><label class="detail-label" for="custom-category">节点类型</label><select id="custom-category"><option value="custom">动作（含执行端口）</option><option value="events">事件（执行输出）</option><option value="variables">纯数据节点</option></select></div><div class="field"><label class="detail-label" for="custom-pins">数据端口：每行「方向 类型 名称」</label><textarea id="custom-pins" class="custom-ports" spellcheck="false">in int32 Amount\nout bool Success</textarea></div><p>方向为 in / out。支持 bool、int32、float、FString、UBaseCardObject* 及 KARDS 枚举。相同类型才能连线。</p><div class="modal-actions"><button id="create-custom" class="primary-button">创建节点</button></div>`,
  );
  $("create-custom").onclick = () => {
    const name = $("custom-name").value.trim(),
      cat = $("custom-category").value;
    if (!name) return toast("请输入节点名称", true);
    let pins = [];
    if (cat === "custom")
      pins.push({ id: "exec-in", name: "执行", type: "exec", direction: "in" });
    if (cat !== "variables")
      pins.push({
        id: "exec-out",
        name: "然后",
        type: "exec",
        direction: "out",
      });
    const lines = $("custom-pins")
      .value.split("\n")
      .filter((l) => l.trim());
    for (const line of lines) {
      const m = line.trim().match(/^(in|out)\s+(\S+)\s+(\w+)$/);
      if (!m || pins.some((p) => p.id === m?.[3]) || m[2] === "exec")
        return toast("端口格式错误、名称重复或使用了保留类型 exec", true);
      pins.push({ id: m[3], name: m[3], type: m[2], direction: m[1] });
    }
    if (pins.length > 100) return toast("自定义节点最多支持 100 个端口", true);
    const def = {
      id: "custom." + uid(),
      name,
      class: "Custom",
      category: cat,
      pure: cat === "variables",
      pins,
    };
    mutate(() => {
      const n = makeNode(def, placement?.x || 100, placement?.y || 150);
      graph().nodes.push(n);
      selection = new Set([n.id]);
    });
    $("modal").close();
  };
}
// Editable default value shown on the node itself: switch (bool), list (enum / Self-None),
// number box (int / float) or text box.
// The Reason output of these overrides is a key of the game's textNotifications table.
const REASON_FUNCTIONS = new Set(["CanPlayFromHand", "CanBeTargetted", "CanOtherCardBeTargetted"]);
const isReasonPin = (n, p) =>
  graph().override &&
  REASON_FUNCTIONS.has(graph().override.function) &&
  n.definition.bp?.type === "result" &&
  p.name === "Reason";
const reasonText = (key) => {
  const r = reasons.find((x) => x.key === key);
  return r ? [r.zh, r.text].filter(Boolean).join(" / ") : "";
};
function reasonDialog(nodeId, pinId) {
  const n = graph().nodes.find((x) => x.id === nodeId);
  if (!n) return;
  const current = String(n.values[pinId] ?? "");
  let query = "";
  const apply = (key) => {
    $("modal").close();
    mutate(() => {
      n.values[pinId] = key;
    });
  };
  openModal(
    "选择 Reason / Pick a reason",
    `<p class="detail-description">${bi2("Reason 是游戏文本表 textNotifications 里的键，玩家看到的是对应的提示文字。推荐从列表里选；也可以自己写一个键。带 {0} 的文字，用 reasonParam1 / reasonParam2 填空。", "Reason is a key of the game's textNotifications table; players see the matching text. Pick one from the list (recommended) or type your own key. Texts with {0} are filled from reasonParam1 / reasonParam2.")}</p><input id="rs-search" class="modal-search" placeholder="搜索键或文字（中英文都行）/ Search key or text…" autocomplete="off"><div id="rs-count" class="ovr-count"></div><div id="rs-list" class="ovr-list"></div><div class="field rs-custom"><label class="detail-label" for="rs-custom">${bi2("自定义键", "Custom key")}</label><div class="rs-custom-row"><input id="rs-custom" value="${esc(current)}" placeholder="my_reason_key" maxlength="128"><button id="rs-use" class="primary-button" type="button">${bi2("使用", "Use")}</button><button id="rs-clear" class="secondary-button" type="button">${bi2("清空", "Clear")}</button></div></div>`,
  );
  const visible = () =>
    reasons.filter((r) => `${r.key} ${r.text} ${r.zh || ""}`.toLowerCase().includes(query));
  const draw = () => {
    const list = visible();
    $("rs-count").textContent = `${list.length} / ${reasons.length}`;
    $("rs-list").innerHTML = list.length
      ? list
          .map(
            (r) =>
              `<button type="button" class="ovr-row rs-row ${r.key === current ? "current" : ""}" data-key="${esc(r.key)}"><span class="ovr-main"><strong>${esc(r.key)}</strong><small>${r.zh ? `<span class="zh">${esc(r.zh)}</span><span class="en">${esc(r.text)}</span>` : esc(r.text)}</small></span>${r.params ? `<span class="ovr-state">{0}</span>` : ""}${r.key === current ? `<span class="ovr-state done">✓</span>` : ""}</button>`,
          )
          .join("")
      : `<p class="detail-description">${bi2("没有匹配的键，可以在下面直接输入。", "No match: type your own key below.")}</p>`;
    $("rs-list")
      .querySelectorAll("[data-key]")
      .forEach((b) => (b.onclick = () => apply(b.dataset.key)));
  };
  $("rs-search").oninput = (e) => {
    query = e.target.value.trim().toLowerCase();
    draw();
  };
  $("rs-search").onkeydown = (e) => {
    if (e.key === "Enter" && visible().length) apply(visible()[0].key);
  };
  $("rs-use").onclick = () => apply($("rs-custom").value.trim());
  $("rs-custom").onkeydown = (e) => {
    if (e.key === "Enter") apply($("rs-custom").value.trim());
  };
  $("rs-clear").onclick = () => apply("");
  draw();
  if (window.innerWidth > 800) $("rs-search").focus();
}
function valueControl(n, p, val) {
  const attrs = `data-input="${esc(p.id)}" data-input-node="${esc(n.id)}"`;
  const kind = pinKind(p.type);
  if (n.folded?.[p.id]) return `<button type="button" class="pin-input folded-value" data-clear-fold="${esc(p.id)}" data-clear-fold-node="${esc(n.id)}" title="${esc(n.folded[p.id].text)} · 点击改为手动输入">ƒ ${esc(n.folded[p.id].text)} ×</button>`;
  if (kind === "bool")
    return `<input type="checkbox" class="pin-checkbox" ${attrs} ${val === true || val === "true" ? "checked" : ""} aria-label="${esc(p.name)} 默认布尔值">`;
  if (p.id === "target" && val === "None")
    return `<span class="pin-value pin-need" title="${esc(`这个函数属于 ${n.definition.class}，不是本蓝图（${project.asset.parentClass}）的成员，Target 必须连接`)}">None</span>`;
  if (isReasonPin(n, p))
    return `<button type="button" class="pin-input pin-reason ${val ? "" : "empty"}" data-reason="${esc(p.id)}" data-reason-node="${esc(n.id)}" title="${esc(reasonText(val) || "点击选择 Reason 键，也可以自己输入")}">${val ? esc(val) : bi2("选择原因…", "Pick a reason…")} ▾</button>`;
  const list = enums[p.type];
  if (list)
    return `<select class="pin-input" ${attrs}>${[...new Set([...list, String(val)])].map((v) => `<option ${String(v) === String(val) ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
  if (kind === "object" && p.type.endsWith("*") && pinDefault(p) === "Self")
    return `<select class="pin-input" ${attrs}>${["Self", "None"].map((v) => `<option ${v === String(val) ? "selected" : ""}>${v}</option>`).join("")}</select>`;
  if (kind === "int" || kind === "float")
    return `<input class="pin-input pin-number" type="number" step="${kind === "int" ? 1 : "any"}" value="${esc(val)}" ${attrs}>`;
  if (kind === "object" || kind === "array")
    return `<span class="pin-value">${esc(val)}</span>`;
  return `<input class="pin-input pin-text" type="text" value="${esc(val)}" ${attrs}>`;
}
const pinConnected = (n, p) =>
  graph().edges.some(
    (e) =>
      (e.from.node === n.id && e.from.pin === p.id) ||
      (e.to.node === n.id && e.to.pin === p.id),
  );
// Like Unreal: a Target that would just be Self stays hidden until something is wired to it.
// While a wire is being dragged from a compatible object pin it appears so it can be dropped on.
function targetHidden(n, p) {
  if (p.id !== "target" || p.direction !== "in" || pinConnected(n, p)) return false;
  if ((n.values.target ?? pinDefault(p)) !== "Self") return false;
  if (pending) {
    const from = graph()
      .nodes.find((x) => x.id === pending.node)
      ?.definition.pins.find((x) => x.id === pending.pin);
    if (from && from.direction === "out" && compatible(from.type, p.type))
      return false;
  }
  return true;
}
function pinMarkup(n, p) {
  const connected = pinConnected(n, p);
  const val = n.values[p.id] ?? pinDefault(p);
  const button = `<button class="pin ${p.type === "exec" ? "exec" : ""} ${pinKind(p.type) === "array" ? "array" : ""} ${connected ? "connected" : ""} ${pending?.node === n.id && pending.pin === p.id ? "pending" : ""}" style="--pin-color:${pinColor(p.type)}" data-node="${esc(n.id)}" data-pin="${esc(p.id)}" title="${esc(p.name)} · ${esc(p.type.split("$T").join("Wildcard"))} · ${p.direction === "in" ? "输入" : "输出"}" aria-label="${esc(p.name)} ${p.direction === "in" ? "输入" : "输出"}端口"></button>`;
  const cn = translate(p.name),
    raw = pinEnglish(p);
  const label = nodeAppearance(n.definition, enums).compact && p.direction === "out" ? "" : cn === raw ? `<span class="pin-label"><span>${esc(raw)}</span></span>` : `<span class="pin-label"><span class="pin-cn zh">${esc(cn)}</span><span class="pin-en en">${esc(raw)}</span></span>`;
  const showValue =
    !connected &&
    p.type !== "exec" &&
    pinKind(p.type) !== "delegate" &&
    pinKind(p.type) !== "wildcard" &&
    !(p.id === "target" && val === "Self") &&
    (p.direction === "in" ||
      (n.definition.category === "variables" && n.definition.kind === "variable"));
  const remove = canRemoveDynamicPin(n.definition, p.id) ? `<button type="button" class="remove-user-pin" data-remove-user-pin="${esc(p.id)}" data-pin-owner="${esc(n.id)}" title="删除引脚（可撤销）" aria-label="删除 ${esc(p.name)} 引脚">×</button>` : "";
  return `<div class="pin-row ${p.direction === "out" ? "output" : ""}">${p.direction === "in" ? button : ""}${label}${showValue ? valueControl(n, p, val) : ""}${p.direction === "out" ? button : ""}${remove}</div>`;
}
function nodeBody(n) {
  const hidden = new Set(n.showAdvanced ? [] : n.definition.advancedPins || []);
  const ins = n.definition.pins.filter(
      (p) => p.direction === "in" && !targetHidden(n, p) && (!hidden.has(p.id) || pinConnected(n, p)),
    ),
    outs = n.definition.pins.filter((p) => p.direction === "out");
  const enumPicker = n.definition.switchEnum || n.definition.selectEnum || n.definition.enumCompare
    ? `<div class="switch-enum"><select data-switch-enum="${esc(n.id)}" aria-label="枚举 / Enum"><option value="">${langMode === "en" ? "Choose enum…" : "选择枚举…"}</option>${Object.keys(enums)
        .map((k) => `<option ${k === n.definition.enumType ? "selected" : ""}>${esc(k)}</option>`)
        .join("")}</select></div>`
    : "";
  const spec = dynamicPinSpec(n.definition);
  const add = spec ? `<button type="button" class="add-user-pin" data-add-user-pin="${esc(n.id)}" ${n.definition.pins.length >= 126 || spec.kind === "operands" && spec.pins.length >= 26 ? "disabled" : ""} title="${spec.kind === "exec" || spec.kind.includes("Cases") ? "添加分支" : "添加引脚"}">＋${nodeAppearance(n.definition, enums).slim ? "" : ` ${spec.kind === "exec" || spec.kind.includes("Cases") ? "添加分支" : "添加引脚"}`}</button>` : "";
  return enumPicker + Array.from(
    { length: Math.max(ins.length, outs.length) },
    (_, i) =>
      `<div class="pin-pair">${ins[i] ? pinMarkup(n, ins[i]) : '<div class="pin-row"></div>'}${outs[i] ? pinMarkup(n, outs[i]) : '<div class="pin-row output"></div>'}</div>`,
  ).join("") + add + (n.definition.advancedPins?.length ? `<button class="pin-input advanced-toggle" data-advanced-node="${esc(n.id)}">${n.showAdvanced ? "收起参数" : `更多参数 (${n.definition.advancedPins.length})`} ▾</button>` : "");
}
$("nodes").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add-user-pin]"), remove = e.target.closest("[data-remove-user-pin]");
  if (add || remove) {
    const n = graph().nodes.find((n) => n.id === (add?.dataset.addUserPin || remove.dataset.pinOwner));
    if (n) mutate(() => { if (add) addDynamicPin(graph(), n, enums); else removeDynamicPin(graph(), n, remove.dataset.removeUserPin); });
    return;
  }
  const folded = e.target.closest("[data-clear-fold]");
  if (folded) {
    const n = graph().nodes.find((n) => n.id === folded.dataset.clearFoldNode);
    if (n) mutate(() => { delete n.folded[folded.dataset.clearFold]; });
    return;
  }
  const button = e.target.closest("[data-advanced-node]");
  if (!button) return;
  const n = graph().nodes.find((n) => n.id === button.dataset.advancedNode);
  if (n) mutate(() => { n.showAdvanced = !n.showAdvanced; });
});
$("nodes").addEventListener("change", (e) => {
  const sw = e.target.closest("[data-switch-enum]");
  if (sw) {
    const n = graph().nodes.find((x) => x.id === sw.dataset.switchEnum);
    if (n) mutate(() => (n.definition.enumType = sw.value || null));
    return;
  }
  const el = e.target.closest("[data-input]");
  if (!el) return;
  const n = graph().nodes.find((x) => x.id === el.dataset.inputNode),
    p = n?.definition.pins.find((x) => x.id === el.dataset.input);
  if (!p) return;
  const kind = pinKind(p.type);
  const val =
    kind === "bool" ? el.checked : kind === "int" || kind === "float" ? Number(el.value) : el.value;
  if (typeof val === "number" && !Number.isFinite(val)) return renderNodes();
  mutate(() => (n.values[p.id] = kind === "int" ? Math.trunc(val) : val));
});
// Nodes size themselves to their content, so redraw wires whenever one changes size.
// A soft keyboard (or focus) can scroll the clipped canvas or resize the
// window; undo the scroll and redraw so wires stay on their pins.
// Pointer events can arrive faster than frames; draw wires/minimap at most once per frame.
let redrawFrame = 0,
  redrawMapOnly = true,
  redrawViewOnly = true;
function redrawSoon(mapOnly = false, viewOnly = false) {
  redrawMapOnly = redrawMapOnly && mapOnly;
  redrawViewOnly = redrawViewOnly && viewOnly;
  if (redrawFrame) return;
  redrawFrame = requestAnimationFrame(() => {
    redrawFrame = 0;
    if (!redrawMapOnly) {
      if (drag?.type === "nodes" && drag.fast) moveFastEdges();
      else drawEdges();
    }
    redrawMapOnly = true;
    drawMinimap(redrawViewOnly);
    redrawViewOnly = true;
  });
}
// While nodes are dragged only the wires touching them move, and their pin offsets inside the node
// are constant, so they are measured once and the wires are rewritten without any layout reads.
function prepareFastDrag() {
  const moving = new Set(drag.positions.map((p) => p.id)),
    nodes = new Map(graph().nodes.map((n) => [n.id, n])),
    paths = new Map(
      [...$("edges").querySelectorAll("path.edge[data-edge]")].map((el) => [el.dataset.edge, el]),
    ),
    end = (ep) => {
      const pos = pinPosition(ep),
        n = nodes.get(ep.node);
      if (!pos || !n) return null;
      return moving.has(ep.node)
        ? { node: n, dx: pos.x - n.x, dy: pos.y - n.y }
        : { x: pos.x, y: pos.y };
    };
  drag.fast = [];
  for (const e of graph().edges) {
    if (!moving.has(e.from.node) && !moving.has(e.to.node)) continue;
    const el = paths.get(e.id),
      a = end(e.from),
      b = end(e.to);
    if (el && a && b) drag.fast.push({ el, a, b });
  }
}
function moveFastEdges() {
  const at = (q) => (q.node ? { x: q.node.x + q.dx, y: q.node.y + q.dy } : q);
  for (const w of drag.fast) w.el.setAttribute("d", curve(at(w.a), at(w.b)));
}
function relayoutSoon() {
  const vp = $("viewport");
  if (vp.scrollLeft || vp.scrollTop) {
    vp.scrollLeft = 0;
    vp.scrollTop = 0;
  }
  cancelAnimationFrame(relayoutFrame);
  relayoutFrame = requestAnimationFrame(() => {
    drawEdges();
    drawMinimap();
  });
}
$("viewport").addEventListener("scroll", relayoutSoon);
$("nodes").addEventListener("focusout", () => setTimeout(relayoutSoon, 120));
window.addEventListener("resize", relayoutSoon);
window.visualViewport?.addEventListener("resize", relayoutSoon);
let relayoutFrame = 0;
const nodeObserver = new ResizeObserver(() => {
  cullSizes = null;
  cancelAnimationFrame(relayoutFrame);
  relayoutFrame = requestAnimationFrame(() => {
    drawEdges();
    drawMinimap();
  });
});
function renderNodes() {
  sizeCache = pinCache = cullSizes = null;
  cullSoon();
  $("nodes").innerHTML = graph()
    .nodes.map(
      (n) => n.definition.reroute ? `<article class="node ue-reroute ${selection.has(n.id) ? "selected" : ""}" data-node-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px"><div class="node-head" title="重定向 / Reroute · 拖动移动">${n.definition.pins.map((p) => `<button class="pin ${p.type === "exec" ? "exec" : ""} ${pinConnected(n, p) ? "connected" : ""}" data-node="${esc(n.id)}" data-pin="${esc(p.id)}" style="--pin-color:${pinColor(p.type)}" title="${esc(p.name)} · ${esc(p.type)}" aria-label="${esc(p.name)}"></button>`).join("")}</div></article>` :
        `<article class="node ue-${nodeKind(n.definition)} ${nodeAppearance(n.definition, enums).compact ? "ue-compact" : ""} ${nodeAppearance(n.definition, enums).slim ? "ue-slim" : ""} tier-${nodeTier(n.definition)} ${selection.has(n.id) ? "selected" : ""}" data-node-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;--node-color:${color(n.definition)}">${n.comment ? `<div class="node-comment">${esc(n.comment)}</div>` : ""}<div class="node-head" title="${esc(kindLabels[nodeKind(n.definition)] || "FUNCTION")} · ${esc((n.definition.class || "UE").replace(/^[UA](?=[A-Z][a-z])/, ""))}"><div class="node-heading"><span>${icon(n.definition)}</span><strong>${esc(nodeAppearance(n.definition, enums).compact && !n.title ? nodeAppearance(n.definition, enums).title : nodeHeading(n))}</strong></div>${langMode === "both" ? `<div class="node-subtitle">${esc(nodeEnglish(n.definition))}</div>` : ""}</div><div class="node-kind-label">${esc(kindLabels[nodeKind(n.definition)] || "FUNCTION")}<span>${esc((n.definition.class || "UE").replace(/^[UA](?=[A-Z][a-z])/, ""))}</span></div><div class="node-body">${nodeBody(n)}</div></article>`,
    )
    .join("");
  nodeObserver.disconnect();
  $("nodes")
    .querySelectorAll(".node")
    .forEach((el) => nodeObserver.observe(el));
}
// ---------------------------------------------------------------- settings
const SETTINGS_KEY = "kards-blueprint-studio.settings";
const settings = { blockCopy: true, dragMode: "marquee", rightPan: true };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
} catch {
  /* defaults */
}
let multiMode = false;
function applySettings() {
  document.documentElement.classList.toggle("block-copy", !!settings.blockCopy);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* settings only last for this visit */
  }
}
// ---------------------------------------------------------------- install as a desktop app
// On Windows (Chrome/Edge) the browser can install this page as its own window with a Start-menu
// icon. We catch its install prompt and offer it right away; "later" snoozes it for two weeks.
const INSTALL_KEY = "kards-blueprint-studio.install-snooze";
let installEvent = null;
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay)").matches ||
  navigator.standalone === true;
const isWindows = () => /Windows/i.test(navigator.userAgentData?.platform || navigator.userAgent || "");
function installSnoozed() {
  try {
    return Date.now() < Number(localStorage.getItem(INSTALL_KEY) || 0);
  } catch {
    return false;
  }
}
function snoozeInstall(days) {
  try {
    localStorage.setItem(INSTALL_KEY, String(Date.now() + days * 864e5));
  } catch {
    /* only for this visit */
  }
}
function hideInstallBanner() {
  document.getElementById("install-banner")?.remove();
}
async function runInstall() {
  const ev = installEvent;
  if (!ev) return;
  installEvent = null;
  hideInstallBanner();
  ev.prompt();
  const choice = await ev.userChoice.catch(() => null);
  if (choice?.outcome !== "accepted") snoozeInstall(14);
}
function showInstallBanner() {
  if (!installEvent || document.getElementById("install-banner") || isStandalone()) return;
  const box = document.createElement("div");
  box.id = "install-banner";
  box.setAttribute("role", "dialog");
  box.innerHTML = `<div class="install-text"><strong>${bi2("安装为 Windows 应用", "Install as a Windows app")}</strong><span>${bi2("独立窗口、开始菜单图标，不再占用浏览器标签页。", "Own window and Start-menu icon, no browser tab.")}</span></div><div class="install-actions"><button type="button" class="primary-button" data-install="yes">${bi2("安装", "Install")}</button><button type="button" class="secondary-button" data-install="later">${bi2("以后再说", "Not now")}</button><button type="button" class="secondary-button" data-install="never">${bi2("不再提示", "Never")}</button></div>`;
  box.addEventListener("click", (e) => {
    const act = e.target.closest("[data-install]")?.dataset.install;
    if (act === "yes") runInstall();
    else if (act) {
      snoozeInstall(act === "never" ? 3650 : 14);
      hideInstallBanner();
    }
  });
  document.body.append(box);
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  if (isWindows() && !installSnoozed()) setTimeout(showInstallBanner, 1500);
});
window.addEventListener("appinstalled", () => {
  installEvent = null;
  hideInstallBanner();
  toast("已安装为应用");
});
if ("serviceWorker" in navigator && location.protocol !== "file:")
  navigator.serviceWorker.register("./sw.js").catch(() => {});
const editable = (t) =>
  !!t?.closest?.("input,textarea,select,[contenteditable='true']");
document.addEventListener("selectstart", (e) => {
  if (settings.blockCopy && !editable(e.target)) e.preventDefault();
});
document.addEventListener("copy", (e) => {
  if (settings.blockCopy && !editable(e.target)) e.preventDefault();
});
document.addEventListener("cut", (e) => {
  if (settings.blockCopy && !editable(e.target)) e.preventDefault();
});
const STORE_PREFIX = "kards-blueprint-studio.";
function exportLocalBackup() {
  persist();
  const entries = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORE_PREFIX) && !key.endsWith(".probe")) entries[key] = localStorage.getItem(key);
    }
  } catch {
    return toast("这个浏览器不允许读取本地存储", true);
  }
  download(
    `kards-local-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ format: "kards-local-backup", version: 1, exportedAt: new Date().toISOString(), entries }),
  );
  toast(`已导出 ${Object.keys(entries).length} 项本地数据`);
}
async function restoreLocalBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data?.format !== "kards-local-backup" || typeof data.entries !== "object") throw new Error("不是本地备份文件");
    const keys = Object.keys(data.entries).filter((k) => k.startsWith(STORE_PREFIX));
    if (!keys.length) throw new Error("备份里没有数据");
    if (!confirm(`恢复 ${keys.length} 项数据？同名卡牌会被备份里的版本覆盖。`)) return;
    persist();
    for (const k of keys) localStorage.setItem(k, String(data.entries[k]));
    location.reload();
  } catch (error) {
    toast(`恢复失败：${error.message}`, true);
  }
}
function openSettings() {
  openModal(
    "设置 / Settings",
    `${versionFieldHtml()}<label class="check-row"><input type="checkbox" id="set-block" ${settings.blockCopy ? "checked" : ""}> ${bi2("阻止长按选中文字和复制", "Block long-press text selection and copy")}</label><p class="detail-description">${bi2("开启后长按不会再出现蓝色选中框和复制菜单；输入框里仍可正常编辑。", "Stops the blue selection and copy menu on long press. Text boxes still work normally.")}</p><div class="field"><label class="detail-label" for="set-drag">${bi2("鼠标左键拖动空白处", "Mouse: drag on empty canvas")}</label><select id="set-drag"><option value="marquee" ${settings.dragMode === "marquee" ? "selected" : ""}>框选节点 / Box select</option><option value="pan" ${settings.dragMode === "pan" ? "selected" : ""}>平移画布 / Pan</option></select><p class="detail-description">${bi2("框选时：按住空格、鼠标中键或 Alt 拖动可平移。手机上用「多选」按钮进入框选/点选多个节点。", "With box select: hold Space, middle mouse or Alt to pan. On phones use the Multi-select button to box-select or tap several nodes.")}</p></div><label class="check-row"><input type="checkbox" id="set-rpan" ${settings.rightPan ? "checked" : ""}> ${bi2("鼠标右键拖动空白处平移", "Right-drag on empty canvas pans")}</label><p class="detail-description">${bi2("如果浏览器的鼠标手势/画笔/截图工具在右键拖动时被触发，请关闭它；平移仍可用空格+左键、鼠标中键或 Alt+左键。", "Turn this off if your browser's mouse gestures / draw / capture tools react to right-drag. You can still pan with Space+left, middle mouse or Alt+left.")}</p>${installEvent ? `<div class="field"><span class="detail-label">${bi2("桌面应用", "Desktop app")}</span><div class="rs-custom-row"><button id="install-now" class="secondary-button" type="button">${bi2("安装为应用…", "Install as app…")}</button></div></div>` : ""}<div class="field"><span class="detail-label">${bi2("本地数据备份", "Local data backup")}</span><p class="detail-description">${bi2("把这个浏览器里保存的全部卡牌原样导出成一个文件（即使有卡牌打不开也能导出）；换设备或清除浏览器数据前先备份。", "Exports everything this browser has saved as one file, even cards that cannot be opened. Do this before switching devices or clearing browser data.")}</p><div class="rs-custom-row"><button id="bk-export" class="secondary-button" type="button">${bi2("导出全部本地数据", "Export all local data")}</button><button id="bk-import" class="secondary-button" type="button">${bi2("恢复备份…", "Restore backup…")}</button></div></div>`,
  );
  $("bk-export").onclick = exportLocalBackup;
  $("bk-import").onclick = () => $("backup-input").click();
  wireVersionField();
  $("set-block").onchange = (e) => {
    settings.blockCopy = e.target.checked;
    applySettings();
  };
  $("install-now")?.addEventListener("click", () => {
    $("modal").close();
    runInstall();
  });
  $("set-rpan").onchange = (e) => {
    settings.rightPan = e.target.checked;
    applySettings();
  };
  $("set-drag").onchange = (e) => {
    settings.dragMode = e.target.value;
    applySettings();
  };
}
function setMultiMode(on) {
  multiMode = on;
  $("multi-toggle").classList.toggle("active", on);
  viewport.classList.toggle("multi", on);
  toast(on ? "多选模式:点节点选中/取消,拖空白处框选" : "已退出多选模式");
}
function updateSelectionStatus() {
  const bar = $("selection-bar");
  if (bar) {
    // With nothing selected a small Paste chip shows for a few seconds after a copy or a switch of
    // graph/card, then gets out of the way.
    const chip =
      !selection.size && !selectedEdge && window.innerWidth <= 800 && !!readLocalClip() && Date.now() < pasteHintUntil;
    bar.hidden = !(selection.size || selectedEdge || chip);
    bar.classList.toggle("paste-only", chip);
    for (const id of ["bar-duplicate", "bar-copy", "bar-details", "bar-clear"])
      $(id).hidden = !selection.size && !selectedEdge;
    $("bar-copy").hidden = !selection.size;
    $("bar-duplicate").hidden = !selection.size;
    $("bar-delete").hidden = !selection.size && !selectedEdge;
    $("bar-paste").hidden = !readLocalClip();
  }
  $("selection-status").textContent = pending
    ? "选择一个兼容端口完成连线 · Esc 取消"
    : selectedEdge
      ? "已选中连接 · 拖动圆点重接 · Delete 删除"
      : selection.size
        ? `已选中 ${selection.size} 个节点`
        : "就绪";
}
function selectNode(id, add = false) {
  if (!add) selection.clear();
  if (add && selection.has(id)) selection.delete(id);
  else selection.add(id);
  selectedEdge = null;
  document
    .querySelectorAll(".node")
    .forEach((n) =>
      n.classList.toggle("selected", selection.has(n.dataset.nodeId)),
    );
  renderInspector();
  updateSelectionStatus();
}
function field(label, key, value, options) {
  let input;
  if (options) {
    const opts = [
      ...new Set([
        ...options.map((o) => (typeof o === "string" ? o : o.value)),
        String(value),
      ]),
    ];
    input = `<select data-field="${esc(key)}">${opts.map((v) => `<option value="${esc(v)}" ${String(value) === v ? "selected" : ""}>${esc(options.find((o) => typeof o === "object" && o.value === v)?.label || v)}</option>`).join("")}</select>`;
  } else
    input = `<input data-field="${esc(key)}" value="${esc(value)}" ${typeof value === "number" ? 'type="number"' : ""}>`;
  return `<div class="field"><label class="detail-label">${esc(label)}${input}</label></div>`;
}
// ---------------------------------------------------------------- class defaults
// Like Unreal's Class Defaults: the editable properties of the parent class. The basic card data
// (name, faction, type, rarity, cost, attack, defense, text) already has its own section.
const CARD_DATA_PROPS = new Set(["title", "Type", "faction", "rarity", "attack", "defense", "kredits", "operationCost", "Text"]);
const CD_GROUPS = [
  ["战斗数值", "Combat", /attack|defense|range|heavyArmor|damage|movement|retreat/i],
  ["费用", "Cost", /kredit|operationCost|cost/i],
  ["关键词", "Keywords", /^has[A-Z]|cipher|exile/],
  ["选牌与抽牌", "Choosing & Drafting", /draft|choose|select|spawn|deck|hand/i],
  ["文本与战役", "Text & Campaign", /text|name|flavor|campaign|help/i],
];
function cdKind(type) {
  if (enums[type]) return "enum";
  if (type === "bool") return "bool";
  if (/^u?int/.test(type)) return "int";
  if (/^(float|double)$/.test(type)) return "float";
  if (["FText", "FString", "FName"].includes(type)) return "text";
  const m = type.match(/^(?:TArray|TSet)<(.+)>$/);
  if (m && cdKind(m[1]) && cdKind(m[1]) !== "list") return "list";
  return null;
}
const cdProps = () =>
  properties.filter(
    (p) => p.class === project.asset.parentClass && p.writable !== false && !CARD_DATA_PROPS.has(p.name),
  );
function cdDefault(p) {
  const kind = cdKind(p.type);
  return kind === "bool" ? false : kind === "int" || kind === "float" ? 0 : kind === "enum" ? enums[p.type][0] : kind === "list" ? [] : "";
}
function cdParse(p, raw) {
  const kind = cdKind(p.type);
  if (kind === "list") {
    const inner = { type: p.type.match(/<(.+)>/)[1] },
      one = (x) => {
        const k = cdKind(inner.type);
        return k === "int" ? Math.trunc(Number(x)) || 0 : k === "float" ? Number(x) || 0 : k === "bool" ? x === "true" : x;
      };
    return raw.split(",").map((x) => x.trim()).filter(Boolean).map(one);
  }
  if (kind === "int") return Math.trunc(Number(raw)) || 0;
  if (kind === "float") return Number(raw) || 0;
  return raw;
}
function cdRows() {
  const list = cdProps(),
    editable = list.filter((p) => cdKind(p.type)),
    q = cdQuery.trim().toLowerCase(),
    shown = editable.filter((p) => !q || p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)),
    groups = new Map();
  for (const p of shown) {
    const g = CD_GROUPS.find(([, , re]) => re.test(p.name));
    const label = g ? bi2(g[0], g[1]) : bi2("其他", "Other");
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(p);
  }
  const order = (label) => {
    const i = CD_GROUPS.findIndex(([zh]) => label.includes(`>${zh}<`));
    return i < 0 ? CD_GROUPS.length : i;
  };
  const row = (p) => {
    const kind = cdKind(p.type),
      has = Object.hasOwn(project.classDefaults, p.name),
      value = has ? project.classDefaults[p.name] : cdDefault(p),
      a = `data-cd-input="${esc(p.name)}"`;
    let control;
    if (kind === "bool") control = `<input type="checkbox" ${a} ${value ? "checked" : ""}>`;
    else if (kind === "enum")
      control = `<select ${a}>${enums[p.type].map((v) => `<option ${v === value ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
    else if (kind === "int" || kind === "float")
      control = `<input type="number" step="${kind === "int" ? 1 : "any"}" ${a} value="${esc(value)}">`;
    else if (kind === "list")
      control = `<input ${a} value="${esc(value.join(", "))}" placeholder="逗号分隔 / comma separated">`;
    else control = `<input ${a} value="${esc(value)}">`;
    return `<div class="cd-row ${has ? "modified" : ""}"><label><span class="cd-name">${esc(p.name)}</span><span class="cd-type">${esc(p.type)}</span></label><div class="cd-control">${control}<button type="button" class="cd-reset" data-cd-reset="${esc(p.name)}" title="恢复默认 / Reset" ${has ? "" : "hidden"}>↺</button></div></div>`;
  };
  const skipped = list.length - editable.length;
  return (
    [...groups.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([g, ps]) => `<h4 class="cd-group">${g} <span>${ps.length}</span></h4>${ps.map(row).join("")}`)
      .join("") ||
    `<p class="detail-description">${bi2("没有匹配的属性。", "No matching properties.")}</p>`
  ) +
    (skipped
      ? `<p class="detail-description">${bi2(`另有 ${skipped} 个结构体/映射类型的属性暂不支持编辑。`, `${skipped} struct / map properties cannot be edited yet.`)}</p>`
      : "");
}
function classDefaultsSection() {
  const changed = Object.keys(project.classDefaults).length;
  return `<section class="detail-section" id="class-defaults"><details ${cdOpen ? "open" : ""} id="cd-details"><summary class="detail-heading">${bi2("类默认值", "Class Defaults")} <span>${changed ? bi2(`${changed} 项已修改`, `${changed} changed`) : "CLASS DEFAULTS"}</span></summary><p class="detail-description">${bi2(`${project.asset.parentClass} 的属性默认值。只保存改过的值，其余使用游戏里的默认。名称、阵营、类型、稀有度、费用、行动花费、攻击、防御和文字在上面的「卡牌信息」里改。`, `Default values of ${project.asset.parentClass} properties. Only changed values are saved. Name, faction, type, rarity, cost, operation cost, attack, defense and text are in Card Data above.`)}</p><input id="cd-search" class="modal-search" placeholder="搜索属性 / Search properties…" value="${esc(cdQuery)}" autocomplete="off"><div id="cd-rows">${cdRows()}</div></details></section>`;
}
function bindClassDefaults() {
  const details = $("cd-details");
  if (!details) return;
  details.ontoggle = () => (cdOpen = details.open);
  $("cd-search").oninput = (e) => {
    cdQuery = e.target.value;
    $("cd-rows").innerHTML = cdRows();
  };
  $("cd-rows").onchange = (e) => {
    const input = e.target.closest("[data-cd-input]");
    if (!input) return;
    const p = cdProps().find((x) => x.name === input.dataset.cdInput);
    if (!p) return;
    const value = input.type === "checkbox" ? input.checked : cdParse(p, input.value);
    checkpoint();
    if (JSON.stringify(value) === JSON.stringify(cdDefault(p))) delete project.classDefaults[p.name];
    else project.classDefaults[p.name] = value;
    persist();
    // update just this row: rebuilding the list would drop the focus of the field tapped next
    const row = input.closest(".cd-row");
    row.classList.toggle("modified", Object.hasOwn(project.classDefaults, p.name));
    row.querySelector(".cd-reset").hidden = !Object.hasOwn(project.classDefaults, p.name);
  };
  $("cd-rows").onclick = (e) => {
    const b = e.target.closest("[data-cd-reset]");
    if (!b) return;
    checkpoint();
    delete project.classDefaults[b.dataset.cdReset];
    persist();
    const p = cdProps().find((x) => x.name === b.dataset.cdReset),
      row = b.closest(".cd-row"),
      input = row.querySelector("[data-cd-input]"),
      value = cdDefault(p);
    if (input.type === "checkbox") input.checked = !!value;
    else input.value = Array.isArray(value) ? value.join(", ") : value;
    row.classList.remove("modified");
    b.hidden = true;
  };
}
function openClassDefaults(target = "class-defaults") {
  selection.clear();
  selectedEdge = null;
  if (target === "class-defaults") cdOpen = true;
  setDrawer(false);
  if (window.innerWidth <= 1000) setInspectorOpen(true);
  else $("inspector").hidden = false;
  renderNodes();
  renderInspector();
  drawEdges();
  updateSelectionStatus();
  requestAnimationFrame(() => $(target)?.scrollIntoView({ block: "start" }));
}
function renderInspector() {
  let body = "";
  const n = graph().nodes.find((n) => selection.has(n.id));
  if (selectedEdge) {
    body =
      '<section class="detail-section"><h3 class="detail-heading">连接详情</h3><p class="detail-description">选中连线后，可按 Delete 删除。数据输入端口只接受一条连接，新的连接会替换原连接；执行输出只连向一处，但多个执行输出可以接到同一个执行输入。</p><button class="danger-button" id="delete-selection">删除连接</button></section>';
  } else if (n) {
    const d = n.definition;
    body = `<section class="detail-section"><h3 class="detail-heading">节点 <span>${selection.size > 1 ? selection.size + " SELECTED" : "NODE"}</span></h3><span class="node-type-badge">${esc(kindLabels[nodeKind(d)] || "自定义")} / ${esc(d.class || "Custom")}</span>${field("显示名称", "title", n.title || nodeChinese(d))}<div class="field"><label class="detail-label">节点注释<textarea data-field="comment" placeholder="描述这段逻辑的意图…">${esc(n.comment)}</textarea></label></div><div class="field-grid">${field("位置 X", "x", n.x)}${field("位置 Y", "y", n.y)}</div></section><section class="detail-section"><h3 class="detail-heading">默认参数 <span>DEFAULTS</span></h3>`;
    const inputs = d.pins.filter(
      (p) =>
        p.type !== "exec" &&
        pinKind(p.type) !== "delegate" &&
        (p.direction === "in" || (d.category === "variables" && d.kind === "variable")),
    );
    body += inputs.length
      ? inputs
          .map((p) => {
            const val = n.values[p.id] ?? pinDefault(p),
              isConnected = graph().edges.some(
                (e) => e.to.node === n.id && e.to.pin === p.id,
              );
            const options =
              p.type === "bool" ? ["false", "true"] : enums[p.type];
            return `<div class="field"><label class="detail-label">${esc(translate(p.name))} / ${esc(p.name)} <span style="opacity:.5">${esc(p.type)}</span>${options ? `<select data-value="${esc(p.id)}" ${isConnected ? "disabled" : ""}>${[...new Set([...options, String(val)])].map((v) => `<option ${String(v) === String(val) ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : `<input data-value="${esc(p.id)}" value="${esc(val)}" ${["int", "float"].includes(pinKind(p.type)) ? 'type="number" step="any"' : ""} ${isReasonPin(n, p) ? 'list="reason-list" placeholder="选择或输入 Reason 键"' : ""} ${isConnected ? "disabled" : ""}>${isReasonPin(n, p) ? `<datalist id="reason-list">${reasons.map((r) => `<option value="${esc(r.key)}">${esc(r.zh || r.text)}</option>`).join("")}</datalist>` : ""}`}${isConnected ? '<span class="detail-description">由连接提供值 · 请在来源节点上修改</span>' : ""}</label></div>`;
          })
          .join("")
      : '<p class="detail-description">此节点没有可编辑的默认输入。</p>';
    body += `</section>${bpNodeSection(n)}<section class="detail-section"><h3 class="detail-heading">源代码 <span>NATIVE</span></h3><div class="detail-source">${esc(d.signature || d.name)}${d.source ? `<p><a href="https://github.com/ghhhhughg638/KardsSource/blob/main/${encodeURI(d.source)}" target="_blank" rel="noreferrer">${esc(d.source)} ↗</a></p>` : "<p>Studio 自定义节点 · 仅用于可视化设计</p>"}</div><button class="secondary-button" id="duplicate" style="width:100%;margin-top:10px">复制节点 <kbd>Ctrl D</kbd></button><button class="danger-button" id="delete-selection">删除选中节点</button></section>`;
  } else {
    const card = project.card;
    body = `${assetSection()}<section class="detail-section" id="card-data"><h3 class="detail-heading">卡牌信息 <span>CARD DATA</span></h3><div class="card-preview rarity-${esc(card.rarity)}"><div class="card-emblem">${esc(card.cost)}</div><div><small>${esc(card.faction.toUpperCase())} / ${esc(card.type.toUpperCase())}</small><h3>${esc(card.title)}</h3><p>${FACTIONS[card.faction] ? bi2(esc(FACTIONS[card.faction]), esc(card.faction)) : esc(card.faction)} · ${bi2(...(RARITY_LABELS[card.rarity] || card.rarity).split(" / ").map(esc).concat([esc(card.rarity)]).slice(0, 2))} · ${bi2("行动", "Op")} ${esc(card.operationCost ?? 1)}</p></div></div>${field("卡牌名称", "card.title", card.title)}${field(
      "所属阵营",
      "card.faction",
      card.faction,
      (enums.EFactionEnum || Object.keys(FACTIONS)).map((value) => ({
        value,
        label: FACTIONS[value] ? `${FACTIONS[value]} / ${value}` : value,
      })),
    )}${field("卡牌类型", "card.type", card.type, labelled(TYPE_LABELS, enums.ETypeEnum || Object.keys(TYPE_LABELS)))}${field("稀有度", "card.rarity", card.rarity, labelled(RARITY_LABELS, ["NotAvailable", "Common", "Uncommon", "Rare", "Unique"]))}<div class="field-grid">${field("攻击力", "card.attack", card.attack)}${field("防御力", "card.defense", card.defense)}</div><div style="height:12px"></div><div class="field-grid">${field("指挥点消耗", "card.cost", card.cost)}${field("行动花费", "card.operationCost", card.operationCost ?? 1)}</div><div class="field"><label class="detail-label">卡牌效果<textarea data-field="card.text">${esc(card.text)}</textarea></label></div></section>${classDefaultsSection()}${graphSection()}<section class="detail-section"><h3 class="detail-heading">文件格式 <span>v2.0</span></h3><p class="detail-description">.kardsbp.json 包含资源信息、变量、函数、宏、EventGraph、节点定义、参数和连线。导入后可继续编辑。</p></section>`;
  }
  $("inspector-content").innerHTML = body;
  $("inspector-content").onpointerdown = (e) => {
    if (e.target.closest("input, select, textarea")) {
      inspectorFieldTap = true;
      setTimeout(() => (inspectorFieldTap = false), 800);
    }
  };
  $("inspector-content")
    .querySelectorAll("[data-field]")
    .forEach(
      (input) =>
        (input.onchange = () => {
          const key = input.dataset.field;
          let val = input.type === "number" ? Number(input.value) : input.value;
          if (typeof val === "number" && !Number.isFinite(val)) return;
          if (key === "asset.name") {
            const error =
              checkName(val.trim()) ||
              (workspace.nameTaken(val.trim(), project.id)
                ? "资源名称已被工作区里的另一张卡牌使用"
                : null);
            if (error) {
              toast(error, true);
              return renderInspector();
            }
            val = val.trim();
          }
          mutate(() => {
            if (key.startsWith("card.")) project.card[key.slice(5)] = val;
            else if (key === "asset.name") project.name = val;
            else if (key.startsWith("asset.")) project.asset[key.slice(6)] = val;
            else if (n) n[key] = val;
          });
        }),
    );
  $("inspector-content")
    .querySelectorAll("[data-value]")
    .forEach(
      (input) =>
        (input.onchange = () => {
          const p = n.definition.pins.find((p) => p.id === input.dataset.value);
          let val =
            p.type === "bool"
              ? input.value === "true"
              : ["int", "float"].includes(pinKind(p.type))
                ? Number(input.value)
                : input.value;
          if (typeof val === "number" && !Number.isFinite(val)) return;
          mutate(() => (n.values[p.id] = val));
        }),
    );
  bindClassDefaults();
  if ($("delete-selection")) $("delete-selection").onclick = deleteSelection;
  if ($("duplicate")) $("duplicate").onclick = duplicate;
  if ($("graph-settings"))
    $("graph-settings").onclick = () => editGraph(project.activeGraph);
  if ($("bp-edit")) $("bp-edit").onclick = () => editBlueprintNode(n);
}
// Pin centres in world units. Rects are read in one pass (no style writes in between) from a
// per-draw lookup, so a redraw costs a single layout instead of one lookup + layout per wire end.
let pinCache = null;
function pinPosition(endpoint) {
  if (!pinCache) {
    const w = $("world").getBoundingClientRect(),
      zoom = graph().view.zoom,
      map = new Map();
    for (const pin of $("nodes").querySelectorAll(".pin")) {
      const r = pin.getBoundingClientRect();
      map.set(pin.dataset.node + "\u0000" + pin.dataset.pin, {
        x: (r.x + r.width / 2 - w.x) / zoom,
        y: (r.y + r.height / 2 - w.y) / zoom,
      });
    }
    pinCache = map;
    queueMicrotask(() => (pinCache = null));
  }
  return pinCache.get(endpoint.node + "\u0000" + endpoint.pin) || null;
}
function curve(a, b) {
  const dx = Math.max(65, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
function drawEdges(pointer) {
  let html = "", handles = "";
  for (const e of graph().edges) {
    const a = pinPosition(e.from),
      b = pinPosition(e.to);
    if (!a || !b) continue;
    const pin = graph()
      .nodes.find((n) => n.id === e.from.node)
      ?.definition.pins.find((p) => p.id === e.from.pin);
    html += `<path class="edge ${selectedEdge === e.id ? "selected" : ""}" data-edge="${esc(e.id)}" d="${curve(a, b)}" stroke="${pinColor(pin.type)}"/>`;
    const dx = Math.max(65, Math.abs(b.x - a.x) * 0.5);
    const handlePoint = (t) => { const u=1-t; return {x:u*u*u*a.x+3*u*u*t*(a.x+dx)+3*u*t*t*(b.x-dx)+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*b.y}; };
    if (selectedEdge === e.id) for (const [side, point] of [["from",handlePoint(.18)],["to",handlePoint(.82)]]) handles += `<circle class="edge-handle" data-rewire="${side}" data-edge-id="${esc(e.id)}" cx="${point.x}" cy="${point.y}" r="7" fill="${pinColor(pin.type)}" stroke="#fff" stroke-width="2"><title>拖动重连 / Drag to reconnect</title></circle>`;
  }
  if (pending && pointer) {
    const p = pinPosition(pending),
      def = graph()
        .nodes.find((n) => n.id === pending.node)
        ?.definition.pins.find((p) => p.id === pending.pin);
    if (p)
      html += `<path class="edge ghost" d="${def.direction === "out" ? curve(p, pointer) : curve(pointer, p)}" stroke="${pinColor(def.type)}"/>`;
  }
  $("edges").innerHTML = html;
  $("edge-handles").innerHTML = handles;
}
// Level of detail + culling. Nodes outside the screen are hidden with `visibility` (they keep their
// layout, so wires still find their pins) and, when zoomed far out, labels/inputs are not painted.
let cullFrame = 0,
  cullSizes = null;
function cullSoon() {
  if (cullFrame) return;
  cullFrame = requestAnimationFrame(() => {
    cullFrame = 0;
    const v = graph().view,
      r = $("viewport").getBoundingClientRect(),
      sizes = (cullSizes ??= nodeSizes()),
      pad = 160,
      left = (-v.x - pad) / v.zoom,
      top = (-v.y - pad) / v.zoom,
      right = (r.width - v.x + pad) / v.zoom,
      bottom = (r.height - v.y + pad) / v.zoom;
    $("viewport").classList.toggle("lod", v.zoom < 0.2);
    for (const el of $("nodes").children) {
      const n = graph().nodes.find((x) => x.id === el.dataset.nodeId);
      if (!n) continue;
      const z = sizes.get(n.id) || { w: 280, h: 180 },
        off = n.x > right || n.y > bottom || n.x + z.w < left || n.y + z.h < top;
      if (off !== el.classList.contains("offscreen")) el.classList.toggle("offscreen", off);
    }
  });
}
let movingTimer = 0;
function updateView() {
  cullSoon();
  const v = graph().view;
  // promote the canvas to its own layer only while it is being panned/zoomed
  $("viewport").classList.add("moving");
  clearTimeout(movingTimer);
  movingTimer = setTimeout(() => $("viewport").classList.remove("moving"), 250);
  $("world").style.transform = `translate(${v.x}px,${v.y}px) scale(${v.zoom})`;
  $("viewport").style.backgroundSize =
    `${16 * v.zoom}px ${16 * v.zoom}px, ${16 * v.zoom}px ${16 * v.zoom}px, ${128 * v.zoom}px ${128 * v.zoom}px, ${128 * v.zoom}px ${128 * v.zoom}px`;
  $("viewport").style.backgroundPosition = `${v.x}px ${v.y}px`;
  $("zoom-label").textContent = `${Math.round(v.zoom * 100)}%`;
}
function worldPoint(e) {
  const r = $("viewport").getBoundingClientRect(),
    v = graph().view;
  return {
    x: (e.clientX - r.left - v.x) / v.zoom,
    y: (e.clientY - r.top - v.y) / v.zoom,
  };
}
function zoomAt(factor, cx, cy) {
  const v = graph().view,
    r = $("viewport").getBoundingClientRect();
  cx ??= r.width / 2;
  cy ??= r.height / 2;
  const z = Math.max(0.05, Math.min(2, v.zoom * factor));
  v.x = cx - ((cx - v.x) * z) / v.zoom;
  v.y = cy - ((cy - v.y) * z) / v.zoom;
  v.zoom = z;
  updateView();
  redrawSoon(true, true);
  scheduleSave();
}
// Node sizes, measured in one pass and shared until the current task ends.
let sizeCache = null;
function nodeSizes() {
  if (!sizeCache) {
    sizeCache = new Map(
      [...$("nodes").querySelectorAll(".node")].map((el) => [
        el.dataset.nodeId,
        { w: el.offsetWidth, h: el.offsetHeight },
      ]),
    );
    queueMicrotask(() => (sizeCache = null));
  }
  return sizeCache;
}
const nodeWidth = (n) => nodeSizes().get(n.id)?.w || 280;
function bounds() {
  if (!graph().nodes.length) return { x: 0, y: 0, w: 900, h: 600 };
  const ns = graph().nodes;
  const x = Math.min(...ns.map((n) => n.x)) - 30,
    y = Math.min(...ns.map((n) => n.y)) - 55;
  return {
    x,
    y,
    w: Math.max(...ns.map((n) => n.x + nodeWidth(n))) - x + 30,
    h:
      Math.max(
        ...ns.map(
          (n) =>
            n.y +
            (nodeSizes().get(n.id)?.h || 180),
        ),
      ) -
      y +
      35,
  };
}
function fit() {
  if (!graph().nodes.length) {
    graph().view = { x: 40, y: 0, zoom: 1 };
    updateView();
    return;
  }
  const narrow = window.innerWidth <= 800,
    b = bounds(),
    r = $("viewport").getBoundingClientRect(),
    z = Math.max(
      0.05,
      Math.min(
        1.15,
        (r.width - (narrow ? 24 : 70)) / b.w,
        (r.height - (narrow ? 80 : 145)) / b.h,
      ),
    );
  graph().view = {
    x: (r.width - b.w * z) / 2 - b.x * z,
    y: (r.height - b.h * z) / 2 - b.y * z + 15,
    zoom: z,
  };
  updateView();
  drawMinimap();
  scheduleSave();
}
let miniBounds;
let miniHeights = null;
// Panning/zooming only moves the "you are here" frame; the node rectangles stay as they are.
function drawMinimap(viewOnly = false) {
  const frame = viewOnly && $("minimap").lastElementChild;
  if (frame && miniBounds) {
    const v = graph().view,
      r = $("viewport").getBoundingClientRect();
    frame.setAttribute("x", -v.x / v.zoom);
    frame.setAttribute("y", -v.y / v.zoom);
    frame.setAttribute("width", r.width / v.zoom);
    frame.setAttribute("height", r.height / v.zoom);
    return;
  }
  const b = bounds();
  miniBounds = { x: b.x - 50, y: b.y - 50, w: b.w + 100, h: b.h + 100 };
  const m = miniBounds,
    v = graph().view,
    r = $("viewport").getBoundingClientRect(),
    heights =
      drag?.type === "nodes" && miniHeights
        ? miniHeights
        : (miniHeights = new Map([...nodeSizes()].map(([id, z]) => [id, z.h])));
  $("minimap").setAttribute("viewBox", `${m.x} ${m.y} ${m.w} ${m.h}`);
  $("minimap").innerHTML =
    graph()
      .nodes.map(
        (n) =>
          `<rect x="${n.x}" y="${n.y}" width="${nodeWidth(n)}" height="${heights.get(n.id) || 150}" rx="5" fill="${color(n.definition)}" fill-opacity=".3" stroke="${color(n.definition)}" stroke-width="2"/>`,
      )
      .join("") +
    `<rect x="${-v.x / v.zoom}" y="${-v.y / v.zoom}" width="${r.width / v.zoom}" height="${r.height / v.zoom}" fill="#dddddd" fill-opacity=".03" stroke="#c7c7c7" stroke-width="3"/>`;
}
function deleteSelection() {
  if (!selection.size && !selectedEdge) return;
  const doomed = new Set(
    graph().nodes.filter((n) => selection.has(n.id) && !n.definition.fixed).map((n) => n.id),
  );
  if (!doomed.size && !graph().edges.some((edge) => edge.id === selectedEdge)) {
    toast("所选节点不能删除", true);
    return;
  }
  mutate(() => {
    graph().nodes = graph().nodes.filter((n) => !doomed.has(n.id));
    graph().edges = graph().edges.filter(
      (e) =>
        !doomed.has(e.from.node) &&
        !doomed.has(e.to.node) &&
        e.id !== selectedEdge,
    );
    selection.clear();
    selectedEdge = null;
  });
}
// ---------------------------------------------------------------- copy & paste
// Nodes (with the wires between them) go to an in-app clipboard that also lives in the browser's
// storage, so they can be pasted into another graph, another card or another tab; the same text is
// offered to the system clipboard as well.

let pasteCount = 0,
  pasteHintUntil = 0,
  lastPointer = null;
function hintPaste() {
  pasteHintUntil = Date.now() + 7000;
  setTimeout(updateSelectionStatus, 7100);
}
const readLocalClip = () => {
  try {
    return localStorage.getItem(CLIP_KEY);
  } catch {
    return null;
  }
};
// Return Nodes can be copied too (the original one is locked in place, copies are extra Return Nodes).
const copyable = (n) =>
  (!n.definition.fixed || n.definition.bp?.type === "result") && n.definition.kind !== "customEvent";
function copyNodes(selected = selection) {
  const nodes = graph().nodes.filter((n) => selected.has(n.id) && copyable(n));
  if (!nodes.length) { toast("先选中要复制的节点", true); return null; }
  let clip, text;
  try {
    clip = nodeClip({ ...project, enums }, graph(), new Set(nodes.map((n) => n.id)));
    if (!clip.nodes.length) { toast("所选节点不能复制", true); return null; }
    text = JSON.stringify(clip);
    localStorage.setItem(CLIP_KEY, text);
  } catch {
    toast("无法保存复制的节点，请检查浏览器存储空间", true);
    return null;
  }
  try { navigator.clipboard?.writeText(CLIP_TAG + text).catch(() => {}); } catch { /* local clipboard is sufficient */ }
  pasteCount = 0;
  hintPaste();
  toast(`已复制 ${clip.nodes.length} 个节点`);
  updateSelectionStatus();
  return new Set(clip.nodes.map((n) => n.id));
}
function cutNodes() {
  // Fixed nodes (including function return nodes) cannot be removed. Copy and delete exactly the
  // same eligible nodes, leaving non-copyable events and locked nodes untouched.
  const eligible = new Set(graph().nodes.filter((n) => selection.has(n.id) && copyable(n) && !n.definition.fixed).map((n) => n.id));
  if (!eligible.size) { toast("所选节点不能剪切", true); return; }
  const copied = copyNodes(eligible);
  if (!copied) return;
  const skipped = selection.size - copied.size;
  selection = copied;
  deleteSelection();
  toast(skipped ? `已剪切 ${copied.size} 个节点，${skipped} 个节点无法剪切，已保留` : `已剪切 ${copied.size} 个节点`);
}
function pasteNodes(text) {
  let data = null;
  // text copied from another device (tagged) first, then the copy kept in this app
  for (const raw of [text?.startsWith(CLIP_TAG) ? text.slice(CLIP_TAG.length) : null, readLocalClip()]) {
    try {
      const found = raw ? JSON.parse(raw) : null;
      if (found?.format === "kards-bp-nodes") {
        data = found;
        break;
      }
    } catch {
      /* not ours: try the next source */
    }
  }
  if (
    data?.format !== "kards-bp-nodes" ||
    !Array.isArray(data.nodes) ||
    !data.nodes.length ||
    data.nodes.length > 500 ||
    data.nodes.some((n) => !n?.definition || !Array.isArray(n.definition.pins))
  )
    return toast("没有可粘贴的节点：先复制一些节点", true);
  // A pasted Return Node becomes an extra Return Node of this function (with this function's outputs).
  for (const n of data.nodes)
    if (n.definition.bp?.type === "result" && graph().kind === "function" && !graph().pure)
      n.definition = resultDefinition(graph(), true);
  const existingEvents = new Set(graph().nodes.filter((n) => n.definition.event).map((n) => n.definition.name));
  const fits = data.nodes.filter((n) => allowedInGraph(n.definition, graph()) && canImplementEvent(n.definition) && !(n.definition.event && existingEvents.has(n.definition.name))),
    skipped = data.nodes.length - fits.length;
  if (!fits.length) return toast("这些节点不能放进当前图表（例如事件只能放在 EventGraph）", true);
  const left = Math.min(...fits.map((n) => n.x)),
    top = Math.min(...fits.map((n) => n.y)),
    r = $("viewport").getBoundingClientRect(),
    inside =
      lastPointer &&
      lastPointer.clientX >= r.left &&
      lastPointer.clientX <= r.right &&
      lastPointer.clientY >= r.top &&
      lastPointer.clientY <= r.bottom,
    target = inside ? worldPoint(lastPointer) : centerPoint(),
    shift = pasteCount * 40;
  pasteCount += 1;
  const made = new Map();
  const candidate = clone(project);
  try {
    importClipDependencies(candidate, data, uid);
    const into = candidate.graphs.find((g) => g.id === candidate.activeGraph);
    for (const n of fits) {
      const copy = clone(n); copy.id = uid();
      copy.x = Math.round((target.x + (n.x - left) + shift) / 10) * 10;
      copy.y = Math.round((target.y + (n.y - top) + shift) / 10) * 10;
      made.set(n.id, copy.id); into.nodes.push(copy);
    }
    for (const e of data.edges || []) if (made.has(e.from?.node) && made.has(e.to?.node)) into.edges.push({ id: uid(), from: { node: made.get(e.from.node), pin: e.from.pin }, to: { node: made.get(e.to.node), pin: e.to.pin } });
    setEnumTable({ ...catalogEnums, ...candidate.enums }); setTypeHierarchy({ ...classes, ...candidate.types });
    validateProject(candidate);
  } catch (error) {
    setEnumTable(enums); setTypeHierarchy({ ...classes, ...project.types });
    return toast(`无法粘贴：${error.message}`, true);
  }
  mutate(() => {
    project = candidate; enums = { ...catalogEnums, ...project.enums };
    setEnumTable(enums); setTypeHierarchy({ ...classes, ...project.types });
  });
  // nodes whose definition no longer exists here (another card's functions) were dropped by the sync
  const alive = [...made.values()].filter((id) => graph().nodes.some((n) => n.id === id));
  selection = new Set(alive);
  renderNodes();
  renderInspector();
  drawEdges();
  updateSelectionStatus();
  const dropped = skipped + (made.size - alive.length);
  toast(dropped ? `已粘贴 ${alive.length} 个节点，${dropped} 个不能用，已跳过` : `已粘贴 ${alive.length} 个节点`);
}
async function pasteFromButton() {
  // The copy kept in this app needs no permission; the system clipboard is only asked when there is none.
  if (readLocalClip()) return pasteNodes("");
  let text = "";
  try {
    text = await Promise.race([
      navigator.clipboard?.readText?.() ?? "",
      new Promise((resolve) => setTimeout(() => resolve(""), 2500)),
    ]);
  } catch {
    /* reading the system clipboard was refused */
  }
  pasteNodes(String(text).startsWith(CLIP_TAG) ? text : "");
}
function duplicate() {
  if (!selection.size) return;
  const copied = graph().nodes.filter((n) =>
    selection.has(n.id) && copyable(n) &&
    (n.definition.bp?.type !== "result" || (graph().kind === "function" && !graph().pure)),
  );
  if (!copied.length) {
    toast("所选节点不能复制", true);
    return;
  }
  mutate(() => {
    const ids = new Map();
    for (const n of copied) {
      const copy = clone(n);
      copy.id = uid();
      if (copy.definition.bp?.type === "result") copy.definition = resultDefinition(graph(), true);
      copy.x += 40;
      copy.y += 40;
      ids.set(n.id, copy.id);
      graph().nodes.push(copy);
    }
    const edges = graph().edges.filter(
      (e) => ids.has(e.from.node) && ids.has(e.to.node),
    );
    graph().edges.push(
      ...edges.map((e) => ({
        id: uid(),
        from: { node: ids.get(e.from.node), pin: e.from.pin },
        to: { node: ids.get(e.to.node), pin: e.to.pin },
      })),
    );
    selection = new Set(ids.values());
  });
}
// A new wire must never silently invalidate other wires during wildcard inference.
function syncKeepingConnections(candidate) {
  const before=candidate.graphs.flatMap(g=>g.edges.map(e=>`${g.id}\u0000${e.id}`));
  syncDefinitions(candidate);
  const after=new Set(candidate.graphs.flatMap(g=>g.edges.map(e=>`${g.id}\u0000${e.id}`)));
  if(before.some(id=>!after.has(id))) throw new Error("连接的类型与现有连线不兼容，请先断开相关连线 / Connection conflicts with existing wires");
}
function disconnectEndpoint(endpoint) {
  const hasLinks=graph().edges.some((e)=>e.from.node===endpoint.node&&e.from.pin===endpoint.pin||e.to.node===endpoint.node&&e.to.pin===endpoint.pin);
  if(!hasLinks)return false;
  mutate(()=>{disconnectPin(graph(),endpoint);if(selectedEdge&&!graph().edges.some(e=>e.id===selectedEdge))selectedEdge=null;});
  return true;
}
function tryConnect(a, b) {
  const snapshot = JSON.stringify(project);
  try {
    if (!connect(graph(), a, b)) {
      pending = null;
      renderNodes();
      drawEdges();
      updateSelectionStatus();
      return;
    }
    syncKeepingConnections(project); // wildcard nodes take the element type without losing other wires
    checkpoint(snapshot);
    pending = null;
    render();
    persist();
  } catch (e) {
    // An unsuccessful attempt must preserve both the graph and redo history.
    project = JSON.parse(snapshot);
    pending = null;
    renderNodes();
    drawEdges();
    toast(e.message, true);
    updateSelectionStatus();
  }
}
const viewport = $("viewport");
// Two-finger pinch: zoom around the midpoint and pan with it.
const touches = new Map();
let pinch = null;
const touchPair = () => {
  const [a, b] = [...touches.values()];
  return {
    d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
};
viewport.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType !== "touch") return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      drag = null;
      pending = null;
      $("marquee").hidden = true;
      viewport.classList.remove("panning");
      pinch = touchPair();
      drawEdges();
    }
    if (touches.size >= 2) e.stopImmediatePropagation();
  },
  true,
);
viewport.addEventListener(
  "pointermove",
  (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch || touches.size !== 2) return;
    e.stopImmediatePropagation();
    const now = touchPair(),
      r = viewport.getBoundingClientRect();
    zoomAt(now.d / pinch.d, now.x - r.left, now.y - r.top);
    graph().view.x += now.x - pinch.x;
    graph().view.y += now.y - pinch.y;
    updateView();
    redrawSoon(true, true);
    pinch = now;
  },
  true,
);
// Long-press on empty canvas opens the node picker (touch devices have no right-click).
let pressTimer = 0,
  ignoreBackdropUntil = 0;
const cancelPress = () => clearTimeout(pressTimer);
viewport.addEventListener("pointerdown", (e) => {
  cancelPress();
  if (
    e.pointerType !== "touch" ||
    touches.size !== 1 ||
    e.target.closest(".node,.pin,[data-edge],.canvas-bottom,.minimap-wrap,.empty-state,.selection-bar")
  )
    return;
  const { clientX, clientY } = e;
  pressTimer = setTimeout(() => {
    if (touches.size !== 1) return;
    drag = null;
    viewport.classList.remove("panning");
    // The finger is still down: its release must not count as a click outside the picker.
    ignoreBackdropUntil = Infinity;
    picker(worldPoint({ clientX, clientY }), pending);
  }, 550);
});
viewport.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" && pressTimer && (drag?.type === "pan" || drag?.type === "marquee")) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8)
      cancelPress();
  }
});
const releasePress = () => {
  cancelPress();
  if (ignoreBackdropUntil === Infinity) ignoreBackdropUntil = Date.now() + 500;
};
window.addEventListener("pointerup", releasePress, true);
window.addEventListener("pointercancel", releasePress, true);
const endTouch = (e) => {
  if (!touches.delete(e.pointerId)) return;
  if (touches.size < 2) pinch = null;
};
window.addEventListener("pointerup", endTouch, true);
window.addEventListener("pointercancel", endTouch, true);
viewport.addEventListener("selectstart", (e) => e.preventDefault());
viewport.addEventListener("dragstart", (e) => {
  if (!e.target.closest(".library-node")) e.preventDefault();
});
// Ask the browser not to start its own right-button gestures (best effort; extensions may still).
viewport.addEventListener("mousedown", (e) => {
  if (e.button === 2 && settings.rightPan && !e.target.closest(".node,.pin,.minimap-wrap,.canvas-bottom,.selection-bar")) {
    e.preventDefault();
    e.stopPropagation();
  }
});
// Right mouse button: drag on empty canvas pans (hand cursor); a plain click still opens the node menu.
let lastEdgeClick = null, ignoreCanvasDoubleClickUntil = 0;
let rightDragged = false,
  rightDownAt = 0,
  rightContextPending = false;
// The application menu may open on pointerup before contextmenu is dispatched. In that case
// the event can target the new modal rather than the canvas, so capture it at the document.
document.addEventListener("contextmenu", (e) => {
  if (!rightContextPending || Date.now() - rightDownAt > 1500) return;
  rightContextPending = false;
  e.preventDefault();
  e.stopPropagation();
}, true);
viewport.addEventListener("pointerdown", (e) => {
  if (e.button === 2) {
    rightDragged = false;
    if (e.target.closest("input,textarea,select,[contenteditable='true']")) {
      rightDownAt = 0;
      rightContextPending = false;
      return;
    }
    rightDownAt = e.pointerType === "mouse" ? Date.now() : 0;
    rightContextPending = !!rightDownAt && !e.target.closest(".minimap-wrap,.canvas-bottom,.selection-bar");
    if (
      settings.rightPan &&
      e.pointerType === "mouse" &&
      !e.target.closest(".node,.pin,[data-edge],.canvas-bottom,.minimap-wrap,.empty-state,.selection-bar")
    ) {
      drag = {
        type: "pan",
        right: true,
        startX: e.clientX,
        startY: e.clientY,
        x: graph().view.x,
        y: graph().view.y,
      };
      viewport.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    return;
  }
  if (e.target.closest(".canvas-bottom,.minimap-wrap,.empty-state,.selection-bar"))
    return;
  if (e.target.closest(".pin-input,input,select,textarea,.add-user-pin,.remove-user-pin,.advanced-toggle")) return;
  const toggle = e.target.closest("[data-toggle]");
  if (toggle && e.button === 0) {
    e.preventDefault();
    const n = graph().nodes.find((n) => n.id === toggle.dataset.toggleNode);
    if (n) {
      const id = toggle.dataset.toggle;
      mutate(() => (n.values[id] = !n.values[id]));
    }
    return;
  }
  const handle = e.target.closest("[data-rewire]");
  if (handle && e.button === 0) {
    const edge = graph().edges.find((item) => item.id === handle.dataset.edgeId);
    if (!edge) return;
    e.preventDefault();
    pending = clone(handle.dataset.rewire === "from" ? edge.to : edge.from);
    drag = { type:"rewire", edgeId:edge.id, side:handle.dataset.rewire, startX:e.clientX, startY:e.clientY };
    drawEdges(worldPoint(e)); updateSelectionStatus(); return;
  }
  const pin = e.target.closest(".pin");
  if (pin && e.button === 0) {
    e.preventDefault();
    const endpoint = { node: pin.dataset.node, pin: pin.dataset.pin };
    if (e.altKey) {
      pending = null; drag = null;
      if (disconnectEndpoint(endpoint)) {
        toast(bi2("已断开引脚连线", "Pin links disconnected"));
      } else { renderNodes(); drawEdges(); updateSelectionStatus(); }
      return;
    }
    if (
      pending &&
      (pending.node !== endpoint.node || pending.pin !== endpoint.pin)
    ) {
      tryConnect(pending, endpoint);
      return;
    }
    pending = endpoint;
    drag = { type: "wire", startX: e.clientX, startY: e.clientY };
    renderNodes();
    drawEdges(worldPoint(e));
    updateSelectionStatus();
    return;
  }
  const edge = e.target.closest("[data-edge]");
  if (edge && e.button === 0 && !space) {
    const now=Date.now(), prev=lastEdgeClick;
    if (prev && prev.id===edge.dataset.edge && now-prev.time<450 && Math.hypot(e.clientX-prev.x,e.clientY-prev.y)<14) {
      const point=worldPoint(e), id=edge.dataset.edge; lastEdgeClick=null; ignoreCanvasDoubleClickUntil=Date.now()+500;
      if(graph().nodes.length>=2000 || graph().edges.length>=10000){toast("蓝图已达到节点或连线数量上限",true);return;}
      mutate(() => { const node=insertReroute(graph(),id,point.x,point.y); if(node) selection=new Set([node.id]); selectedEdge=null; }); return;
    }
    lastEdgeClick={id:edge.dataset.edge,time:now,x:e.clientX,y:e.clientY};
    selection.clear();
    selectedEdge = edge.dataset.edge;
    renderNodes();
    renderInspector();
    drawEdges();
    updateSelectionStatus();
    return;
  }
  const node = e.target.closest(".node");
  if (node && e.button === 0 && !space) {
    const id = node.dataset.nodeId,
      additive = multiMode || e.shiftKey || e.ctrlKey || e.metaKey,
      drags = multiMode || !!e.target.closest(".node-head");
    // Tapping a selected node in a multi-selection un-selects it (after the press turns out not to be a drag).
    let toggleOff = null;
    if (additive) {
      if (!selection.has(id)) selectNode(id, true);
      else if (drags) toggleOff = id;
      else selectNode(id, true);
    } else if (!selection.has(id)) selectNode(id, false);
    if (drags) {
      drag = {
        type: "nodes",
        startX: e.clientX,
        startY: e.clientY,
        positions: graph()
          .nodes.filter((n) => selection.has(n.id))
          .map((n) => ({ id: n.id, x: n.x, y: n.y })),
        changed: false,
        toggleOff,
        els: new Map(
          [...selection].map((id) => [id, document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)]),
        ),
      };
      viewport.setPointerCapture(e.pointerId);
    }
    return;
  }
  if (e.button === 0 || e.button === 1) {
    const marquee =
      e.button === 0 &&
      !space &&
      !e.altKey &&
      (multiMode ||
        (e.pointerType !== "touch" && settings.dragMode === "marquee"));
    if (marquee) {
      const additive = multiMode || e.shiftKey || e.ctrlKey || e.metaKey;
      if (!additive) {
        selection.clear();
        selectedEdge = null;
        pending = null;
        renderNodes();
        drawEdges();
      }
      drag = {
        type: "marquee",
        startX: e.clientX,
        startY: e.clientY,
        base: new Set(selection),
      };
      viewport.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 0 && !space) {
      selection.clear();
      selectedEdge = null;
      pending = null;
      renderNodes();
      renderInspector();
      drawEdges();
      updateSelectionStatus();
    }
    drag = {
      type: "pan",
      startX: e.clientX,
      startY: e.clientY,
      x: graph().view.x,
      y: graph().view.y,
    };
    viewport.classList.add("panning");
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});
viewport.addEventListener("pointermove", (e) => {
  if (pending) drawEdges(worldPoint(e));
  if (!drag) return;
  const dx = e.clientX - drag.startX,
    dy = e.clientY - drag.startY;
  if (drag.type === "marquee") {
    const r = viewport.getBoundingClientRect(),
      box = {
        l: Math.min(e.clientX, drag.startX),
        t: Math.min(e.clientY, drag.startY),
        r: Math.max(e.clientX, drag.startX),
        b: Math.max(e.clientY, drag.startY),
      },
      m = $("marquee");
    if (Math.abs(dx) + Math.abs(dy) < 4 && m.hidden) return;
    m.hidden = false;
    Object.assign(m.style, {
      left: box.l - r.left + "px",
      top: box.t - r.top + "px",
      width: box.r - box.l + "px",
      height: box.b - box.t + "px",
    });
    selection = new Set(drag.base);
    document.querySelectorAll(".node").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.right >= box.l && b.left <= box.r && b.bottom >= box.t && b.top <= box.b)
        selection.add(el.dataset.nodeId);
      el.classList.toggle("selected", selection.has(el.dataset.nodeId));
    });
    updateSelectionStatus();
  } else if (drag.type === "pan") {
    if (drag.right) {
      if (!rightDragged && Math.hypot(dx, dy) < 5) return;
      rightDragged = true;
      viewport.classList.add("panning");
    }
    graph().view.x = drag.x + dx;
    graph().view.y = drag.y + dy;
    updateView();
    redrawSoon(true, true);
  } else if (
    drag.type === "nodes" &&
    (drag.changed || Math.abs(dx) + Math.abs(dy) > 3)
  ) {
    if (!drag.changed) {
      checkpoint();
      drag.changed = true;
      prepareFastDrag();
    }
    for (const p of drag.positions) {
      const n = graph().nodes.find((n) => n.id === p.id);
      n.x = p.x + dx / graph().view.zoom;
      n.y = p.y + dy / graph().view.zoom;
      const el = drag.els.get(n.id);
      el.style.left = n.x + "px";
      el.style.top = n.y + "px";
    }
    redrawSoon();
  }
});
window.addEventListener("pointerup", (e) => {
  if (!drag) return;
  if (drag.type === "rewire") {
    const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest(".pin");
    if (hit) {
      try {
        const updated=reconnectEdge(graph(),drag.edgeId,drag.side,{node:hit.dataset.node,pin:hit.dataset.pin});
        if (updated) {
          const candidate=clone(project),index=candidate.graphs.findIndex((g)=>g.id===candidate.activeGraph);candidate.graphs[index]=updated;
          syncKeepingConnections(candidate);
          mutate(() => { project=candidate; });
        }
      } catch (error) { toast(error.message,true); }
    }
    pending=null; renderNodes(); drawEdges(); updateSelectionStatus();
  } else if (drag.type === "wire") {
    const hit = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(".pin");
    if (
      hit &&
      pending &&
      (hit.dataset.node !== pending.node || hit.dataset.pin !== pending.pin)
    )
      tryConnect(pending, { node: hit.dataset.node, pin: hit.dataset.pin });
    else if (
      pending &&
      !hit &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 7 &&
      viewport.contains(document.elementFromPoint(e.clientX, e.clientY)) &&
      !document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(".node,.minimap-wrap,.canvas-bottom")
    )
      picker(worldPoint(e), pending);
  } else if (drag.type === "nodes" && drag.changed) {
    for (const p of drag.positions) {
      const n = graph().nodes.find((n) => n.id === p.id);
      n.x = Math.round(n.x / 10) * 10;
      n.y = Math.round(n.y / 10) * 10;
      const el = drag.els.get(n.id);
      el.style.left = n.x + "px";
      el.style.top = n.y + "px";
    }
    drag.fast = null;
    drawEdges();
    drawMinimap();
    persist();
  } else if (drag.type === "nodes" && drag.toggleOff) {
    selectNode(drag.toggleOff, true);
  } else if (drag.type === "marquee") {
    $("marquee").hidden = true;
    renderInspector();
    updateSelectionStatus();
  } else if (drag.type === "pan") scheduleSave();
  drag = null;
  viewport.classList.remove("panning");
});
viewport.addEventListener(
  "wheel",
  (e) => {
    if (e.target.closest(".node-body") && e.shiftKey) return;
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0012), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
function openPinMenu(target) {
  const el = target?.closest(".pin[data-node][data-pin]");
  if (!el) return false;
  const n = graph().nodes.find((n) => n.id === el.dataset.node), id = el.dataset.pin;
  if (!n) return false;
  const p = n.definition.pins.find((p) => p.id === id);
  if (!p) return false;
  const links = graph().edges.filter((e) => e.from.node === n.id && e.from.pin === id || e.to.node === n.id && e.to.pin === id).length;
  const cn = translate(p.name), raw = pinEnglish(p);
  const name = langMode === "en" ? raw : langMode === "zh" || cn === raw ? cn : `${cn} / ${raw}`;
  const direction = p.direction === "in" ? bi2("输入", "Input") : bi2("输出", "Output");
  openModal(name, `<p>${direction} · ${esc(p.type)} · ${bi2(`${links} 条连接`, `${links} connections`)}</p><button id="pin-disconnect" class="secondary-button" ${links ? "" : "disabled"}>${bi2("断开此引脚的连线", "Disconnect pin links")}</button><button id="pin-remove" class="secondary-button" ${canRemoveDynamicPin(n.definition, id) ? "" : "disabled"}>${bi2("删除引脚", "Remove pin")}</button><p class="detail-description">${bi2("可用撤销恢复引脚及连线。固定签名引脚不能删除。", "Undo restores the pin and links. Fixed signature pins cannot be removed.")}</p>`);
  $("pin-disconnect").onclick = () => { $("modal").close(); disconnectEndpoint({node:n.id,pin:id}); };
  $("pin-remove").onclick = () => { $("modal").close(); mutate(() => removeDynamicPin(graph(), n, id)); };
  return true;
}
viewport.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".minimap-wrap,input,textarea,select,[contenteditable='true']")) return;
  e.preventDefault();
  // A mouse right-click opens the menu on button release (below), once we know it was not a pan.
  if (Date.now() - rightDownAt < 1500) return;
  if (openPinMenu(e.target)) return;
  picker(worldPoint(e), pending);
});
window.addEventListener("pointerup", (e) => {
  if (e.button !== 2 || Date.now() - rightDownAt > 1500 || rightDragged) return;
  const t = document.elementFromPoint(e.clientX, e.clientY);
  if (!t || !viewport.contains(t) || t.closest(".minimap-wrap,.canvas-bottom,.selection-bar,input,textarea,select,[contenteditable='true']")) return;
  if (openPinMenu(t)) return;
  picker(worldPoint(e), pending);
});
viewport.addEventListener("dblclick", (e) => {
  if (Date.now()<ignoreCanvasDoubleClickUntil || e.target.closest("[data-edge]")) return;
  if (!e.target.closest(".node,.minimap-wrap,.canvas-bottom,.empty-state"))
    picker(worldPoint(e), pending);
});
viewport.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
viewport.addEventListener("drop", (e) => {
  e.preventDefault();
  const id = e.dataTransfer.getData("application/x-kards-node");
  if (id) addNode(id, worldPoint(e));
});
$("minimap").onclick = (e) => {
  const pt = $("minimap").createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform($("minimap").getScreenCTM().inverse()),
    r = viewport.getBoundingClientRect(),
    v = graph().view;
  v.x = r.width / 2 - p.x * v.zoom;
  v.y = r.height / 2 - p.y * v.zoom;
  updateView();
  drawMinimap();
  scheduleSave();
};
function download(filename, text, type) {
  const url = URL.createObjectURL(
      text instanceof Blob ? text : new Blob([text], { type }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProject() {
  persist();
  const data = buildExport(project, {
    classes: classMap(),
    enums,
    repository,
    propertyTypes: Object.fromEntries(
      properties.filter((p) => p.class === project.asset.parentClass).map((p) => [p.name, p.type]),
    ),
  });
  download(
    (project.name || "blueprint").replace(/[\\/:*?"<>|]/g, "_") +
      ".kardsbp.json",
    JSON.stringify(data, null, 2),
    "application/json",
  );
  toast("已导出蓝图，可随时导入继续编辑");
}
// SVG exports use English for everything the editor provides (node, pin and category names),
// and exactly what the user typed for everything they can customise (card title, graph name,
// node titles, comments, default values).
// Draws the active graph as a standalone SVG; also the source for the PNG export.
function buildGraphSVG() {
  if (!graph().nodes.length) return null;
  const b = bounds();
  const header = 60;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y - header} ${b.w} ${b.h + header}" width="${b.w}" height="${b.h + header}"><rect x="${b.x}" y="${b.y - header}" width="${b.w}" height="${b.h + header}" fill="#252525"/><text x="${b.x + 20}" y="${b.y - 25}" fill="#d4d4d4" font-family="sans-serif" font-size="16">${esc(project.card.title)} · ${esc(graph().name)}</text><g fill="none" stroke-width="2.3">`;
  for (const e of graph().edges) {
    const a = pinPosition(e.from),
      p = pinPosition(e.to),
      node = graph().nodes.find((n) => n.id === e.from.node),
      pin = node.definition.pins.find((p) => p.id === e.from.pin);
    if (a && p)
      svg += `<path d="${curve(a, p)}" stroke="${pinColor(pin.type)}"/>`;
  }
  svg += "</g>";
  for (const n of graph().nodes) {
    const el = document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`),
      h = el.offsetHeight,
      w = el.offsetWidth;
    if (n.definition.reroute) {
      svg += `<g><rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="${h/2}" fill="#333" stroke="${pinColor(n.definition.pins[0].type)}"/>`;
      for(const p of n.definition.pins){const pos=pinPosition({node:n.id,pin:p.id});if(pos)svg+=`<circle cx="${pos.x}" cy="${pos.y}" r="4" fill="#171717" stroke="${pinColor(p.type)}" stroke-width="2"/>`;}
      svg += "</g>"; continue;
    }
    svg += `<g font-family="monospace"><rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="6" fill="#171717" stroke="${color(n.definition)}"/><rect x="${n.x + 1}" y="${n.y + 1}" width="${w - 2}" height="57" rx="5" fill="${color(n.definition)}"/><text x="${n.x + 12}" y="${n.y + 24}" fill="#e0e9e2" font-size="12">${esc(n.title || nodeEnglish(n.definition))}</text><text x="${n.x + 12}" y="${n.y + 43}" fill="#eeeeee" font-size="9">${esc(n.title ? nodeEnglish(n.definition) : kindEnglish(n))}</text>`;
    if (n.comment)
      svg += `<text x="${n.x}" y="${n.y - 12}" fill="#a4b69d" font-size="10">${esc(n.comment)}</text>`;
    for (const p of n.definition.pins) {
      const pos = pinPosition({ node: n.id, pin: p.id }),
        out = p.direction === "out";
      if (!pos) continue;
      const val = n.values[p.id] ?? pinDefault(p);
      const hasValue =
        p.type !== "exec" &&
        !graph().edges.some((e) => e.to.node === n.id && e.to.pin === p.id) &&
        (p.direction === "in" ||
          (n.definition.category === "variables" && n.definition.kind === "variable"));
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="4" fill="#171717" stroke="${pinColor(p.type)}" stroke-width="2"/><text x="${pos.x + (out ? -12 : 12)}" y="${pos.y + 3}" fill="#b1c4b8" font-size="9" text-anchor="${out ? "end" : "start"}">${esc(pinEnglish(p))}${hasValue ? " = " + esc(val) : ""}</text>`;
    }
    svg += "</g>";
  }
  svg += "</svg>";
  return { svg, width: b.w, height: b.h + header };
}
const graphFileName = () =>
  (graph().name || "graph").replace(/[\\/:*?"<>|]/g, "_");
function exportSVG() {
  const built = buildGraphSVG();
  if (!built) return toast("请先添加节点");
  download(`${graphFileName()}.svg`, built.svg, "image/svg+xml");
  toast("已导出可独立打开的 SVG 图像");
}
async function exportPNG() {
  const built = buildGraphSVG();
  if (!built) return toast("请先添加节点");
  const url = URL.createObjectURL(
    new Blob([built.svg], { type: "image/svg+xml" }),
  );
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("svg"));
      img.src = url;
    });
    // Browsers cap canvas size (phones are the tightest), so shrink the scale for big graphs.
    const scale = Math.min(
      pngScale,
      8192 / built.width,
      8192 / built.height,
      Math.sqrt(16e6 / (built.width * built.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(built.width * scale));
    canvas.height = Math.max(1, Math.round(built.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#252525";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("png");
    download(`${graphFileName()}.png`, blob);
    toast(
      scale < pngScale - 0.01
        ? `已导出 PNG 图片（图较大，倍率降为 ${scale.toFixed(1)}×）`
        : "已导出 PNG 图片",
    );
  } catch {
    toast("PNG 导出失败，请改用 SVG 导出", true);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- one Export button with a switchable format (blueprint file / SVG / PNG)
const EXPORT_KEY = "kards-blueprint-studio.export";
const EXPORT_FORMATS = {
  json: { zh: "蓝图文件", en: "Blueprint file", ext: ".kardsbp.json" },
  svg: { zh: "SVG 矢量图", en: "SVG vector", ext: "SVG" },
  png: { zh: "PNG 图片", en: "PNG image", ext: "PNG" },
  zip: { zh: "工作区全部 (ZIP)", en: "All cards (ZIP)", ext: ".zip" },
};
const EXPORT_FILE_EXT = { json: ".kardsbp.json", svg: ".svg", png: ".png", zip: ".zip" };
let exportFormat = "json",
  pngScale = 2;
try {
  const saved = JSON.parse(localStorage.getItem(EXPORT_KEY) || "{}");
  if (EXPORT_FORMATS[saved.format]) exportFormat = saved.format;
  if (Number.isFinite(saved.scale) && saved.scale >= 0.5 && saved.scale <= 8)
    pngScale = saved.scale;
} catch {
  /* storage unavailable: defaults */
}
function saveExportChoice() {
  try {
    localStorage.setItem(
      EXPORT_KEY,
      JSON.stringify({ format: exportFormat, scale: pngScale }),
    );
  } catch {
    /* the choice just lasts for this visit */
  }
}
function renderExportControl() {
  const f = EXPORT_FORMATS[exportFormat];
  $("export-label").textContent =
    exportFormat === "png" ? `PNG · ${pngScale}×` : f.ext;
  $("export-menu").innerHTML =
    Object.entries(EXPORT_FORMATS)
      .map(
        ([key, v]) =>
          `<button type="button" role="menuitemradio" aria-checked="${key === exportFormat}" class="export-item ${key === exportFormat ? "active" : ""}" data-format="${key}"><span class="export-check">${key === exportFormat ? "✓" : ""}</span><span class="export-name">${bi2(v.zh, v.en)}</span><span class="export-ext">${EXPORT_FILE_EXT[key]}</span></button>`,
      )
      .join("") +
    (exportFormat === "png"
      ? `<div class="export-scale" role="group" aria-label="PNG 倍率"><span>${bi2("倍率", "Scale")}</span>${[1, 2, 3, 4].map((n) => `<button type="button" class="export-scale-btn ${n === pngScale ? "active" : ""}" data-scale="${n}">${n}×</button>`).join("")}<label class="export-scale-custom" title="自定义倍率 0.5–8"><input type="number" class="export-scale-input" min="0.5" max="8" step="0.5" value="${pngScale}" aria-label="自定义倍率"><span>×</span></label></div>`
      : "");
}
function setExportMenu(open) {
  const menu = $("export-menu");
  if (open) {
    // position: fixed, so the top bar's own scrolling never clips the menu
    const r = $("export-format").getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 22)}px`;
    menu.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
  }
  menu.hidden = !open;
  $("export-format").setAttribute("aria-expanded", String(open));
}
function exportCurrent() {
  ({ json: exportProject, svg: exportSVG, png: exportPNG, zip: exportAllZip })[
    exportFormat
  ]();
}
function newProject() {
  let n = 1,
    suggestion = "BP_NewCard";
  while (workspace.nameTaken(suggestion)) suggestion = `BP_NewCard_${++n}`;
  openModal(
    "新建卡牌",
    `<div class="field"><label class="detail-label" for="new-name">资源名称</label><input id="new-name" value="${esc(suggestion)}" maxlength="64"><p class="detail-description">名称只能包含英文字母、数字和下划线，不能以数字开头（不支持中文）。</p></div><p>新卡牌会加入左侧的工作区，当前这张卡牌会自动保存。</p><div class="modal-actions"><button id="create-project" class="primary-button">创建卡牌</button></div>`,
  );
  $("create-project").onclick = () => {
    const name = $("new-name").value.trim(),
      error = checkName(name) || (workspace.nameTaken(name) ? "资源名称已被工作区里的另一张卡牌使用" : null);
    if (error) return toast(error, true);
    const p = makeProject();
    p.name = name;
    addCard(p);
    $("modal").close();
  };
}
$("file-input").onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (files.length) await importFiles(files);
};
function validate() {
  try {
    validateProject(clone(project));
    const g = graph(),
      needsTarget = g.nodes.filter((n) => {
        const p = n.definition.pins.find(
          (x) => x.id === "target" && x.direction === "in",
        );
        if (!p || g.edges.some((e) => e.to.node === n.id && e.to.pin === p.id))
          return false;
        const value = n.values[p.id] ?? pinDefault(p);
        return (
          value === "None" ||
          value === "" ||
          (value === "Self" && pinDefault(p) !== "Self")
        );
      }),
      unconnected = g.nodes.filter((n) =>
        n.definition.pins.some(
          (p) =>
            p.type === "exec" &&
            p.direction === "in" &&
            !g.edges.some((e) => e.to.node === n.id && e.to.pin === p.id),
        ),
      );
    openModal(
      "蓝图检查",
      `<div class="validation-item">✓ 文件结构、端口类型和连接引用有效。</div><div class="validation-item">${g.nodes.length} 个节点 · ${g.edges.length} 条连接 · ${unconnected.length} 个动作节点没有执行输入</div>${unconnected.length ? `<p>尚未接入执行流：${unconnected.map((n) => esc(nodeHeading(n))).join(langMode === "en" ? ", " : "、")}。可以保留它们作为设计草稿。</p>` : ""}${needsTarget.length ? `<div class="validation-item warn">⚠ ${needsTarget.length} 个节点的 Target 没有连接，而且它们不属于 ${esc(project.asset.parentClass)}，不能默认使用 Self：${needsTarget.map((n) => esc(nodeHeading(n))).join(langMode === "en" ? ", " : "、")}。</div>` : ""}<p>检查范围为蓝图文档结构。此编辑器不运行蓝图，也不验证游戏运行结果。</p>`,
    );
  } catch (e) {
    toast(e.message, true);
  }
}
function help() {
  openModal(
    "设计你的下一张卡牌",
    `<div class="help-grid"><span>添加节点</span><kbd>Tab / 右键</kbd><span>框选节点</span><kbd>拖动空白（白色框）</kbd><span>平移画布</span><kbd>空格 / 中键 / Alt + 拖动</kbd><span>缩放画布</span><kbd>滚轮 / ＋ −</kbd><span>适应所有节点</span><kbd>F</kbd><span>断开引脚连线</span><kbd>Alt + 单击引脚</kbd><span>重接已有连线</span><kbd>选中连线后拖动圆点</kbd><span>插入重定向节点</span><kbd>双击连线</kbd><span>查找节点</span><kbd>Ctrl / Cmd + F</kbd><span>多选节点</span><kbd>Shift + 单击 / 手机「多选」按钮</kbd><span>移动选中节点</span><kbd>方向键 / Shift + 方向键（快速）</kbd><span>全选 / 复制 / 删除</span><kbd>Ctrl A / Ctrl D / Delete</kbd><span>撤销 / 重做</span><kbd>Ctrl Z / Ctrl Shift Z</kbd><span>保存到本地 / 导出文件</span><kbd>Ctrl S / Ctrl Shift S</kbd><span>取消连线 / 取消选择</span><kbd>Esc</kbd></div><p>从一个端口拖向另一个端口，或依次点击两个端口。只有类型相同的输出与输入可以连接。点击连线后按 Delete 可断开。</p><p>修改会自动保存在当前浏览器。使用「导出蓝图」获得文件；更换设备或清除浏览器数据前请先导出。支持 macOS 的 ⌘ 快捷键。</p><div class="format-note">format: "${FORMAT}"\nversion: ${VERSION}\ngraphs: [{ nodes, edges, view }]</div>`,
  );
}
$("node-search").oninput = () => {
  libraryLimit = 120;
  renderLibrary();
};
$("add-node").onclick = () => picker();
$("empty-add").onclick = () => picker();
$("add-graph").onclick = newItemMenu;
$("new-project").onclick = newProject;
// The Workspace and My Blueprint sections fold away by clicking their titles.
{
  const KEY = "kards-blueprint-studio.collapsed";
  let folded = {};
  try {
    folded = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    /* keep everything open */
  }
  for (const [selector, id] of [
    [".workspace-section", "workspace"],
    [".graph-section", "blueprint"],
  ]) {
    const section = document.querySelector(selector),
      title = section.querySelector(".section-heading h2");
    section.classList.toggle("folded", id in folded ? !!folded[id] : id === "blueprint" && window.innerWidth > 800);
    title.setAttribute("role", "button");
    title.tabIndex = 0;
    const toggle = () => {
      section.classList.toggle("folded");
      folded[id] = section.classList.contains("folded");
      try {
        localStorage.setItem(KEY, JSON.stringify(folded));
      } catch {
        /* the fold state just lasts for this visit */
      }
    };
    title.onclick = toggle;
    title.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    };
  }
}
$("import").onclick = () => $("file-input").click();
$("ws-import").onclick = () => $("file-input").click();
$("ws-new").onclick = newProject;
$("save").onclick = () => {
  persist();
  toast("项目已保存到当前浏览器");
};
$("export").onclick = exportCurrent;
$("export-format").onclick = (e) => {
  e.stopPropagation();
  setExportMenu($("export-menu").hidden);
};
$("export-menu").onchange = (e) => {
  const input = e.target.closest(".export-scale-input");
  if (!input) return;
  const value = Math.round(Number(input.value) * 10) / 10;
  pngScale = Number.isFinite(value) ? Math.min(8, Math.max(0.5, value)) : pngScale;
  saveExportChoice();
  renderExportControl();
};
$("export-menu").onclick = (e) => {
  e.stopPropagation();
  const item = e.target.closest("[data-format]"),
    scale = e.target.closest("[data-scale]");
  if (item) {
    exportFormat = item.dataset.format;
    saveExportChoice();
    renderExportControl();
    // PNG keeps the menu open so its scale can be chosen right away
    setExportMenu(exportFormat === "png");
  } else if (scale) {
    pngScale = Number(scale.dataset.scale);
    saveExportChoice();
    renderExportControl();
  }
};
document.addEventListener("click", () => setExportMenu(false));
window.addEventListener("resize", () => setExportMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setExportMenu(false);
});
renderExportControl();
$("undo").onclick = undo;
$("redo").onclick = redo;
$("fit").onclick = fit;
$("zoom-in").onclick = () => zoomAt(1.15);
$("zoom-out").onclick = () => zoomAt(1 / 1.15);
$("zoom-label").onclick = () => zoomAt(1 / graph().view.zoom);
// Re-download every site file from the server (bypassing the HTTP cache), then reload.
// Every file the page loads; Refresh / Update re-download all of them from the server.
// Unreal's ExpandEnumAsExecs: a function whose output is an enum named "Branches" (WhichChooseOne,
// EnumCompareFaction, ...) is shown with one execution output per enumerator instead of a data pin.
// Every node also gets its name split into words as a search alias ("Which Choose One").
const SEARCH_ALIASES = {
  GetOppositeSide: "获取敌方阵营 敌方阵营 敌人阵营 对方阵营 Enemy Side",
  GetOpponentSide: "敌方阵营 敌人阵营 对方阵营 Enemy Side",
  GetTheOtherSide: "敌方阵营 敌人阵营 对方阵营 Enemy Side",
};
function expandEnumExecs(d, enumTable) {
  const words = d.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const out = {
    ...d,
    aliases: [d.aliases || (words !== d.name ? words : ""), SEARCH_ALIASES[d.name] || ""].filter(Boolean).join(" ") || undefined,
  };
  return expandEnumPins(out, enumTable);
}
const SITE_FILES = [
  "./",
  "./reference.html",
  "./reference.css",
  "./reference.js",
  "./reference-graph.js",
  "./reference-types.js",
  "./reference-data/index.json",
  "./reference-data/zh-Hans.json",
  "./style.css",
  "./polish.css",
  "./app.js",
  "./model.js",
  "./enum-tools.js",
  "./blueprint.js",
  "./ue-nodes.js",
  "./ue-node-features.js",
  "./ue-editor-metadata.js",
  "./i18n.js",
  "./ui-i18n.js",
  "./workspace.js",
  "./zip.js",
  "./update.js",
  "./node-look.js",
  "./reference-loops.js",
  "./sw.js",
  "./catalog.json",
  "./engine-events.json",
  "./node-clipboard.js",
  "./graph-edit.js",
  "./reference-drafts.js",
  "./reasons.json",
  "./changelog.json",
  "./version.json",
];
// Stamped with the commit and version by the Pages workflow; local copies keep the placeholders.
const BUILD = { sha: "__BUILD_SHA__", version: "__BUILD_VERSION__" };
// Published builds pin every file to their commit (?v=sha), so updating means opening the page
// again under the new commit: nothing from an older build can be mixed in.
async function reloadFresh(sha) {
  persist();
  let next = sha;
  if (!next)
    try {
      next = (await (await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" })).json()).sha;
    } catch {
      next = String(Date.now());
    }
  location.replace(`${location.pathname}?r=${encodeURIComponent(next)}${location.hash}`);
}
async function forceRefresh(sha = null) {
  const button = $("force-refresh");
  button.disabled = true;
  button.textContent = "⟳ …";
  try {
    if (isStamped(BUILD)) {
      toast("正在读取最新版本…");
      return await reloadFresh(sha);
    }
    persist();
    const files = SITE_FILES;
    await Promise.all(
      files.map((f) =>
        fetch(f, { cache: "reload" }).then((r) => {
          if (!r.ok && f !== "./version.json") throw new Error(`${f} ${r.status}`);
        }),
      ),
    );
    if ("caches" in window)
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    toast("已从 GitHub 读取最新版本，正在刷新…");
    setTimeout(() => location.reload(), 400);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = `⟳ ${bi("刷新", "Refresh")}`;
    toast(`刷新失败：${error.message}。请检查网络后重试。`, true);
  }
}
$("force-refresh").onclick = forceRefresh;
$("world").addEventListener("click", (e) => {
  const b = e.target.closest("[data-reason]");
  if (b) reasonDialog(b.dataset.reasonNode, b.dataset.reason);
});
$("help").onclick = help;
$("settings").onclick = openSettings;
$("backup-input").onchange = (e) => {
  const [file] = e.target.files;
  e.target.value = "";
  if (file) restoreLocalBackup(file);
};
$("arrange").onclick = arrangeNodes;

function openGraphFind() {
  let found=[], current=-1;
  openModal("查找节点 / Find nodes", `<input id="find-query" class="modal-search" placeholder="节点、引脚或参数值 / Node, pin or value"><div id="find-count" class="detail-description"></div><div class="modal-actions"><button id="find-prev" class="secondary-button">↑ 上一个 / Previous</button><button id="find-next" class="primary-button">↓ 下一个 / Next</button></div>`);
  const update=()=>{const q=$("find-query").value.trim().normalize("NFKC").toLowerCase();found=q?graph().nodes.filter(n=>`${nodeHeading(n)} ${nodeChinese(n.definition)} ${nodeEnglish(n.definition)} ${n.definition.class||""} ${n.comment||""} ${Object.values(n.values||{}).join(" ")} ${n.definition.pins.map(p=>`${p.name} ${translate(p.name)} ${p.type}`).join(" ")}`.normalize("NFKC").toLowerCase().includes(q)):[];current=-1;$("find-count").textContent=langMode==="en"?`${found.length} matches`:langMode==="zh"?`${found.length} 个匹配`:`${found.length} 个匹配 / ${found.length} matches`;};
  const go=(step)=>{if(!found.length)return; current=current<0?(step<0?found.length-1:0):(current+step+found.length)%found.length;const n=found[current],v=graph().view,r=viewport.getBoundingClientRect();v.x=r.width/2-(n.x+nodeWidth(n)/2)*v.zoom;v.y=r.height/2-(n.y+40)*v.zoom;selection=new Set([n.id]);selectedEdge=null;render();scheduleSave();$("find-count").textContent=`${current+1} / ${found.length} · ${nodeHeading(n)}`;};
  $("find-query").oninput=update;$("find-query").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();go(e.shiftKey?-1:1);}};$("find-prev").onclick=()=>go(-1);$("find-next").onclick=()=>go(1);$("find-query").focus();
}
$("graph-find").onclick=openGraphFind;
$("align-nodes").onchange=(e)=>{const mode=e.target.value;e.target.value="";if(!mode)return;const nodes=graph().nodes.filter(n=>selection.has(n.id));const snapshot=JSON.stringify(project);const changed=alignNodes(nodes,mode,n=>{const el=document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`);return {width:el?.offsetWidth||280,height:el?.offsetHeight||100};});if(!changed){const enough=nodes.length >= (mode.startsWith("distribute") ? 3 : 2);toast(enough?bi2("所选节点已处于该位置", "Nodes already match this arrangement"):bi2("请选择足够数量的节点", "Select enough nodes"),!enough);return;}checkpoint(snapshot);render();persist();};
$("multi-toggle").onclick = () => setMultiMode(!multiMode);
$("bar-clear").onclick = () => {
  selection.clear();
  selectedEdge = null;
  renderNodes();
  renderInspector();
  drawEdges();
  updateSelectionStatus();
};
applySettings();
$("validate").onclick = validate;
$("toggle-inspector").onclick = () => {
  const panel = $("inspector");
  if (window.innerWidth <= 1000)
    setInspectorOpen(!panel.classList.contains("mobile-open"));
  else panel.hidden = !panel.hidden;
  requestAnimationFrame(() => {
    drawEdges();
    drawMinimap();
  });
};
function setDrawer(open) {
  $("left-panel").classList.toggle("open", open);
  $("drawer-backdrop").classList.toggle("open", open);
  if (open) $("inspector").classList.remove("mobile-open");
}
function setInspectorOpen(open) {
  $("inspector").classList.toggle("mobile-open", open);
  $("drawer-backdrop").classList.toggle("open", open);
}
$("bar-details").onclick = () => setInspectorOpen(true);
$("bar-duplicate").onclick = duplicate;
$("bar-copy").onclick = () => copyNodes();
$("bar-paste").onclick = pasteFromButton;
$("copy-nodes").onclick = () => copyNodes();
$("paste-nodes").onclick = pasteFromButton;
$("bar-delete").onclick = deleteSelection;
$("toggle-library").onclick = () =>
  setDrawer(!$("left-panel").classList.contains("open"));
$("close-inspector").onclick = () => setInspectorOpen(false);
$("close-left").onclick = () => setDrawer(false);
$("drawer-backdrop").onclick = () => {
  setDrawer(false);
  setInspectorOpen(false);
};
$("graph-list").addEventListener("click", () => {
  if (window.innerWidth <= 800) setDrawer(false);
});
$("project-name").onchange = (e) => {
  const name = e.target.value.trim(),
    error =
      checkName(name) ||
      (workspace.nameTaken(name, project.id)
        ? "资源名称已被工作区里的另一张卡牌使用"
        : null);
  if (error) {
    toast(error, true);
    e.target.value = project.name;
  } else mutate(() => (project.name = name));
};
$("modal").onclick = (e) => {
  if (Date.now() < ignoreBackdropUntil) return;
  if (e.target === $("modal")) {
    const r = $("modal").getBoundingClientRect();
    if (
      e.clientX < r.x ||
      e.clientX > r.right ||
      e.clientY < r.y ||
      e.clientY > r.bottom
    )
      $("modal").close();
  }
};
window.addEventListener("keydown", (e) => {
  const typing =
    /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
    e.target.isContentEditable;
  if (e.key === "Escape") {
    if ($("modal").open || typing) return;
    setDrawer(false);
    setInspectorOpen(false);
    if (drag?.type === "rewire") drag = null;
    pending = null;
    selection.clear();
    selectedEdge = null;
    renderNodes();
    renderInspector();
    drawEdges();
    updateSelectionStatus();
    return;
  }
  if ($("modal").open) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (e.shiftKey) exportProject();
    else {
      persist();
      toast("已保存到当前浏览器");
    }
    return;
  }
  if (typing) return;
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (direction && selection.size && !mod && !e.altKey && !drag && !e.target.closest("button, a, [contenteditable]")) {
    const nodes = graph().nodes.filter((node) => selection.has(node.id));
    if (nodes.length) {
      e.preventDefault();
      if (!e.repeat) checkpoint();
      const step = e.shiftKey ? 10 : 1;
      for (const node of nodes) { node.x += direction[0] * step; node.y += direction[1] * step; }
      render();
      scheduleSave();
    }
    return;
  }
  if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); openGraphFind(); return; }
  if (e.key === " ") {
    e.preventDefault();
    space = true;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    picker();
  }
  if (e.key === "/") {
    e.preventDefault();
    $("node-search").focus();
  }
  if (e.key.toLowerCase() === "f" && !mod) fit();
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelection();
  }
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
  if (mod && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
  }
  if (mod && e.key.toLowerCase() === "d") {
    e.preventDefault();
    duplicate();
  }
  if (mod && e.key.toLowerCase() === "c") {
    e.preventDefault();
    copyNodes();
  }
  if (mod && e.key.toLowerCase() === "x") {
    e.preventDefault();
    cutNodes();
  }
  if (mod && e.key.toLowerCase() === "a") {
    e.preventDefault();
    selection = new Set(graph().nodes.map((n) => n.id));
    renderNodes();
    renderInspector();
    drawEdges();
    updateSelectionStatus();
  }
});
// Ctrl/Cmd+V arrives as a "paste" event, which also carries text copied from another device.
document.addEventListener("paste", (e) => {
  if ($("modal").open || editable(e.target)) return;
  e.preventDefault();
  pasteNodes(e.clipboardData?.getData("text") || "");
});
viewport.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") lastPointer = { clientX: e.clientX, clientY: e.clientY };
});
window.addEventListener("keyup", (e) => {
  if (e.key === " ") space = false;
});
window.addEventListener("blur", () => {
  space = false;
});
window.addEventListener("resize", () => {
  drawEdges();
  drawMinimap();
});
// Only write on the way out when something is still unsaved: an idle tab must never overwrite what
// another tab (or a restored backup) has stored since.
window.addEventListener("beforeunload", () => {
  if (project && dirty) persist();
});
// Several tabs share one workspace: when another tab saves, take over its newer version.
window.addEventListener("storage", (e) => {
  if (!project || !e.key || !e.key.startsWith("kards-blueprint-studio.")) return;
  if (e.key === "kards-blueprint-studio.workspace") {
    workspace.load();
    renderWorkspace();
    return;
  }
  if (e.key !== `kards-blueprint-studio.card.${project.id}` || !e.newValue) return;
  try {
    const raw = JSON.parse(e.newValue);
    setTypeHierarchy({ ...classes, ...raw.types });
    const next = validateProject(raw);
    clearTimeout(saveTimer);
    dirty = false;
    loadProject(next, { fitView: false, save: false });
    toast("这张卡牌在另一个标签页里被修改了，已载入最新内容");
  } catch {
    /* keep what is on screen */
  }
});
// ---------------------------------------------------------------- version info (Settings)
// Shows which build this page runs and compares it with what is published, so it is easy to tell
// whether this device is in sync.
const shortSha = (sha) => String(sha || "").slice(0, 7);
function versionFieldHtml() {
  const stamped = isStamped(BUILD),
    page = document.querySelector('meta[name="build"]')?.content;
  const build = stamped
    ? `v${esc(BUILD.version)} <small>· ${bi2("构建", "build")} <code>${esc(shortSha(BUILD.sha))}</code></small>`
    : `<span>${bi2("本地开发版（未发布构建）", "Local development copy (not a published build)")}</span>`;
  const mismatch =
    stamped && page && !page.startsWith("__") && page !== BUILD.sha
      ? `<p class="detail-description version-warn">${bi2("页面与脚本不是同一次构建，点「强制刷新」修复。", "The page and its script come from different builds — press Force refresh.")}</p>`
      : "";
  return `<div class="field version-field"><span class="detail-label">${bi2("版本", "Version")}</span><div class="version-line">${build}</div><p class="detail-description" id="ver-status">${stamped ? bi2("正在检查最新版本…", "Checking for the latest version…") : bi2("本地副本不会检查更新。", "Local copies do not check for updates.")}</p>${mismatch}<div class="rs-custom-row"><button id="ver-check" class="secondary-button" type="button" ${stamped ? "" : "disabled"}>${bi2("检查更新", "Check for updates")}</button><button id="ver-refresh" class="secondary-button" type="button">${bi2("强制刷新", "Force refresh")}</button></div></div>`;
}
async function publishedVersion() {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
async function runVersionCheck() {
  const out = $("ver-status");
  if (!out || !isStamped(BUILD)) return;
  out.innerHTML = bi2("正在检查最新版本…", "Checking for the latest version…");
  try {
    const latest = await publishedVersion();
    if (!$("ver-status")) return;
    const tag = `v${esc(latest.version || "?")} · <code>${esc(shortSha(latest.sha))}</code>`;
    out.innerHTML = isOutdated(BUILD, latest)
      ? `<b class="version-old">${bi2("有新版本", "Update available")}</b> ${tag} — ${bi2("点「强制刷新」更新。", "press Force refresh to update.")}`
      : `<b class="version-ok">${bi2("已是最新", "Up to date")}</b> ${tag}`;
  } catch {
    if ($("ver-status")) out.innerHTML = bi2("无法连接，检查网络后重试。", "Could not reach the site — check your connection and retry.");
  }
}
function wireVersionField() {
  $("ver-check")?.addEventListener("click", runVersionCheck);
  $("ver-refresh")?.addEventListener("click", () => {
    $("modal").close();
    forceRefresh();
  });
  runVersionCheck();
}
// ---- update check: ask before replacing the page with a newer deployed version.
// It runs shortly after start and again whenever the page comes back to the foreground, regains
// focus or the network returns (at most every 10 minutes), so a tab or installed app that stays
// open for days still notices a new release. A version that was already offered is not asked twice
// in the same session; the Settings version block always shows the current state.
let askedFor = "",
  lastUpdateCheck = 0;
const UPDATE_CHECK_EVERY = 10 * 60 * 1000;
async function checkForUpdate() {
  if (!isStamped(BUILD) || Date.now() - lastUpdateCheck < UPDATE_CHECK_EVERY) return;
  lastUpdateCheck = Date.now();
  try {
    const stamp = `t=${Date.now()}`;
    const fetchJson = async (file) => {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`./${file}?${stamp}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    };
    const latest = await fetchJson("version.json");
    if (!isOutdated(BUILD, latest) || askedFor === latest.sha) return;
    // Never cover a dialog the user is working in; look again at the next check.
    if ($("modal").open) {
      lastUpdateCheck = 0;
      return;
    }
    let log = [];
    try {
      log = await fetchJson("changelog.json");
    } catch {
      /* the dialog still works without the notes */
    }
    askedFor = latest.sha;
    showUpdateDialog(latest, entriesSince(log, BUILD.version));
  } catch {
    /* offline or blocked: never bother the user about it */
  }
}
function showUpdateDialog(latest, entries) {
  const line = (item) =>
    `<li><span class="zh">${esc(item.zh)}</span><span class="en">${esc(item.en || item.zh)}</span></li>`;
  const notes = entries.length
    ? entries
        .map(
          (e) =>
            `<section class="update-entry"><h3>v${esc(e.version)} · <span class="zh">${esc(e.title?.zh || "")}</span><span class="en">${esc(e.title?.en || e.title?.zh || "")}</span> <small>${esc(e.date || "")}${e.author ? ` · ${esc(e.author)}` : ""}</small></h3><ul>${(e.items || []).map(line).join("")}</ul></section>`,
        )
        .join("")
    : "<p>这个版本包含功能改进和问题修复。</p>";
  openModal(
    "发现新版本",
    `<p class="update-versions">当前 v${esc(BUILD.version)} → 最新 v${esc(latest.version || "?")}</p><div class="update-notes">${notes}</div><p class="detail-description">更新会重新下载页面文件并刷新；你的卡牌保存在浏览器里，不会丢失。</p><div class="update-actions"><button id="update-later" class="secondary-button">暂不更新</button><button id="update-now" class="primary-button">立即更新</button></div>`,
  );
  $("update-later").onclick = () => $("modal").close();
  $("update-now").onclick = () => {
    $("update-now").disabled = true;
    $("update-now").textContent = "…";
    forceRefresh(latest?.sha);
  };
}
// index.html carries the build it was published with; if the cached page and the script disagree,
// reopen the page fresh (once) instead of running a half-updated app.
function buildMismatch() {
  const page = document.querySelector('meta[name="build"]')?.content;
  return isStamped(BUILD) && page && !page.startsWith("__") && page !== BUILD.sha;
}
async function boot() {
  if (buildMismatch()) {
    let tried = false;
    try {
      tried = sessionStorage.getItem("kards-heal") === BUILD.sha;
      sessionStorage.setItem("kards-heal", BUILD.sha);
    } catch {
      tried = true;
    }
    if (!tried) return reloadFresh(BUILD.sha);
  }
  try {
    const [response, engineResponse] = await Promise.all([fetch("./catalog.json"), fetch("./engine-events.json")]);
    if (!response.ok) throw new Error("节点库载入失败");
    if (!engineResponse.ok) throw new Error("UE 事件库载入失败");
    const engineData = await engineResponse.json(), engineEvents = engineData.nodes;
    const data = await response.json();
    classes = { ...engineClasses, ...data.classes };
    setTypeHierarchy(classes);
    catalog = [
      ...builtins.map((d) => { const e = engineEvents.find((e) => e.class === d.class && e.name === d.name); return e ? { ...e, id: d.id, label: d.label, english: d.english } : d; }),
      ...engineEvents.filter((e) => !builtins.some((d) => d.class === e.class && d.name === e.name)),
      ...typeNodes(classes, data.properties || []),
      ...data.nodes.map((d) => expandEnumExecs(d, data.enums)),
    ];
    catalogEnums = { ...data.enums, ...engineData.enums };
    enums = data.enums;
    setEnumTable(enums);
    properties = data.properties || [];
    repository = data.repository || null;
    try {
      const r = await fetch("./reasons.json");
      if (r.ok) reasons = (await r.json()).reasons || [];
    } catch {
      /* the Reason picker then only accepts typed text */
    }
    $("catalog-count").textContent = catalog.length;
    $("source-status").textContent =
      `${data.nodes.length} 项目节点定义 + ${engineEvents.length} UE 事件/覆写 · ${Object.keys(data.classes || {}).length} 类 · ${builtins.length} UE 节点`;
    let restored = false;
    workspace.load();
    if (workspace.adopted)
      toast(`找回了 ${workspace.adopted} 张没有出现在工作区列表里的卡牌`);
    // Try the active card first, then the others; a card that cannot be read is never overwritten.
    const unreadable = [];
    for (const id of [workspace.active(), ...workspace.ids()].filter((x, i, a) => x && a.indexOf(x) === i)) {
      try {
        const raw = workspace.read(id);
        setTypeHierarchy({ ...classes, ...raw?.types });
        project = validateProject(raw);
        restored = true;
        break;
      } catch (error) {
        unreadable.push(`${id.slice(0, 8)}：${error.message}`);
      }
    }
    if (unreadable.length)
      toast(
        restored
          ? `有 ${unreadable.length} 张卡牌无法读取，已保留原数据（设置里可导出备份）。`
          : "本地卡牌无法读取，已新建空白项目；原数据没有被删除，可在设置里导出备份。",
        true,
      );
    if (!project) {
      project = makeProject();
      project.name = workspace.uniqueName(project.name);
    }
    project.types = { ...classes, ...project.types };
    setTypeHierarchy(project.types);
    renderLibrary();
    render();
    if (!restored) requestAnimationFrame(fit);
    persist();
    window.__kardsBooted = true;
    setTimeout(checkForUpdate, 1500);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && checkForUpdate());
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    setInterval(() => document.visibilityState === "visible" && checkForUpdate(), UPDATE_CHECK_EVERY);
  } catch (e) {
    $("source-status").textContent = "节点库载入失败";
    openModal(
      "无法加载节点库",
      `<p>${esc(e.message)}。请刷新页面，或检查 catalog.json 是否和站点一起发布。</p><button class="primary-button" onclick="location.reload()">重新加载</button>`,
    );
  }
}
$("modal").addEventListener("close", () => {
  pickerContext = null;
  pending = null;
  if (project) {
    renderNodes();
    drawEdges();
    updateSelectionStatus();
  }
});
$("new-project").innerHTML = bi("新建", "New");
$("import").innerHTML = bi("导入", "Import");
$("export").innerHTML = `<span>↗</span>${bi("导出", "Export")}`;
$("add-node").innerHTML = `＋ ${bi("节点", "Node")}`;
$("validate").innerHTML = bi("检查", "Check");
$("lang-select").value = langMode;
setUiLanguage(langMode);
$("lang-select").onchange = (e) => {
  langMode = e.target.value;
  document.documentElement.dataset.lang = langMode;
  try {
    localStorage.setItem(LANG_KEY, langMode);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
  renderLibrary();
  render();
  setUiLanguage(langMode);
};
boot().then(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("paste") === "reference" && window.__kardsBooted) {
    params.delete("paste"); window.history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
    pasteNodes("");
  }
});
