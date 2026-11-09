/* global localStorage, DOMPoint */
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function seed(page) {
 await page.goto("/index.html");
 await page.evaluate(async()=>{
  const {makeProject,makeNode,builtins,connect,resolveWildcards}=await import("/model.js"),{createWorkspace}=await import("/workspace.js");
  const p=makeProject(),g=p.graphs[0],a=makeNode(builtins.find(x=>x.name==="Integer"),0,100),b=makeNode(builtins.find(x=>x.name==="Integer"),0,350),c=makeNode(builtins.find(x=>x.id==="ue.MakeArray"),420,100);
  g.nodes=[a,b,c];connect(g,{node:a.id,pin:"Value"},{node:c.id,pin:"Item0"});resolveWildcards(g);
  localStorage.clear();createWorkspace(localStorage).load().save(p);
 });
 await page.reload();await expect(page.locator('.node')).toHaveCount(3);await page.locator('#fit').click();
}
test("Alt-click disconnects links, undo restores them, empty pin leaves redo intact",async({page})=>{
 await seed(page);const target=page.locator('[data-pin="Item0"]');await target.click({modifiers:['Alt']});await expect(page.locator('.edge')).toHaveCount(0);await expect(target).toHaveAttribute('title',/Wildcard/);
 await page.keyboard.press('Control+z');await expect(page.locator('.edge')).toHaveCount(1);await page.keyboard.press('Control+Shift+z');await expect(page.locator('.edge')).toHaveCount(0);await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z');await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z');
 await page.keyboard.press('Control+z');await expect(page.locator('#redo')).toBeEnabled();await page.locator('[data-pin="Item1"]').click({modifiers:['Alt']});await expect(page.locator('#redo')).toBeEnabled();
});
test("double clicking a wire inserts an undoable reroute and can disconnect it",async({page})=>{
 await seed(page);const path=page.locator('.edge').first();const point=await path.evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()/2),m=e.getScreenCTM(),q=new DOMPoint(p.x,p.y).matrixTransform(m);return {x:q.x,y:q.y};});
 await page.mouse.dblclick(point.x,point.y);await expect(page.locator('.ue-reroute')).toHaveCount(1);await expect(page.locator('#modal')).not.toHaveAttribute('open');await expect(page.locator('.edge')).toHaveCount(2);
 await page.locator('#export-format').click();await page.locator('[data-format="svg"]').click();const download=page.waitForEvent('download');await page.locator('#export').click();const svg=await readFile(await (await download).path(),'utf8');expect(svg).toContain('rx="12" fill="#333"');
 await page.keyboard.press('Control+z');await expect(page.locator('.ue-reroute')).toHaveCount(0);await expect(page.locator('.edge')).toHaveCount(1);await page.keyboard.press('Control+Shift+z');await expect(page.locator('.ue-reroute')).toHaveCount(1);
 await page.locator('#viewport').focus();await page.keyboard.press('Control+a');await page.locator('#copy-nodes').dispatchEvent('click');await page.locator('#paste-nodes').dispatchEvent('click');await expect(page.locator('.ue-reroute')).toHaveCount(2);await expect(page.locator('.edge')).toHaveCount(4);await page.keyboard.press('Control+z');await expect(page.locator('.ue-reroute')).toHaveCount(1);await expect(page.locator('.edge')).toHaveCount(2);
});
test("selected nodes can align and graph search selects results",async({page})=>{
 await seed(page);const before=await page.locator('.node').evaluateAll(es=>es.map(e=>e.style.top));await page.locator('#viewport').click({position:{x:15,y:260}});await page.keyboard.press('Control+a');await page.locator('#align-nodes').selectOption('startY');
 const tops=await page.locator('.node').evaluateAll(es=>es.map(e=>e.style.top));expect(new Set(tops).size).toBe(1);await page.keyboard.press('Control+z');await expect.poll(()=>page.locator('.node').evaluateAll(es=>es.map(e=>e.style.top))).toEqual(before);
 await page.locator('#graph-find').click();await page.locator('#find-query').fill('Make Array');await expect(page.locator('#find-count')).toContainText('1');await page.locator('#find-next').click();await expect(page.locator('.node.selected')).toContainText(/Make Array|构造数组/);
});
test("dragging a selected wire endpoint reconnects it and undo restores the original",async({page})=>{
 await seed(page);const sources=page.locator('.node').filter({hasText:'Integer'});const original=await sources.nth(0).getAttribute('data-node-id'),replacement=await sources.nth(1).getAttribute('data-node-id');
 const path=page.locator('.edge').first(),point=await path.evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()/2),q=new DOMPoint(p.x,p.y).matrixTransform(e.getScreenCTM());return {x:q.x,y:q.y};});await page.mouse.click(point.x,point.y);
 await page.waitForTimeout(300);const handle=page.locator('[data-rewire="from"]'),other=sources.nth(1).locator('[data-pin="Value"]');await expect(handle).toBeVisible();const h=await handle.boundingBox(),p=await other.boundingBox();
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(p.x+p.width/2,p.y+p.height/2,{steps:8});await page.mouse.up();
 const source=()=>page.evaluate(()=>{const index=JSON.parse(localStorage.getItem('kards-blueprint-studio.workspace'));return JSON.parse(localStorage.getItem('kards-blueprint-studio.card.'+index.active)).graphs[0].edges[0].from.node;});
 await expect.poll(source).toBe(replacement);await page.keyboard.press('Control+z');await expect.poll(source).toBe(original);
});
test.describe('phone toolbar',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true});
 test('search, alignment and details remain reachable on a narrow screen',async({page})=>{
  await page.goto('/index.html');await expect(page.locator('#project-name')).not.toHaveValue('');
  const toolbar=page.locator('.canvas-toolbar .canvas-tools');await expect(page.locator('#graph-find')).toBeVisible();await page.locator('#graph-find').click();await expect(page.locator('#find-query')).toBeVisible();await page.locator('#close-modal').click();
  await page.locator('#align-nodes').scrollIntoViewIfNeeded();await expect(page.locator('#align-nodes')).toBeVisible();await page.locator('#toggle-inspector').scrollIntoViewIfNeeded();await page.locator('#toggle-inspector').click();await expect(page.locator('#inspector')).toHaveClass(/mobile-open/);
  const bounds=await toolbar.boundingBox();expect(bounds.x+bounds.width).toBeLessThanOrEqual(391);
 });
});
test("connecting an execution wire to a data reroute never deletes the existing wire",async({page})=>{
 await page.goto('/index.html');await page.evaluate(async()=>{
  const {makeProject,makeNode,builtins,connect,resolveWildcards}=await import('/model.js'),{rerouteDefinition}=await import('/graph-edit.js'),{createWorkspace}=await import('/workspace.js');
  const p=makeProject(),g=p.graphs[0],branch=makeNode(builtins.find(d=>d.name==='Branch'),0,100),reroute=makeNode(rerouteDefinition('$R'),350,100),array=makeNode(builtins.find(d=>d.id==='ue.MakeArray'),650,100);
  g.nodes=[branch,reroute,array];connect(g,{node:reroute.id,pin:'out'},{node:array.id,pin:'Item0'});resolveWildcards(g);localStorage.clear();createWorkspace(localStorage).load().save(p);
 });await page.reload();await expect(page.locator('.edge')).toHaveCount(1);
 await page.locator('[data-pin="True"]').dispatchEvent('pointerdown',{button:0});await page.locator('.ue-reroute [data-pin="in"]').dispatchEvent('pointerdown',{button:0});
 await expect(page.locator('#toast')).toContainText('现有连线不兼容');await expect(page.locator('.edge')).toHaveCount(1);await expect(page.locator('.ue-reroute [data-pin="out"]')).toHaveAttribute('title',/\$R/);
});
test('Alt-click removes every wire from one output in one undo step',async({page})=>{
 await seed(page);await expect(page.locator("#save-state")).toHaveText(/已保存/);await page.evaluate(async()=>{const {connect,resolveWildcards}=await import('/model.js');const idx=JSON.parse(localStorage.getItem('kards-blueprint-studio.workspace')),key='kards-blueprint-studio.card.'+idx.active,p=JSON.parse(localStorage.getItem(key)),g=p.graphs[0],src=g.nodes[0],arr=g.nodes[2];connect(g,{node:src.id,pin:'Value'},{node:arr.id,pin:'Item1'});resolveWildcards(g);localStorage.setItem(key,JSON.stringify(p));});
 await page.reload();await expect(page.locator('.edge')).toHaveCount(2);await page.locator('.node').filter({hasText:'Integer'}).first().locator('[data-pin="Value"]').click({modifiers:['Alt']});await expect(page.locator('.edge')).toHaveCount(0);await page.keyboard.press('Control+z');await expect(page.locator('.edge')).toHaveCount(2);
});
test('reconnecting an unconstrained wildcard wire can change its type',async({page})=>{
 await seed(page);await expect(page.locator("#save-state")).toHaveText(/已保存/);await page.evaluate(async()=>{const {makeNode,builtins}=await import('/model.js');const idx=JSON.parse(localStorage.getItem('kards-blueprint-studio.workspace')),key='kards-blueprint-studio.card.'+idx.active,p=JSON.parse(localStorage.getItem(key));p.graphs[0].nodes.push(makeNode(builtins.find(n=>n.name==='Boolean'),0,500));localStorage.setItem(key,JSON.stringify(p));});
 await page.reload();await page.locator('#fit').click();const path=page.locator('.edge').first(),point=await path.evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()/2),q=new DOMPoint(p.x,p.y).matrixTransform(e.getScreenCTM());return {x:q.x,y:q.y};});await page.mouse.click(point.x,point.y);await page.waitForTimeout(250);
 const handle=await page.locator('[data-rewire="from"]').boundingBox(),pin=await page.locator('.node').filter({hasText:'Boolean'}).locator('[data-pin="Value"]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(pin.x+pin.width/2,pin.y+pin.height/2,{steps:8});await page.mouse.up();
 await expect(page.locator('[data-pin="Item0"]')).toHaveAttribute('title',/bool/);await page.keyboard.press('Control+z');await expect(page.locator('[data-pin="Item0"]')).toHaveAttribute('title',/int32/);
});

