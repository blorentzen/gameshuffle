using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace GameShuffle.Link.Tests
{
    /// <summary>A made-up timer that behaves like LiveSplit's TimerModel for the commands the relay sends.</summary>
    sealed class FakeTimer : ITimer
    {
        public string[] Names = { "Cap", "Cascade", "Sand", "Lake" };
        public TimeSpan?[] Pb = { TimeSpan.FromSeconds(221.2), TimeSpan.FromSeconds(482.7), TimeSpan.FromSeconds(947.9), TimeSpan.FromSeconds(1162.4) };
        public TimeSpan?[] Best = { TimeSpan.FromSeconds(215.0), TimeSpan.FromSeconds(470.5), TimeSpan.FromSeconds(930.1), TimeSpan.FromSeconds(1140.0) };
        public TimeSpan?[] Splits = new TimeSpan?[4];
        public RunPhase Phase { get; set; } = RunPhase.NotRunning;
        public int SplitIndex { get; set; } = -1;
        public TimeSpan Now = TimeSpan.Zero;
        public int Attempts = 41;
        public string Game = "Super Mario Odyssey", Category = "Any%";
        public bool GameTimeOn;

        public int SegmentCount => Names.Length;
        public string SegmentName(int i) => Names[i];
        public TimeSpan? ComparisonTime(int i, string comparison, bool? gameTime)
        {
            if (gameTime == true && !GameTimeOn) return null;
            if (comparison == null || comparison == "Personal Best") return Pb[i];
            if (comparison == "Best Segments") return Best[i];
            return null;
        }
        public TimeSpan? SplitTime(int i, bool? gameTime) => gameTime == true && !GameTimeOn ? null : Splits[i];
        public TimeSpan? CurrentTime(bool? gameTime) => gameTime == true && !GameTimeOn ? (TimeSpan?)null : Now;

        public string Control(string command, bool saveAttempt)
        {
            switch (command)
            {
                case "start":
                    if (Phase != RunPhase.NotRunning) return "RunAlreadyInProgress";
                    Phase = RunPhase.Running; SplitIndex = 0; Attempts++; Now = TimeSpan.Zero; return null;
                case "split":
                    if (Phase == RunPhase.NotRunning) return "NoRunInProgress";
                    if (Phase == RunPhase.Ended) return "RunFinished";
                    if (Phase == RunPhase.Paused) return "TimerPaused";
                    Splits[SplitIndex] = Now; SplitIndex++;
                    if (SplitIndex == Names.Length) { Phase = RunPhase.Ended; SplitIndex = -1; }
                    return null;
                case "reset":
                    if (Phase == RunPhase.NotRunning) return "NoRunInProgress";
                    Phase = RunPhase.NotRunning; SplitIndex = -1; Splits = new TimeSpan?[Names.Length]; return null;
                case "undoSplit":
                    if (Phase == RunPhase.NotRunning) return "NoRunInProgress";
                    if (SplitIndex == 0) return "CantUndoFirstSplit";
                    if (Phase == RunPhase.Ended) { Phase = RunPhase.Running; SplitIndex = Names.Length; }
                    SplitIndex--; Splits[SplitIndex] = null; return null;
                default: return "Unsupported";
            }
        }

        public RunInfo Info() => new RunInfo { Game = Game, Category = Category, Attempts = Attempts, RunKey = TimeText.KeyOf(Names) };
    }

    static class Program
    {
        static int fails;
        static int passes;
        static void Check(bool ok, string what, string got = null)
        {
            if (ok) passes++; else fails++;
            Console.WriteLine((ok ? "ok   " : "FAIL ") + what + (ok || got == null ? "" : "  (got " + got + ")"));
        }

        static int Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "live") return Live(args).GetAwaiter().GetResult();
            Unit();
            Console.WriteLine(fails == 0 ? passes + " passed" : fails + " failed, " + passes + " passed");
            return fails == 0 ? 0 : 1;
        }

        static void Unit()
        {
            // JSON
            var o = Json.TryParseObject("{\"command\":\"getSegmentName\",\"index\":-1,\"x\":[1,true,null,\"a\\\"b\\u00e9\"]}");
            Check(o != null && (string)o["command"] == "getSegmentName" && (double)o["index"] == -1, "JSON reads a command");
            var arr = (List<object>)o["x"];
            Check(arr.Count == 4 && (bool)arr[1] && arr[2] == null && (string)arr[3] == "a\"bé", "JSON reads arrays, literals and escapes");
            Check(Json.TryParseObject("not json") == null && Json.TryParseObject("[1]") == null, "JSON that isn't an object is refused");
            Check(Json.Write(new Dictionary<string, object> { ["a"] = "x\ny", ["b"] = null, ["c"] = 3 }) == "{\"a\":\"x\\ny\",\"b\":null,\"c\":3}", "JSON writes");

            // Times, the way livesplit-core writes them (the relay's parseTime reads these).
            Check(TimeText.Format(TimeSpan.FromSeconds(480.1)) == "00:08:00.100000000", "time: 8:00.1", TimeText.Format(TimeSpan.FromSeconds(480.1)));
            Check(TimeText.Format(TimeSpan.FromSeconds(-1.5)) == "-00:00:01.500000000", "time: negative");
            Check(TimeText.Format(new TimeSpan(1, 2, 3, 4, 500)) == "1.02:03:04.500000000", "time: past a day");
            Check(TimeText.KeyOf(new[] { "A", "B" }) != TimeText.KeyOf(new[] { "A", "C" }) && TimeText.KeyOf(new[] { "A" }).StartsWith("1-"), "run key changes with the names");

            // Commands
            var t = new FakeTimer();
            var remote = true;
            var c = new Commands(t, () => remote);
            Check(c.Handle("{\"command\":\"getSegmentName\",\"index\":0}") == "{\"success\":\"Cap\"}", "segment name");
            Check(c.Handle("{\"command\":\"getSegmentName\",\"index\":-1}") == "{\"success\":\"Lake\"}", "segment name from the end");
            Check(c.Handle("{\"command\":\"getSegmentName\",\"index\":4}") == "{\"error\":{\"code\":\"InvalidIndex\"}}", "past the last split: InvalidIndex");
            Check(c.Handle("{\"command\":\"getSegmentName\"}") == "{\"error\":{\"code\":\"InvalidIndex\"}}", "no current split before a run");
            Check(c.Handle("{\"command\":\"getCurrentState\"}") == "{\"success\":{\"state\":\"NotRunning\"}}", "state before a run");
            Check(c.Handle("{\"command\":\"getComparisonTime\",\"index\":1,\"comparison\":\"Personal Best\"}") == "{\"success\":\"00:08:02.700000000\"}", "PB split");
            Check(c.Handle("{\"command\":\"getComparisonTime\",\"index\":3,\"comparison\":\"Best Segments\"}") == "{\"success\":\"00:19:00.000000000\"}", "sum of best");
            Check(c.Handle("{\"command\":\"getCurrentTime\",\"timingMethod\":\"GameTime\"}") == "{\"success\":null}", "game time before it starts: null");
            Check(c.Handle("{\"command\":\"start\"}") == "{\"success\":null}", "start");
            Check(c.Handle("{\"command\":\"start\"}") == "{\"error\":{\"code\":\"RunAlreadyInProgress\"}}", "start twice");
            Check(c.Handle("{\"command\":\"getCurrentState\"}") == "{\"success\":{\"state\":\"Running\",\"index\":0}}", "state while running");
            t.Now = TimeSpan.FromSeconds(200);
            Check(c.Handle("{\"command\":\"split\"}") == "{\"success\":null}" && t.SplitIndex == 1, "split");
            Check(c.Handle("{\"command\":\"getCurrentRunSplitTime\",\"index\":0}") == "{\"success\":\"00:03:20.000000000\"}", "this attempt's split time");
            Check(c.Handle("{\"command\":\"getSegmentName\",\"index\":1,\"relative\":true}") == "{\"success\":\"Sand\"}", "relative index");
            remote = false;
            Check(c.Handle("{\"command\":\"split\"}") == "{\"error\":{\"code\":\"Unsupported\"}}" && t.SplitIndex == 1, "phone remote off: timer commands refused");
            Check(c.Handle("{\"command\":\"getCurrentState\"}").Contains("Running"), "phone remote off: reads still work");
            remote = true;
            Check(c.Handle("{\"command\":\"reset\",\"saveAttempt\":true}") == "{\"success\":null}" && t.Phase == RunPhase.NotRunning, "reset");
            Check(c.Handle("{\"command\":\"switchToNextComparison\"}") == "{\"error\":{\"code\":\"Unsupported\"}}", "commands it doesn't take: Unsupported");
            Check(c.Handle("{\"command\":\"fly\"}").Contains("InvalidCommand"), "unknown command: InvalidCommand");
            Check(c.Handle("{\"event\":\"Splitted\"}") == null, "a message that isn't a command gets no reply");
            Check(c.Handle("nope").Contains("InvalidCommand"), "text that isn't JSON: InvalidCommand");
            Check(Commands.Event("Splitted") == "{\"event\":\"Splitted\"}", "events look like LiveSplit One's");
            var info = Commands.Info("1.0.0", t.Info(), true, true);
            Check(info.StartsWith("{\"gameshuffle\":{\"v\":1,\"addon\":\"1.0.0\"") && info.Contains("\"game\":\"Super Mario Odyssey\"") && info.Contains("\"attempts\":42"), "info message", info);
            var quiet = Commands.Info("1.0.0", t.Info(), false, false);
            Check(quiet.Contains("\"game\":null") && quiet.Contains("\"attempts\":null") && quiet.Contains("\"remote\":false") && quiet.Contains("runKey"), "info with sharing off keeps only what the relay needs", quiet);

            // Addresses
            Check(Connection.Normalize("  wss://relay.example/lso/t1.abc.1.sig  ", "wss://x") == "wss://relay.example/lso/t1.abc.1.sig", "an address as copied");
            Check(Connection.Normalize("t1.abc.1.sig", "wss://relay.example") == "wss://relay.example/lso/t1.abc.1.sig", "just the token");
            Check(Connection.Normalize("https://www.gameshuffle.co/speedrun", "wss://x") == null && Connection.Normalize("", "wss://x") == null, "anything else is refused");
        }

        /// <summary>The made-up timer through a real relay: it reads the run, follows a start and a split, takes the info message.</summary>
        static async Task<int> Live(string[] args)
        {
            var wsBase = args[1]; var token = args[2]; var http = args[3].TrimEnd('/'); var relayId = args[4]; var secret = args[5];
            var t = new FakeTimer();
            var conn = new Connection(new Commands(t, () => true), () => Commands.Info("1.0.0", t.Info(), true, true));
            var statuses = new List<string>();
            conn.Changed += (s, d) => statuses.Add(s.ToString());
            conn.SetAddress(Connection.Normalize(token, wsBase));
            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("authorization", "Bearer " + secret);
            async Task<Dictionary<string, object>> State()
            {
                var body = await client.GetStringAsync(http + "/state/" + relayId);
                return Json.TryParseObject(body);
            }
            async Task<Dictionary<string, object>> WaitFor(Func<Dictionary<string, object>, bool> ok, int ms = 8000)
            {
                Dictionary<string, object> last = null;
                for (var waited = 0; waited < ms; waited += 250)
                {
                    try { last = await State(); if (ok(last)) return last; } catch { }
                    await Task.Delay(250);
                }
                return last;
            }
            Dictionary<string, object> St(Dictionary<string, object> r) => r?["state"] as Dictionary<string, object>;

            var s1 = await WaitFor(r => St(r) != null && (bool)St(r)["connected"] && ((List<object>)St(r)["segments"]).Count == 4);
            var segs = (List<object>)St(s1)?["segments"];
            Check(segs != null && segs.Count == 4, "the relay read 4 splits", s1 == null ? "nothing" : Json.Write(St(s1)));
            var first = segs?[0] as Dictionary<string, object>;
            Check(first != null && (string)first["name"] == "Cap" && (double)first["pbMs"] == 221200 && (double)first["bestMs"] == 215000, "names, PB and best segments came through");
            Check(statuses.Contains("Connected"), "the add-on says it's connected");

            t.Control("start", true);
            conn.Send(Commands.Event("Started"));
            var s2 = await WaitFor(r => (string)St(r)["phase"] == "running");
            Check((string)St(s2)?["phase"] == "running", "a start shows as running");
            Check(s2 != null && (double)St(s2)["attempt"] >= 1, "the relay counted the attempt");
            t.Now = TimeSpan.FromSeconds(219.4);
            t.Control("split", true);
            conn.Send(Commands.Event("Splitted"));
            var s3 = await WaitFor(r => ((List<object>)St(r)["splits"])[0] is double);
            var split0 = ((List<object>)St(s3)?["splits"])?[0];
            Check(split0 is double d && d == 219400, "the split time came through", split0?.ToString());
            Check(s3 != null && ((List<object>)St(s3)["golds"])[0] is bool g0 && !g0, "not a gold (best segment is 3:35.0)");
            var timer = s3?.ContainsKey("timer") == true ? s3["timer"] as Dictionary<string, object> : null;
            Check(timer != null && (string)timer["game"] == "Super Mario Odyssey" && (string)timer["addon"] == "1.0.0", "the relay kept the add-on's info", timer == null ? "none" : Json.Write(timer));

            // A command from the site (the phone remote) reaches the timer.
            var cmd = new HttpRequestMessage(HttpMethod.Post, http + "/cmd/" + relayId) { Content = new StringContent("{\"command\":\"split\"}") };
            cmd.Headers.Add("authorization", "Bearer " + secret);
            var reply = await (await client.SendAsync(cmd)).Content.ReadAsStringAsync();
            Check(reply.Contains("\"ok\":true") && t.SplitIndex == 2, "the phone remote's split reached the timer", reply);

            conn.Dispose();
            var s4 = await WaitFor(r => !(bool)St(r)["connected"]);
            Check(s4 != null && !(bool)St(s4)["connected"], "closing the add-on disconnects");
            Console.WriteLine(fails == 0 ? passes + " passed" : fails + " failed, " + passes + " passed");
            return fails == 0 ? 0 : 1;
        }
    }
}
