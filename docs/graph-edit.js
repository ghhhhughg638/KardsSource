import { clone, connect, makeNode, resolveWildcards, uid } from "./model.js";

export function disconnectPin(graph, endpoint) {
  const kept = graph.edges.filter((e) => !(e.from.node === endpoint.node && e.from.pin === endpoint.pin || e.to.node === endpoint.node && e.to.pin === endpoint.pin));
  if (kept.length === graph.edges.length) return false;
  graph.edges = kept; return true;
}
export function rerouteDefinition(type) {
  return { id:"studio.Reroute", name:"Reroute", label:"重定向", class:"Studio", category:"flow", kind:"reroute", reroute:true,
    pins:[{id:"in",name:"Input",type,direction:"in"},{id:"out",name:"Output",type,direction:"out"}] };
}
export function insertReroute(graph, edgeId, x, y) {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  if (graph.nodes.length >= 2000 || graph.edges.length >= 10000) throw new Error("蓝图已达到节点或连线数量上限");
  const pin = graph.nodes.find((n) => n.id === edge.from.node)?.definition.pins.find((p) => p.id === edge.from.pin);
  if (!pin) throw new Error("无法找到连线的来源引脚");
  const node = makeNode(rerouteDefinition(pin.type), Math.round(x / 10) * 10, Math.round(y / 10) * 10);
  graph.nodes.push(node);
  graph.edges = graph.edges.filter((e) => e.id !== edgeId);
  graph.edges.push({ id: uid(), from: clone(edge.from), to: { node: node.id, pin:"in" } }, { id: uid(), from:{node:node.id,pin:"out"}, to:clone(edge.to) });
  return node;
}
export function reconnectEdge(graph, edgeId, side, endpoint) {
  const original = graph.edges.find((e) => e.id === edgeId);
  if (!original || !["from", "to"].includes(side)) return null;
  if (original[side].node === endpoint.node && original[side].pin === endpoint.pin) return null;
  const copy = clone(graph);
  copy.edges = copy.edges.filter((e) => e.id !== edgeId);
  // Infer against the graph without the moving wire, so a now-unconstrained wildcard can change type.
  resolveWildcards(copy);
  const from = side === "from" ? endpoint : original.from, to = side === "to" ? endpoint : original.to;
  const fn=copy.nodes.find((n)=>n.id===from.node)?.definition.pins.find((p)=>p.id===from.pin);
  const tn=copy.nodes.find((n)=>n.id===to.node)?.definition.pins.find((p)=>p.id===to.pin);
  if (fn?.direction !== "out" || tn?.direction !== "in") throw new Error("请将输出端口连接到输入端口");
  if (!connect(copy, from, to)) throw new Error("该连线已存在");
  copy.edges[copy.edges.length-1].id = edgeId;
  return copy;
}
export function alignNodes(nodes, mode, sizeOf) {
  if (nodes.length < (mode.startsWith("distribute") ? 3 : 2)) return false;
  const rects=nodes.map((n)=>({n,...sizeOf(n)}));
  const axis=mode.endsWith("X") ? "x" : "y", dimension=axis==="x"?"width":"height";
  const before=nodes.map((n)=>`${n.x},${n.y}`).join(";");
  if (mode.startsWith("distribute")) {
    rects.sort((a,b)=>a.n[axis]-b.n[axis]);
    const first=rects[0].n[axis], last=rects.at(-1).n[axis]+rects.at(-1)[dimension];
    const gap=(last-first-rects.reduce((sum,r)=>sum+r[dimension],0))/(rects.length-1);
    let pos=first; for (const r of rects) {r.n[axis]=Math.round(pos);pos+=r[dimension]+gap;}
  } else {
    const high=mode.startsWith("end"), edge=high?Math.max(...rects.map(r=>r.n[axis]+r[dimension])):Math.min(...rects.map(r=>r.n[axis]));
    for (const r of rects) r.n[axis]=Math.round(high?edge-r[dimension]:edge);
  }
  return before!==nodes.map((n)=>`${n.x},${n.y}`).join(";");
}
