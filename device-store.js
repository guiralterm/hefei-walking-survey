/* The public site sends no answers to any server. All survey writes are IndexedDB transactions. */
(()=>{
const DB_NAME='hefei-walking-field-v1',FORMAT='hefei-pages-device-v1';
let databasePromise,configPromise;
const clone=value=>structuredClone(value);
function randomInt(n){const array=new Uint32Array(1),limit=4294967296-(4294967296%n);do{crypto.getRandomValues(array);}while(array[0]>=limit);return array[0]%n;}
function shuffle(values){for(let i=values.length-1;i>0;i--){const j=randomInt(i+1);[values[i],values[j]]=[values[j],values[i]];}return values;}
function makePlan(design,block){
 const tasks=shuffle(clone(design.tasks.filter(t=>t.block_id===block)));
 const candidates=design.tasks.filter(t=>t.block_id!==block);const practice=clone(candidates[randomInt(candidates.length)]);
 practice.task_id='PRACTICE';practice.task_type='practice';
 return [practice,...tasks].map((t,order)=>({...t,task_order:order,presentation_id:crypto.randomUUID(),alternatives:shuffle(t.alternatives).map((a,i)=>({...a,display_position:i+1}))}));
}
function open(){
 if(!databasePromise){
  const attempt=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);
   const forget=()=>{if(databasePromise===attempt)databasePromise=null;};
   const failed=message=>{forget();reject(Error(message));};
   request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('records',{keyPath:'respondent_id'});db.createObjectStore('settings',{keyPath:'key'});};
   request.onsuccess=()=>{const db=request.result;if(databasePromise!==attempt){db.close();return;}
    db.onclose=forget;
    db.onversionchange=()=>{forget();db.close();};
    resolve(db);
   };
   request.onerror=()=>failed('无法读取设备答卷，请使用普通浏览模式并检查设备存储空间。请勿清理网站数据。');
   request.onblocked=()=>failed('其他页面占用了采集数据，请关闭重复打开的问卷页后重试。请勿清理网站数据。');
  });
  databasePromise=attempt;
 }
 return databasePromise;
}
async function transaction(mode,run){
 let tx;
 for(let attempt=0;attempt<2;attempt++){
  const connection=open(),db=await connection;
  try{
   try{tx=db.transaction(['records','settings'],mode,{durability:'strict'});}
   catch(error){if(error.name!=='TypeError')throw error;tx=db.transaction(['records','settings'],mode);}
   break;
  }catch(error){
   // Safari may invalidate an idle/background connection without firing close.
   // Retry only transaction creation: an already-started write is never replayed.
   if(error.name!=='InvalidStateError')throw error;
   if(databasePromise===connection)databasePromise=null;
   try{db.close();}catch{}
   if(attempt===1)throw Error('设备存储连接暂时不可用，请关闭重复的问卷标签页后刷新重试。已保存答卷不会被本操作删除，请勿清理网站数据。');
  }
 }
 // Attach handlers and enqueue requests without awaiting after creating a transaction.
 return new Promise((resolve,reject)=>{
 let value,failure;const set=v=>{value=v;};const fail=error=>{failure=error;tx.abort();};
 tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure||Error('未能保存，答卷没有被标记为提交。请检查设备剩余空间。'));tx.onerror=()=>{};
 try{run(tx,set,fail);}catch(err){fail(err);}
 });}
