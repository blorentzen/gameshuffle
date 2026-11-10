import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMs, parseTime } from "../src/time";

test("parses LiveSplit One's server times", () => {
  assert.equal(parseTime("00:08:00.100000000"), 480_100);
  assert.equal(parseTime("00:33:41.800000000"), 2_021_800);
  assert.equal(parseTime("00:00:01.207399845"), 1207);
  assert.equal(parseTime("00:00:00.000000000"), 0);
  assert.equal(parseTime("00:00:00.004499913"), 4);
  assert.equal(parseTime("12:34:56.123456789"), 45_296_123);
  assert.equal(parseTime("-00:00:01.500000000"), -1500);
  assert.equal(parseTime("-12:34:56.123456789"), -45_296_123);
  assert.equal(parseTime("1.02:03:04.500000000"), (((24 + 2) * 60 + 3) * 60 + 4) * 1000 + 500);
  assert.equal(parseTime("89.12:34:56.123456789"), ((89 * 24 + 12) * 3600 + 34 * 60 + 56) * 1000 + 123);
});

test("parses short and hand-typed forms", () => {
  assert.equal(parseTime("1:07:30.70"), 4_050_700);
  assert.equal(parseTime("-00:00:01.5"), -1500);
  assert.equal(parseTime("7:55.4"), 475_400);
  assert.equal(parseTime("45.2"), 45_200);
  assert.equal(parseTime("45"), 45_000);
  assert.equal(parseTime("00:00"), 0);
  assert.equal(parseTime(" 00:00:02.25 "), 2250);
  assert.equal(parseTime("00:00:02,25"), 2250);
  assert.equal(parseTime("−00:00:01.000"), -1000);
  assert.equal(parseTime("-00:00:00.000000000"), 0);
});

test("rejects what isn't a time", () => {
  for (const bad of [null, undefined, 12, "", "abc", "1:2:3:4", "--1", "1.5.6", "00:00:01.", ":30"]) {
    assert.equal(parseTime(bad), null, String(bad));
  }
});

test("formats for logs", () => {
  assert.equal(formatMs(125_432), "2:05.432");
  assert.equal(formatMs(-1500), "-0:01.500");
  assert.equal(formatMs(4_050_700), "1:07:30.700");
});
