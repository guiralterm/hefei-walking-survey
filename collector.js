/* Device-local export tools. This is not a hosted researcher dashboard. */
(()=>{
const dialog=document.querySelector('#collector-dialog');let urls=[];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const segments=[['A','长江中路',4],['B','寿春路',3],['C','阜阳北路',3],['D','蒙城路',3],['E','徽州大道',2],['F','金寨路',2]].flatMap(([prefix,name,n])=>Array.from({length:n},(_,i)=>[prefix+(i+1),name+' '+prefix+(i+1)]));
function cell(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function longRows(payload){const rows=[];for(const record of payload.records)for(const task of record.plan){const response=record.responses[task.task_id];if(!response)continue;
 for(const alt of task.alternatives){const row={respondent_id:record.respondent_id,device_id:record.device_id,segment_id:record.segment_id,phase:record.phase,design_version:record.design_version,schema_version:record.schema_version,block_id:record.block_id,task_id:task.task_id,presentation_id:task.presentation_id,task_order:task.task_order,task_type:task.task_type,alternative_id:alt.alternative_id,display_position:alt.display_position,profile_id:alt.profile_id,image_id:alt.image_id,image_sha256:alt.image_sha256,image_matches_profile:alt.image_matches_profile,available:1,chosen:Number(response.chosen_alternative_id===alt.alternative_id),active_ms:response.active_ms,image_load_status:response.image_load_status,respondent_complete:record.complete,include_main:Number(record.phase==='formal'&&record.complete&&task.task_type!=='practice'),include_pipeline_demo:Number(record.phase!=='formal'&&task.task_type!=='practice'),age_group:record.age_group,gender:record.gender,area_frequency:record.area_frequency,main_purpose:record.main_purpose};
 for(const attribute of record.survey_config.attributes){row[attribute.id+'_level']=alt.levels[attribute.id];for(const level of attribute.levels.slice(1))row[attribute.id+'_L'+level.id]=Number(alt.levels[attribute.id]===level.id);}rows.push(row);}}
 return rows;}
function csv(rows){const columns=[...new Set(rows.flatMap(Object.keys))];return '\ufeff'+[columns.map(cell).join(','),...rows.map(row=>columns.map(k=>cell(row[k])).join(','))].join('\r\n');}
async function open(){try{
 const data=await DeviceStore.exportData(),segment=await DeviceStore.getSegment(),active=await DeviceStore.activeSession();
 for(const url of urls)URL.revokeObjectURL(url);urls=[];
 dialog.innerHTML=`<div class="step-line"><h2>本设备采集管理</h2><button class="secondary" id="collector-close">关闭</button></div><p>这里只能查看当前设备、当前浏览器保存的数量。答卷不会上传到GitHub，其他人的设备看不到这里的记录。</p><div class="metrics"><div class="metric"><span>完整提交</span><strong>${data.records.filter(r=>r.complete).length}</strong></div><div class="metric"><span>未完成</span><strong>${data.records.filter(r=>!r.complete).length}</strong></div></div><div class="field"><label for="field-segment">接下来采集的路段（研究者设置）</label><select id="field-segment"><option value="">暂不记录路段</option>${segments.map(([id,label])=>`<option value="${id}" ${id===segment?'selected':''}>${label}</option>`).join('')}</select><p class="hint">只影响之后新开始的问卷，不改写已保存记录。</p></div><p class="inline-warning">请使用普通浏览模式。清理网站数据、更换浏览器或设备可能丢失本地答卷。每天导出备份，并在iPad“文件”中确认保存。</p><button id="prepare-export">生成本设备备份</button><div id="download-files" class="actions"></div><p id="collector-feedback" class="hint"></p>${active&&!active.complete?'<button class="secondary" id="leave-incomplete">保留这份未完成答卷，开始下一位</button>':''}<p class="hint">此页面需要网络加载问卷和题图；可使用手机热点。已经保存的答案不会因为暂时断网而自动删除。</p>`;
 document.querySelector('#collector-close').onclick=()=>dialog.close();
 document.querySelector('#field-segment').onchange=async e=>{await DeviceStore.setSegment(e.target.value);document.querySelector('#collector-feedback').textContent='路段设置已保存。';};
 document.querySelector('#prepare-export').onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{
  const payload=await DeviceStore.exportData(),date=new Date().toISOString().replace(/[:.]/g,'-');
  const chunks=Array.from({length:Math.max(1,Math.ceil(payload.records.length/500))},(_,i)=>({...payload,export_part:i+1,export_parts:Math.max(1,Math.ceil(payload.records.length/500)),records:payload.records.slice(i*500,(i+1)*500)}));const documents=[...chunks.map((part,i)=>['JSON备份'+(chunks.length>1?' 第'+(i+1)+'/'+chunks.length+'部分':'（导入电脑研究者端）'),'hefei-device-export-'+date+'-part'+(i+1)+'.json',JSON.stringify(part,null,2),'application/json']),['CSV选择长表','hefei-long-export-'+date+'.csv',csv(longRows(payload)),'text/csv;charset=utf-8']];
  const links=documents.map(([label,name,content,type])=>{const url=URL.createObjectURL(new Blob([content],{type}));urls.push(url);return `<a class="button secondary" href="${url}" download="${name}">下载${label}</a>`;}).join('');
  document.querySelector('#download-files').innerHTML=links;document.querySelector('#collector-feedback').textContent='文件已生成。请点击下载，并在Safari下载列表或“文件”App中确认保存；生成文件不代表已经完成备份。';
 }catch(error){document.querySelector('#collector-feedback').textContent=error.message;}finally{button.disabled=false;}};
 const leave=document.querySelector('#leave-incomplete');if(leave)leave.onclick=async()=>{await DeviceStore.leaveIncomplete();sessionStorage.removeItem('sp-token');sessionStorage.removeItem('sp-request');location.assign('./');};
 dialog.showModal();
 }catch(error){alert('无法打开设备记录：'+error.message);}}
document.querySelector('#collector-open').onclick=open;
globalThis.DeviceExport={longRows,csv};
})();