test('graph search accepts Chinese while the interface is English',async({page})=>{
 await seed(page);await page.locator('#lang-select').selectOption('en');await page.locator('#graph-find').click();await page.locator('#find-query').fill('构造数组');await expect(page.locator('#find-count')).toContainText('1');await page.locator('#find-next').click();await expect(page.locator('.node.selected')).toContainText('Make Array');
});
test('disconnecting a selected wire clears its stale selection',async({page})=>{
 await seed(page);const path=page.locator('.edge').first(),point=await path.evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()/2),q=new DOMPoint(p.x,p.y).matrixTransform(e.getScreenCTM());return {x:q.x,y:q.y};});await page.mouse.click(point.x,point.y);await expect(page.locator('[data-rewire]')).toHaveCount(2);
 await page.locator('[data-pin="Item0"]').click({modifiers:['Alt']});await expect(page.locator('.edge')).toHaveCount(0);await expect(page.locator('[data-rewire]')).toHaveCount(0);await expect(page.locator('#selection-status')).not.toContainText('已选中连接');
});
test('dragging a wire target changes the destination and undo restores it',async({page})=>{
 await seed(page);const path=page.locator('.edge').first(),point=await path.evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()/2),q=new DOMPoint(p.x,p.y).matrixTransform(e.getScreenCTM());return {x:q.x,y:q.y};});await page.mouse.click(point.x,point.y);await page.waitForTimeout(300);
 const handle=await page.locator('[data-rewire="to"]').boundingBox(),target=await page.locator('[data-pin="Item1"]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});await page.mouse.up();
 const destination=()=>page.evaluate(()=>{const index=JSON.parse(localStorage.getItem('kards-blueprint-studio.workspace'));return JSON.parse(localStorage.getItem('kards-blueprint-studio.card.'+index.active)).graphs[0].edges[0].to.pin;});await expect.poll(destination).toBe('Item1');await page.keyboard.press('Control+z');await expect.poll(destination).toBe('Item0');
});
