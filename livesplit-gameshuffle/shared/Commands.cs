// Answers GameShuffle's relay the way LiveSplit One answers it (livesplit-core src/networking/server_protocol.rs):
// one reply per command, in order, {"success": value} or {"error": {"code": ...}}. The relay never knows which timer
// it's talking to. Timer commands answer "Unsupported" when the runner turned the phone remote off.

using System;
using System.Collections.Generic;
using System.Globalization;

namespace GameShuffle.Link
{
    public sealed class Commands
    {
        readonly ITimer timer;
        readonly Func<bool> remoteAllowed;

        static readonly HashSet<string> Control = new HashSet<string>(StringComparer.Ordinal)
        {
            "start", "split", "splitOrStart", "undoSplit", "skipSplit", "reset", "pause", "resume", "togglePauseOrStart", "undoAllPauses",
        };

        public Commands(ITimer timer, Func<bool> remoteAllowed)
        {
            this.timer = timer;
            this.remoteAllowed = remoteAllowed;
        }

        /// <summary>The reply to one message, or null when the message isn't a command (nothing is sent back then).</summary>
        public string Handle(string text)
        {
            var msg = Json.TryParseObject(text);
            if (msg == null || !msg.TryGetValue("command", out var c) || !(c is string command))
                return msg == null ? Error("InvalidCommand", "That message isn't a JSON object with a command.") : null;
            try
            {
                return Run(command, msg);
            }
            catch (IndexOutOfRangeException)
            {
                return Error("InvalidIndex");
            }
            catch (Exception e)
            {
                // The window closing, or LiveSplit busy with something else: say so instead of going quiet.
                return Error("Unknown", e.GetType().Name);
            }
        }

        string Run(string command, Dictionary<string, object> msg)
        {
            if (Control.Contains(command))
            {
                if (!remoteAllowed()) return Error("Unsupported");
                var save = !msg.TryGetValue("saveAttempt", out var s) || !(s is bool b) || b;
                var err = timer.Control(command, save);
                return err == null ? Success(null) : Error(err);
            }
            switch (command)
            {
                case "ping": return Success(null);
                case "getCurrentState": return Success(State());
                case "getCurrentTime": return SuccessTime(timer.CurrentTime(GameTime(msg)));
                case "getSegmentName": return Success(timer.SegmentName(Index(msg)));
                case "getComparisonTime":
                {
                    var index = Index(msg);
                    var comparison = msg.TryGetValue("comparison", out var name) ? name as string : null;
                    return SuccessTime(timer.ComparisonTime(index, comparison, GameTime(msg)));
                }
                case "getCurrentRunSplitTime": return SuccessTime(timer.SplitTime(Index(msg), GameTime(msg)));
                case "switchToPreviousComparison":
                case "switchToNextComparison":
                case "setCurrentComparison":
                case "toggleTimingMethod":
                case "setCurrentTimingMethod":
                case "initializeGameTime":
                case "setGameTime":
                case "pauseGameTime":
                case "resumeGameTime":
                case "setLoadingTimes":
                case "setCustomVariable":
                    return Error("Unsupported");
                default:
                    return Error("InvalidCommand", "Unknown command: " + command);
            }
        }

        Dictionary<string, object> State()
        {
            var phase = timer.Phase;
            var state = new Dictionary<string, object> { ["state"] = phase.ToString() };
            if (phase == RunPhase.Running || phase == RunPhase.Paused) state["index"] = Math.Max(0, timer.SplitIndex);
            return state;
        }

        /// <summary>The segment a command means, the way livesplit-core resolves it (negative = from the end, relative =
        /// from the current split, missing = the current split). Out of range throws, which answers InvalidIndex.</summary>
        int Index(Dictionary<string, object> msg)
        {
            var count = timer.SegmentCount;
            var current = timer.SplitIndex;
            var relative = msg.TryGetValue("relative", out var r) && r is bool rb && rb;
            int index;
            if (msg.TryGetValue("index", out var raw) && raw is double d)
            {
                var n = (int)Math.Truncate(d);
                if (relative)
                {
                    if (current < 0) throw new IndexOutOfRangeException();
                    index = current + n;
                }
                else index = n < 0 ? count + n : n;
            }
            else
            {
                if (current < 0) throw new IndexOutOfRangeException();
                index = current;
            }
            if (index < 0 || index >= count) throw new IndexOutOfRangeException();
            return index;
        }

        static bool? GameTime(Dictionary<string, object> msg)
        {
            if (!msg.TryGetValue("timingMethod", out var t) || !(t is string s)) return null;
            if (s == "GameTime") return true;
            if (s == "RealTime") return false;
            return null;
        }

        static string SuccessTime(TimeSpan? t) => Success(t.HasValue ? TimeText.Format(t.Value) : null);

        static string Success(object value) => Json.Write(new Dictionary<string, object> { ["success"] = value });

        static string Error(string code, string message = null)
        {
            var err = new Dictionary<string, object> { ["code"] = code };
            if (message != null) err["message"] = message;
            return Json.Write(new Dictionary<string, object> { ["error"] = err });
        }

        /// <summary>An event the way LiveSplit One pushes one: {"event": "Splitted"}.</summary>
        public static string Event(string name) => Json.Write(new Dictionary<string, object> { ["event"] = name });

        /// <summary>The add-on's own message (GameShuffle's relay reads it; LiveSplit One never sends one).</summary>
        public static string Info(string addonVersion, RunInfo info, bool share, bool remote)
        {
            var body = new Dictionary<string, object>
            {
                ["v"] = 1,
                ["addon"] = addonVersion,
                ["runKey"] = info?.RunKey,
                ["remote"] = remote,
                ["game"] = share ? info?.Game : null,
                ["category"] = share ? info?.Category : null,
            };
            body["attempts"] = share && info != null ? (object)info.Attempts : null;
            return Json.Write(new Dictionary<string, object> { ["gameshuffle"] = body });
        }

        internal static string Num(int n) => n.ToString(CultureInfo.InvariantCulture);
    }
}
