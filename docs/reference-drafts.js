const PREFIX = "kards-blueprint-studio.reference-draft.";
const VERSION = 1;
export function draftKey(cardId, mode, sourceHash) { return `${PREFIX}${cardId}.${mode}.${sourceHash}`; }
export function saveReferenceDraft(storage, cardId, mode, sourceHash, project) {
  if (!cardId || !sourceHash) throw new Error("缺少原版数据的来源标识");
  const value = { version: VERSION, cardId, mode, sourceHash, savedAt: new Date().toISOString(), project };
  storage.setItem(draftKey(cardId, mode, sourceHash), JSON.stringify(value));
  return value;
}
export function readReferenceDraft(storage, cardId, mode, sourceHash) {
  const raw=storage.getItem(draftKey(cardId,mode,sourceHash));
  if (!raw) return null;
  const value=JSON.parse(raw);
  if (value.version!==VERSION || value.cardId!==cardId || value.mode!==mode || value.sourceHash!==sourceHash || !value.project) throw new Error("参考副本格式无效");
  return value;
}
export function staleReferenceDrafts(storage, cardId, mode, sourceHash) {
  const prefix=`${PREFIX}${cardId}.${mode}.`, current=draftKey(cardId,mode,sourceHash), result=[];
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix)&&key!==current) result.push(key);}
  return result.sort();
}
export function removeReferenceDraft(storage, cardId, mode, sourceHash) { storage.removeItem(draftKey(cardId,mode,sourceHash)); }
