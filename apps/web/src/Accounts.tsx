import { useEffect, useRef, useState, type ReactNode } from "react";
import { accountApi, type AccountUser, type Profile } from "./account-api.ts";
import type { PhotoAvatar } from "./PhotoUpload.tsx";

export function Login({ onLogin, notice }: { onLogin: (user: AccountUser) => void; notice: string }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <main className="login-page"><div className="login-story"><a className="library-brand" href="/">声息</a>
    <p className="eyebrow">AI 数字人通话</p><h1>熟悉的面容，<br/>新的对话。</h1><p>登录后，与你的人物相见。</p></div>
    <form className="account-panel login-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { const result = await accountApi<{ user: AccountUser }>("/api/auth/login", "POST", { username, password }); setPassword(""); onLogin(result.user); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><p className="eyebrow">欢迎回来</p><h2>登录声息</h2><p className="account-hint">使用管理员为你分配的账号和密码。</p>
      <label>账号<input autoComplete="username" required maxLength={32} value={username} onChange={e => setUsername(e.target.value)} autoFocus /></label>
      <label>密码<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {(error || notice) && <p className="account-error" role="alert">{error || notice}</p>}
      <button className="primary-button" disabled={busy}>{busy ? "正在登录…" : "登录"}</button>
      <p className="account-hint">忘记密码？请联系管理员重置。</p>
    </form></main>;
}
function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="role-dialog account-dialog" aria-label={title} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="account-modal-heading"><h2>{title}</h2><button aria-label="关闭" disabled={busy} onClick={onClose}>×</button></div>{children}</dialog>;
}
function CredentialForm({ username: fixed, onDone, onClose }: { username?: AccountUser; onDone: () => void; onClose: () => void }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  return <Modal title={issued ? "登录信息已生成" : fixed ? `重置 ${fixed.username} 的密码` : "创建用户"} onClose={onClose} busy={busy}>
    {issued ? <div><p>请将以下信息发给对应用户。关闭后不能再次查看密码。</p>
      <label>账号<input readOnly value={issued.username} /></label><label>新密码<input readOnly value={issued.password} /></label>
      <div className="dialog-actions"><button className="primary-button" onClick={onClose}>已保存，关闭</button></div></div>
      : <form onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try {
          const result = await accountApi<{ user?: AccountUser; password: string }>(fixed ? `/api/admin/users/${fixed.id}/password-reset` : "/api/admin/users", "POST",
            { ...(!fixed ? { username } : {}), ...(password ? { password } : {}) });
          setIssued({ username: fixed?.username ?? result.user!.username, password: result.password }); setPassword(""); onDone();
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
        {!fixed && <><label>账号<input autoFocus required minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}" value={username} autoComplete="off" onChange={e => setUsername(e.target.value)} aria-describedby="username-help" /></label><small id="username-help">3—32 位字母、数字、点、下划线或短横线，登录时不区分大小写。</small></>}
        <label>密码<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="留空自动生成 12 位密码" /></label>
        <p className="account-hint">{fixed ? "重置后，该用户所有旧登录和正在进行的通话会失效。" : "也可手动设置至少 12 位密码。创建后再为用户分配人物。"}</p>
        {error && <p role="alert" className="account-error">{error}</p>}
        <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy}>{busy ? "保存中…" : fixed ? "确认重置" : "创建用户"}</button></div>
      </form>}
  </Modal>;
}
function ProfileForm({ profile, username, onClose, onDone }: { profile: Profile; username: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(profile.name), [relationship, setRelationship] = useState(profile.relationship), [persona, setPersona] = useState(profile.persona);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Modal title={`${username} 的专属人物设定`} onClose={onClose} busy={busy}><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try { await accountApi(`/api/admin/users/${profile.user_id}/avatars/${profile.avatar_id}`, "PATCH", { name, relationship, persona }); onDone(); onClose(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <label>向该用户显示的人物名称<input autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
    <label>关系与称呼<input maxLength={200} value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="例如：你是我的老师，请叫我小林" /></label>
    <label>提示词与人物设定<textarea rows={8} maxLength={2000} value={persona} onChange={e => setPersona(e.target.value)} placeholder="性格、语气、背景，以及希望人物如何回应这个用户…" /></label>
    <p className="account-hint">仅影响 {username} 的下一场通话，不改变共享人物或其他用户的设定。</p>
    {error && <p className="account-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存专属设定"}</button></div>
  </form></Modal>;
}
function Assignments({ user }: { user: AccountUser }) {
  const [avatars, setAvatars] = useState<PhotoAvatar[]>([]), [profiles, setProfiles] = useState<Profile[]>([]), [chosen, setChosen] = useState<string[]>([]);
  const [version, setVersion] = useState(0), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null), [removing, setRemoving] = useState<Profile | null>(null);
  useEffect(() => {
    let active = true; setLoaded(false);
    Promise.all([accountApi<{ avatars: PhotoAvatar[] }>("/api/avatars"), accountApi<{ assignments: Profile[] }>(`/api/admin/users/${user.id}/avatars`)])
      .then(([a, p]) => { if (active) { setAvatars(a.avatars); setProfiles(p.assignments); setLoaded(true); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [user.id, version]);
  const available = avatars.filter(a => !profiles.some(p => p.avatar_id === a.id));
  return <section className="account-panel assignment-panel"><h3>分配人物与专属设定</h3><p className="account-hint">一个用户可拥有多个人物；共享外观，设定各自独立。</p>
    {error && <p className="account-error" role="alert">{error}</p>}
    {!loaded ? <p>正在读取分配记录…</p> : <>
      {profiles.length === 0 && <p className="account-empty">尚未分配人物。用户登录后会看到联系管理员的提示。</p>}
      <div className="assignment-list">{profiles.map(p => <article key={p.avatar_id} className="assignment-row"><div><strong>{p.name}</strong><small>共享人物：{avatars.find(a => a.id === p.avatar_id)?.name}</small><small>{p.relationship || "未填写关系称呼"}</small></div>
        <div className="account-actions"><button onClick={() => setEditing(p)}>专属设定</button><button onClick={() => setRemoving(p)}>移除授权</button></div></article>)}</div>
      {available.length > 0 ? <form onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try { await accountApi(`/api/admin/users/${user.id}/avatars`, "POST", { avatarIds: chosen }); setChosen([]); setVersion(v => v + 1); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}><fieldset disabled={busy}><legend>添加已有人物</legend><div className="assignment-choices">{available.map(a => <label key={a.id}><input type="checkbox" checked={chosen.includes(a.id)} onChange={e => setChosen(c => e.target.checked ? [...c, a.id] : c.filter(id => id !== a.id))} />{a.name}<small>{a.status === "ready" ? "可通话" : "尚未就绪"}</small></label>)}</div></fieldset>
        <button className="primary-button" disabled={busy || !chosen.length}>{busy ? "分配中…" : `分配所选人物${chosen.length ? `（${chosen.length}）` : ""}`}</button></form> : <p className="account-hint">{avatars.length ? "所有现有人物均已分配。" : "请先到人物管理添加人物。"}</p>}
    </>}
    {editing && <ProfileForm profile={editing} username={user.username} onClose={() => setEditing(null)} onDone={() => setVersion(v => v + 1)} />}
    {removing && <Modal title="移除人物授权" onClose={() => setRemoving(null)} busy={busy}><p>取消 {user.username} 对“{removing.name}”的访问？该用户与此人物正在进行的通话会结束，其他授权保持不变。</p><div className="dialog-actions"><button disabled={busy} onClick={() => setRemoving(null)}>取消</button><button className="delete-button" disabled={busy} onClick={async () => {
      setBusy(true); setError(""); try { await accountApi(`/api/admin/users/${user.id}/avatars/${removing.avatar_id}`, "DELETE"); setRemoving(null); setVersion(v => v + 1); }
      catch (e) { setError((e as Error).message); setRemoving(null); setVersion(v => v + 1); } finally { setBusy(false); }
    }}>确认移除</button></div></Modal>}
  </section>;
}
export function UserManagement() {
  const [users, setUsers] = useState<AccountUser[]>([]), [selected, setSelected] = useState<string | null>(null), [search, setSearch] = useState("");
  const [version, setVersion] = useState(0), [error, setError] = useState(""), [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false), [resetting, setResetting] = useState<AccountUser | null>(null), [statusTarget, setStatusTarget] = useState<AccountUser | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true;
    accountApi<{ users: AccountUser[] }>("/api/admin/users").then(r => { if (active) { setUsers(r.users.filter(u => u.user_type === "USER")); setLoaded(true); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [version]);
  const current = users.find(u => u.id === selected);
  return <section><div className="library-heading"><div><h2>用户管理</h2><p className="account-hint">创建账号，分配人物，为每位用户设置专属对话。</p></div><button className="primary-button" onClick={() => setCreating(true)}>创建用户</button></div>
    {error && <p className="account-error" role="alert">{error}</p>}
    <div className="accounts-layout"><aside className="account-panel"><label>搜索账号<input value={search} onChange={e => setSearch(e.target.value)} placeholder="输入账号查找" /></label>
      {!loaded && <p>正在读取用户…</p>}{loaded && !users.length && <p className="account-empty">还没有用户，先创建一个账号。</p>}
      {users.filter(u => u.username.includes(search.toLowerCase())).map(u => <button className={`user-row ${selected === u.id ? "selected" : ""}`} key={u.id} onClick={() => setSelected(u.id)}><span>{u.username}</span><small>{u.status === "enabled" ? "已启用" : "已停用"}</small></button>)}
    </aside><div>{current ? <><section className="account-panel user-summary"><div><h2>{current.username}</h2><span className={`account-status ${current.status}`}>{current.status === "enabled" ? "账号已启用" : "账号已停用"}</span></div><div className="account-actions"><button onClick={() => setResetting(current)}>重置密码</button><button onClick={() => setStatusTarget(current)}>{current.status === "enabled" ? "停用账号" : "启用账号"}</button></div></section><Assignments user={current} key={current.id} /></> : <div className="account-panel account-empty">选择一位用户，查看账户和人物授权。</div>}</div></div>
    {(creating || resetting) && <CredentialForm username={resetting ?? undefined} onDone={() => setVersion(v => v + 1)} onClose={() => { setCreating(false); setResetting(null); }} />}
    {statusTarget && <Modal title={statusTarget.status === "enabled" ? "停用账号" : "启用账号"} onClose={() => setStatusTarget(null)} busy={busy}><p>{statusTarget.status === "enabled" ? `停用 ${statusTarget.username} 后，所有旧登录和正在进行的通话会失效，资料与人物分配仍保留。` : `启用 ${statusTarget.username} 后，用户可使用当前密码重新登录。旧登录不会恢复。`}</p><div className="dialog-actions"><button disabled={busy} onClick={() => setStatusTarget(null)}>取消</button><button className="primary-button" disabled={busy} onClick={async () => {
      setBusy(true); setError(""); try { await accountApi(`/api/admin/users/${statusTarget.id}/status`, "PATCH", { status: statusTarget.status === "enabled" ? "disabled" : "enabled" }); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); setStatusTarget(null); setVersion(v => v + 1); }
    }}>确认{statusTarget.status === "enabled" ? "停用" : "启用"}</button></div></Modal>}
  </section>;
}
export function AdminSecurity({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrent] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="account-panel security-form" onSubmit={async e => {
    e.preventDefault(); if (password !== confirmation) { setError("两次新密码不一致"); return; }
    setBusy(true); setError(""); try { await accountApi("/api/admin/self/password", "POST", { currentPassword, password }); onChanged(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}><h2>管理员账户</h2><p className="account-hint">账号：lenox。修改密码后，管理员的所有旧登录和测试通话都会失效。</p>
    <label>当前密码<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrent(e.target.value)} /></label>
    <label>新密码<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <label>再次输入新密码<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
    {error && <p role="alert" className="account-error">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "保存中…" : "修改密码并重新登录"}</button>
  </form>;
}
