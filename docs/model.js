export const FORMAT = "kards-blueprint";
export const VERSION = 2;
export const uid = () => crypto.randomUUID();
export const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
import { ueBuiltins, engineClasses } from "./ue-nodes.js";
import { enumNodes } from "./enum-tools.js";
import {
  DEFAULT_PACKAGE_PATH,
  DEFAULT_PARENT,
  EVENT_GRAPH_NAME,
  syncDefinitions,
  validateBlueprint,
} from "./blueprint.js";
export const builtins = [...ueBuiltins, ...enumNodes];
let typeHierarchy = { ...engineClasses };
export function setTypeHierarchy(classes = {}) {
  typeHierarchy = { ...engineClasses, ...classes };
}
// Wildcard pins (array library nodes work for any element type): "$T" stands for the element
// type and is replaced by the real one as soon as something is connected, like Unreal.
export const WILD = "$T";
// "Switch on Enum" selection pin: accepts any enum, and takes that enum's type once one is chosen.
export const WILD_ENUM = "$E";
let enumTable = {};
export function setEnumTable(enums = {}) {
  enumTable = enums;
}
const isTypedArray = (t) => /^TArray<.+>$/.test(t);
export function compatible(a, b) {
  if (a === b) return true;
  if (a === WILD_ENUM || b === WILD_ENUM) {
    const other = a === WILD_ENUM ? b : a;
    return !!enumTable[other] || other === WILD_ENUM;
  }
  const wa = a.includes(WILD),
    wb = b.includes(WILD);
  if (wa || wb) {
    if (wa && wb) return isTypedArray(a) === isTypedArray(b);
    const [wild, other] = wa ? [a, b] : [b, a];
    if (other === "exec" || other.startsWith("Delegate<") || other.includes("TSet<")) return false;
    return isTypedArray(wild) ? isTypedArray(other) : !isTypedArray(other);
  }
  if (
    !a.endsWith("*") ||
    !b.endsWith("*") ||
    a.includes("<") ||
    b.includes("<")
  )
    return false;
  let current = a.slice(0, -1),
    wanted = b.slice(0, -1);
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (current === wanted) return true;
    seen.add(current);
    current = typeHierarchy[current]?.parent;
  }
  return false;
}
export function matchingPin(definition, source) {
  const options = definition.pins.filter(
    (p) =>
      p.direction !== source.direction &&
      (source.direction === "out"
        ? compatible(source.type, p.type)
        : compatible(p.type, source.type)),
  );
  return (
    options.find((p) => p.id === "target") ||
    options.find((p) => p.type === source.type) ||
    options[0]
  );
}
export function makeNode(def, x, y) {
  return {
    id: uid(),
    definition: clone(def),
    x,
    y,
    title: "",
    comment: "",
    values: {},
  };
}
export function makeGraph(name = EVENT_GRAPH_NAME, kind = "event") {
  return {
    id: uid(),
    name,
    kind,
    nodes: [],
    edges: [],
    view: { x: 40, y: 0, zoom: 1 },
  };
}
export function makeProject() {
  const g = makeGraph(EVENT_GRAPH_NAME, "event");
  return {
    format: FORMAT,
    version: VERSION,
    id: uid(),
    name: "BP_NewCard",
    asset: {
      parentClass: DEFAULT_PARENT,
      packagePath: DEFAULT_PACKAGE_PATH,
      description: "",
    },
    variables: [],
    dispatchers: [],
    classDefaults: {},
    card: {
      title: "未命名卡牌",
      faction: "Soviet",
      type: "infantry",
      rarity: "Common",
      cost: 3,
      operationCost: 1,
      attack: 3,
      defense: 4,
      text: "在这里描述卡牌效果。",
    },
    graphs: [g],
    activeGraph: g.id,
  };
}
export function pinKind(type) {
  if (type === "exec") return "exec";
  if (enumTable[type]) return "enum";
  if (type === WILD_ENUM) return "wildcard";
  if (type.includes(WILD)) return type.startsWith("TArray<") ? "array" : "wildcard";
  if (type.startsWith("Delegate<")) return "delegate";
  if (type.includes("TArray") || type.includes("TSet")) return "array";
  if (type.includes("bool")) return "bool";
  if (/^(int|uint)/.test(type)) return "int";
  if (/float|double/.test(type)) return "float";
  if (type === "FName") return "name";
  if (type === "FText") return "text";
  if (type === "FVector" || type === "FVector2D") return "vector";
  if (type === "FRotator") return "rotator";
  if (type === "FString") return "string";
  if (/^E[A-Z]/.test(type) || type.startsWith("Enum")) return "enum";
  return "object";
}
// `selfType` (e.g. "UBaseCardObject*") is the blueprint's own class: an object input defaults
// to "Self" only when this blueprint is that type; otherwise it must be wired (default "None").
export function defaultValue(type, enums = {}, selfType = null) {
  if (enums[type]) return enums[type][0] || "";
  const k = pinKind(type);
  if (k === "object" && selfType)
    return type.endsWith("*") && compatible(selfType, type) ? "Self" : "None";
  return k === "bool"
    ? false
    : k === "int" || k === "float"
      ? 0
      : k === "object"
        ? "Self"
        : k === "array"
          ? "[]"
          : "";
}
export function connect(graph, a, b) {
  const na = graph.nodes.find((n) => n.id === a.node),
    nb = graph.nodes.find((n) => n.id === b.node);
  if (!na || !nb || na === nb) throw new Error("请连接两个不同的节点");
  const pa = na.definition.pins.find((p) => p.id === a.pin),
    pb = nb.definition.pins.find((p) => p.id === b.pin);
  if (!pa || !pb || pa.direction === pb.direction)
    throw new Error("请将输出端口连接到输入端口");
  const [from, to, po, pi] =
    pa.direction === "out" ? [a, b, pa, pb] : [b, a, pb, pa];
  if (!compatible(po.type, pi.type))
    throw new Error(`端口类型不匹配：${po.type} → ${pi.type}`);
  if (
    graph.edges.some(
      (e) =>
        e.from.node === from.node &&
        e.from.pin === from.pin &&
        e.to.node === to.node &&
        e.to.pin === to.pin,
    )
  )
    return false;
  // A data input keeps one wire (the new one replaces it); an execution output leads to one place
  // (the new wire replaces it), but any number of execution outputs may share one execution input.
  graph.edges = graph.edges.filter((e) =>
    po.type === "exec"
      ? !(e.from.node === from.node && e.from.pin === from.pin)
      : !(e.to.node === to.node && e.to.pin === to.pin),
  );
  graph.edges.push({ id: uid(), from: clone(from), to: clone(to) });
  return true;
}
export function validateProject(input) {
  if (!input || input.format !== FORMAT || input.version !== VERSION)
    throw new Error("无法识别文件。请导入版本 2 的 .kardsbp.json 蓝图文件（旧版本文件不兼容）。");
  if (input.enums !== undefined) {
    if (!input.enums || typeof input.enums !== "object" || Array.isArray(input.enums) || Object.keys(input.enums).length > 200 || Object.entries(input.enums).some(([name, values]) => !/^[A-Za-z_]\w*$/.test(name) || !Array.isArray(values) || values.length > 1000 || values.some((v) => typeof v !== "string" || v.length > 128) || new Set(values).size !== values.length)) throw new Error("枚举声明无效");
    setEnumTable({ ...enumTable, ...input.enums });
  }
  if (
    typeof input.name !== "string" ||
    input.name.length > 200 ||
    !Array.isArray(input.graphs) ||
    !input.graphs.length ||
    input.graphs.length > 100
  )
    throw new Error("项目名称或事件图列表无效");
  if (
    !input.card ||
    ["title", "faction", "type", "rarity", "text"].some(
      (k) => typeof input.card[k] !== "string",
    ) ||
    ["cost", "attack", "defense"].some(
      (k) =>
        typeof input.card[k] !== "number" || !Number.isFinite(input.card[k]),
    )
  )
    throw new Error("卡牌信息不完整");
  // operation cost was added later: older files get the usual 1
  if (input.card.operationCost === undefined) input.card.operationCost = 1;
  if (typeof input.card.operationCost !== "number" || !Number.isFinite(input.card.operationCost))
    throw new Error("卡牌信息不完整");
  const graphIds = new Set();
  for (const g of input.graphs) {
    if (
      typeof g.id !== "string" ||
      graphIds.has(g.id) ||
      typeof g.name !== "string" ||
      !Array.isArray(g.nodes) ||
      !Array.isArray(g.edges) ||
      g.nodes.length > 2000 ||
      g.edges.length > 10000
    )
      throw new Error("事件图结构无效或超出大小限制");
    graphIds.add(g.id);
    const nodes = new Map();
    for (const n of g.nodes) {
      if (
        typeof n.id !== "string" ||
        nodes.has(n.id) ||
        !Number.isFinite(n.x) ||
        !Number.isFinite(n.y) ||
        Math.abs(n.x) > 1e7 ||
        Math.abs(n.y) > 1e7
      )
        throw new Error("节点标识或位置无效");
      const d = n.definition;
      if (
        !d ||
        typeof d.name !== "string" ||
        !Array.isArray(d.pins) ||
        d.pins.length > 150 ||
        typeof d.category !== "string"
      )
        throw new Error("节点定义缺失");
      const pins = new Set();
      for (const p of d.pins) {
        if (
          typeof p.id !== "string" ||
          pins.has(p.id) ||
          typeof p.name !== "string" ||
          typeof p.type !== "string" ||
          !["in", "out"].includes(p.direction)
        )
          throw new Error("端口定义无效");
        pins.add(p.id);
      }
      if (
        n.values !== undefined &&
        (!n.values ||
          typeof n.values !== "object" ||
          Array.isArray(n.values) ||
          Object.values(n.values).some(
            (v) => !["string", "boolean", "number"].includes(typeof v),
          ))
      )
        throw new Error("节点参数值无效");
      n.values = n.values || {};
      n.title = typeof n.title === "string" ? n.title : "";
      n.comment = typeof n.comment === "string" ? n.comment : "";
      nodes.set(n.id, n);
    }
    const edgeIds = new Set(),
      inputs = new Set(),
      pairs = new Set(),
      execOutputs = new Set();
    for (const e of g.edges) {
      if (typeof e.id !== "string" || edgeIds.has(e.id))
        throw new Error("连接标识重复");
      edgeIds.add(e.id);
      const out = nodes
        .get(e.from?.node)
        ?.definition.pins.find(
          (p) => p.id === e.from.pin && p.direction === "out",
        );
      const into = nodes
        .get(e.to?.node)
        ?.definition.pins.find(
          (p) => p.id === e.to.pin && p.direction === "in",
        );
      if (
        !out ||
        !into ||
        !compatible(out.type, into.type) ||
        e.from.node === e.to.node
      )
        throw new Error("文件含有不存在或类型不匹配的连接");
      // Like Unreal: a data input takes one wire and an execution output leads to one place, but
      // an execution input can be the target of any number of execution outputs.
      const key = JSON.stringify(e.to),
        outkey = JSON.stringify(e.from),
        pair = key + outkey;
      if (
        (out.type !== "exec" && inputs.has(key)) ||
        (out.type === "exec" && execOutputs.has(outkey)) ||
        pairs.has(pair)
      )
        throw new Error("文件中有重复的输入或执行连接");
      pairs.add(pair);
      if (out.type !== "exec") inputs.add(key);
      if (out.type === "exec") execOutputs.add(outkey);
    }
    if (
      !g.view ||
      !Number.isFinite(g.view.x) ||
      !Number.isFinite(g.view.y) ||
      !Number.isFinite(g.view.zoom)
    )
      g.view = { x: 40, y: 0, zoom: 1 };
    g.view.zoom = Math.max(0.2, Math.min(2, g.view.zoom));
  }
  if (!graphIds.has(input.activeGraph)) input.activeGraph = input.graphs[0].id;
  validateBlueprint(input);
  syncDefinitions(input);
  return input;
}

