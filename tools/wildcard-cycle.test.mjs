import test from "node:test";
import assert from "node:assert/strict";
import { makeGraph, makeNode, connect, resolveWildcards, builtins } from "../docs/model.js";

function linkedCycle() {
  const graph = makeGraph();
  const array = makeNode(builtins.find((d) => d.id === "ue.MakeArray"), 0, 0);
  const get = makeNode(builtins.find((d) => d.id === "ue.GetArrayItem"), 400, 0);
  const number = makeNode(builtins.find((d) => d.name === "Integer"), -300, 0);
  graph.nodes.push(number, array, get);
  connect(graph, { node: number.id, pin: "Value" }, { node: array.id, pin: "Item1" });
  resolveWildcards(graph);
  connect(graph, { node: array.id, pin: "Array" }, { node: get.id, pin: "Array" });
  resolveWildcards(graph);
  connect(graph, { node: get.id, pin: "Item" }, { node: array.id, pin: "Item0" });
  resolveWildcards(graph);
  return { graph, number, array, get };
}
const type = (node, pin) => node.definition.pins.find((p) => p.id === pin).type;

test("a wildcard cycle forgets its type after its last concrete source is disconnected", () => {
  const { graph, number, array, get } = linkedCycle();
  assert.equal(type(array, "Array"), "TArray<int32>");
  assert.equal(type(get, "Item"), "int32");
  graph.edges = graph.edges.filter((edge) => edge.from.node !== number.id);
  resolveWildcards(graph);
  assert.equal(type(array, "Array"), "TArray<$T>");
  assert.equal(type(get, "Item"), "$T");
  const boolean = makeNode(builtins.find((d) => d.name === "Boolean"), -300, 0);
  graph.nodes.push(boolean);
  connect(graph, { node: boolean.id, pin: "Value" }, { node: array.id, pin: "Item1" });
  resolveWildcards(graph);
  assert.equal(type(array, "Array"), "TArray<bool>");
  assert.equal(type(get, "Item"), "bool");
});
