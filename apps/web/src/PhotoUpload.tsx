import { useEffect, useRef, useState } from "react";
import { accountFetch as fetch } from "./account-api.ts";
export type PhotoAvatar = { id:string; name:string; status:"queued"|"processing"|"paused"|"ready"|"failed"|"interrupted";
  stage:string; percent:number; message?:string; frameUrl?:string; batchId:string; persona?:string };
const statusText: Record<PhotoAvatar["status"],string> = {
  queued:"等待制作",processing:"正在制作人物",paused:"为通话暂停",ready:"可以通话",failed:"制作失败",interrupted:"处理已中断"
};
async function encode(file:File) {
  return await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("照片读取失败"));
    reader.onload=()=>resolve(String(reader.result).split(",")[1]!);
    reader.readAsDataURL(file);
  });
}
export function PhotoUpload({onSelect, admin = true}: {onSelect:(avatar:PhotoAvatar)=>void; admin?: boolean}) {
  const [avatars,setAvatars]=useState<PhotoAvatar[]>([]);
  const [files,setFiles]=useState<File[]>([]);
  const [message,setMessage]=useState("");
  const [uploading,setUploading]=useState(false);
  const [connected,setConnected]=useState(false);
  const [callActive,setCallActive]=useState(false);
  const [editing,setEditing]=useState<{avatar:PhotoAvatar;mode:"name"|"persona"|"delete"}|null>(null);
  const [draft,setDraft]=useState("");
  const [saving,setSaving]=useState(false);
  const [editError,setEditError]=useState("");
  const editDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(editing)editDialog.current?.showModal();else editDialog.current?.close();},[editing]);
  const openEditor=(avatar:PhotoAvatar,mode:"name"|"persona"|"delete")=>{
    setEditError("");setDraft(mode==="name"?avatar.name:avatar.persona??"");setEditing({avatar,mode});
  };
  const requestId=useRef(crypto.randomUUID());
  const uploadAbort=useRef<AbortController|null>(null);
  const alive=useRef(true);
  const busy=avatars.some(a=>["queued","processing","paused"].includes(a.status));
  useEffect(()=>{
    alive.current=true;const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try{
        const response=await fetch("/api/avatars",{signal:abort.signal});
        if(!response.ok)throw new Error();
        const data=await response.json() as {avatars:PhotoAvatar[];callActive:boolean;message?:string};
        if(abort.signal.aborted)return;
        setAvatars(data.avatars);setCallActive(data.callActive);setConnected(true);
        if(data.message)setMessage(data.message);
      }catch{if(!abort.signal.aborted)setConnected(false);}
      if(!abort.signal.aborted)timer=setTimeout(poll,1000);
    };
    void poll();
    return()=>{alive.current=false;abort.abort();uploadAbort.current?.abort();clearTimeout(timer);};
  },[]);
  const upload=async()=>{
    if(!files.length||files.length>3||uploading||busy||callActive)return;
    setUploading(true);setMessage("正在上传照片");
    const abort=new AbortController();uploadAbort.current=abort;
    try{
      const encoded=await Promise.all(files.map(async f=>({name:f.name,type:f.type,data:await encode(f)})));
      if(abort.signal.aborted)return;
      const response=await fetch("/api/avatars/batches",{method:"POST",signal:abort.signal,
        headers:{"content-type":"application/json","x-avatar-upload":"1"},
        body:JSON.stringify({requestId:requestId.current,files:encoded})});
      const data=await response.json() as {message?:string;avatars:PhotoAvatar[]};
      if(!response.ok)throw new Error(data.message??"上传失败");
      if(!alive.current)return;
      setAvatars(existing=>[...existing.filter(a=>!data.avatars.some(b=>a.id===b.id)),...data.avatars]);
      setFiles([]);requestId.current=crypto.randomUUID();setMessage("照片已提交，人物将逐张制作");
    }catch(error){if(alive.current&&!abort.signal.aborted)setMessage(error instanceof Error?error.message:"上传失败，可再次提交");}
    finally{if(alive.current)setUploading(false);}
  };
  const retry=async(id:string)=>{
    try{
      const response=await fetch(`/api/avatars/${id}/retry`,{method:"POST",headers:{"x-avatar-upload":"1"}});
      const data=await response.json() as PhotoAvatar & {message?:string};
      if(!response.ok)throw new Error(data.message??"重试失败");
      if(alive.current)setAvatars(items=>items.map(a=>a.id===id?data:a));
    }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:"重试失败");}
  };
  const saveRole=async()=>{
    if(!editing||saving)return;
    setSaving(true);setEditError("");
    try{
      const {avatar,mode}=editing;
      const response=await fetch(`/api/avatars/${avatar.id}`,{method:mode==="delete"?"DELETE":"PATCH",
        headers:{"content-type":"application/json","x-avatar-upload":"1"},
        ...(mode!=="delete"?{body:JSON.stringify({[mode]:draft})}:{})});
      const data=await response.json();if(!response.ok)throw new Error(data.message??"保存失败");
      if(!alive.current)return;
      setAvatars(items=>mode==="delete"?items.filter(a=>a.id!==avatar.id):items.map(a=>a.id===avatar.id?data:a));
      setEditing(null);setMessage(mode==="delete"?"人物已从列表移除，资料已保留":"人物设置已保存");
    }catch(error){if(alive.current)setEditError(error instanceof Error?error.message:"保存失败");}
    finally{if(alive.current)setSaving(false);}
  };
  return <>
    {admin && <section className="upload-panel" aria-label="批量上传人物">
      <div><h2>添加新人物</h2><p>每次选择 1—3 张单人照片，每张照片创建一个角色。</p></div>
      <label className="file-picker">选择照片
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="选择人物照片"
          disabled={uploading||busy||callActive} onChange={event=>{
            const chosen=Array.from(event.target.files??[]);event.target.value="";
            setFiles([]);requestId.current=crypto.randomUUID();
            if(chosen.length>3){setMessage("每批最多 3 张照片，请重新选择");return;}
            if(chosen.some(f=>f.size>12*1024*1024||!["image/png","image/jpeg","image/webp"].includes(f.type))){
              setMessage("请选择不超过 12 MB 的 JPG、PNG 或 WebP 照片");return;
            }
            setFiles(chosen);requestId.current=crypto.randomUUID();setMessage("");
          }}/>
      </label>
      {files.length>0&&<div className="selected-files">{files.map((f,i)=><span key={i}>{f.name}</span>)}</div>}
      <button className="primary-button" disabled={!connected||!files.length||uploading||busy||callActive} onClick={()=>void upload()}>
        {uploading?"上传中…":`开始制作${files.length?`（${files.length} 张）`:""}`}
      </button>
      <p role="status">{!connected?"正在连接人物服务，请确认本机服务已启动":callActive?"当前通话进行中，结束后可添加人物或开始新通话。":message|| (busy?"照片正在逐张制作，已完成的人物可立即通话。":"支持 JPG、PNG、WebP，单张不超过 12 MB。")}</p>
    </section>}
    {!admin && <p className="account-hint" role="status">{!connected ? "正在连接人物服务…" : callActive ? "当前有人正在通话，请稍后再试。" : "选择一位已分配的人物，点击接听后开始通话。"}</p>}
    <section aria-label="人物列表">
      <div className="library-heading"><h2>我的人物</h2><span>{avatars.filter(a=>a.status==="ready").length} 位可以通话</span></div>
      {!avatars.length&&<div className="library-empty">{admin ? "从一张照片开始" : "还没有分配给你的人物"}<br/><small>{admin ? "制作完成后，人物会出现在这里。" : "请联系管理员分配，完成后人物会出现在这里。"}</small></div>}
      <div className="avatar-grid">{avatars.map(avatar=><article className="avatar-card" key={avatar.id} data-avatar-id={avatar.id}>
        <div className="portrait">{avatar.status==="ready"?<img src={`/api/avatars/${avatar.id}/source.jpg`} alt={avatar.name} loading="lazy"/>:<span aria-hidden="true">◌</span>}
          <span className={`avatar-badge badge-${avatar.status}`}>{statusText[avatar.status]}</span>
        </div>
        <div className="card-body"><h3>{avatar.name}</h3>
          {admin && <div className="role-actions" aria-label={`${avatar.name}的人物管理`}>
            <button disabled={!connected} onClick={()=>openEditor(avatar,"name")}>重命名</button>
            <button disabled={!connected} onClick={()=>openEditor(avatar,"persona")}>角色设定</button>
            <button disabled={!connected} onClick={()=>openEditor(avatar,"delete")}>删除</button>
          </div>}
          {avatar.status==="processing"&&<p className="making-note">{["standardizing","standardizing_fallback"].includes(avatar.stage)?"正在整理照片…":avatar.stage==="checking_portrait"?"正在检查人物照片…":"正在制作通话画面…"}</p>}
          {admin && avatar.message&&<p className="card-error">{avatar.message}</p>}
          {avatar.status==="ready"?<button className="call-button" disabled={uploading||callActive||!connected} onClick={()=>onSelect(avatar)}>视频通话</button>
          :["failed","interrupted"].includes(avatar.status)?admin?<button disabled={callActive||uploading||!connected} onClick={()=>void retry(avatar.id)}>重试制作</button>:<p className="card-help">人物暂不可用，请联系管理员。</p>
          :<p className="card-help">{avatar.status==="paused"?"通话结束后继续制作":avatar.status==="queued"?"等待前一张完成":"制作完成后即可通话"}</p>}
        </div>
      </article>)}</div>
    </section>
    <dialog ref={editDialog} className="role-dialog" onCancel={event=>{if(saving)event.preventDefault();else setEditing(null);}}>
      {editing&&<form onSubmit={event=>{event.preventDefault();void saveRole();}}>
        <h2>{editing.mode==="delete"?"删除人物":editing.mode==="name"?"重命名":"角色设定"}</h2>
        {editing.mode==="delete"?<p>将“{editing.avatar.name}”从列表中移除？照片、资源和角色资料会保留，制作任务将停止。</p>:
          editing.mode==="name"?<label>人物名称<input autoFocus value={draft} maxLength={100} required onChange={e=>setDraft(e.target.value)}/></label>:
          <><label>与我的关系、性格和背景<textarea autoFocus rows={8} maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="例如：你是我的老师，性格耐心，说话温和简短，喜欢用生活中的例子解释问题。"/></label>
          <p>可填写关系、语气、性格、说话方式与背景信息。下一次通话生效，声音保持不变。</p><small>{draft.length}/2000</small></>}
        {editError&&<p role="alert" className="card-error">{editError}</p>}
        <div className="dialog-actions"><button type="button" disabled={saving} onClick={()=>setEditing(null)}>取消</button>
          <button className={editing.mode==="delete"?"delete-button":"primary-button"} disabled={saving||(editing.mode==="name"&&!draft.trim())}>{saving?"保存中…":editing.mode==="delete"?"确认删除":"保存"}</button></div>
      </form>}
    </dialog>
  </>;
}
