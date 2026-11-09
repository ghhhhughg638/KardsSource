import { saveReferenceDraft, readReferenceDraft, staleReferenceDrafts, removeReferenceDraft } from "./reference-drafts.js";
import { CLIP_KEY, CLIP_TAG, nodeClip } from "./node-clipboard.js";
import { pinColor, nodeAppearance, dynamicPinSpec, canRemoveDynamicPin, addDynamicPin, removeDynamicPin, applyUEPalette } from "./ue-node-features.js";
import { buildReferenceProject } from "./reference-graph.js";
import { createWorkspace } from "./workspace.js";
import { validateProject, setEnumTable, setTypeHierarchy, resolveWildcards, pinKind } from "./model.js";
import { nodeChinese, nodeEnglish, nodeKind, kindLabels, translate } from "./i18n.js";
import { nodeIcon, nodeTier, pinEnglish } from "./node-look.js";

applyUEPalette(document.documentElement);
document.documentElement.dataset.lang = "both";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const factions = { Britain: "英国", Germany: "德国", Soviet: "苏联", Japan: "日本", USA: "美国", France: "法国", Finland: "芬兰", Italy: "意大利", Poland: "波兰", Neutral: "中立", Anzac: "澳新", ANZAC: "澳新", NotAvailable: "其他" };
let library, card, project, page = 0, request = 0, view = { x: 30, y: 30, zoom: 0.8 }, draftUnsaved = false, activeMode = "expanded";
const narrow = matchMedia("(max-width: 1024px)");
function showPanel(panel) {
  document.querySelector(".ref-layout").dataset.panel = panel;
  if (panel === "graph") requestAnimationFrame(() => { if (graph()) { renderGraph(!viewReady); viewReady = true; } });
}
let viewReady = false, focusedNode;
let refSelection = new Set(), multiSelecting = false;
function paintSelection() {
  for (const el of $("ref-nodes").children) el.classList.toggle("selected", refSelection.has(el.dataset.refNode));
  $("ref-copy-selected").disabled = !refSelection.size;
  $("ref-paste-editor").disabled = !refSelection.size;
  $("ref-copy-selected").textContent = `复制节点 (${refSelection.size})`;
}
$("ref-select-all").onclick = () => { refSelection = new Set(graph()?.nodes.filter((n) => !n.definition.fixed).map((n) => n.id)); paintSelection(); $("ref-viewport").focus(); };
$("ref-multi").onclick = () => { multiSelecting = !multiSelecting; $("ref-multi").setAttribute("aria-pressed", String(multiSelecting)); };
$("ref-browse").onclick = () => showPanel("library");
$("ref-close-library").onclick = () => showPanel("graph");
$("ref-close-details").onclick = () => { document.querySelector(".ref-layout").dataset.panel = "graph"; };
$("ref-more").onclick = () => {
  const open = $("ref-more").getAttribute("aria-expanded") !== "true";
  $("ref-more").setAttribute("aria-expanded", String(open));
  $("ref-actions").classList.toggle("open", open);
};
function closeTools() { $("ref-actions").classList.remove("open"); $("ref-more").setAttribute("aria-expanded", "false"); }
$("ref-viewport").addEventListener("pointerdown", closeTools);
$("ref-info").onclick = () => {
  $("ref-info-content").replaceChildren($("ref-summary").cloneNode(true));
  $("ref-info-content").firstChild.removeAttribute("id");
  for (const [title, content] of [["类默认值与资源", $("ref-defaults").textContent], ["源指令", $("ref-instructions").textContent]]) {
    const d = document.createElement("details"), heading = document.createElement("summary"), pre = document.createElement("pre");
    heading.textContent = title; pre.textContent = content; d.append(heading, pre); $("ref-info-content").append(d);
  }
  closeTools(); $("ref-info-dialog").showModal();
};
$("ref-mode").onchange = () => {
  if (!card) { activeMode=$("ref-mode").value; return; }
  if (draftUnsaved && !confirm("当前参考副本尚未保存。切换前请先导出；仍要放弃未保存的修改吗？")) { $("ref-mode").value=activeMode; return; }
  draftUnsaved=false;activeMode=$("ref-mode").value;
  const previous = project.activeGraph;
  project = buildReferenceProject(card, library, { expanded: $("ref-mode").value === "expanded" });
  const draftMessage=restoreDraft();setEnumTable(library.enums);setTypeHierarchy(project.types);
  if (project.graphs.some((g) => g.id === previous)) project.activeGraph = previous;
  closeTools(); renderGraph(); if(draftMessage)status(draftMessage,draftBlocked);
};
const pageSize = 40;
const cache = new Map();
const graph = () => project?.graphs.find((g) => g.id === project.activeGraph);
const status = (message, error = false) => { $("ref-status").textContent = message; $("ref-status").classList.toggle("error", error); };
const snapshot = (key) => {
  const url = new URL(key, import.meta.url), build = new URL(import.meta.url).searchParams.get("v");
  if (build) url.searchParams.set("v", build);
  return url.href;
};

