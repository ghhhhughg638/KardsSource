// Blueprint-asset structure, modelled on the Unreal Engine Blueprint editor:
//   one fixed Event Graph, user functions (custom or overriding a parent function),
//   macros, variables and custom events. Names are C++-style identifiers.
import {
  uid,
  clone,
  compatible,
  defaultValue,
  makeGraph,
  makeNode,
  pinKind,
  resolveWildcards,
} from "./model.js";

export const APP_NAME = "KARDS Blueprint Studio";
export const APP_VERSION = "2.16.0";
export const ENGINE_VERSION = "5.6";
export const DEFAULT_PARENT = "UBaseCardObject";
export const DEFAULT_PACKAGE_PATH = "/Game/KARDS/Cards";
export const EVENT_GRAPH_NAME = "EventGraph";
export const BASE_TYPES = [
  "bool",
  "int32",
  "float",
  "FString",
  "FName",
  "FText",
  "FVector",
  "FRotator",
  "UBaseCardObject*",
];
const RESERVED = new Set([
  "None",
  "Self",
  "Target",
  "Exec",
  "Then",
  "Execute",
  "ReturnValue",
  "EventGraph",
  "UserConstructionScript",
  "ConstructionScript",
  "class",
  "struct",
  "enum",
  "namespace",
  "template",
  "this",
  "new",
  "delete",
  "return",
  "void",
  "true",
  "false",
  "int",
  "float",
  "double",
  "bool",
  "if",
  "else",
  "for",
  "while",
  "switch",
  "case",
  "default",
]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// Returns an error message, or null when `name` is a valid, unused identifier.
export function checkName(name, taken = []) {
  if (!name) return "请输入名称";
  if (!IDENT.test(name))
    return "名称只能包含英文字母、数字和下划线，不能以数字开头，最长 64 位（不支持中文）";
  if (RESERVED.has(name)) return `“${name}”是保留名称，请换一个`;
  if (taken.some((t) => t.toLowerCase() === name.toLowerCase()))
    return `名称“${name}”已被使用`;
  return null;
}

export function typeChoices(enums = {}, classes = {}) {
  const objects = Object.keys(classes)
    .filter((c) => /^[UA][A-Z]/.test(c))
    .map((c) => `${c}*`);
  return [
    ...new Set([...BASE_TYPES, ...Object.keys(enums), ...objects.slice(0, 80)]),
  ];
}
export const isArrayType = (type) => /^TArray<.+>$/.test(type);
export const elementType = (type) =>
  isArrayType(type) ? type.slice(7, -1) : type;
export const arrayOf = (type) => `TArray<${type}>`;

const pin = (id, name, type, direction) => ({ id, name, type, direction });
const execIn = (id = "exec-in", name = "Exec") =>
  pin(id, name, "exec", "in");
const execOut = (id = "exec-out", name = "Then") =>
  pin(id, name, "exec", "out");

export function makeVariable(name, type = "bool", enums = {}) {
  return {
    id: uid(),
    name,
    type,
    default: defaultValueFor(type, enums),
    category: "Default",
    tooltip: "",
    instanceEditable: false,
    exposeOnSpawn: false,
  };
}
export function defaultValueFor(type, enums = {}) {
  if (isArrayType(type)) return "[]";
  const value = defaultValue(type, enums);
  return pinKind(type) === "object" ? "None" : value;
}
const param = (name, type) => ({ id: uid(), name, type });

export function makeFunctionGraph(name, options = {}) {
  const g = makeGraph(name, "function");
  g.pure = !!options.pure;
  g.access = options.access || "Public";
  g.category = options.category || "Default";
  g.description = options.description || "";
  g.override = options.override || null;
  g.inputs = (options.inputs || []).map((p) => ({ id: p.id || uid(), ...p }));
  g.outputs = (options.outputs || []).map((p) => ({ id: p.id || uid(), ...p }));
  g.locals = (options.locals || []).map((v) => ({
    id: v.id || uid(),
    name: v.name,
    type: v.type,
    default: v.default ?? defaultValueFor(v.type),
  }));
  return ensureBoundaryNodes(g);
}
export function makeMacroGraph(name, options = {}) {
  const g = makeGraph(name, "macro");
  g.description = options.description || "";
  g.inputs = (options.inputs || []).map((p) => ({ id: p.id || uid(), ...p }));
  g.outputs = (options.outputs || []).map((p) => ({ id: p.id || uid(), ...p }));
  return ensureBoundaryNodes(g);
}
export const newParam = param;

// ---------------------------------------------------------------- node definitions
const base = (extra) => ({
  class: "Blueprint",
  category: "flow",
  ...extra,
});
export function entryDefinition(g) {
  const isMacro = g.kind === "macro";
  const pins = isMacro
    ? g.inputs.map((p) =>
        p.type === "exec"
          ? execOut(`in:${p.id}`, p.name)
          : pin(`in:${p.id}`, p.name, p.type, "out"),
      )
    : [
        ...(g.pure ? [] : [execOut("then", "Then")]),
        ...g.inputs.map((p) => pin(`in:${p.id}`, p.name, p.type, "out")),
      ];
  return base({
    id: `bp.${isMacro ? "macroEntry" : "functionEntry"}.${g.id}`,
    name: g.name,
    label: isMacro ? `宏输入 · ${g.name}` : `函数入口 · ${g.name}`,
    kind: isMacro ? "macroEntry" : "functionEntry",
    fixed: true,
    bp: { type: isMacro ? "macroEntry" : "entry", graphId: g.id },
    signature: `${isMacro ? "macro" : "function"} ${g.name}`,
    pins,
  });
}
// `extra` marks additional Return Nodes of a function (Unreal allows several, one per exit path).
export function resultDefinition(g, extra = false) {
  const isMacro = g.kind === "macro";
  const pins = isMacro
    ? g.outputs.map((p) =>
        p.type === "exec"
          ? execIn(`out:${p.id}`, p.name)
          : pin(`out:${p.id}`, p.name, p.type, "in"),
      )
    : [
        ...(g.pure ? [] : [execIn("exec", "Exec")]),
        ...g.outputs.map((p) => pin(`out:${p.id}`, p.name, p.type, "in")),
      ];
  return base({
    id: `bp.${isMacro ? "macroExit" : "functionResult"}.${g.id}`,
    name: isMacro ? `${g.name} Outputs` : "Return Node",
    label: isMacro ? `宏输出 · ${g.name}` : `返回节点 · ${g.name}`,
    kind: isMacro ? "macroExit" : "functionResult",
    fixed: !extra,
    bp: isMacro
      ? { type: "macroExit", graphId: g.id }
      : { type: "result", graphId: g.id, ...(extra ? { extra: true } : {}) },
    signature: `${isMacro ? "macro" : "function"} ${g.name} result`,
    pins,
  });
}
export function callDefinition(g) {
  const pins = [
    ...(g.pure ? [] : [execIn(), execOut()]),
    ...g.inputs.map((p) => pin(`in:${p.id}`, p.name, p.type, "in")),
    ...g.outputs.map((p) => pin(`out:${p.id}`, p.name, p.type, "out")),
  ];
  return base({
    id: `bp.call.${g.id}`,
    name: g.name,
    label: g.name,
    class: "Self",
    category: "functions",
    kind: "call",
    pure: g.pure,
    bp: { type: "call", graphId: g.id },
    signature: signatureOf(g),
    pins,
  });
}
export function macroDefinition(g) {
  const pins = [
    ...g.inputs.map((p) =>
      p.type === "exec"
        ? execIn(`in:${p.id}`, p.name)
        : pin(`in:${p.id}`, p.name, p.type, "in"),
    ),
    ...g.outputs.map((p) =>
      p.type === "exec"
        ? execOut(`out:${p.id}`, p.name)
        : pin(`out:${p.id}`, p.name, p.type, "out"),
    ),
  ];
  return base({
    id: `bp.macro.${g.id}`,
    name: g.name,
    label: g.name,
    class: "Macro",
    category: "macros",
    kind: "macro",
    bp: { type: "macro", graphId: g.id },
    signature: `macro ${g.name}`,
    pins,
  });
}
// Pin type that connects a custom event to an event dispatcher's Bind / Unbind node.
export const delegateType = (params) =>
  `Delegate<${params.map((p) => p.type).join(",")}>`;
export function customEventDefinition(name, params, previous = {}) {
  return base({
    id: previous.id || `bp.customEvent.${uid()}`,
    name,
    label: `自定义事件 · ${name}`,
    class: "Blueprint",
    category: "events",
    kind: "customEvent",
    bp: { type: "customEvent", params: clone(params) },
    signature: `event ${name}(${params.map((p) => `${p.type} ${p.name}`).join(", ")})`,
    pins: [
      execOut("then", "Then"),
      pin("delegate", "Delegate", delegateType(params), "out"),
      ...params.map((p) => pin(`p:${p.id}`, p.name, p.type, "out")),
    ],
  });
}
export function callEventDefinition(node) {
  const { params } = node.definition.bp;
  return base({
    id: `bp.callEvent.${node.id}`,
    name: node.definition.name,
    label: `调用事件 · ${node.definition.name}`,
    class: "Self",
    category: "events",
    kind: "call",
    bp: { type: "callEvent", eventNodeId: node.id, params: clone(params) },
    signature: node.definition.signature,
    pins: [
      execIn(),
      execOut(),
      ...params.map((p) => pin(`p:${p.id}`, p.name, p.type, "in")),
    ],
  });
}
export function getDefinition(v) {
  return base({
    id: `bp.get.${v.id}`,
    name: `Get ${v.name}`,
    label: `获取 ${v.name}`,
    class: "Variable",
    category: "variables",
    kind: "getter",
    pure: true,
    property: v.name,
    bp: { type: "get", variableId: v.id },
    signature: `${v.type} ${v.name}`,
    pins: [pin("value", v.name, v.type, "out")],
  });
}
export function setDefinition(v) {
  return base({
    id: `bp.set.${v.id}`,
    name: `Set ${v.name}`,
    label: `设置 ${v.name}`,
    class: "Variable",
    category: "variables",
    kind: "setter",
    property: v.name,
    bp: { type: "set", variableId: v.id },
    signature: `${v.type} ${v.name} = …`,
    pins: [
      execIn(),
      pin("value", v.name, v.type, "in"),
      execOut(),
      pin("result", "Output", v.type, "out"),
    ],
  });
}
export function localGetDefinition(g, v) {
  return base({
    id: `bp.getlocal.${v.id}`,
    name: `Get ${v.name}`,
    label: `获取局部变量 ${v.name}`,
    class: "Local",
    category: "variables",
    kind: "getter",
    pure: true,
    property: v.name,
    bp: { type: "getLocal", graphId: g.id, variableId: v.id },
    signature: `local ${v.type} ${v.name}`,
    pins: [pin("value", v.name, v.type, "out")],
  });
}
export function localSetDefinition(g, v) {
  return base({
    id: `bp.setlocal.${v.id}`,
    name: `Set ${v.name}`,
    label: `设置局部变量 ${v.name}`,
    class: "Local",
    category: "variables",
    kind: "setter",
    property: v.name,
    bp: { type: "setLocal", graphId: g.id, variableId: v.id },
    signature: `local ${v.type} ${v.name} = …`,
    pins: [
      execIn(),
      pin("value", v.name, v.type, "in"),
      execOut(),
      pin("result", "Output", v.type, "out"),
    ],
  });
}
export function dispatcherDefinition(d, action) {
  const params = d.params.map((p) => pin(`p:${p.id}`, p.name, p.type, "in"));
  const delegate = pin("event", "Event", delegateType(d.params), "in");
  const shape = {
    call: { label: "调用分发器", pins: [execIn(), execOut(), ...params] },
    bind: { label: "绑定事件", pins: [execIn(), execOut(), delegate] },
    unbind: { label: "解除绑定", pins: [execIn(), execOut(), delegate] },
    unbindAll: { label: "解除全部绑定", pins: [execIn(), execOut()] },
  }[action];
  const verb = { call: "Call", bind: "Bind Event to", unbind: "Unbind Event from", unbindAll: "Unbind all Events from" }[action];
  return base({
    id: `bp.dispatch.${action}.${d.id}`,
    name: `${verb} ${d.name}`,
    label: `${shape.label} · ${d.name}`,
    class: "Dispatcher",
    category: "events",
    kind: "call",
    bp: { type: "dispatcher", action, dispatcherId: d.id },
    signature: `dispatcher ${d.name}(${d.params.map((p) => `${p.type} ${p.name}`).join(", ")})`,
    pins: shape.pins,
  });
}
export const newCustomEventEntry = () =>
  base({
    id: "bp.new.customEvent",
    name: "Add Custom Event…",
    label: "添加自定义事件…",
    category: "events",
    kind: "customEvent",
    action: "newCustomEvent",
    pins: [],
  });
function signatureOf(g) {
  const ins = g.inputs.map((p) => `${p.type} ${p.name}`).join(", ");
  const outs = g.outputs.map((p) => `${p.type} ${p.name}`).join(", ");
  return `${g.pure ? "pure " : ""}function ${g.name}(${ins})${outs ? ` -> (${outs})` : ""}`;
}

// ---------------------------------------------------------------- consistency
const BOUNDARY_ID = { entry: 1, result: 1, macroEntry: 1, macroExit: 1 };
export function ensureBoundaryNodes(g) {
  if (g.kind === "event") return g;
  const want = [];
  const isMacro = g.kind === "macro";
  want.push([isMacro ? "macroEntry" : "entry", entryDefinition(g), 60]);
  if (isMacro || g.outputs.length)
    want.push([isMacro ? "macroExit" : "result", resultDefinition(g), 760]);
  for (const [type, def, x] of want) {
    const existing = g.nodes.filter(
      (n) => n.definition.bp?.type === type && n.definition.bp.graphId === g.id,
    );
    if (existing.length)
      for (const n of existing)
        n.definition =
          type === "result" ? resultDefinition(g, !!n.definition.bp.extra) : def;
    else g.nodes.push(makeNode(def, x, 120));
  }
  // No forced terminal node for void functions. Keep user-added early returns
  // in impure functions; output functions still require their result boundary.
  if (!isMacro && !want.some(([type]) => type === "result"))
    g.nodes = g.nodes.filter(
      (n) => !(n.definition.bp?.type === "result" && n.definition.bp.graphId === g.id && (g.pure || !n.definition.bp.extra)),
    );
  if (!isMacro && !g.outputs.length && !g.pure) for (const n of g.nodes) if (n.definition.bp?.type === "result") n.definition = resultDefinition(g, true);
  return g;
}

// Rebuild every blueprint-defined node from the project's current functions, macros,
// variables and custom events, and drop wires whose pins no longer exist.
export function syncDefinitions(project) {
  const graphs = new Map(project.graphs.map((g) => [g.id, g]));
  const variables = new Map(project.variables.map((v) => [v.id, v]));
  const dispatchers = new Map(project.dispatchers.map((d) => [d.id, d]));
  const eventNodes = new Map();
  for (const g of project.graphs)
    for (const n of g.nodes)
      if (n.definition.bp?.type === "customEvent") {
        n.definition = customEventDefinition(
          n.definition.name,
          n.definition.bp.params,
          n.definition,
        );
        eventNodes.set(n.id, n);
      }
  for (const g of project.graphs) {
    if (g.kind !== "event") ensureBoundaryNodes(g);
    const removed = new Set();
    for (const n of g.nodes) {
      const bp = n.definition.bp;
      if (!bp) continue;
      let next = null;
      if (bp.type === "call") next = graphs.has(bp.graphId) && graphs.get(bp.graphId).kind === "function" ? callDefinition(graphs.get(bp.graphId)) : null;
      else if (bp.type === "macro") next = graphs.get(bp.graphId)?.kind === "macro" ? macroDefinition(graphs.get(bp.graphId)) : null;
      else if (bp.type === "get") next = variables.has(bp.variableId) ? getDefinition(variables.get(bp.variableId)) : null;
      else if (bp.type === "set") next = variables.has(bp.variableId) ? setDefinition(variables.get(bp.variableId)) : null;
      else if (bp.type === "getLocal" || bp.type === "setLocal") {
        const owner = graphs.get(bp.graphId);
        const v = owner?.kind === "function" && owner === g ? owner.locals.find((x) => x.id === bp.variableId) : null;
        next = v ? (bp.type === "getLocal" ? localGetDefinition(owner, v) : localSetDefinition(owner, v)) : null;
      } else if (bp.type === "dispatcher")
        next = dispatchers.has(bp.dispatcherId) && !(g.kind === "function" && g.pure) ? dispatcherDefinition(dispatchers.get(bp.dispatcherId), bp.action) : null;
      else if (bp.type === "callEvent") next = eventNodes.has(bp.eventNodeId) ? callEventDefinition(eventNodes.get(bp.eventNodeId)) : null;
      else if (bp.type === "customEvent") next = n.definition;
      else if (BOUNDARY_ID[bp.type]) next = n.definition;
      if (!next) removed.add(n.id);
      else n.definition = next;
    }
    g.nodes = g.nodes.filter((n) => !removed.has(n.id));
    resolveWildcards(g);
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    g.edges = g.edges.filter((e) => {
      const a = byId.get(e.from.node),
        b = byId.get(e.to.node);
      if (!a || !b) return false;
      const out = a.definition.pins.find((p) => p.id === e.from.pin && p.direction === "out"),
        into = b.definition.pins.find((p) => p.id === e.to.pin && p.direction === "in");
      return !!out && !!into && compatible(out.type, into.type);
    });
    for (const n of g.nodes) {
      const ids = new Set(n.definition.pins.map((p) => p.id));
      for (const key of Object.keys(n.values || {}))
        if (!ids.has(key)) delete n.values[key];
    }
  }
  return project;
}

// ---------------------------------------------------------------- picker content
function dependsOnMacro(project, macroId, targetId, seen = new Set()) {
  if (macroId === targetId) return true;
  if (seen.has(macroId)) return false;
  seen.add(macroId);
  const g = project.graphs.find((x) => x.id === macroId);
  return !!g?.nodes.some(
    (n) =>
      n.definition.bp?.type === "macro" &&
      dependsOnMacro(project, n.definition.bp.graphId, targetId, seen),
  );
}
export const MAX_MACRO_DEPTH = 8;
// Number of macro levels from `id` down through the macros it instantiates (1 = none).
export function macroLevels(project, id, seen = new Set()) {
  if (seen.has(id)) return Infinity;
  const g = project.graphs.find((x) => x.id === id);
  if (!g) return 0;
  const next = new Set(seen).add(id);
  let deepest = 0;
  for (const n of g.nodes)
    if (n.definition.bp?.type === "macro")
      deepest = Math.max(deepest, macroLevels(project, n.definition.bp.graphId, next));
  return 1 + deepest;
}
// Number of macro levels above `id` (macros that instantiate it, directly or not).
export function macroAbove(project, id, seen = new Set()) {
  if (seen.has(id)) return Infinity;
  const next = new Set(seen).add(id);
  let highest = 0;
  for (const g of project.graphs)
    if (g.kind === "macro" && g.nodes.some((n) => n.definition.bp?.type === "macro" && n.definition.bp.graphId === id))
      highest = Math.max(highest, 1 + macroAbove(project, g.id, next));
  return highest;
}
const macroFits = (project, host, macro) =>
  host.kind !== "macro" ||
  (!dependsOnMacro(project, macro.id, host.id) &&
    macroAbove(project, host.id) + 1 + macroLevels(project, macro.id) <= MAX_MACRO_DEPTH);
// Definitions that exist only because of this project, filtered to what `graph` may contain.
export function dynamicDefinitions(project, graph) {
  const out = [];
  const pureFn = graph.kind === "function" && graph.pure;
  for (const v of project.variables) {
    out.push(getDefinition(v));
    if (!pureFn) out.push(setDefinition(v));
  }
  if (graph.kind === "function")
    for (const v of graph.locals) {
      out.push(localGetDefinition(graph, v));
      if (!pureFn) out.push(localSetDefinition(graph, v));
    }
  for (const g of project.graphs) {
    if (g.kind === "function") out.push(callDefinition(g));
    if (g.kind === "macro" && macroFits(project, graph, g)) out.push(macroDefinition(g));
  }
  if (graph.kind === "function" && !graph.pure) out.push(resultDefinition(graph, true));
  if (!pureFn)
    for (const d of project.dispatchers)
      for (const action of ["call", "bind", "unbind", "unbindAll"])
        out.push(dispatcherDefinition(d, action));
  if (graph.kind === "event") {
    out.push(newCustomEventEntry());
    for (const n of graph.nodes)
      if (n.definition.bp?.type === "customEvent")
        out.push(callEventDefinition(n));
  }
  return out;
}
export function allowedInGraph(def, graph) {
  const kind = def.kind;
  if (def.fixed) return false;
  if (kind === "event" || kind === "customEvent") return graph.kind === "event";
  if (def.bp?.type === "callEvent") return graph.kind === "event";
  if (def.bp?.type === "getLocal" || def.bp?.type === "setLocal")
    return graph.kind === "function" && def.bp.graphId === graph.id;
  if (def.bp?.type === "dispatcher") return !(graph.kind === "function" && graph.pure);
  if (def.bp?.type === "result") return graph.kind === "function" && !graph.pure && def.bp.graphId === graph.id;
  return true;
}
export function referencesGraph(project, graphId) {
  return project.graphs.some((g) =>
    g.nodes.some(
      (n) =>
        n.definition.bp?.graphId === graphId &&
        ["call", "macro"].includes(n.definition.bp.type),
    ),
  );
}

// ---------------------------------------------------------------- overrides
// Functions of the parent class that Blueprint can override (BlueprintImplementableEvent /
// BlueprintNativeEvent with outputs). Void events with no outputs live in the Event Graph.
export function overridableMembers(catalog, parentClass = DEFAULT_PARENT, classes = {}) {
  const parents = new Set();
  for (let name = parentClass; name && !parents.has(name); name = classes[name]?.parent) parents.add(name);
  const names = new Set();
  return catalog
    .filter(
      (d) =>
        parents.has(d.class) &&
        (d.nativeEvent || d.implementable || d.event) &&
        d.kind !== "getter" &&
        d.kind !== "setter",
    )
    .sort((a, b) => [...parents].indexOf(a.class) - [...parents].indexOf(b.class))
    .filter((d) => { if (names.has(d.name)) return false; names.add(d.name); return true; })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function overridableFunctions(catalog, parentClass = DEFAULT_PARENT, classes = {}) {
  return overridableMembers(catalog, parentClass, classes).filter((d) => !d.event);
}
export function overrideSignature(def) {
  const data = def.pins.filter((p) => p.type !== "exec" && p.id !== "target");
  return {
    pure: !!def.pure,
    inputs: data
      .filter((p) => p.direction === "in")
      .map((p) => ({ id: `ovr-${p.id}`, name: p.id, type: p.type })),
    outputs: data
      .filter((p) => p.direction === "out")
      .map((p) => ({ id: `ovr-${p.id}`, name: p.name, type: p.type })),
  };
}

// ---------------------------------------------------------------- validation
export function validateBlueprint(project) {
  const bad = (msg) => {
    throw new Error(msg);
  };
  if (checkName(project.name)) bad("资源名称无效：" + checkName(project.name));
  const asset = project.asset;
  if (
    !asset ||
    typeof asset.parentClass !== "string" ||
    typeof asset.packagePath !== "string" ||
    typeof asset.description !== "string"
  )
    bad("资源信息不完整");
  if (!Array.isArray(project.variables) || project.variables.length > 500)
    bad("变量列表无效");
  // Class Defaults: only the values that differ from the type's default are stored.
  project.classDefaults = project.classDefaults ?? {};
  const defaults = project.classDefaults,
    simple = (v) => ["string", "number", "boolean"].includes(typeof v) && (typeof v !== "number" || Number.isFinite(v));
  if (
    typeof defaults !== "object" ||
    Array.isArray(defaults) ||
    Object.keys(defaults).length > 600 ||
    Object.entries(defaults).some(
      ([k, v]) => !/^[A-Za-z_]\w*$/.test(k) || !(simple(v) || (Array.isArray(v) && v.length <= 500 && v.every(simple))),
    )
  )
    bad("类默认值无效");
  project.dispatchers = project.dispatchers ?? [];
  if (!Array.isArray(project.dispatchers) || project.dispatchers.length > 200)
    bad("事件分发器列表无效");
  const varNames = new Set();
  for (const v of project.variables) {
    if (
      typeof v.id !== "string" ||
      typeof v.type !== "string" ||
      typeof v.category !== "string" ||
      typeof v.tooltip !== "string" ||
      typeof v.instanceEditable !== "boolean" ||
      typeof v.exposeOnSpawn !== "boolean" ||
      !["string", "number", "boolean"].includes(typeof v.default) ||
      checkName(v.name) ||
      varNames.has(v.name.toLowerCase())
    )
      bad("变量定义无效或名称重复");
    varNames.add(v.name.toLowerCase());
  }
  const dispatcherNames = new Set();
  const paramListOf = (list) => {
    if (!Array.isArray(list) || list.length > 64) bad("函数参数无效");
    const seen = new Set();
    for (const p of list) {
      if (typeof p.id !== "string" || typeof p.type !== "string" || checkName(p.name) || seen.has(p.name.toLowerCase()))
        bad("函数参数名无效或重复");
      seen.add(p.name.toLowerCase());
    }
  };
  for (const d of project.dispatchers) {
    if (typeof d.id !== "string" || checkName(d.name) || dispatcherNames.has(d.name.toLowerCase()) || varNames.has(d.name.toLowerCase()))
      bad("事件分发器名称无效或重复");
    dispatcherNames.add(d.name.toLowerCase());
    d.description = typeof d.description === "string" ? d.description : "";
    paramListOf(d.params);
  }
  const events = project.graphs.filter((g) => g.kind === "event");
  if (events.length !== 1 || project.graphs[0] !== events[0] || events[0].name !== EVENT_GRAPH_NAME)
    bad("蓝图必须有且仅有一个 EventGraph，并且排在第一位");
  const names = new Set();
  const paramList = (list) => {
    if (!Array.isArray(list) || list.length > 64) bad("函数参数无效");
    const seen = new Set();
    for (const p of list) {
      if (
        typeof p.id !== "string" ||
        typeof p.type !== "string" ||
        checkName(p.name) ||
        seen.has(p.name.toLowerCase())
      )
        bad("函数参数名无效或重复");
      seen.add(p.name.toLowerCase());
    }
  };
  for (const g of project.graphs.slice(1)) {
    if (!["function", "macro"].includes(g.kind)) bad("事件图之外只能有函数或宏");
    if (checkName(g.name) || names.has(g.name.toLowerCase()))
      bad("函数或宏的名称无效或重复");
    names.add(g.name.toLowerCase());
    paramList(g.inputs);
    paramList(g.outputs);
    if (dispatcherNames.has(g.name.toLowerCase()) || varNames.has(g.name.toLowerCase()))
      bad("函数或宏的名称无效或重复");
    if (g.kind === "function") {
      g.locals = g.locals ?? [];
      if (!Array.isArray(g.locals) || g.locals.length > 200) bad("局部变量无效");
      const seenLocal = new Set([...g.inputs, ...g.outputs].map((p) => p.name.toLowerCase()));
      for (const v of g.locals) {
        if (
          typeof v.id !== "string" ||
          typeof v.type !== "string" ||
          !["string", "number", "boolean"].includes(typeof v.default) ||
          checkName(v.name) ||
          seenLocal.has(v.name.toLowerCase())
        )
          bad("局部变量名无效或重复");
        seenLocal.add(v.name.toLowerCase());
      }
    }
    if (g.kind === "function" && typeof g.pure !== "boolean") bad("函数定义无效");
    g.description = typeof g.description === "string" ? g.description : "";
    if (g.kind === "function") {
      g.category = typeof g.category === "string" ? g.category : "Default";
      g.access = ["Public", "Protected", "Private"].includes(g.access) ? g.access : "Public";
      g.override =
        g.override && typeof g.override.function === "string" ? g.override : null;
    }
  }
  const eventNames = new Set();
  for (const n of events[0].nodes)
    if (n.definition.bp?.type === "customEvent") {
      paramList(n.definition.bp.params);
      const name = n.definition.name;
      if (checkName(name) || eventNames.has(name.toLowerCase()))
        bad("自定义事件名称无效或重复");
      eventNames.add(name.toLowerCase());
    }
  for (const g of project.graphs)
    for (const n of g.nodes)
      if (
        n.definition.bp?.type === "customEvent" &&
        g.kind !== "event"
      )
        bad("自定义事件只能放在 EventGraph 中");
  for (const g of project.graphs.filter((x) => x.kind === "macro"))
    if (macroLevels(project, g.id) + macroAbove(project, g.id) > MAX_MACRO_DEPTH)
      bad(`宏不能引用自身，嵌套也不能超过 ${MAX_MACRO_DEPTH} 层`);
  return project;
}

// ---------------------------------------------------------------- export
function usedDefinitions(project) {
  const used = new Map();
  for (const g of project.graphs)
    for (const n of g.nodes) {
      const d = n.definition;
      if (d.bp || d.id?.startsWith("studio.") || d.class === "UE") continue;
      const entry = used.get(d.id) || { definition: d, uses: 0, graphs: new Set() };
      entry.uses += 1;
      entry.graphs.add(g.name);
      used.set(d.id, entry);
    }
  return [...used.values()];
}
export function buildExport(project, context = {}) {
  const { classes = {}, enums = {}, exportedAt = new Date().toISOString() } = context;
  const typeMentions = new Set();
  const noteType = (t) => {
    if (!t || t === "exec" || t.includes("$")) return;
    const inner = elementType(t);
    typeMentions.add(inner.replace(/\*$/, ""));
  };
  for (const v of project.variables) noteType(v.type);
  for (const d of project.dispatchers) for (const p of d.params) noteType(p.type);
  for (const g of project.graphs) for (const v of g.locals || []) noteType(v.type);
  const graphsOut = project.graphs.map((g) => {
    const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
    const links = g.edges.map((e) => {
      const a = nodeById.get(e.from.node),
        b = nodeById.get(e.to.node);
      const pa = a.definition.pins.find((p) => p.id === e.from.pin),
        pb = b.definition.pins.find((p) => p.id === e.to.pin);
      return {
        id: e.id,
        type: pa.type,
        from: { node: a.id, nodeName: a.title || a.definition.name, pin: pa.id, pinName: pa.name },
        to: { node: b.id, nodeName: b.title || b.definition.name, pin: pb.id, pinName: pb.name },
      };
    });
    for (const n of g.nodes) for (const p of n.definition.pins) noteType(p.type);
    return {
      ...g,
      links,
      stats: {
        nodes: g.nodes.length,
        links: g.edges.length,
        comments: g.nodes.filter((n) => n.comment).length,
      },
    };
  });
  const parent = project.asset.parentClass;
  const chain = [];
  for (let c = parent, seen = new Set(); c && !seen.has(c); c = classes[c]?.parent) {
    chain.push(c);
    seen.add(c);
  }
  const natives = usedDefinitions(project);
  const classNames = new Set([parent, ...natives.map((u) => u.definition.class)]);
  for (const t of typeMentions) if (classes[t]) classNames.add(t);
  const enumNames = [...typeMentions].filter((t) => enums[t]);
  const sig = (g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    inputs: g.inputs,
    outputs: g.outputs,
    graph: g.id,
    ...(g.kind === "function"
      ? { pure: g.pure, access: g.access, category: g.category, override: g.override, locals: g.locals }
      : {}),
  });
  const customEvents = project.graphs[0].nodes
    .filter((n) => n.definition.bp?.type === "customEvent")
    .map((n) => ({
      node: n.id,
      name: n.definition.name,
      params: n.definition.bp.params,
      graph: project.graphs[0].id,
    }));
  const name = project.name;
  return {
    format: project.format,
    version: project.version,
    id: project.id,
    name,
    asset: {
      name,
      objectPath: `${project.asset.packagePath}/${name}.${name}`,
      packagePath: project.asset.packagePath,
      assetClass: "Blueprint",
      blueprintType: "BPTYPE_Normal",
      generatedClass: `${name}_C`,
      skeletonClass: `SKEL_${name}_C`,
      description: project.asset.description,
      parentClass: parent,
      parent: {
        name: parent,
        source: classes[parent]?.source || null,
        hierarchy: chain,
      },
    },
    card: project.card,
    classDefaults: project.classDefaults || {},
    ...(project.enums ? { enums: project.enums } : {}),
    ...(project.reference ? { reference: project.reference } : {}),
    classDefaultTypes: Object.fromEntries(
      Object.keys(project.classDefaults || {}).map((k) => [k, context.propertyTypes?.[k] ?? null]),
    ),
    variables: project.variables,
    dispatchers: project.dispatchers,
    eventGraph: project.graphs[0].id,
    functions: project.graphs.filter((g) => g.kind === "function").map(sig),
    macros: project.graphs.filter((g) => g.kind === "macro").map(sig),
    customEvents,
    graphs: graphsOut,
    dependencies: {
      nativeClasses: [...classNames]
        .filter((c) => c && c !== "UE" && c !== "Self" && c !== "Variable" && c !== "Blueprint" && c !== "Macro")
        .map((c) => ({ name: c, parent: classes[c]?.parent || null, source: classes[c]?.source || null })),
      nativeFunctions: natives.map((u) => ({
        id: u.definition.id,
        name: u.definition.name,
        class: u.definition.class,
        kind: u.definition.kind,
        source: u.definition.source || null,
        signature: u.definition.signature || null,
        uses: u.uses,
        graphs: [...u.graphs],
      })),
      enums: enumNames.map((e) => ({ name: e, values: enums[e] })),
      types: [...typeMentions].sort(),
    },
    stats: {
      graphs: project.graphs.length,
      functions: project.graphs.filter((g) => g.kind === "function").length,
      macros: project.graphs.filter((g) => g.kind === "macro").length,
      customEvents: customEvents.length,
      variables: project.variables.length,
      localVariables: project.graphs.reduce((sum, g) => sum + (g.locals?.length || 0), 0),
      dispatchers: project.dispatchers.length,
      nodes: graphsOut.reduce((s, g) => s + g.stats.nodes, 0),
      links: graphsOut.reduce((s, g) => s + g.stats.links, 0),
    },
    types: project.types,
    exporter: {
      name: APP_NAME,
      version: APP_VERSION,
      engineVersion: ENGINE_VERSION,
      repository: context.repository || null,
      exportedAt,
    },
    activeGraph: project.activeGraph,
  };
}
