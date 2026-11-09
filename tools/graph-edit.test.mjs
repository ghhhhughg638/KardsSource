import test from "node:test";
import assert from "node:assert/strict";
import { makeProject, makeNode, builtins, connect, resolveWildcards, validateProject, clone } from "../docs/model.js";
import { buildExport } from "../docs/blueprint.js";
import { disconnectPin, insertReroute, reconnectEdge, alignNodes } from "../docs/graph-edit.js";
const fixture = () => {
 const project=makeProject(),g=project.graphs[0],a=makeNode(builtins.find(n=>n.name==="Integer"),0,0),b=makeNode(builtins.find(n=>n.name==="Integer"),0,100),array=makeNode(builtins.find(n=>n.id==="ue.MakeArray"),300,0);
 g.nodes.push(a,b,array);connect(g,{node:a.id,pin:"Value"},{node:array.id,pin:"Item0"});resolveWildcards(g);return {project,g,a,b,array};
};
test("reroute preserves data connections, inference, import and disconnected wildcard",()=>{
 const {project,g,a,array}=fixture(),edge=g.edges[0],node=insertReroute(g,edge.id,150,50);resolveWildcards(g);
 assert.equal(g.edges.length,2);assert.equal(node.definition.pins[0].type,"int32");validateProject(clone(project));const roundTrip=validateProject(clone(buildExport(project)));assert.equal(roundTrip.graphs[0].edges.length,2);assert(roundTrip.graphs[0].nodes.some(n=>n.definition.reroute));
 assert(disconnectPin(g,{node:a.id,pin:"Value"}));disconnectPin(g,{node:array.id,pin:"Item0"});resolveWildcards(g);assert.equal(node.definition.pins[0].type,"$R");const exported=validateProject(clone(project));assert.equal(exported.graphs[0].nodes.find(n=>n.id===node.id).definition.pins[0].type,"$R");assert(!JSON.stringify(buildExport(project).dependencies).includes("$R"));
});
test("reroute supports execution and its single-output constraint",()=>{
 const p=makeProject(),g=p.graphs[0],a=makeNode(builtins.find(n=>n.name==="Branch"),0,0),b=makeNode(builtins.find(n=>n.name==="Sequence"),300,0),c=makeNode(builtins.find(n=>n.name==="Sequence"),600,0);g.nodes=[a,b,c];connect(g,{node:a.id,pin:"True"},{node:b.id,pin:"exec-in"});const n=insertReroute(g,g.edges[0].id,100,0);resolveWildcards(g);assert.equal(n.definition.pins[0].type,"exec");connect(g,{node:n.id,pin:"out"},{node:c.id,pin:"exec-in"});assert.equal(g.edges.length,2);validateProject(clone(p));
});
test("rewiring is atomic, preserves id and leaves invalid attempts unchanged",()=>{
 const {g,a,b,array}=fixture(),edge=g.edges[0],before=clone(g);
 assert.throws(()=>reconnectEdge(g,edge.id,"from",{node:array.id,pin:"Item0"}));assert.deepEqual(g,before);
 assert.equal(reconnectEdge(g,edge.id,"from",{node:a.id,pin:"Value"}),null);
 const result=reconnectEdge(g,edge.id,"from",{node:b.id,pin:"Value"});assert.equal(result.edges[0].id,edge.id);assert.equal(result.edges[0].from.node,b.id);assert.deepEqual(g,before);
});
test("align and distribute use actual node sizes",()=>{
 const nodes=[{x:10,y:8,w:20,h:10},{x:80,y:50,w:40,h:20},{x:200,y:70,w:30,h:40}];const size=n=>({width:n.w,height:n.h});
 assert(alignNodes(nodes,"startY",size));assert.deepEqual(nodes.map(n=>n.y),[8,8,8]);assert(!alignNodes(nodes,"startY",size));assert(alignNodes(nodes,"distributeX",size));assert.deepEqual(nodes.map(n=>n.x),[10,95,200]);
});
test("reroute forwards array types and releases them after both ends disconnect",()=>{
 const p=makeProject(),g=p.graphs[0],make=makeNode(builtins.find(n=>n.id==="ue.MakeArray"),0,0),len=makeNode(builtins.find(n=>n.id==="ue.ArrayLength"),400,0),number=makeNode(builtins.find(n=>n.name==="Integer"),0,200);
 g.nodes=[number,make,len];connect(g,{node:number.id,pin:"Value"},{node:make.id,pin:"Item0"});resolveWildcards(g);connect(g,{node:make.id,pin:"Array"},{node:len.id,pin:"Array"});resolveWildcards(g);
 const edge=g.edges.find(e=>e.from.node===make.id),r=insertReroute(g,edge.id,200,0);resolveWildcards(g);assert.equal(r.definition.pins[0].type,"TArray<int32>");validateProject(clone(p));
 disconnectPin(g,{node:r.id,pin:"in"});disconnectPin(g,{node:r.id,pin:"out"});resolveWildcards(g);assert.equal(r.definition.pins[0].type,"$R");
});
test("reconnecting the last wildcard source can change the inferred type",()=>{
 const {g,array}=fixture(),edge=g.edges[0],bool=makeNode(builtins.find(n=>n.name==="Boolean"),0,200);g.nodes.push(bool);
 const result=reconnectEdge(g,edge.id,"from",{node:bool.id,pin:"Value"});assert(result);resolveWildcards(result);
 assert.equal(result.nodes.find(n=>n.id===array.id).definition.pins.find(p=>p.id==="Array").type,"TArray<bool>");
 assert.equal(array.definition.pins.find(p=>p.id==="Array").type,"TArray<int32>");
});
test("wildcard data nodes never infer execution or delegate types from reroutes",()=>{
 const p=makeProject(),g=p.graphs[0],array=makeNode(builtins.find(n=>n.id==="ue.MakeArray"),0,0),branch=makeNode(builtins.find(n=>n.name==="Branch"),0,0);
 const reroute=makeNode({id:"studio.Reroute",name:"Reroute",category:"flow",kind:"reroute",reroute:true,pins:[{id:"in",name:"Input",type:"$R",direction:"in"},{id:"out",name:"Output",type:"$R",direction:"out"}]},0,0);
 g.nodes=[array,branch,reroute];connect(g,{node:reroute.id,pin:"out"},{node:array.id,pin:"Item0"});resolveWildcards(g);connect(g,{node:branch.id,pin:"True"},{node:reroute.id,pin:"in"});resolveWildcards(g);
 assert.equal(reroute.definition.pins[0].type,"exec");assert.equal(array.definition.pins.find(p=>p.id==="Item0").type,"$T");
});
test("enum types propagate through reroutes to Select Enum immediately",async()=>{
 const {setEnumTable}=await import("../docs/model.js");setEnumTable({EFactionEnum:["Germany","Britain"]});
 const p=makeProject(),g=p.graphs[0],select=makeNode(builtins.find(n=>n.id==="studio.SelectEnum"),400,0);
 const source=makeNode({id:"test.enum",name:"Faction",class:"Test",category:"variables",pins:[{id:"out",name:"Out",type:"EFactionEnum",direction:"out"}]},0,0);
 const route=makeNode({id:"studio.Reroute",name:"Reroute",category:"flow",kind:"reroute",reroute:true,pins:[{id:"in",name:"Input",type:"$R",direction:"in"},{id:"out",name:"Output",type:"$R",direction:"out"}]},200,0);
 g.nodes=[source,route,select];connect(g,{node:route.id,pin:"out"},{node:select.id,pin:"Index"});resolveWildcards(g);connect(g,{node:source.id,pin:"out"},{node:route.id,pin:"in"});resolveWildcards(g);
 assert.equal(select.definition.enumType,"EFactionEnum");assert(select.definition.pins.some(p=>p.id==="Value_Germany"));
});
test("multiple execution outputs may feed a reroute input",()=>{
 const g=makeProject().graphs[0],a=makeNode(builtins.find(n=>n.name==="Branch"),0,0),b=makeNode(builtins.find(n=>n.name==="Branch"),0,100),target=makeNode(builtins.find(n=>n.name==="Sequence"),400,0);
 g.nodes=[a,b,target];connect(g,{node:a.id,pin:"True"},{node:target.id,pin:"exec-in"});const route=insertReroute(g,g.edges[0].id,200,0);resolveWildcards(g);connect(g,{node:b.id,pin:"True"},{node:route.id,pin:"in"});resolveWildcards(g);
 assert.equal(g.edges.filter(e=>e.to.node===route.id).length,2);assert.equal(route.definition.pins[0].type,"exec");
});
test("inserting a reroute at the graph size limit leaves the original graph intact",()=>{
 const {g}=fixture(),edgeId=g.edges[0].id;while(g.nodes.length<2000)g.nodes.push({id:`extra-${g.nodes.length}`});
 assert.throws(()=>insertReroute(g,edgeId,100,0),/数量上限/);assert.equal(g.edges.length,1);assert.equal(g.edges[0].id,edgeId);assert.equal(g.nodes.length,2000);
});
test("reconnecting the target replaces only the wire occupying the new data input",()=>{
 const {g,b,array}=fixture(),original=g.edges[0];connect(g,{node:b.id,pin:"Value"},{node:array.id,pin:"Item1"});
 const result=reconnectEdge(g,original.id,"to",{node:array.id,pin:"Item1"});assert.equal(g.edges.length,2);assert.equal(result.edges.length,1);assert.equal(result.edges[0].id,original.id);assert.equal(result.edges[0].to.pin,"Item1");
});
