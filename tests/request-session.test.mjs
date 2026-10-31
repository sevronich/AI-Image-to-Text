import test from "node:test";
import assert from "node:assert/strict";
import { createRequestSession } from "../lib/request-session.mjs";

test("a new image aborts old inference and blocks its late non-cooperative result", async () => {
  const session = createRequestSession(); let finishOld;
  const old = session.begin();
  const oldResult = new Promise(resolve => { finishOld = resolve; });
  const next = session.begin(); let displayed = "new image pending";
  const renderOld = oldResult.then(value => { if (old.isCurrent()) displayed = value; });
  finishOld("old image result"); await renderOld;
  assert.equal(old.signal.aborted, true); assert.equal(next.isCurrent(), true);
  assert.equal(displayed, "new image pending");
});
test("out-of-order image decoding cannot overwrite the latest selection", async () => {
  const session = createRequestSession(); const slow = session.begin(); const fast = session.begin();
  const visible = [];
  await Promise.resolve().then(() => { if (fast.isCurrent()) visible.push("fast image"); });
  await Promise.resolve().then(() => { if (slow.isCurrent()) visible.push("slow image"); });
  assert.deepEqual(visible, ["fast image"]);
});
test("clearing an image invalidates a pending response even before a replacement exists", () => {
  const session = createRequestSession(); const pending = session.begin(); session.invalidate();
  assert.equal(pending.signal.aborted, true); assert.equal(pending.isCurrent(), false);
});
