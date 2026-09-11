import { useEffect, useState } from "react";
import { PhotoUpload, type PhotoAvatar } from "./PhotoUpload.tsx";
import { CallRoom } from "./CallRoom.tsx";
import { Login, UserManagement, AdminSecurity } from "./Accounts.tsx";
import { accountApi, type AccountUser } from "./account-api.ts";
import { AvatarTest } from "./AvatarTest.tsx";
export function App() {
  const [selected,setSelected]=useState<PhotoAvatar|null>(null);
  const [user,setUser]=useState<AccountUser|null>(null),[loading,setLoading]=useState(true),[notice,setNotice]=useState("");
  const [tab,setTab]=useState<"avatars"|"users"|"security">("avatars");
  const clear=(message:string)=>{setSelected(null);setUser(null);setNotice(message);setTab("avatars");};
  useEffect(()=>{
    let active=true;
    // A first visit without a session is normal, not an expired-login warning.
    fetch("/api/me",{cache:"no-store"}).then(async response=>response.ok?await response.json():null).then(r=>{
      if(active&&r?.user){setUser(r.user);setTab(r.user.user_type==="ADMIN"?"users":"avatars");}
    }).catch(()=>{}).finally(()=>{if(active)setLoading(false);});
    const expired=()=>{if(active)clear("登录已到期或被管理员撤销，请重新登录。");};
    window.addEventListener("account-expired",expired);
    return()=>{active=false;window.removeEventListener("account-expired",expired);};
  },[]);
  useEffect(()=>{
    if(!user)return;
    const timer=setInterval(()=>{void accountApi("/api/me").catch(()=>{});},5000);
    return()=>clearInterval(timer);
  },[user?.id]);
  if(loading)return <main className="login-page"><p>正在恢复登录状态…</p></main>;
  if(!user)return <Login notice={notice} onLogin={u=>{setUser(u);setNotice("");setTab(u.user_type==="ADMIN"?"users":"avatars");}}/>;
  if(selected)return <CallRoom key={selected.id} avatar={selected} onExit={()=>setSelected(null)}/>;
  const admin=user.user_type==="ADMIN";
  return <main className="avatar-library">
    <header className="library-header"><a href="/" className="library-brand">声息</a><div className="account-actions"><span>{user.username} · {admin?"管理员":"用户"}</span><button onClick={async()=>{try{await accountApi("/api/auth/logout","POST",{});clear("已退出登录。");}catch(e){setNotice((e as Error).message);}}}>退出登录</button></div></header>
    {notice&&<p className="account-error" role="alert">{notice}</p>}
    {admin&&<nav className="admin-tabs" aria-label="管理后台">{([["users","用户管理"],["avatars","人物管理"],["security","管理员账户"]] as const).map(([id,label])=><button key={id} aria-current={tab===id?"page":undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>}
    {admin&&new URLSearchParams(location.search).has("avatar-test")?<AvatarTest/>:admin&&tab==="users"?<UserManagement/>:admin&&tab==="security"?<AdminSecurity onChanged={()=>clear("密码已修改，请使用新密码登录。")}/>:<>
    <div className="library-intro"><p>熟悉的面容，新的对话</p><h1>选择一位人物，开始通话。</h1>
      <p>{admin?"管理共享人物的外观与默认设定，修改不会覆盖用户的专属设定。":"这里仅展示管理员分配给你的数字人。每一次对话，从你的专属设定开始。"}</p></div>
    <PhotoUpload onSelect={setSelected} admin={admin}/></>}
    <footer className="library-footer">AI 数字人通话 · 只使用麦克风，无需摄像头。{admin&&" 照片通过 ZenMux 云端标准化，通话画面由本机生成。"}</footer>
  </main>;
}
