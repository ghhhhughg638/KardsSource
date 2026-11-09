/* global localStorage */
import { test, expect } from "@playwright/test";

async function seedFunction(page, pure = false) {
  await page.goto("/index.html");
  await page.evaluate(async ({ pure }) => {
    const { makeProject, makeNode, builtins } = await import("/model.js");
    const { makeFunctionGraph } = await import("/blueprint.js");
    const { createWorkspace } = await import("/workspace.js");
    const p = makeProject(), fn = makeFunctionGraph("Calculate", { pure, outputs: [{ name: "Value", type: "int32" }] });
    fn.nodes.push(makeNode(builtins.find((n) => n.name === "Integer"), 350, 300));
    p.graphs.push(fn); p.activeGraph = fn.id;
    localStorage.clear(); createWorkspace(localStorage).load().save(p);
  }, { pure });
  await page.reload();
  await expect(page.locator(".node")).toHaveCount(3);
}
async function select(page, name) {
  await page.locator(".node").filter({ hasText: name }).locator(".node-head").dispatchEvent("pointerdown", { button: 0 });
  await page.dispatchEvent("#viewport", "pointerup", { button: 0 });
}

test("duplicating a function Return Node makes an extra deletable return", async ({ page }) => {
  await seedFunction(page);
  await select(page, "Return Node");
  await page.keyboard.press("Control+d");
  await expect(page.locator(".node")).toHaveCount(4);
  await page.keyboard.press("Delete");
  await expect(page.locator(".node")).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".node")).toHaveCount(4);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".node")).toHaveCount(3);
});

test("trying to delete a fixed entry preserves redo history", async ({ page }) => {
  await seedFunction(page);
  await select(page, "Integer"); await page.keyboard.press("Delete"); await page.keyboard.press("Control+z");
  await expect(page.locator("#redo")).toBeEnabled();
  await select(page, "函数入口"); await page.keyboard.press("Delete");
  await expect(page.locator(".node")).toHaveCount(3);
  await expect(page.locator("#redo")).toBeEnabled();
  await page.keyboard.press("Control+Shift+z"); await expect(page.locator(".node")).toHaveCount(2);
});

test("trying to duplicate a pure function Return Node preserves redo history", async ({ page }) => {
  await seedFunction(page, true);
  await select(page, "Integer"); await page.keyboard.press("Delete"); await page.keyboard.press("Control+z");
  await select(page, "Return Node"); await page.keyboard.press("Control+d");
  await expect(page.locator(".node")).toHaveCount(3);
  await expect(page.locator("#redo")).toBeEnabled();
  await page.keyboard.press("Control+Shift+z"); await expect(page.locator(".node")).toHaveCount(2);
});
