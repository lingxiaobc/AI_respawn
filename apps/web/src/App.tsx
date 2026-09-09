import { useState } from "react";
import { PhotoUpload, type PhotoAvatar } from "./PhotoUpload.tsx";
import { CallRoom } from "./CallRoom.tsx";
export function App() {
  const [selected,setSelected]=useState<PhotoAvatar|null>(null);
  if(selected)return <CallRoom key={selected.id} avatar={selected} onExit={()=>setSelected(null)}/>;
  return <main className="avatar-library">
    <header className="library-header"><a href="/" className="library-brand">声息</a><span>AI 数字人通话</span></header>
    <div className="library-intro"><p>熟悉的面容，新的对话</p><h1>选择一位人物，开始通话。</h1>
      <p>上传照片后自动制作。已完成的人物随时可以通话。</p></div>
    <PhotoUpload onSelect={setSelected}/>
    <footer className="library-footer">照片通过 ZenMux 云端标准化，通话画面由本机生成。通话只使用麦克风，无需摄像头。</footer>
  </main>;
}
