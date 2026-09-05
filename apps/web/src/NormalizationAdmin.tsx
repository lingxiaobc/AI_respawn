import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicNormalizationJob } from "../../../packages/image-normalization/src/types.ts";
import "./normalization.css";

const statusCopy = {
  queued: "等待处理",
  running: "正在规范化",
  succeeded: "处理成功",
  failed: "处理失败",
  skipped: "已有结果，已跳过",
} as const;

interface JobsResponse { jobs: PublicNormalizationJob[] }

export function NormalizationAdmin() {
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<PublicNormalizationJob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/normalization/jobs", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取任务列表");
    const body = await response.json() as JobsResponse;
    setJobs(body.jobs);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "声息 · 图片规范化";
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "任务列表加载失败"));
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2_000);
    return () => {
      window.clearInterval(timer);
      document.title = previousTitle;
    };
  }, [refresh]);

  const selectionText = useMemo(() => files.length === 0 ? "尚未选择图片" : `已选择 ${files.length} 张图片`, [files]);

  async function submit() {
    if (files.length === 0 || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const created: PublicNormalizationJob[] = [];
      for (const file of files) {
        if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} 超过 12 MiB 限制`);
        const response = await fetch("/api/normalization/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: [{
            name: file.name,
            type: file.type || "application/octet-stream",
            dataBase64: await fileToBase64(file),
          }] }),
        });
        const body = await response.json() as JobsResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? `${file.name} 提交失败`);
        created.push(...body.jobs);
      }
      setFiles([]);
      setMessage(`已提交 ${created.length} 个任务，后台将按顺序处理。`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="normalization-shell">
      <header className="normalization-topbar">
        <a href="/" className="normalization-brand"><span />声息 · 图片规范化</a>
        <div className="normalization-local">仅本机 · 密钥留在服务端</div>
      </header>

      <section className="normalization-hero">
        <p className="normalization-kicker">PORTRAIT NORMALIZATION / ADMIN TEST</p>
        <h1>把不同照片，收拢到同一条生产线。</h1>
        <p>上传清晰正脸照片。系统会保留人物、衣服与背景，只做必要的补肩、构图和自然闭嘴调整，输出统一的 1024×1536 PNG。</p>
      </section>

      <section className="upload-panel" aria-labelledby="upload-title">
        <div>
          <p className="panel-index">01 / 上传</p>
          <h2 id="upload-title">选择管理员照片</h2>
          <p>PNG、JPEG 或 WebP；每张不超过 12 MiB，短边至少 512px，一次一张。此旧页面仅规范化；完整角色流水线使用独立角色管理入口。</p>
        </div>
        <div className="upload-actions">
          <label className="file-picker">
            <input
              key={files.length === 0 ? "empty" : "selected"}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 1))}
            />
            选择图片
          </label>
          <span>{selectionText}</span>
          <button type="button" disabled={files.length === 0 || submitting} onClick={() => void submit()}>
            {submitting ? "正在提交…" : "开始规范化"}
          </button>
        </div>
        {files.length > 0 && <div className="selected-files">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
        {message && <p className="normalization-message" role="status">{message}</p>}
      </section>

      <section className="jobs-panel" aria-labelledby="jobs-title">
        <div className="jobs-heading">
          <div><p className="panel-index">02 / 任务</p><h2 id="jobs-title">后台处理列表</h2></div>
          <button type="button" className="refresh" onClick={() => void refresh()}>立即刷新</button>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-jobs">尚无任务。上传一张测试图后，状态和对比结果会出现在这里。</div>
        ) : (
          <div className="job-list">
            {jobs.map((job) => <JobCard job={job} key={job.id} />)}
          </div>
        )}
      </section>
    </main>
  );
}

function JobCard({ job }: { job: PublicNormalizationJob }) {
  const completed = job.status === "succeeded" || job.status === "skipped";
  return (
    <article className="job-card">
      <header>
        <div><strong>{job.fileName}</strong><small>{job.outputKey}</small></div>
        <span className={`job-status is-${job.status}`}>{statusCopy[job.status]}</span>
      </header>
      <div className="image-comparison">
        <figure><img src={job.sourceUrl} alt={`${job.fileName} 原图`} /><figcaption>原图副本</figcaption></figure>
        <figure className={!completed ? "is-placeholder" : undefined}>
          {completed && job.canonicalUrl ? <img src={job.canonicalUrl} alt={`${job.fileName} 规范图`} /> : <div>{job.status === "failed" ? "没有生成结果" : "后台处理中"}</div>}
          <figcaption>1024 × 1536 规范图</figcaption>
        </figure>
      </div>
      {job.error && <p className="job-error">{job.error}</p>}
      <dl><div><dt>原图</dt><dd>{job.source.width} × {job.source.height}</dd></div><div><dt>模型</dt><dd>{job.model}</dd></div><div><dt>创建时间</dt><dd>{new Date(job.createdAt).toLocaleString()}</dd></div></dl>
    </article>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} 读取失败`));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}
