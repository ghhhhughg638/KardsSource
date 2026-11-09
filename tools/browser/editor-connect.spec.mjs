/* global localStorage */
import { test, expect } from "@playwright/test";

async function seedUndoableGraph(page) {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    const { makeProject, makeNode, builtins, connect } = await import("/model.js");
    const { createWorkspace } = await import("/workspace.js");
    const p = makeProject(), g = p.graphs[0];
    const branch = makeNode(builtins.find((n) => n.name === "Branch"), 100, 100);
    const sequence = makeNode(builtins.find((n) => n.name === "Sequence"), 500, 100);
    g.nodes = [branch, sequence];
    connect(g, { node: branch.id, pin: "True" }, { node: sequence.id, pin: "exec-in" });
    localStorage.clear(); createWorkspace(localStorage).load().save(p);
  });
  await page.reload();
  await expect(page.locator(".node")).toHaveCount(2);
  await page.locator("#viewport").click({ position: { x: 20, y: 250 } });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(page.locator(".node")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".node")).toHaveCount(2);
  await expect(page.locator("#redo")).toBeEnabled();
}

async function link(page, fromPin, toPin, toNode) {
  await page.locator(`[data-pin="${fromPin}"]`).dispatchEvent("pointerdown", { button: 0 });
  await page.locator(".node").filter({ hasText: toNode }).locator(`[data-pin="${toPin}"]`).dispatchEvent("pointerdown", { button: 0 });
}

test("invalid pin connection does not erase redo history", async ({ page }) => {
  await seedUndoableGraph(page);
  await link(page, "Then0", "Condition", "Branch");
  await expect(page.locator("#toast")).toContainText("类型不匹配");
  await expect(page.locator("#redo")).toBeEnabled();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".node")).toHaveCount(0);
});

test("connecting an existing edge does not erase redo history", async ({ page }) => {
  await seedUndoableGraph(page);
  await link(page, "True", "exec-in", "Sequence");
  await expect(page.locator("#redo")).toBeEnabled();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".node")).toHaveCount(0);
});

test("a new connection is undoable and clears obsolete redo history", async ({ page }) => {
  await seedUndoableGraph(page);
  await link(page, "False", "exec-in", "Sequence");
  await expect(page.locator("#redo")).toBeDisabled();
  await expect(page.locator(".edge")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".edge")).toHaveCount(1);
  await expect(page.locator("#redo")).toBeEnabled();
});
