/* global localStorage, Storage */
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("reference layout is saved per card, restored after reload and can be reset",async({page})=>{
 await page.goto('/reference.html#ffc141adeef542f6');await expect(page.locator('.ref-node').first()).toBeVisible();
 const node=page.locator('.ref-node').first(),head=await node.locator('.node-head').boundingBox(),before=await node.evaluate(e=>({left:e.style.left,top:e.style.top}));
 await page.mouse.move(head.x+25,head.y+head.height/2);await page.mouse.down();await page.mouse.move(head.x+100,head.y+head.height/2+50,{steps:8});await page.mouse.up();
 const after=await node.evaluate(e=>({left:e.style.left,top:e.style.top}));expect(after).not.toEqual(before);
 const keys=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('kards-blueprint-studio.reference-draft.')));expect(keys.length).toBe(1);
 await page.reload();await expect(page.locator('.ref-node').first()).toBeVisible();await expect.poll(()=>page.locator('.ref-node').first().evaluate(e=>({left:e.style.left,top:e.style.top}))).toEqual(after);
 page.once('dialog',d=>d.accept());await page.locator('#ref-reset-draft').click();await expect.poll(()=>page.locator('.ref-node').first().evaluate(e=>({left:e.style.left,top:e.style.top}))).not.toEqual(after);
});
test("reference node search counts and cycles through matching nodes",async({page})=>{
 await page.goto('/reference.html#ffc141adeef542f6');await expect(page.locator('.ref-node').first()).toBeVisible();
 const firstName=await page.locator('.ref-node .node-subtitle').first().textContent();await page.locator('#ref-find').fill(firstName.trim());await expect(page.locator('#ref-find-count')).not.toBeEmpty();await expect(page.locator('.ref-node.selected')).toHaveCount(1);
});
test("older source drafts remain available for export instead of being overwritten",async({page})=>{
 await page.goto('/reference.html#ffc141adeef542f6');await expect(page.locator('.ref-node').first()).toBeVisible();const node=page.locator('.ref-node').first(),head=await node.locator('.node-head').boundingBox();
 await page.mouse.move(head.x+25,head.y+head.height/2);await page.mouse.down();await page.mouse.move(head.x+95,head.y+head.height/2+35,{steps:6});await page.mouse.up();
 const oldKey=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('kards-blueprint-studio.reference-draft.'));const old=key.replace(/\.[^.]+$/,'.older-source');localStorage.setItem(old,localStorage.getItem(key));localStorage.removeItem(key);return old;});
 await page.reload();await expect(page.locator('#ref-status')).toContainText('原版数据已更新');await expect(page.locator('#ref-export-draft')).toBeVisible();await expect(page.locator('#ref-draft-history')).toHaveValue(oldKey);
 const download=page.waitForEvent('download');await page.locator('#ref-export-draft').click();const file=await download;expect(file.suggestedFilename()).toContain('.kardsbp.json');expect(JSON.parse(await readFile(await file.path(),'utf8')).format).toBe('kards-blueprint');expect(await page.evaluate(key=>!!localStorage.getItem(key),oldKey)).toBe(true);
});
test("a reference draft write failure reports the problem and keeps the page editable",async({page})=>{
 await page.goto('/reference.html#ffc141adeef542f6');await expect(page.locator('.ref-node').first()).toBeVisible();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('kards-blueprint-studio.reference-draft.'))throw new DOMException('full','QuotaExceededError');return original.call(this,k,v);};});
 const node=page.locator('.ref-node').first(),head=await node.locator('.node-head').boundingBox(),before=await node.evaluate(e=>e.style.left);
 await page.mouse.move(head.x+25,head.y+head.height/2);await page.mouse.down();await page.mouse.move(head.x+100,head.y+head.height/2+40,{steps:8});await page.mouse.up();
 await expect(page.locator('#ref-status')).toContainText('未保存');expect(await node.evaluate(e=>e.style.left)).not.toBe(before);await expect(page.locator('#ref-export')).toBeEnabled();
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#ref-mode').selectOption('compact');await expect(page.locator('#ref-mode')).toHaveValue('expanded');expect(await node.evaluate(e=>e.style.left)).not.toBe(before);
});
test("reference parameter changes survive reload and card switching",async({page})=>{
 await page.goto('/reference.html');await expect(page.locator('#ref-total')).toHaveText('2019 个');await page.locator('#ref-search').fill('EnumCompareFaction');await page.locator('#ref-cards .ref-card').first().click();await expect(page.locator('.ref-node').first()).toBeVisible();
 let found=false, selected, nodeId, pinId, graphId;
 for(let i=0;i<await page.locator('#ref-graph option').count();i++){
  await page.locator('#ref-graph').selectOption({index:i});const controls=page.locator('[data-node-value][data-pin-value]');
  for(let j=0;j<await controls.count();j++){
   const control=controls.nth(j),tag=await control.evaluate(e=>e.tagName),type=await control.getAttribute('type');
   if(tag==='SELECT'&&await control.locator('option').count()>1){selected=await control.locator('option').nth(1).getAttribute('value');await control.selectOption(selected);}
   else if(tag==='INPUT'&&(type==='text'||type==='number')){selected=type==='number'?'37':'DraftValue';await control.fill(selected);await control.dispatchEvent('change');}
   else continue;
   nodeId=await control.getAttribute('data-node-value');pinId=await control.getAttribute('data-pin-value');graphId=await page.locator('#ref-graph').inputValue();found=true;break;
  } if(found)break;
 }
 expect(found).toBe(true);const returnUrl=page.url();await page.goto('/reference.html#1a1410e4609e6a61');await expect(page.locator('.ref-node').first()).toBeVisible();await page.goto(returnUrl);await expect(page.locator('#ref-graph')).toHaveValue(graphId);await expect(page.locator(`[data-node-value="${nodeId}"][data-pin-value="${pinId}"]`)).toHaveValue(selected);
});
test.describe('touch multiselect',()=>{
 test.use({hasTouch:true,viewport:{width:1000,height:900}});
 test('dragging in multi-select mode boxes reference nodes',async({page})=>{
  await page.goto('/reference.html#ffc141adeef542f6');await expect(page.locator('.ref-node').first()).toBeVisible();await page.locator('#ref-more').click();await page.locator('#ref-multi').click();
  const node=page.locator('.ref-node').first(),box=await node.boundingBox(),vp=await page.locator('#ref-viewport').boundingBox();
  const start={x:Math.max(vp.x+3,box.x-8),y:Math.max(vp.y+3,box.y-8)},end={x:Math.min(vp.x+vp.width-3,box.x+20),y:Math.min(vp.y+vp.height-3,box.y+20)};
  const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(node).toHaveClass(/selected/);
 });
});
test.describe('phone reference navigation',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true});
 test('the graph search and previous / next controls stay usable',async({page})=>{
  await page.goto('/reference.html#ffc141adeef542f6');await expect(page.locator('.ref-node').first()).toBeVisible();const name=(await page.locator('.ref-node .node-subtitle').first().textContent()).trim();
  await expect(page.locator('#ref-find')).toBeVisible();await page.locator('#ref-find').fill(name);await expect(page.locator('#ref-find-count')).not.toBeEmpty();await expect(page.locator('#ref-find-next')).toBeInViewport();await page.locator('#ref-find-next').click();
 });
});
test('reference drafts are isolated by display mode and restored when switching back',async({page})=>{
 await page.goto('/reference.html#ffc141adeef542f6');await expect(page.locator('.ref-node').first()).toBeVisible();const node=page.locator('.ref-node').first(),head=await node.locator('.node-head').boundingBox();
 await page.mouse.move(head.x+25,head.y+head.height/2);await page.mouse.down();await page.mouse.move(head.x+105,head.y+head.height/2+45,{steps:8});await page.mouse.up();const saved=await node.evaluate(e=>({left:e.style.left,top:e.style.top}));
 await page.locator('#ref-mode').selectOption('compact');await page.locator('#ref-mode').selectOption('expanded');await expect.poll(()=>page.locator('.ref-node').first().evaluate(e=>({left:e.style.left,top:e.style.top}))).toEqual(saved);
});
