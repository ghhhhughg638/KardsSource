import test from "node:test";
import assert from "node:assert/strict";
import {saveReferenceDraft,readReferenceDraft,staleReferenceDrafts,removeReferenceDraft} from "../docs/reference-drafts.js";
function storage(){const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)??null,removeItem:k=>data.delete(k)};}
test("reference drafts restore per card, mode and source without overwriting older data",()=>{
 const s=storage(),p={graphs:[{nodes:[{x:10,values:{Amount:3}}]}]};saveReferenceDraft(s,"card","expanded","old",p);saveReferenceDraft(s,"card","compact","old",{name:"compact"});saveReferenceDraft(s,"card","expanded","new",{name:"new"});
 assert.deepEqual(readReferenceDraft(s,"card","expanded","old").project,p);assert.equal(staleReferenceDrafts(s,"card","expanded","new").length,1);removeReferenceDraft(s,"card","expanded","new");assert.deepEqual(readReferenceDraft(s,"card","expanded","old").project,p);assert.equal(readReferenceDraft(s,"card","compact","old").project.name,"compact");
});
test("a failed write preserves the previous draft",()=>{const s=storage();saveReferenceDraft(s,"c","expanded","hash",{v:1});const set=s.setItem;s.setItem=()=>{throw new Error("quota");};assert.throws(()=>saveReferenceDraft(s,"c","expanded","hash",{v:2}));s.setItem=set;assert.equal(readReferenceDraft(s,"c","expanded","hash").project.v,1);});