// Gives every wildcard node (definition.wild holds its pin template) the concrete element type
// of whatever is wired to it; with nothing wired it goes back to wildcard.
// "Switch on Enum": its pins follow the chosen enum (or the enum wired into Selection).
function resolveEnumSwitches(graph) {
  for (const n of graph.nodes) {
    const d = n.definition;
    if (!d.switchEnum && !d.selectEnum && !d.enumCompare) continue;
    const selectors = d.selectEnum ? ["Index"] : d.enumCompare ? ["A", "B"] : ["Selection"];
    let wired = null;
    for (const e of graph.edges) {
      if (e.to.node !== n.id || !selectors.includes(e.to.pin)) continue;
      const t = graph.nodes.find((x) => x.id === e.from.node)?.definition.pins.find((p) => p.id === e.from.pin)?.type;
      if (t && enumTable[t]) wired = t;
    }
    if (wired) d.enumType = wired;
    if (d.enumType && !enumTable[d.enumType]) d.enumType = null;
    if (d.enumCompare) {
      d.pins = [...["A", "B"].map((id) => ({ id, name: id, type: d.enumType || WILD_ENUM, direction: "in" })), { id: "Result", name: "Result", type: "bool", direction: "out" }];
      continue;
    }
    if (d.selectEnum) {
      d.wild = [
        { id: "Index", name: "Index", type: d.enumType || WILD_ENUM, direction: "in" },
        ...(d.enumType ? enumTable[d.enumType] : []).map((v) => ({ id: `Value_${v}`, name: v, type: WILD, direction: "in" })),
        { id: "Result", name: "Result", type: WILD, direction: "out" },
      ];
      d.pins = d.wild.map((p) => ({ ...p }));
      continue;
    }
    const exec = d.pins.find((p) => p.id === "exec-in") || { id: "exec-in", name: "Exec", type: "exec", direction: "in" };
    d.pins = [
      exec,
      { id: "Selection", name: "Selection", type: d.enumType || WILD_ENUM, direction: "in" },
      ...(d.enumType ? enumTable[d.enumType] : []).map((v) => ({ id: "Case_" + v, name: v, type: "exec", direction: "out" })),
    ];
  }
}
export function resolveWildcards(graph) {
  resolveEnumSwitches(graph);
  const wilds = graph.nodes.filter((n) => Array.isArray(n.definition.wild));
  if (!wilds.length) return;
  // Start from the declared templates each time. Otherwise a cycle of wildcard nodes can
  // perpetuate a stale type after its last concrete connection has been removed.
  for (const node of wilds) node.definition.pins = node.definition.wild.map((pin) => ({ ...pin }));
  const typeOf = (id, pin) =>
    graph.nodes.find((x) => x.id === id)?.definition.pins.find((p) => p.id === pin)?.type;
  const resolve = (n) => {
    const template = n.definition.wild;
    let found = null;
    for (const e of graph.edges) {
      const mine = e.from.node === n.id ? e.from : e.to.node === n.id ? e.to : null;
      if (!mine) continue;
      const other = mine === e.from ? e.to : e.from,
        tpl = template.find((p) => p.id === mine.pin)?.type,
        theirs = typeOf(other.node, other.pin);
      if (!tpl?.includes(WILD) || !theirs || theirs.includes(WILD)) continue;
      const candidate = tpl.startsWith("TArray<") ? /^TArray<(.+)>$/.exec(theirs)?.[1] : theirs;
      if (candidate && !/^T(Array|Set)</.test(candidate)) {
        found = candidate;
        break;
      }
    }
    const pins = template.map((p) => ({ ...p, type: p.type.split(WILD).join(found ?? WILD) }));
    const same = pins.every((p, i) => p.type === n.definition.pins[i]?.type);
    if (!same) n.definition.pins = pins;
    return !same;
  };
  for (let pass = 0; pass <= wilds.length; pass++)
    if (!wilds.map(resolve).some(Boolean)) break;
}
