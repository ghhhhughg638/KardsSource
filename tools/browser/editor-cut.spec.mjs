/* global localStorage, Storage */
import { test, expect } from "@playwright/test";

async function seedEditor(page) {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    const { makeProject, makeNode, builtins, connect } = await import("/model.js");
    const { customEventDefinition } = await import("/blueprint.js");
    const { createWorkspace } = await import("/workspace.js");
    const p = makeProject(), g = p.graphs[0];
    const event = makeNode(customEventDefinition("MyEvent", []), 0, 100);
    const branch = makeNode(builtins.find((n) => n.name === "Branch"), 350, 100);
    const sequence = makeNode(builtins.find((n) => n.name === "Sequence"), 700, 100);
    g.nodes = [event, branch, sequence];
    connect(g, { node: branch.id, pin: "True" }, { node: sequence.id, pin: "exec-in" });
    localStorage.clear(); createWorkspace(localStorage).load().save(p);
  });
  await page.reload();
  await expect(page.locator(".node")).toHaveCount(3);
  await page.locator("#viewport").click({ position: { x: 20, y: 250 } });
  await page.keyboard.press("Control+a");
  await expect(page.locator(".node.selected")).toHaveCount(3);
}

test("cut preserves custom events and removes exactly the copied nodes, with undo", async ({ page }) => {
  await seedEditor(page);
  await page.keyboard.press("Control+x");
  await expect(page.locator(".node")).toHaveCount(1);
  await expect(page.locator(".node")).toContainText("MyEvent");
  const clip = await page.evaluate(() => JSON.parse(localStorage.getItem("kards-blueprint-studio.clipboard")));
  expect(clip.nodes).toHaveLength(2);
  expect(clip.edges).toHaveLength(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".node")).toHaveCount(3);
});

test("cut keeps every node when clipboard storage fails", async ({ page }) => {
  await seedEditor(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "kards-blueprint-studio.clipboard") throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.keyboard.press("Control+x");
  await expect(page.locator(".node")).toHaveCount(3);
  await expect(page.locator("#toast")).toContainText("无法保存复制的节点");
});

test("copy toolbar still copies the selected nodes", async ({ page }) => {
  await seedEditor(page);
  await page.locator("#copy-nodes").dispatchEvent("click");
  const clip = await page.evaluate(() => JSON.parse(localStorage.getItem("kards-blueprint-studio.clipboard")));
  expect(clip.nodes).toHaveLength(2);
  await expect(page.locator(".node")).toHaveCount(3);
});
