import test from "node:test";
import assert from "node:assert/strict";
import { roleInstructions } from "../../apps/server/src/role-instructions.ts";
import type { AvatarRecord } from "../../apps/server/src/avatar-store.ts";
test("role instructions snapshot each character without leaking another role or changing the base",()=>{
  const role:AvatarRecord={id:"one",batchId:"batch",name:"小林",persona:"与用户是同学，语气轻松，喜欢园艺",sourcePath:"private/photo",status:"ready",stage:"ready",percent:100,createdAt:"today",attempt:0};
  const base="每次回答不超过两句话。";
  const first=roleInstructions(role,base);role.persona="与用户是老师，说话严谨";
  const second=roleInstructions(role,base);
  assert.ok(first.includes("同学"));assert.ok(!first.includes("老师"));assert.ok(second.includes("老师"));assert.ok(!second.includes("同学"));
  assert.ok(first.startsWith(base));assert.ok(!first.includes("private/photo"));
  assert.equal(roleInstructions({...role,DELET_OR_NOT:true},base),base);assert.equal(roleInstructions(null,base),base);
});
