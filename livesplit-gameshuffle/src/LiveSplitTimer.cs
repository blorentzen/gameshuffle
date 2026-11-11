// LiveSplit's timer, as the protocol needs it. Every read and command runs on LiveSplit's window thread (the
// connection calls from its own), and commands go through a TimerModel like LiveSplit's own server does, so they fire
// the same events as the runner's hotkeys.

using System;
using System.Linq;
using LiveSplit.Model;
using LsPhase = LiveSplit.Model.TimerPhase;

namespace GameShuffle.Link
{
    sealed class LiveSplitTimer : ITimer
    {
        readonly LiveSplitState state;
        readonly TimerModel model;

        public LiveSplitTimer(LiveSplitState state)
        {
            this.state = state;
            model = new TimerModel { CurrentState = state };
        }

        T Ui<T>(Func<T> read)
        {
            var form = state.Form;
            if (form == null || form.IsDisposed) throw new ObjectDisposedException("LiveSplit");
            return form.InvokeRequired ? (T)form.Invoke(read) : read();
        }

        TimingMethod Method(bool? gameTime) =>
            gameTime == null ? state.CurrentTimingMethod : gameTime.Value ? TimingMethod.GameTime : TimingMethod.RealTime;

        public RunPhase Phase => Ui(() => PhaseOf(state.CurrentPhase));

        static RunPhase PhaseOf(LsPhase p) => p switch
        {
            LsPhase.Running => RunPhase.Running,
            LsPhase.Paused => RunPhase.Paused,
            LsPhase.Ended => RunPhase.Ended,
            _ => RunPhase.NotRunning,
        };

        public int SplitIndex => Ui(() => state.CurrentPhase == LsPhase.Running || state.CurrentPhase == LsPhase.Paused ? state.CurrentSplitIndex : -1);

        public int SegmentCount => Ui(() => state.Run.Count);

        public string SegmentName(int index) => Ui(() => state.Run[index].Name ?? "");

        public TimeSpan? ComparisonTime(int index, string comparison, bool? gameTime) => Ui(() =>
        {
            var method = Method(gameTime);
            var name = comparison ?? state.CurrentComparison;
            var seg = state.Run[index];
            if (name == global::LiveSplit.Model.Run.PersonalBestComparisonName) return seg.PersonalBestSplitTime[method];
            if (seg.Comparisons != null && seg.Comparisons.TryGetValue(name, out var t)) return t[method];
            // Best Segments when its comparison generator is turned off: add the best segments up.
            if (name == "Best Segments")
            {
                TimeSpan sum = TimeSpan.Zero;
                for (var i = 0; i <= index; i++)
                {
                    var best = state.Run[i].BestSegmentTime[method];
                    if (best == null) return (TimeSpan?)null;
                    sum += best.Value;
                }
                return sum;
            }
            return null;
        });

        public TimeSpan? SplitTime(int index, bool? gameTime) => Ui(() => state.Run[index].SplitTime[Method(gameTime)]);

        public TimeSpan? CurrentTime(bool? gameTime) => Ui(() => state.CurrentTime[Method(gameTime)]);

        public string Control(string command, bool saveAttempt) => Ui(() =>
        {
            var phase = state.CurrentPhase;
            switch (command)
            {
                case "start":
                    if (phase != LsPhase.NotRunning) return "RunAlreadyInProgress";
                    model.Start();
                    return null;
                case "splitOrStart":
                    if (phase == LsPhase.NotRunning) { model.Start(); return null; }
                    goto case "split";
                case "split":
                    if (phase == LsPhase.NotRunning) return "NoRunInProgress";
                    if (phase == LsPhase.Paused) return "TimerPaused";
                    if (phase == LsPhase.Ended) return "RunFinished";
                    model.Split();
                    return null;
                case "undoSplit":
                    if (phase == LsPhase.NotRunning) return "NoRunInProgress";
                    if (state.CurrentSplitIndex <= 0) return "CantUndoFirstSplit";
                    model.UndoSplit();
                    return null;
                case "skipSplit":
                    if (phase == LsPhase.NotRunning) return "NoRunInProgress";
                    if (phase == LsPhase.Ended) return "RunFinished";
                    if (state.CurrentSplitIndex >= state.Run.Count - 1) return "CantSkipLastSplit";
                    model.SkipSplit();
                    return null;
                case "reset":
                    if (phase == LsPhase.NotRunning) return "NoRunInProgress";
                    model.Reset(saveAttempt);
                    return null;
                case "pause":
                    if (phase == LsPhase.NotRunning) return "NoRunInProgress";
                    if (phase == LsPhase.Paused) return "AlreadyPaused";
                    if (phase == LsPhase.Ended) return "RunFinished";
                    model.Pause();
                    return null;
                case "resume":
                    if (phase != LsPhase.Paused) return "NotPaused";
                    model.Pause(); // LiveSplit's Pause resumes a paused run
                    return null;
                case "togglePauseOrStart":
                    if (phase == LsPhase.NotRunning) model.Start();
                    else if (phase == LsPhase.Ended) return "RunFinished";
                    else model.Pause();
                    return null;
                case "undoAllPauses":
                    if (phase == LsPhase.NotRunning) return "NoRunInProgress";
                    model.UndoAllPauses();
                    return null;
                default:
                    return "Unsupported";
            }
        });

        public RunInfo Info() => Ui(() => new RunInfo
        {
            Game = state.Run.GameName,
            Category = state.Run.CategoryName,
            Attempts = state.Run.AttemptCount,
            RunKey = TimeText.KeyOf(state.Run.Select(s => s.Name)),
        });
    }
}
