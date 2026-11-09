/* global localStorage */
import { test, expect } from "@playwright/test";

test("disconnecting the last concrete input resets a wildcard cycle and undo restores it", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    const { makeProject, makeNode, builtins, connect, resolveWildcards } = await import("/model.js");
    const { createWorkspace } = await import("/workspace.js");
    const project = makeProject(), graph = project.graphs[0];
    const number = makeNode(builtins.find((d) => d.name === "Integer"), 0, 100);
    const array = makeNode(builtins.find((d) => d.id === "ue.MakeArray"), 350, 100);
    const get = makeNode(builtins.find((d) => d.id === "ue.GetArrayItem"), 700, 100);
    graph.nodes = [number, array, get];
    connect(graph, { node: number.id, pin: "Value" }, { node: array.id, pin: "Item1" }); resolveWildcards(graph);
    connect(graph, { node: array.id, pin: "Array" }, { node: get.id, pin: "Array" }); resolveWildcards(graph);
    connect(graph, { node: get.id, pin: "Item" }, { node: array.id, pin: "Item0" }); resolveWildcards(graph);
    localStorage.clear(); createWorkspace(localStorage).load().save(project);
  });
  await page.reload();
  const source = page.locator('[data-pin="Item1"]');
  const getItem = page.locator('[data-pin="Item"]');
  await expect(source).toHaveAttribute("title", /int32/);
  await source.dispatchEvent("contextmenu", { button: 2 });
  await page.locator("#pin-disconnect").click();
  await expect(source).toHaveAttribute("title", /Wildcard/);
  await expect(getItem).toHaveAttribute("title", /Wildcard/);
  await expect(page.locator(".edge")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(source).toHaveAttribute("title", /int32/);
  await expect(getItem).toHaveAttribute("title", /int32/);
  await expect(page.locator(".edge")).toHaveCount(3);
  await page.keyboard.press("Control+Shift+z");
  await expect(source).toHaveAttribute("title", /Wildcard/);
});