function read(store,key,done){const request=store.get(key);request.onsuccess=()=>done(request.result);}
function current(record){return {...clone(record),token:record.respondent_id};}
async function definitions(){if(!configPromise)configPromise=Promise.all(['study.json','design.json'].map(async path=>{const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw Error('问卷定义加载失败，请联网刷新。');return response.json();})).then(([config,design])=>({config,design}));return configPromise;}
function active(tx,done,fail){read(tx.objectStore('settings'),'active',entry=>{if(!entry?.value){fail(Error('没有正在填写的问卷。'));return;}read(tx.objectStore('records'),entry.value,record=>record?done(record):fail(Error('当前问卷记录不存在。')));});}
async function api(path,body){
 const {config,design}=await definitions();
 if(path==='/api/config'){await open();return clone(config);}
 if(path==='/api/session')return transaction('readonly',(tx,set,fail)=>active(tx,r=>set(current(r)),fail));
 if(path==='/api/start'){
  if(body?.consent!==true||!['18-29','30-44','45-59','60+'].includes(body.age_group))throw Error('请确认自愿参与，且年龄不少于18岁。');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.request_id||''))throw Error('开始编号无效，请刷新后重试。');
  return transaction('readwrite',(tx,set,fail)=>{
   const records=tx.objectStore('records'),settings=tx.objectStore('settings');
   read(settings,'active',entry=>{const proceed=()=>{const request=records.getAll();request.onsuccess=()=>{
    const all=request.result;const prior=all.find(r=>r.request_id===body.request_id);if(prior){set(current(prior));return;}
    read(settings,'device',device=>{const deviceId=device?.value||crypto.randomUUID();if(!device)settings.put({key:'device',value:deviceId});
     read(settings,'segment',segment=>{
      const blocks=[...new Set(design.tasks.map(t=>t.block_id))];const counts=Object.fromEntries(blocks.map(b=>[b,all.filter(r=>r.design_version===config.design_version&&r.block_id===b).length]));const least=Math.min(...Object.values(counts));const available=blocks.filter(b=>counts[b]===least);const block=available[randomInt(available.length)];
      const record={respondent_id:crypto.randomUUID(),request_id:body.request_id,device_id:deviceId,phase:config.phase,design_version:config.design_version,schema_version:config.schema_version,block_id:block,age_group:body.age_group,created_at:Date.now()/1000,completed_at:null,complete:false,segment_id:segment?.value||'',recruitment_channel:'ipad-field',survey_config:clone(config),plan:makePlan(design,block),responses:{}};
      records.add(record);settings.put({key:'active',value:record.respondent_id});set(current(record));
     });
    });
   };};if(entry?.value)read(records,entry.value,old=>{if(old&&!old.complete){set(current(old));return;}proceed();});else proceed();});
  });
 }
 if(path==='/api/respond')return transaction('readwrite',(tx,set,fail)=>active(tx,record=>{
  const task=record.plan.find(t=>t.presentation_id===body.presentation_id);if(!task||!task.alternatives.some(a=>a.alternative_id===body.chosen_alternative_id)){fail(Error('选择与当前题目不对应。'));return;}
  const old=record.responses[task.task_id];if(old){if(old.chosen_alternative_id!==body.chosen_alternative_id){fail(Error('已保存的选择不能被覆盖。'));return;}set(current(record));return;}
  if(record.complete||Object.keys(record.responses).length!==task.task_order||body.image_load_status!=='loaded'||!Number.isInteger(body.active_ms)||body.active_ms<0||body.active_ms>86400000){fail(Error('当前题目尚未完成，或图片未加载成功。'));return;}
  record.responses[task.task_id]={task_id:task.task_id,presentation_id:task.presentation_id,chosen_alternative_id:body.chosen_alternative_id,active_ms:body.active_ms,image_load_status:'loaded',received_at:Date.now()/1000};
  tx.objectStore('records').put(record);set(current(record));
 },fail));
 if(path==='/api/complete')return transaction('readwrite',(tx,set,fail)=>active(tx,record=>{
  const fields={gender:['女','男','不便透露'],area_frequency:['从未','偶尔','每周','几乎每天','不便透露'],main_purpose:['通勤通学','交通接驳','购物与生活事务','就医及办事','休闲游憩','无固定目的或不适用','不便透露']};
  if(Object.keys(record.responses).length!==record.plan.length||Object.entries(fields).some(([key,allowed])=>!allowed.includes(body[key]))){fail(Error('请完成全部选择与三项背景信息。'));return;}
  if(!record.complete){Object.assign(record,...Object.keys(fields).map(k=>({[k]:body[k]})),{complete:true,completed_at:Date.now()/1000});tx.objectStore('records').put(record);}set(current(record));
 },fail));
 throw Error('本静态页面没有服务器接口。');
}
async function exportData(){const {config}=await definitions();return transaction('readonly',(tx,set)=>{const records=tx.objectStore('records').getAll();records.onsuccess=()=>read(tx.objectStore('settings'),'device',device=>set({format:FORMAT,export_id:crypto.randomUUID(),exported_at:new Date().toISOString(),device_id:device?.value||null,study_version:config.design_version,records:clone(records.result)}));});}
async function setSegment(value){if(!/^(?:[A-F][1-4])?$/.test(value))throw Error('路段编号无效。');return transaction('readwrite',(tx,set)=>{tx.objectStore('settings').put({key:'segment',value});set(true);});}
async function getSegment(){return transaction('readonly',(tx,set)=>read(tx.objectStore('settings'),'segment',entry=>set(entry?.value||'')));}
async function activeSession(){try{return await transaction('readonly',(tx,set,fail)=>active(tx,r=>set(current(r)),fail));}catch{return null;}}
async function leaveIncomplete(){return transaction('readwrite',(tx,set)=>{tx.objectStore('settings').put({key:'active',value:null});set(true);});}
async function requestPersistence(){try{if(navigator.storage?.persist)await navigator.storage.persist();}catch{} }
globalThis.DeviceStore={api,exportData,setSegment,getSegment,activeSession,leaveIncomplete,requestPersistence,makePlan,randomInt,shuffle};
})();
