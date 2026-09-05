import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, resolve, relative, sep } from "node:path";
import { RoleStore, STAGES, hash, type RoleJob, type Stage } from "./state.ts";
import { PaidImages } from "./paid-images.ts";
import { validateAndConvertInput, sanitizeProviderError } from "../../image-normalization/src/validation.ts";
import { NORMALIZATION_CONTRACT, NORMALIZATION_PROMPT } from "../../image-normalization/src/contract.ts";
import { donorPrompt, donorPromptVersion } from "../../portrait-motion/src/donors.ts";
import {pipelineVersion} from './version.ts';

interface Fixture { inputHash: string; images: Record<string, { path: string; sha256: string }> }
interface Options { root: string; python: string; paid: PaidImages; fixture?: Fixture }
export class RolePipeline {
  readonly store: RoleStore; readonly options: Options;
  #working?: Promise<void>; #submissions: Promise<unknown> = Promise.resolve(); #closing = false;
  #controls: Promise<unknown> = Promise.resolve();
  constructor(options: Options) { this.options = options; this.store = new RoleStore(options.root); }
  async initialize() { await this.store.initialize(); this.kick(); }
  submit(name: string, bytes: Buffer, key: string): Promise<RoleJob> {
    const task = this.#submissions.then(async () => {
      if (this.#closing) throw new Error("SERVICE_STOPPING");
      await validateAndConvertInput({ fileName: name, bytes });
      if (this.options.fixture && hash(bytes) !== this.options.fixture.inputHash) throw new Error("FIXTURE_INPUT_MISMATCH: replay accepts only its recorded input");
      const job = await this.store.create(name, bytes, key, this.options.fixture ? "fixture" : "live");
      this.kick(); return job;
    });
    this.#submissions = task.catch(() => {}); return task;
  }
  kick() {
    if (this.#working || this.#closing) return;
    this.#working = this.drain().finally(() => { this.#working = undefined; if (!this.#closing) void this.store.list().then(jobs=>{if(jobs.some(j=>j.status==="queued"))this.kick();}).catch(()=>{}); });
    // Failed storage is reported by the caller on subsequent operations, not an unhandled rejection.
    void this.#working.catch(() => {});
  }
  async wait() { await this.#submissions; await this.#working; }
  async close() { this.#closing = true; await this.wait(); await this.store.close(); }
  control<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#controls.then(operation); this.#controls = result.catch(()=>{}); return result;
  }
  resume(id: string) { return this.control(()=>this.resumeRole(id)); }
  async resumeRole(id: string) {
    const job = await this.store.get(id);
    if (job.status !== "paused") throw new Error("ROLE_NOT_PAUSED");
    // This changes scheduling only. A paid ledger in unknown state still prevents a request.
    job.status = "queued"; delete job.error; await this.store.save(job); this.kick(); return job;
  }
  review(id: string, decision: "approved" | "rejected", note: string, expectedHash: string) { return this.control(()=>this.reviewRole(id,decision,note,expectedHash)); }
  async reviewRole(id: string, decision: "approved" | "rejected", note: string, expectedHash: string) {
    const job = await this.store.get(id);
    if (job.status !== "awaiting_review" || job.resourceHash !== expectedHash) throw new Error("STALE_REVIEW_OR_INVALID_STATE");
    if (!(await this.verify(job))) throw new Error("RESOURCE_CHANGED_SINCE_AUDIT");
    job.status = decision; job.review = { decision, note: note.slice(0, 2000), resourceHash: expectedHash, at: new Date().toISOString() };
    await this.store.save(job); return job;
  }
  async verify(job: RoleJob) {
    try {
      for (const cp of Object.values(job.completed)) for (const [path, digest] of Object.entries(cp.files)) {
        if (hash(await readFile(this.safePath(job.id, path))) !== digest) return false;
      }
      return true;
    } catch { return false; }
  }
  safePath(id: string, path: string) {
    const root = this.store.directory(id), target = resolve(root, path.replaceAll("\\", "/"));
    if (!target.startsWith(root + sep)) throw new Error("PATH_OUTSIDE_ROLE");
    return target;
  }
  async drain() {
    while (!this.#closing) {
      const job = (await this.store.list()).reverse().find(j => j.status === "queued");
      if (!job) return;
      await this.run(job);
    }
  }
  async run(job: RoleJob) {
    try {
      const version=await pipelineVersion();
      if(Object.keys(job.completed).length && job.pipelineVersion!==version)throw new Error('PIPELINE_VERSION_CHANGED: preserve old resources; submit a new job to rebuild from verified image cache');
      job.pipelineVersion=version;
      if ((job.mode === "fixture") !== Boolean(this.options.fixture)) throw new Error("EXECUTION_MODE_CHANGED");
      if (hash(await readFile(join(this.store.directory(job.id), "source.upload"))) !== job.sourceHash || !await this.verify(job)) throw new Error("CHECKPOINT_HASH_MISMATCH");
      for (const stage of STAGES) {
        if (job.completed[stage]) continue;
        job.status = "running"; job.stage = stage; await this.store.save(job);
        const started = Date.now(); const paths = await this.execute(job, stage);
        const files: Record<string, string> = {};
        for (const path of paths) files[relative(this.store.directory(job.id), path).split(sep).join("/")] = hash(await readFile(path));
        job.completed[stage] = { files, elapsedMs: Date.now() - started }; await this.store.save(job);
      }
      job.resourceHash = hash(JSON.stringify(job.completed)); job.status = "awaiting_review"; delete job.error; await this.store.save(job);
    } catch (e) { job.status = "paused"; job.error = sanitizeProviderError(e); await this.store.save(job); }
  }
  async image(job: RoleJob, state: string, source: string) {
    if (this.options.fixture) {
      const entry = this.options.fixture.images[state]; if (!entry) throw new Error("FIXTURE_STATE_MISSING");
      const bytes = await readFile(entry.path); if (hash(bytes) !== entry.sha256) throw new Error("FIXTURE_HASH_MISMATCH"); return bytes;
    }
    const input = await validateAndConvertInput({ fileName: "input.png", bytes: await readFile(source) });
    const normal = state === "normalize";
    return this.options.paid.image(input, state, normal ? NORMALIZATION_CONTRACT.promptVersion : donorPromptVersion(state as Parameters<typeof donorPrompt>[0]), normal ? NORMALIZATION_PROMPT : donorPrompt(state as Parameters<typeof donorPrompt>[0]));
  }
  async execute(job: RoleJob, stage: Stage): Promise<string[]> {
    const directory = this.store.directory(job.id), source = join(directory, "source.upload"), canonical = join(directory, "canonical.png");
    const py = async (script: string, ...args: string[]) => this.command(this.options.python, [resolve("scripts/portrait-motion", script), ...args]);
    if (stage === "preflight") { const output = join(directory, "preflight.json"); await py("preflight.py", source, output); return [output]; }
    if (stage === "normalize") { await writeFile(canonical, await this.image(job, stage, source)); return [canonical]; }
    if (stage === "locate") {
      await py("prepare.py", canonical, directory);
      return ["landmarks.json", "static_locked_base.png", "mask-mouth.png", "mask-eyeLeft.png", "mask-eyeRight.png", "mask-union.png"].map(n => join(directory,n));
    }
    if (["mouth-half", "mouth-open", "eyes-half", "eyes-closed"].includes(stage)) {
      await mkdir(join(directory, "donors"), { recursive: true }); const output = join(directory, "donors", `${stage}.png`);
      await writeFile(output, await this.image(job, stage, canonical)); return [output];
    }
    if (stage === "assemble") {
      await py("assemble.py", directory);
      const pointer = JSON.parse(await readFile(join(directory, "resource-candidate.json"), "utf8"));
      job.resource = pointer.resource;
      const resource = this.safePath(job.id, job.resource!);
      return (await readdir(resource)).filter(n => !n.endsWith(".tmp")).map(n=>join(resource,n));
    }
    if (!job.resource) throw new Error("RESOURCE_NOT_ASSEMBLED");
    const resource = this.safePath(job.id, job.resource);
    if (stage === "audit") { await py("audit_resource.py", directory); return [join(resource,"final-audit.json")]; }
    if (stage === "export") { await py("export_preview.py", directory); return [join(resource,"preview.html"), join(resource,"motion-preview.png")]; }
    if (stage === "browser") {
      const html = await readFile(join(resource,"preview.html"));
      const server = createServer((req,res) => { if(req.url!=="/preview.html"){res.writeHead(404);res.end();return;}res.writeHead(200,{"content-type":"text/html"});res.end(html); });
      await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
      try { const address = server.address() as { port: number }; await this.command(process.execPath,[resolve("scripts/portrait-motion/verify-preview.mjs"),`http://127.0.0.1:${address.port}/preview.html`,resource]); }
      finally { await new Promise<void>(r=>server.close(()=>r())); }
      return [join(resource,"browser-qa.json")];
    }
    await py("finalize_resource.py", directory); return [join(directory,"resource-current.json"),join(directory,`${job.resource}-review.zip`)];
  }
  async command(program: string, args: string[]) {
    await new Promise<void>((accept,reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUTF8: "1" };
      for (const key of Object.keys(env)) if (/(KEY|TOKEN|SECRET|PASSWORD)/i.test(key)) delete env[key];
      const child = spawn(program,args,{windowsHide:true,env,stdio:["ignore","ignore","pipe"]});
      let error = ""; child.stderr.on("data",chunk=>{error=(error+chunk.toString()).slice(-16000);});
      const timer=setTimeout(()=>{child.kill();reject(new Error("LOCAL_STAGE_TIMEOUT"));},600_000);
      child.once("error",e=>{clearTimeout(timer);reject(e);});
      child.once("exit",code=>{clearTimeout(timer);const lines=error.trim().split(/\r?\n/);const diagnostic=lines.filter(line=>/^\w*(Error|Exception):|^\s*code:/.test(line));code===0?accept():reject(new Error(`LOCAL_STAGE_FAILED exit=${code}: ${sanitizeProviderError((diagnostic.length?diagnostic:lines.slice(-2)).join(' '))}`));});
    });
  }
}
