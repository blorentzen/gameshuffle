// What the protocol needs from a timer. LiveSplit's own (LiveSplitTimer, in the add-on) answers on LiveSplit's window
// thread; the tests use a made-up one. Every member may be called from the connection's thread.

using System;
using System.Globalization;
using System.Text;

namespace GameShuffle.Link
{
    public enum RunPhase { NotRunning, Running, Paused, Ended }

    public interface ITimer
    {
        RunPhase Phase { get; }
        /// <summary>The split being run (0-based) while running or paused; -1 otherwise.</summary>
        int SplitIndex { get; }
        int SegmentCount { get; }
        string SegmentName(int index);
        /// <summary>A comparison's split time (cumulative), or null. Null comparison = the one on screen; null gameTime = the timing method on screen.</summary>
        TimeSpan? ComparisonTime(int index, string comparison, bool? gameTime);
        /// <summary>This attempt's split time for a segment, or null.</summary>
        TimeSpan? SplitTime(int index, bool? gameTime);
        /// <summary>The time on the timer now, or null (game time before it starts).</summary>
        TimeSpan? CurrentTime(bool? gameTime);
        /// <summary>Runs a timer command (start, split, undoSplit, skipSplit, reset, pause, resume, ...). Null when it
        /// worked, else an error code the way LiveSplit One names them (NoRunInProgress, RunFinished, ...).</summary>
        string Control(string command, bool saveAttempt);
        /// <summary>What the splits file says, for GameShuffle's setup page (pick 2): game, category, attempt count.</summary>
        RunInfo Info();
    }

    public sealed class RunInfo
    {
        public string Game;
        public string Category;
        public int Attempts;
        /// <summary>Changes when the splits change (another file, renamed or added splits): the relay reads them again.</summary>
        public string RunKey;
    }

    public static class TimeText
    {
        /// <summary>LiveSplit One's format: "hh:mm:ss.fffffffff", "d." in front past a day, "-" for negative times.</summary>
        public static string Format(TimeSpan t)
        {
            var sb = new StringBuilder();
            if (t < TimeSpan.Zero) { sb.Append('-'); t = t.Negate(); }
            if (t.Days > 0) sb.Append(t.Days.ToString(CultureInfo.InvariantCulture)).Append('.');
            sb.Append(t.Hours.ToString("00", CultureInfo.InvariantCulture)).Append(':')
              .Append(t.Minutes.ToString("00", CultureInfo.InvariantCulture)).Append(':')
              .Append(t.Seconds.ToString("00", CultureInfo.InvariantCulture)).Append('.')
              // Ticks are 100 ns: seven digits, then two zeros for nanoseconds.
              .Append((t.Ticks % TimeSpan.TicksPerSecond).ToString("0000000", CultureInfo.InvariantCulture)).Append("00");
            return sb.ToString();
        }

        /// <summary>A short, stable fingerprint of the split names (FNV-1a, hex).</summary>
        public static string KeyOf(System.Collections.Generic.IEnumerable<string> names)
        {
            unchecked
            {
                uint h = 2166136261;
                var n = 0;
                foreach (var name in names)
                {
                    foreach (var c in (name ?? "") + "\n") { h ^= c; h *= 16777619; }
                    n++;
                }
                return n.ToString(CultureInfo.InvariantCulture) + "-" + h.ToString("x8", CultureInfo.InvariantCulture);
            }
        }
    }
}