let draftBlocked = false, staleKeys = [], findMatches = [], findIndex = -1, referenceMarquee = null;
function sourceHash() { return card?.provenance?.sha256 || ""; }
function saveDraft() {
  if (!card || !project) return false;
  if (draftBlocked) { draftUnsaved=true;status("参考副本未保存：旧副本无法读取。请先导出当前参考蓝图。",true);return false; }
  try { saveReferenceDraft(localStorage,card.id,$("ref-mode").value,sourceHash(),project); draftUnsaved=false;return true; }
  catch { draftUnsaved=true;status("参考副本未保存：浏览器存储空间不足。请用“导出参考蓝图”备份当前内容。",true); return false; }
}
function restoreDraft() {
  draftBlocked=false;draftUnsaved=false;staleKeys=[];$("ref-export-draft").hidden=true;$("ref-draft-history").hidden=true;
  try {
    staleKeys=staleReferenceDrafts(localStorage,card.id,$("ref-mode").value,sourceHash());
    $("ref-export-draft").hidden=!staleKeys.length;
    $("ref-draft-history").hidden=!staleKeys.length;
    $("ref-draft-history").innerHTML=staleKeys.map((key,i)=>`<option value="${esc(key)}">旧副本 ${i+1} · ${esc(key.split(".").at(-1).slice(0,12))}</option>`).join("");
    const draft=readReferenceDraft(localStorage,card.id,$("ref-mode").value,sourceHash());
    if (draft) { const restored=validateProject(structuredClone(draft.project)); project=restored; return "已恢复本地参考副本"; }
    return staleKeys.length?"原版数据已更新，旧参考副本已保留；可导出旧副本。":"";
  } catch {
    draftBlocked=true;$("ref-export-draft").hidden=false;$("ref-draft-history").hidden=false;
    const current=`kards-blueprint-studio.reference-draft.${card.id}.${$("ref-mode").value}.${sourceHash()}`;
    const options=[current,...staleKeys];$("ref-draft-history").innerHTML=options.map((key,i)=>`<option value="${esc(key)}">${i===0?"无法读取的当前副本":`旧副本 ${i}`} · ${esc(key.split(".").at(-1).slice(0,12))}</option>`).join("");
    return "参考副本无法读取，已保留原数据；请导出旧副本。";
  }
}
function exportDraft() {
  try {
    const key=$("ref-draft-history").value || staleKeys.at(-1) || `kards-blueprint-studio.reference-draft.${card.id}.${$("ref-mode").value}.${sourceHash()}`;
    const raw=localStorage.getItem(key); if(!raw) throw new Error("没有可导出的副本");
    let data=raw; try { const value=JSON.parse(raw); if(value.project) data=JSON.stringify(value.project,null,2); } catch { /* export unreadable bytes for recovery */ }
    const url=URL.createObjectURL(new Blob([data],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`${card.name}-reference-backup.kardsbp.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch(e) {status(`无法导出参考副本：${e.message}`,true);}
}
$("ref-export-draft").onclick=exportDraft;
$("ref-reset-draft").onclick=()=>{
  if(!card || !confirm("恢复当前卡牌的原版参考图？本地参考副本会被删除，工作区不受影响。"))return;
  try {removeReferenceDraft(localStorage,card.id,$("ref-mode").value,sourceHash());draftBlocked=false;draftUnsaved=false;project=buildReferenceProject(card,library,{expanded:$("ref-mode").value==="expanded"});refSelection.clear();renderGraph();status("已恢复原版参考图，其他来源版本的旧副本仍然保留。");}catch(e){status(`恢复失败：${e.message}`,true);}
};
function findReference(step=0) {
  const q=$("ref-find").value.trim().toLowerCase();
  findMatches=q?graph().nodes.filter(n=>`${nodeChinese(n.definition)} ${nodeEnglish(n.definition)} ${n.definition.signature||""} ${n.comment||""}`.toLowerCase().includes(q)):[];
  if(!findMatches.length){findIndex=-1;$("ref-find-count").textContent=q?"0 / 0":"";return;}
  findIndex=step===0?0:(findIndex+step+findMatches.length)%findMatches.length;
  const n=findMatches[findIndex];$("ref-find-count").textContent=`${findIndex+1} / ${findMatches.length}`;refSelection=new Set([n.id]);paintSelection();focusNode(n.id);
}
$("ref-find").oninput=()=>findReference(0);$("ref-find-prev").onclick=()=>findReference(-1);$("ref-find-next").onclick=()=>findReference(1);
$("ref-find").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();findReference(e.shiftKey?-1:1);}};
const searchText = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/<[^>]*>/g, "").replace(/[\s\p{P}]+/gu, "");
const plainText = (s) => String(s ?? "").replace(/<[^>]*>/g, "");
function filteredCards() {
  const terms = $("ref-search").value.trim().split(/\s+/).map(searchText).filter(Boolean), faction = $("ref-faction").value, type = $("ref-type").value;
  return library.cards.filter((c) => (!faction || c.faction === faction) && (!type || c.type === type) && (!$("ref-with-logic").checked || !c.dataOnly) && terms.every((term) => c.searchIndex.includes(term)));

}
function renderList() {
  const cards = filteredCards(); page = Math.min(page, Math.max(0, Math.ceil(cards.length / pageSize) - 1));
  $("ref-result-count").textContent = `${cards.length} 个匹配 / ${library.cards.length} 个蓝图`;
  $("ref-page").textContent = `${page + 1} / ${Math.max(1, Math.ceil(cards.length / pageSize))}`;
  $("ref-prev").disabled = page === 0; $("ref-next").disabled = (page + 1) * pageSize >= cards.length;
  $("ref-cards").innerHTML = cards.slice(page * pageSize, (page + 1) * pageSize).map((c) => `<button type="button" class="ref-card ${c.id === card?.id ? "active" : ""}" data-card="${esc(c.id)}"><strong>${esc(c.zh.title || c.title)}</strong>${c.zh.title && c.zh.title !== c.title ? `<span class="ref-card-english">${esc(c.title)}</span>` : ""}<small>${esc(c.name)}</small>${c.zh.text || c.text ? `<span class="ref-card-effect">${esc(plainText(c.zh.text || c.text))}</span>` : ""}<span class="ref-card-tags">${esc(factions[c.faction] || c.faction)} · ${esc(c.type)} · ${c.cost} 费 · ${c.dataOnly ? "仅默认数据" : `${c.functionCount} 函数`}${Object.values(c.zh.origins || {}).includes("reference") ? " · 参考译文" : ""}</span></button>`).join("") || '<p class="ref-muted">没有匹配的卡牌，可试试“总部 伤害”等效果关键词。</p>';
  $("ref-cards").querySelectorAll("[data-card]").forEach((b) => b.addEventListener("click", async () => { await openCard(b.dataset.card); if (narrow.matches) showPanel("graph"); }));
}
async function openCard(id, graphName) {
  if (card && id!==card.id && draftUnsaved && !confirm("当前参考副本尚未保存。切换前请先导出；仍要放弃未保存的修改吗？")) return;
  const ticket = ++request;
  status("正在读取蓝图…");
  try {
    let payload = cache.get(id);
    if (!payload) {
      const response = await fetch(snapshot(`./reference-data/cards/${id}.json`));
      if (!response.ok) throw new Error(`蓝图文件加载失败 (${response.status})`);
      payload = await response.json(); cache.set(id, payload);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
    }
    if (ticket !== request) return;
    draftUnsaved=false;
    card = { ...payload, translation: library.cards.find((c) => c.id === id)?.zh || {} }; document.querySelector(".ref-heading strong").textContent = card.translation.title || card.card.title; $("ref-crumb").textContent = card.translation.title || card.card.title; project = buildReferenceProject(card, library, { expanded: $("ref-mode").value === "expanded" });
    setEnumTable(library.enums); setTypeHierarchy(project.types);
    const draftMessage=restoreDraft();setEnumTable(library.enums);setTypeHierarchy(project.types);
    if (graphName) project.activeGraph = project.graphs.find((g) => g.id === graphName || g.sourceName === graphName)?.id || project.activeGraph;
    $("ref-summary").innerHTML = `<h2>${esc(card.translation.title || card.card.title)}</h2>${card.translation.title && card.translation.title !== card.card.title ? `<p class="ref-original-text">${esc(card.card.title)}</p>` : ""}<div class="ref-package">${esc(card.name)} · ${esc(card.package)}</div><div class="ref-badges"><span class="ref-badge">${esc(factions[card.card.faction] || card.card.faction)}</span><span class="ref-badge">${esc(card.card.type)} · ${esc(card.card.rarity)}</span><span class="ref-badge">${card.card.cost} 费 · ${card.card.operationCost} 行动 · ${card.card.attack}/${card.card.defense}</span><span class="ref-badge">${card.functions.length} 函数</span></div><p>${esc(plainText(card.translation.text || card.card.text))}</p>${card.translation.text && card.translation.text !== card.card.text ? `<p class="ref-original-text">英文原文：${esc(card.card.text)}</p>` : ""}${Object.values(card.translation.origins || {}).includes("reference") ? '<p class="ref-translation-note">包含参考译文：解包未提供对应中文时补译，英文原文保留。</p>' : ""}`;
    $("ref-defaults").textContent = JSON.stringify({ package: card.package, parent: card.parent, defaults: card.defaults, provenance: card.provenance }, null, 2);
    $("ref-graph").innerHTML = project.graphs.map((g) => `<option value="${esc(g.id)}" ${g.id === project.activeGraph ? "selected" : ""}>${esc(g.sourceName || g.name)}${g.pure ? " · Pure" : ""}</option>`).join("");
    for (const id of ["ref-graph", "ref-copy", "ref-export"]) $(id).disabled = false;
    viewReady = false; renderList(); renderGraph();
    if($("ref-find").value.trim())requestAnimationFrame(()=>findReference(0));
    status(`${draftMessage ? draftMessage + " · " : ""}${card.functions.reduce((s, f) => s + f.body.length, 0)} 条源指令已保留 · 自动布局 · ${$("ref-mode").value === "expanded" ? "完整展开逻辑" : "精简参考"}${project.reference.diagnostics.length ? ` · ${project.reference.diagnostics.length} 个待检查控制流` : ""}`);
  } catch (e) { if (ticket === request) status(e.message, true); }
}
function pinControl(n, p) {
  if (p.direction !== "in" || p.type === "exec") return "";
  if (graph().edges.some((e) => e.to.node === n.id && e.to.pin === p.id)) return "";
  if (n.folded?.[p.id]) return `<span class="pin-value ref-folded" title="${esc(n.folded[p.id].text)}">ƒ ${esc(n.folded[p.id].text)}</span>`;
  const value = n.values?.[p.id] ?? "", attrs = `data-node-value="${esc(n.id)}" data-pin-value="${esc(p.id)}"`;
  if (library.enums[p.type]) {
    const vs = [...new Set([...library.enums[p.type], String(value)].filter(Boolean))];
    return `<select class="pin-input" ${attrs} aria-label="${esc(`${n.definition.name} ${p.name} ${p.type}`)}">${vs.map((v) => `<option value="${esc(v)}" ${v === String(value) ? "selected" : ""}>${esc(library.enumLabels?.[p.type]?.[v] || v)}</option>`).join("")}</select>`;
  }
  if (value === "") return "";
  if (typeof value === "boolean") return `<input type="checkbox" class="pin-checkbox" ${attrs} ${value ? "checked" : ""} aria-label="${esc(p.name)} 默认布尔值">`;
  return `<input class="pin-input ${typeof value === "number" ? "pin-number" : ""}" ${attrs} aria-label="${esc(p.name)}" value="${esc(value)}" type="${typeof value === "number" ? "number" : "text"}" />`;
}
// Same node markup and classes as the editor (app.js renderNodes), so both look identical.
function pinButton(g, n, p) {
  const connected = g.edges.some((e) => (e.to.node === n.id && e.to.pin === p.id) || (e.from.node === n.id && e.from.pin === p.id));
  return `<button type="button" tabindex="-1" aria-hidden="true" class="pin ${p.type === "exec" ? "exec" : ""} ${pinKind(p.type) === "array" ? "array" : ""} ${connected ? "connected" : ""}" style="--pin-color:${pinColor(p.type, library.enums)}" data-pin-dot="${esc(p.id)}" title="${esc(p.name)} · ${esc(p.type)} · ${p.direction === "in" ? "输入" : "输出"}"></button>`;
}
function pinRow(g, n, p, look) {
  const cn = translate(p.name), raw = pinEnglish(p);
  const label = look.compact && p.direction === "out" ? "" : cn === raw ? `<span class="pin-label"><span>${esc(raw)}</span></span>` : `<span class="pin-label"><span class="pin-cn zh">${esc(cn)}</span><span class="pin-en en">${esc(raw)}</span></span>`;
  const remove = canRemoveDynamicPin(n.definition, p.id) ? `<button type="button" class="remove-user-pin" data-ref-remove-pin="${esc(p.id)}" data-pin-owner="${esc(n.id)}" aria-label="删除 ${esc(p.name)} 引脚">×</button>` : "";
  const linked = g.edges.some((e) => e.to.node === n.id && e.to.pin === p.id);
  const control = p.direction === "in" && !linked ? pinControl(n, p) : "";
  return `<div class="pin-row ${p.direction === "out" ? "output" : ""}" data-ref-pin="${esc(p.id)}">${p.direction === "in" ? pinButton(g, n, p) : ""}${label}${control}${p.direction === "out" ? pinButton(g, n, p) : ""}${remove}</div>`;
}
function nodeHtml(n, g) {
  const d = n.definition, look = nodeAppearance(d, library.enums), kind = nodeKind(d);
  const linkedIn = (p) => g.edges.some((e) => e.to.node === n.id && e.to.pin === p.id);
  const shown = d.pins.filter((p) => n.showAdvanced || !d.advancedPins?.includes(p.id) || linkedIn(p));
  const ins = shown.filter((p) => p.direction === "in"), outs = shown.filter((p) => p.direction === "out");
  const rows = Array.from({ length: Math.max(ins.length, outs.length) }, (_, i) => `<div class="pin-pair">${ins[i] ? pinRow(g, n, ins[i], look) : '<div class="pin-row"></div>'}${outs[i] ? pinRow(g, n, outs[i], look) : '<div class="pin-row output"></div>'}</div>`).join("");
  const advanced = $("ref-mode").value === "compact" && d.advancedPins?.length ? `<button class="pin-input advanced-toggle ref-advanced" data-advanced-node="${esc(n.id)}">${n.showAdvanced ? "收起参数" : `更多参数 (${d.advancedPins.length})`} ▾</button>` : "";
  const add = dynamicPinSpec(d) ? `<button type="button" class="add-user-pin" data-ref-add-pin="${esc(n.id)}" title="添加引脚／分支">${look.slim ? "＋" : "＋ 添加引脚／分支"}</button>` : "";
  const owner = (d.class || "UE").replace(/^[UA](?=[A-Z][a-z])/, "");
  return `<article class="node ref-node ue-${kind} ${look.compact ? "ue-compact" : ""} ${look.slim ? "ue-slim" : ""} tier-${nodeTier(d)} ${refSelection.has(n.id) ? "selected" : ""}" style="--node-color:${look.color};left:${n.x}px;top:${n.y}px" data-ref-node="${esc(n.id)}"><div class="node-head" title="${esc(kindLabels[kind] || "FUNCTION")} · ${esc(owner)}"><div class="node-heading"><span>${nodeIcon(d)}</span><strong>${esc(look.compact ? look.title : nodeChinese(d))}</strong></div><div class="node-subtitle">${esc(nodeEnglish(d))}</div></div><div class="node-kind-label">${esc(kindLabels[kind] || "FUNCTION")}<span>${esc(owner)}</span></div><div class="node-body">${rows}${advanced}${add}</div><div class="ref-node-note">${d.reference ? `${esc(d.reference.function)} · @${d.reference.sourceOffset}` : "Function signature"}</div></article>`;
}
function renderGraph(refit = true) {
  const g = graph(); if (!g) return;
  history.replaceState(null, "", `#${card.id}~${encodeURIComponent(g.id)}`);
  $("ref-empty").hidden = !!g.nodes.length;
  $("ref-empty").textContent = "此图没有可执行效果节点。可查看类默认值或切换其他函数。";
  $("ref-nodes").innerHTML = g.nodes.map((n) => nodeHtml(n, g)).join("");
  // Size columns using real content height; busy native functions must not overlap.
  const columns = new Map();
  refSelection = new Set([...refSelection].filter((id) => g.nodes.some((n) => n.id === id)));
  // Space the columns by the real node widths so wide nodes never run into their neighbours.
  if (!g.referenceManualLayout) {
    const widthOf = new Map([...$("ref-nodes").children].map((e) => [e.dataset.refNode, e.offsetWidth]));
    const xs = [...new Set(g.nodes.map((n) => n.x))].sort((a, b) => a - b), next = new Map();
    let cursor = 50;
    for (const x of xs) {
      next.set(x, cursor);
      cursor += Math.max(0, ...g.nodes.filter((n) => n.x === x).map((n) => widthOf.get(n.id) || 244)) + 120;
    }
    for (const n of g.nodes) {
      n.x = next.get(n.x);
      const el = [...$("ref-nodes").children].find((e) => e.dataset.refNode === n.id);
      if (el) el.style.left = `${n.x}px`;
    }
  }
  for (const n of g.nodes) {
    const ys = columns.get(n.x) || 60;
    const el = [...$("ref-nodes").children].find((e) => e.dataset.refNode === n.id);
    if (!g.referenceManualLayout) n.y = ys;
    el.style.top = `${n.y}px`; columns.set(n.x, ys + el.offsetHeight + 65);
    el.addEventListener("click", (e) => {
      if (e.target.closest("input,select,button")) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || multiSelecting) { if (refSelection.has(n.id)) refSelection.delete(n.id); else refSelection.add(n.id); }
      else refSelection = new Set([n.id]);
      inspect(n);
    });
  }
  $("ref-nodes").querySelectorAll("[data-advanced-node]").forEach((b) => b.addEventListener("click", () => { const n = g.nodes.find((n) => n.id === b.dataset.advancedNode); n.showAdvanced = !n.showAdvanced; renderGraph(false); }));
  $("ref-nodes").querySelectorAll("[data-node-value]").forEach((el) => el.addEventListener("change", () => {
    const n = g.nodes.find((n) => n.id === el.dataset.nodeValue), p = n.definition.pins.find((p) => p.id === el.dataset.pinValue), current = n.values[p.id];
    n.values[p.id] = typeof current === "boolean" ? el.checked : typeof current === "number" ? Number(el.value) : el.value;
    if(saveDraft()) status("已调整参考选项，已保存本地参考副本；原版参考数据未被覆盖。");
  }));
  const source = g.kind === "event" ? card.functions.filter((f) => f.name.startsWith("ExecuteUbergraph_") || f.event) : card.functions.filter((f) => f.name === g.sourceName);
  $("ref-instructions").textContent = JSON.stringify(source, null, 2);
  $("ref-instruction-count").textContent = ` · ${source.reduce((s, f) => s + f.body.length, 0)} 条`;
  $("ref-locate").innerHTML = '<option value="">定位节点…</option>' + g.nodes.map((n) => `<option value="${esc(n.id)}">${esc(nodeChinese(n.definition))} · ${esc(n.definition.name)}</option>`).join("");
  for (const row of $("ref-nodes").querySelectorAll("[data-ref-pin]")) {
    const nodeId = row.closest("[data-ref-node]").dataset.refNode, port = row.dataset.refPin;
    const edge = g.edges.find((e) => e.from.node === nodeId && e.from.pin === port || e.to.node === nodeId && e.to.pin === port);
    if (!edge) continue;
    const target = edge.from.node === nodeId ? edge.to.node : edge.from.node;
    row.classList.add("ref-connected"); row.title = "点击沿连线定位节点";
    row.addEventListener("click", (e) => { if (!e.target.closest("input,select,button")) { e.stopPropagation(); focusNode(target); } });
  }
  paintSelection();
  requestAnimationFrame(() => { if (refit) focusNode(); else transform(); drawWires(); });
}
$("ref-nodes").addEventListener("click", (e) => {
  const add = e.target.closest("[data-ref-add-pin]"), remove = e.target.closest("[data-ref-remove-pin]");
  if (!add && !remove) return;
  const n = graph().nodes.find((n) => n.id === (add?.dataset.refAddPin || remove.dataset.pinOwner));
  if (!n) return;
  if (add) addDynamicPin(graph(), n, library.enums); else removeDynamicPin(graph(), n, remove.dataset.refRemovePin);
  resolveWildcards(graph()); renderGraph(false);
  if(saveDraft()) status("已修改并保存本地参考副本的引脚；原版源数据未覆盖。");
});
function focusNode(id = focusedNode) {
  const g = graph(); if (!g) return;
  const n = g.nodes.find((n) => n.id === id) || g.nodes.find((n) => n.definition.event || n.definition.bp?.type === "entry") || g.nodes[0];
  if (!n || !$("ref-viewport").clientWidth) return;
  focusedNode = n.id; viewReady = true;
  const viewport = $("ref-viewport");
  const width = [...$("ref-nodes").children].find((e) => e.dataset.refNode === n.id)?.offsetWidth || 244;
  view = { x: Math.max(12, (viewport.clientWidth - width * .95) / 2) - n.x * .95, y: 28 - n.y * .95, zoom: .95 };
  transform(); $("ref-locate").value = n.id;
}
$("ref-locate").onchange = () => focusNode($("ref-locate").value);
$("ref-readable").onclick = () => focusNode();
function inspect(n) {
  focusedNode = n.id;
  if (narrow.matches && !multiSelecting) document.querySelector(".ref-layout").dataset.panel = "details";
  paintSelection();
  $("ref-details").innerHTML = `<h3>${esc(n.definition.name)}</h3><p class="ref-muted">${esc(n.definition.signature || "")}</p>${n.definition.reference?.signatureEvidence ? '<p class="ref-muted">参数类型来自源调用反射；缺少原始参数名的输入按 Arg0、Arg1 标记。</p>' : ""}${n.definition.pins.filter((p) => p.type !== "exec").map((p) => `<div class="ref-detail-pin"><strong>${esc(p.name)} · ${esc(p.type)}</strong><code>${esc(n.folded?.[p.id]?.text ?? n.values[p.id] ?? p.direction)}</code></div>`).join("")}<details><summary>源位置与表达式</summary><pre>${esc(JSON.stringify({ source: n.definition.reference, folded: n.folded }, null, 2))}</pre></details>`;
}
function transform() {
  $("ref-stage").style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`;
  const z = view.zoom, grid = $("ref-viewport").style;
  grid.backgroundSize = `${16 * z}px ${16 * z}px, ${16 * z}px ${16 * z}px, ${128 * z}px ${128 * z}px, ${128 * z}px ${128 * z}px`;
  grid.backgroundPosition = `${view.x}px ${view.y}px`;
  $("ref-zoom").textContent = `${Math.round(view.zoom * 100)}%`;
}
function fit() {
  if (!$("ref-viewport").clientWidth || !$("ref-viewport").clientHeight) return;
  viewReady = true;
  const nodes = graph()?.nodes || []; if (!nodes.length) { view = { x: 30, y: 30, zoom: 1 }; transform(); return; }
  const bounds = $("ref-viewport").getBoundingClientRect();
  const widthOf = new Map([...$("ref-nodes").children].map((e) => [e.dataset.refNode, e.offsetWidth])), right = Math.max(...nodes.map((n) => n.x + (widthOf.get(n.id) || 244))), bottom = Math.max(...[...$("ref-nodes").children].map((e) => parseFloat(e.style.top) + e.offsetHeight));
  const left = Math.min(...nodes.map((n) => n.x)), top = Math.min(...nodes.map((n) => n.y));
  const zoom = Math.max(0.035, Math.min(1, (bounds.width - 40) / Math.max(1, right - left), (bounds.height - 50) / Math.max(1, bottom - top)));
  view = { x: 20 - left * zoom, y: 25 - top * zoom, zoom }; transform();
}
// Pin positions are measured once per render (relative to their node), so dragging a node only has to
// re-route the wires that touch it instead of re-measuring every pin of every node.
let pinOffsets = new Map(), edgesByNode = new Map();
function wirePath(g, e, nodes) {
  const na = nodes.get(e.from.node), nb = nodes.get(e.to.node);
  const oa = pinOffsets.get(`${e.from.node}\u0000${e.from.pin}`), ob = pinOffsets.get(`${e.to.node}\u0000${e.to.pin}`);
  if (!na || !nb || !oa || !ob) return "";
  const ax = na.x + oa.x, ay = na.y + oa.y, bx = nb.x + ob.x, by = nb.y + ob.y;
  const dx = Math.max(65, Math.abs(bx - ax) * 0.5);
  return `M${ax} ${ay} C${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`;
}
function drawWires() {
  const g = graph(); if (!g) return;
  const stage = $("ref-stage").getBoundingClientRect(), nodes = new Map(g.nodes.map((n) => [n.id, n]));
  pinOffsets = new Map();
  for (const el of $("ref-nodes").children) {
    const n = nodes.get(el.dataset.refNode); if (!n) continue;
    for (const row of el.querySelectorAll("[data-ref-pin]")) {
      const dot = row.querySelector(".pin"); if (!dot) continue;
      const r = dot.getBoundingClientRect();
      pinOffsets.set(`${el.dataset.refNode}\u0000${row.dataset.refPin}`, { x: (r.x + r.width / 2 - stage.x) / view.zoom - n.x, y: (r.y + r.height / 2 - stage.y) / view.zoom - n.y });
    }
  }
  const typeOf = new Map(g.nodes.map((n) => [n.id, new Map(n.definition.pins.map((p) => [p.id, p.type]))]));
  edgesByNode = new Map();
  $("ref-wires").innerHTML = g.edges.map((e, i) => {
    for (const id of [e.from.node, e.to.node]) (edgesByNode.get(id) || edgesByNode.set(id, []).get(id)).push(i);
    const d = wirePath(g, e, nodes); if (!d) return `<path data-i="${i}" d=""/>`;
    const type = typeOf.get(e.from.node)?.get(e.from.pin);
    return `<path data-i="${i}" style="stroke:${pinColor(type, library.enums)}" class="edge ref-wire ${type !== "exec" ? "data" : ""}" d="${d}" />`;
  }).join("");
}
function updateWires(ids) {
  const g = graph(); if (!g) return;
  const nodes = new Map(g.nodes.map((n) => [n.id, n])), paths = $("ref-wires").children, done = new Set();
  for (const id of ids) for (const i of edgesByNode.get(id) || []) {
    if (done.has(i)) continue; done.add(i);
    paths[i]?.setAttribute("d", wirePath(g, g.edges[i], nodes));
  }
}
function zoom(delta, point) {
  const old = view.zoom, next = Math.max(0.035, Math.min(2, old * delta));
  const p = point || { x: $("ref-viewport").clientWidth / 2, y: $("ref-viewport").clientHeight / 2 };
  view.x = p.x - (p.x - view.x) * next / old; view.y = p.y - (p.y - view.y) * next / old; view.zoom = next; transform();
}
$("ref-viewport").addEventListener("wheel", (e) => { if (e.target.closest("select,input") && e.target === document.activeElement) return; e.preventDefault(); const r = $("ref-viewport").getBoundingClientRect(); zoom(e.deltaY > 0 ? 0.9 : 1.1, { x: e.clientX - r.left, y: e.clientY - r.top }); }, { passive: false });
const pointers = new Map();
let gesture, nodeDrag, moved = false, suppressClickUntil = 0;
function resetGesture() {
  const ps = [...pointers.values()], r = $("ref-viewport").getBoundingClientRect();
  if (!ps.length) { gesture = null; return; }
  const center = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
  gesture = { x: center.x - r.left, y: center.y - r.top, vx: view.x, vy: view.y, zoom: view.zoom, distance: ps.length > 1 ? Math.max(1, Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)) : 0 };
}
let singleOnControl = false;
$("ref-viewport").addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const onControl = !!e.target.closest("input,select,button:not(.pin),a");
  if (onControl && e.pointerType === "mouse") return;
  if (!onControl) $("ref-viewport").focus({ preventScroll: true });
  if (!pointers.size) { moved = false; singleOnControl = onControl; }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const el = e.target.closest("[data-ref-node]");
  // A second finger always joins the gesture, even when it lands on a node's input or button, so a
  // pinch that touches a node still zooms instead of being swallowed by the control under it.
  if (pointers.size > 1) { nodeDrag = null; referenceMarquee=null; $("ref-marquee").hidden=true; singleOnControl = false; }
  else if (!onControl && !el && (e.shiftKey || (multiSelecting && e.pointerType === "touch"))) { referenceMarquee={x:e.clientX,y:e.clientY,base:new Set(refSelection)};nodeDrag=null; }
  else if (onControl) nodeDrag = null;
  else if (el) {
    const id = el.dataset.refNode, ids = refSelection.has(id) ? new Set(refSelection) : e.ctrlKey || e.metaKey || e.shiftKey || multiSelecting ? new Set([...refSelection, id]) : new Set([id]);
    const els = new Map([...$("ref-nodes").children].map((c) => [c.dataset.refNode, c]));
    nodeDrag = { x: e.clientX, y: e.clientY, ids, els, positions: graph().nodes.filter((n) => ids.has(n.id)).map((n) => ({ n, x: n.x, y: n.y, el: els.get(n.id) })), frame: 0, dx: 0, dy: 0 };
  } else { nodeDrag = null; if (!e.shiftKey) { refSelection.clear(); paintSelection(); } }
  resetGesture();
});
$("ref-viewport").addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (singleOnControl && pointers.size === 1) return;
  if(referenceMarquee && pointers.size===1){
    const r=$("ref-viewport").getBoundingClientRect(),box={l:Math.min(referenceMarquee.x,e.clientX),r:Math.max(referenceMarquee.x,e.clientX),t:Math.min(referenceMarquee.y,e.clientY),b:Math.max(referenceMarquee.y,e.clientY)};
    if(Math.hypot(e.clientX-referenceMarquee.x,e.clientY-referenceMarquee.y)<5)return;
    moved=true;$("ref-viewport").setPointerCapture(e.pointerId);const el=$("ref-marquee");el.hidden=false;Object.assign(el.style,{left:`${box.l-r.left}px`,top:`${box.t-r.top}px`,width:`${box.r-box.l}px`,height:`${box.b-box.t}px`});
    refSelection=new Set(referenceMarquee.base);for(const node of $("ref-nodes").children){const b=node.getBoundingClientRect();if(b.right>=box.l&&b.left<=box.r&&b.bottom>=box.t&&b.top<=box.b)refSelection.add(node.dataset.refNode);}paintSelection();return;
  }
  if (nodeDrag && pointers.size === 1) {
    const dx = e.clientX - nodeDrag.x, dy = e.clientY - nodeDrag.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { refSelection = new Set(nodeDrag.ids); paintSelection(); $("ref-viewport").setPointerCapture(e.pointerId); graph().referenceManualLayout = true; }
    moved = true; suppressClickUntil = Date.now() + 400;
    nodeDrag.dx = dx; nodeDrag.dy = dy;
    if (!nodeDrag.frame) nodeDrag.frame = requestAnimationFrame(applyNodeDrag);
    return;
  }
  const ps = [...pointers.values()], r = $("ref-viewport").getBoundingClientRect();
  const center = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
  const x = center.x - r.left, y = center.y - r.top;
  if (!moved && ps.length === 1 && Math.hypot(x - gesture.x, y - gesture.y) < 5) return;
  moved = true; suppressClickUntil = Date.now() + 400;
  $("ref-viewport").setPointerCapture(e.pointerId);
  const next = ps.length > 1 ? Math.max(0.035, Math.min(2, gesture.zoom * Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / gesture.distance)) : gesture.zoom;
  view.x = x - (gesture.x - gesture.vx) * next / gesture.zoom;
  view.y = y - (gesture.y - gesture.vy) * next / gesture.zoom;
  view.zoom = next; transform();
});
function applyNodeDrag() {
  const drag = nodeDrag; if (!drag) return;
  drag.frame = 0;
  for (const item of drag.positions) {
    item.n.x = item.x + drag.dx / view.zoom; item.n.y = item.y + drag.dy / view.zoom;
    item.el.style.left = `${item.n.x}px`; item.el.style.top = `${item.n.y}px`;
  }
  updateWires(drag.ids);
}
function endPointer(e) {
  if (moved) suppressClickUntil = Date.now() + 400;
  if (nodeDrag && moved) {
    if (nodeDrag.frame) cancelAnimationFrame(nodeDrag.frame);
    applyNodeDrag();
    for (const item of nodeDrag.positions) {
      item.n.x = Math.round(item.n.x / 10) * 10; item.n.y = Math.round(item.n.y / 10) * 10;
      item.el.style.left = `${item.n.x}px`; item.el.style.top = `${item.n.y}px`;
    }
    updateWires(nodeDrag.ids); saveDraft();
  }
  if(referenceMarquee){referenceMarquee=null;$("ref-marquee").hidden=true;paintSelection();}
  nodeDrag = null; pointers.delete(e.pointerId); resetGesture();
}
// A finger that lands on a node is captured by that node; handing the capture to the canvas makes the node
// "lose" it, and that event bubbles up here. It is not the finger lifting, so only the canvas's own counts.
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) $("ref-viewport").addEventListener(name, (e) => { if (name === "lostpointercapture" && e.target !== $("ref-viewport")) return; endPointer(e); });
$("ref-viewport").addEventListener("click", (e) => { if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); } }, true);
$("ref-fit").onclick = fit; $("ref-zoom-in").onclick = () => zoom(1.2); $("ref-zoom-out").onclick = () => zoom(1 / 1.2);
$("ref-graph").onchange = () => { project.activeGraph = $("ref-graph").value; $("ref-find").value="";$("ref-find-count").textContent="";findIndex=-1;renderGraph(); };
for (const id of ["ref-search", "ref-faction", "ref-type", "ref-with-logic"]) $(id).addEventListener(id === "ref-search" ? "input" : "change", () => { page = 0; renderList(); });
$("ref-prev").onclick = () => { page -= 1; renderList(); }; $("ref-next").onclick = () => { page += 1; renderList(); };
function copySelectedNodes() {
  const clip = nodeClip(project, graph(), refSelection);
  if (!clip.nodes.length) { status("先选择要复制的节点；函数入口不能跨图粘贴。", true); return false; }
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(clip)); } catch { status("浏览器存储空间不足，复制失败。", true); return false; }
  navigator.clipboard?.writeText(CLIP_TAG + JSON.stringify(clip)).catch(() => {});
  status(`已复制 ${clip.nodes.length} 个节点和 ${clip.edges.length} 条内部连线。返回编辑器按 Ctrl+V，或点“粘贴到当前编辑器”。`);
  return true;
}
$("ref-copy-selected").onclick = copySelectedNodes;
$("ref-paste-editor").onclick = () => { if (copySelectedNodes()) location.href = "./index.html?paste=reference"; };
window.addEventListener("keydown", (e) => {
  if (e.target.closest("input,select,textarea") || e.target.isContentEditable) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); $("ref-find").focus(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && refSelection.size && !getSelection()?.toString()) { e.preventDefault(); copySelectedNodes(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && document.activeElement === $("ref-viewport")) { e.preventDefault(); $("ref-select-all").click(); }
  if (e.key === "Escape") { refSelection.clear(); paintSelection(); document.querySelector(".ref-layout").dataset.panel = "graph"; }
});
$("ref-copy").onclick = () => {
  try {
    const copy = validateProject(structuredClone(project)); copy.id = crypto.randomUUID();
    const workspace = createWorkspace(localStorage).load(); copy.name = workspace.uniqueName(copy.name); workspace.save(copy);
    location.href = "./index.html";
  } catch (e) { status(`复制失败：${e.message}`, true); }
};
window.addEventListener("beforeunload",(e)=>{if(draftUnsaved){e.preventDefault();e.returnValue="";}});
$("ref-export").onclick = () => {
  try {
    const copy = validateProject(structuredClone(project));
    const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `${card.name}.kardsbp.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { status(`导出失败：${e.message}`, true); }
};
let viewportWidth = innerWidth;
window.addEventListener("resize", () => {
  if (graph() && $("ref-viewport").clientWidth && innerWidth !== viewportWidth) renderGraph(true);
  viewportWidth = innerWidth;
});
try {
  const [response, chineseResponse] = await Promise.all([fetch(snapshot("./reference-data/index.json")), fetch(snapshot("./reference-data/zh-Hans.json"))]); if (!response.ok) throw new Error(`索引加载失败 (${response.status})`);
  if (!chineseResponse.ok) throw new Error(`中文索引加载失败 (${chineseResponse.status})`);
  const chinese = await chineseResponse.json();
  library = await response.json();
  for (const c of library.cards) {
    c.zh = chinese.cards[c.id] || {};
    c.searchIndex = searchText(`${c.name} ${c.title} ${c.text} ${c.zh.title || ""} ${c.zh.text || ""} ${c.package} ${factions[c.faction] || c.faction} ${(c.functionNames || []).join(" ")}`);
  }
  $("ref-total").textContent = `${library.cards.length} 个`;
  for (const [id, key] of [["ref-faction", "faction"], ["ref-type", "type"]]) for (const v of [...new Set(library.cards.map((c) => c[key]))].sort()) { const option = document.createElement("option"); option.value = v; option.textContent = key === "faction" ? factions[v] || v : v; $(id).append(option); }
  renderList(); status(`${library.counts.cards} 张卡 · ${library.counts.functions} 个函数 · ${library.counts.statements} 条源指令 · Codex`);
  const [id, fn] = location.hash.slice(1).split("~");
  const first = library.cards.find((c) => c.id === id) || library.cards.find((c) => c.name === "card_event_stranglehold") || library.cards.find((c) => !c.dataOnly);
  if (first) await openCard(first.id, fn ? decodeURIComponent(fn) : undefined);
  if (narrow.matches && !id) showPanel("library");
} catch (e) { status(`蓝图库加载失败：${e.message}`, true); $("ref-empty").textContent = e.message; }
