import test from "node:test";
import assert from "node:assert/strict";
import { CallClock } from "./src/call-clock.ts";
test("call deadlines start only after media readiness and retain independent idle and maximum clocks",()=>{
  const clock=new CallClock();
  assert.equal(clock.snapshot(50000),null);
  clock.activate(1000);
  assert.equal(clock.snapshot(121000)?.idleRemaining,10);
  clock.activity(126000);
  assert.equal(clock.snapshot(131000)?.ended,null);
  clock.busy();
  assert.equal(clock.snapshot(400000)?.idleRemaining,130);
  clock.listening(401000);
  assert.equal(clock.snapshot(531000)?.ended,"IDLE_TIMEOUT");
  clock.activity(890000);
  assert.equal(clock.snapshot(891000)?.maxRemaining,10);
  clock.activate(899000); // Cannot reset the maximum with duplicate readiness.
  assert.equal(clock.snapshot(901000)?.ended,"MAX_DURATION");
});
