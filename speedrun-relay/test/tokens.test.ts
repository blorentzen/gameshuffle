import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerOk, signBody, signToken, timingSafeEqual, verifyBody, verifyToken } from "../src/tokens";

// Shared with the site's suite (specs/gs-speedrun/phase1-contract.md).
const SECRET = "test-secret-0123456789abcdef0123456789";
const RELAY = "AbCdEfGh12345678";
const TIMER = "t1.AbCdEfGh12345678.1.4Wg53LFG6THcL-65ru8oQI";
const OVERLAY = "o1.AbCdEfGh12345678.1.Owqqi3mshHyOYbuNt0Z_Zk";
const ROOM = "r1.AbCdEfGh12345678.1.dqF0YB_KU0q9vuJ9l1563w";
const BODY = JSON.stringify({ relayId: RELAY, event: "start" });
const BODY_SIG = "83b9b2aecc2ac281c8a93bd563a3b04d7a2aa8f16f1e52dfae81c177a6a139f0";

test("signs the contract's test vectors", async () => {
  assert.equal(await signToken(SECRET, "timer", RELAY, 1), TIMER);
  assert.equal(await signToken(SECRET, "overlay", RELAY, 1), OVERLAY);
  assert.equal(await signToken(SECRET, "room", RELAY, 1), ROOM);
  assert.deepEqual(await verifyToken(SECRET, ROOM, "room"), { kind: "room", relayId: RELAY, version: 1 });
  assert.equal(await verifyToken(SECRET, ROOM, "overlay"), null);
  assert.equal(BODY, '{"relayId":"AbCdEfGh12345678","event":"start"}');
  assert.equal(await signBody(SECRET, BODY), BODY_SIG);
  assert.equal(await verifyBody(SECRET, BODY, BODY_SIG), true);
  assert.equal(await verifyBody(SECRET, BODY + " ", BODY_SIG), false);
});

test("verifies its own tokens and nothing else", async () => {
  assert.deepEqual(await verifyToken(SECRET, TIMER), { kind: "timer", relayId: RELAY, version: 1 });
  assert.deepEqual(await verifyToken(SECRET, OVERLAY, "overlay"), { kind: "overlay", relayId: RELAY, version: 1 });
  assert.equal(await verifyToken(SECRET, TIMER, "overlay"), null, "kind must match");
  assert.equal(await verifyToken(SECRET, OVERLAY, "timer"), null);
  assert.equal(await verifyToken("another-secret-0123456789abcdef0123", TIMER), null, "other secret");
  assert.equal(await verifyToken(SECRET, TIMER.replace(".1.", ".2.")), null, "version is signed");
  assert.equal(await verifyToken(SECRET, TIMER.replace("t1.", "o1.")), null, "kind is signed");
  assert.equal(await verifyToken(SECRET, TIMER.slice(0, -1) + "J"), null, "one character off");
  assert.equal(await verifyToken(SECRET, TIMER + "x"), null, "too long");
  assert.equal(await verifyToken(SECRET, "t1.AbCdEfGh1234567.1.4Wg53LFG6THcL-65ru8oQI"), null, "short relay id");
  assert.equal(await verifyToken(SECRET, "t1.AbCdEfGh12345678.01.4Wg53LFG6THcL-65ru8oQI"), null, "leading zero");
  assert.equal(await verifyToken(SECRET, ""), null);
  const v7 = await signToken(SECRET, "timer", RELAY, 7);
  assert.deepEqual(await verifyToken(SECRET, v7, "timer"), { kind: "timer", relayId: RELAY, version: 7 });
});

test("refuses bad inputs when signing", async () => {
  await assert.rejects(signToken(SECRET, "timer", "short", 1));
  await assert.rejects(signToken(SECRET, "timer", RELAY, 0));
  await assert.rejects(signToken(SECRET, "timer", RELAY, 1.5));
});

test("bearer check and constant-time compare", async () => {
  assert.equal(await bearerOk(SECRET, `Bearer ${SECRET}`), true);
  assert.equal(await bearerOk(SECRET, `Bearer ${SECRET}x`), false);
  assert.equal(await bearerOk(SECRET, SECRET), false);
  assert.equal(await bearerOk(SECRET, null), false);
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "ab"), false);
  assert.equal(timingSafeEqual("", ""), true);
});
