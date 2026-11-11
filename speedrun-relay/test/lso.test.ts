import { test } from "node:test";
import assert from "node:assert/strict";
import { LsoClient, LsoError, type Clock, type LsoReply } from "../src/lso";

class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(id: unknown) {
    this.timers = this.timers.filter((x) => x.id !== id);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
  get count() {
    return this.timers.length;
  }
}

function setup(opts: { send?: (t: string) => void } = {}) {
  const clock = new FakeClock();
  const sent: string[] = [];
  const events: string[] = [];
  const lost: string[] = [];
  const client = new LsoClient({
    send: opts.send ?? ((t) => sent.push(t)),
    onEvent: (e) => events.push(e),
    onLost: (w) => lost.push(w),
    clock,
    timeoutMs: 5000,
    quietMs: 2000,
    tombstoneMs: 20000,
  });
  return { clock, sent, events, lost, client };
}

const flush = () => new Promise((r) => setImmediate(r));
const ok = (value: unknown) => JSON.stringify({ success: value });
const STATE = ok({ state: "Running", index: 1 });

test("answers come back in order and events pass by", async () => {
  const { client, sent, events } = setup();
  const a = client.request({ command: "getCurrentState" });
  const b = client.request({ command: "getCurrentTime" });
  const c = client.request({ command: "splitOrStart" });
  assert.deepEqual(sent.map((s) => JSON.parse(s).command), ["getCurrentState", "getCurrentTime", "splitOrStart"]);
  client.handle(STATE);
  client.handle('{"event":"Splitted"}');
  client.handle(ok("00:00:01.500000000"));
  client.handle(JSON.stringify({ error: { code: "Busy" } }));
  assert.deepEqual(await a, { ok: true, value: { state: "Running", index: 1 } });
  assert.deepEqual(await b, { ok: true, value: "00:00:01.500000000" });
  assert.deepEqual(await c, { ok: false, code: "Busy" } satisfies LsoReply);
  assert.deepEqual(events, ["Splitted"]);
  assert.equal(client.pending, 0);
});

test("a late reply is thrown away, not given to the next request", async () => {
  const { client, clock, lost } = setup();
  const slow = client.request({ command: "getCurrentTime" });
  clock.advance(5000);
  await assert.rejects(slow, (e: unknown) => e instanceof LsoError && e.code === "timeout");
  const next = client.request({ command: "getSegmentName", index: 0 });
  client.handle(ok("00:00:09.000000000")); // the late answer to the first request
  client.handle(ok("Mushroom"));
  assert.deepEqual(await next, { ok: true, value: "Mushroom" });
  assert.deepEqual(lost, ["late"]);
  assert.equal(clock.count, 0, "no timers left behind");
});

test("a reply of the wrong shape stops everything until LiveSplit One goes quiet", async () => {
  const { client, clock, lost } = setup();
  const a = client.request({ command: "getCurrentState" });
  const b = client.request({ command: "getCurrentTime" });
  client.handle(ok("00:00:01.000000000")); // a string where a state belongs
  await assert.rejects(a, (e: unknown) => e instanceof LsoError && e.code === "resync");
  await assert.rejects(b, (e: unknown) => e instanceof LsoError && e.code === "resync");
  await assert.rejects(client.request({ command: "ping" }), (e: unknown) => e instanceof LsoError && e.code === "resync");
  clock.advance(1500);
  client.handle(STATE); // stragglers are dropped and push the quiet period back
  clock.advance(1500);
  assert.deepEqual(lost, []);
  clock.advance(600);
  assert.deepEqual(lost, ["resynced"]);
  const c = client.request({ command: "getCurrentState" });
  client.handle(STATE);
  assert.deepEqual(await c, { ok: true, value: { state: "Running", index: 1 } });
});

test("a tombstone that never gets its reply leads to a resync", async () => {
  const { client, clock, lost } = setup();
  const a = client.request({ command: "getCurrentTime" });
  clock.advance(5000);
  await assert.rejects(a);
  clock.advance(19_999);
  assert.deepEqual(lost, []);
  clock.advance(1);
  clock.advance(2000);
  assert.deepEqual(lost, ["resynced"]);
  assert.equal(client.pending, 0);
});

test("stray replies are reported, close fails what is waiting", async () => {
  const { client, lost, clock } = setup();
  client.handle(ok(null));
  assert.deepEqual(lost, ["stray"]);
  const a = client.request({ command: "getCurrentState" });
  client.close();
  await assert.rejects(a, (e: unknown) => e instanceof LsoError && e.code === "closed");
  await assert.rejects(client.request({ command: "ping" }), (e: unknown) => e instanceof LsoError && e.code === "closed");
  assert.equal(clock.count, 0);
});

test("a send that throws rejects at once", async () => {
  const { client } = setup({
    send: () => {
      throw new Error("socket closed");
    },
  });
  await assert.rejects(client.request({ command: "ping" }), (e: unknown) => e instanceof LsoError && e.code === "closed");
  assert.equal(client.pending, 0);
});

test("ignores what isn't JSON or isn't a reply", async () => {
  const { client } = setup();
  const a = client.request({ command: "ping" });
  client.handle("not json");
  client.handle("[1,2]");
  client.handle('{"hello":1}');
  client.handle(ok(null));
  assert.deepEqual(await a, { ok: true, value: null });
  await flush();
});

test("the LiveSplit add-on's info message goes to onInfo and never takes a reply's place", async () => {
  const infos: Record<string, unknown>[] = [];
  const client = new LsoClient({ send: () => {}, onEvent: () => {}, onInfo: (i) => infos.push(i), clock: new FakeClock() });
  const a = client.request({ command: "getCurrentState" });
  client.handle(JSON.stringify({ gameshuffle: { v: 1, addon: "1.0.0", game: "Super Mario Odyssey", attempts: 42 } }));
  client.handle(STATE);
  assert.deepEqual(await a, { ok: true, value: { state: "Running", index: 1 } });
  assert.equal(infos.length, 1);
  assert.equal(infos[0].game, "Super Mario Odyssey");
});
