// GameShuffle for LiveSplit (picks 2026-11-10, all as recommended): sends the runner's splits to their GameShuffle
// overlay the way LiveSplit One does, and connects by itself whenever LiveSplit opens. Nothing shows in the timer unless
// the status line is switched on. The address is private (anyone with it can send splits to the overlay), so it's kept
// in the runner's own app data folder, never in the layout file people share.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Windows.Forms;
using System.Xml;
using LiveSplit.Model;
using LiveSplit.UI;
using LiveSplit.UI.Components;
using LsPhase = LiveSplit.Model.TimerPhase;

namespace GameShuffle.Link
{
    public sealed class GameShuffleComponent : IComponent
    {
        /// <summary>Where a bare token is sent (the address on the setup page carries its own).</summary>
        public const string DefaultBase = "wss://gameshuffle-speedrun-relay.britton-c37.workers.dev";
        internal static readonly string AddonVersion = typeof(GameShuffleComponent).Assembly.GetName().Version.ToString(3);

        readonly LiveSplitState state;
        readonly LiveSplitTimer timer;
        readonly Connection connection;
        readonly SettingsControl settings;
        readonly InfoTextComponent line = new InfoTextComponent("GameShuffle", "Not connected");
        IRun lastRun;
        TimingMethod lastMethod;
        volatile bool share = true;
        volatile bool remote = true;

        public GameShuffleComponent(LiveSplitState state)
        {
            this.state = state;
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            timer = new LiveSplitTimer(state);
            settings = new SettingsControl(AddonVersion);
            connection = new Connection(new Commands(timer, () => remote), InfoMessage);
            connection.Changed += (s, detail) =>
            {
                settings.ShowStatus(s, detail);
                line.InformationValue = Short(s);
            };
            settings.AddressChanged += text =>
            {
                AddressStore.Save(text);
                connection.SetAddress(Connection.Normalize(text, DefaultBase));
            };
            settings.OptionsChanged += () =>
            {
                share = settings.Share;
                remote = settings.Remote;
                connection.SendInfo();
            };

            state.OnStart += OnStart;
            state.OnSplit += OnSplit;
            state.OnSkipSplit += OnSkipSplit;
            state.OnUndoSplit += OnUndoSplit;
            state.OnReset += OnReset;
            state.OnPause += OnPause;
            state.OnResume += OnResume;
            state.OnUndoAllPauses += OnUndoAllPauses;
            state.OnSwitchComparisonNext += OnComparison;
            state.OnSwitchComparisonPrevious += OnComparison;
            state.RunManuallyModified += OnRunEdited;
            lastRun = state.Run;
            lastMethod = state.CurrentTimingMethod;

            var saved = AddressStore.Load();
            settings.Fill(saved, share, remote, false);
            connection.SetAddress(Connection.Normalize(saved, DefaultBase));
        }

        string InfoMessage() => Commands.Info(AddonVersion, timer.Info(), share, remote);

        static string Short(LinkStatus s) => s switch
        {
            LinkStatus.Connected => "Sending",
            LinkStatus.Connecting => "Connecting",
            LinkStatus.Waiting => "Reconnecting",
            LinkStatus.Refused => "New address needed",
            _ => "No address",
        };

        void OnStart(object sender, EventArgs e)
        {
            connection.Send(Commands.Event("Started"));
            connection.SendInfo(); // the attempt count went up
        }
        void OnSplit(object sender, EventArgs e) => connection.Send(Commands.Event(state.CurrentPhase == LsPhase.Ended ? "Finished" : "Splitted"));
        void OnSkipSplit(object sender, EventArgs e) => connection.Send(Commands.Event("SplitSkipped"));
        void OnUndoSplit(object sender, EventArgs e) => connection.Send(Commands.Event("SplitUndone"));
        void OnReset(object sender, LsPhase previous)
        {
            connection.Send(Commands.Event("Reset"));
            connection.SendInfo(); // a new PB or golds may have been saved
        }
        void OnPause(object sender, EventArgs e) => connection.Send(Commands.Event("Paused"));
        void OnResume(object sender, EventArgs e) => connection.Send(Commands.Event("Resumed"));
        void OnUndoAllPauses(object sender, EventArgs e) => connection.Send(Commands.Event("PausesUndone"));
        void OnComparison(object sender, EventArgs e) => connection.Send(Commands.Event("ComparisonChanged"));
        void OnRunEdited(object sender, EventArgs e) => connection.SendInfo();

        public string ComponentName => "GameShuffle";

        bool Shown => settings.StatusLine;
        public float HorizontalWidth => Shown ? line.HorizontalWidth : 0;
        public float MinimumHeight => Shown ? line.MinimumHeight : 0;
        public float VerticalHeight => Shown ? line.VerticalHeight : 0;
        public float MinimumWidth => Shown ? line.MinimumWidth : 0;
        public float PaddingTop => Shown ? line.PaddingTop : 0;
        public float PaddingBottom => Shown ? line.PaddingBottom : 0;
        public float PaddingLeft => Shown ? line.PaddingLeft : 0;
        public float PaddingRight => Shown ? line.PaddingRight : 0;
        public IDictionary<string, Action> ContextMenuControls => null;

        void Colors(LiveSplitState s)
        {
            line.NameLabel.ForeColor = s.LayoutSettings.TextColor;
            line.ValueLabel.ForeColor = s.LayoutSettings.TextColor;
        }

        public void DrawHorizontal(Graphics g, LiveSplitState s, float height, Region clipRegion)
        {
            if (!Shown) return;
            Colors(s);
            line.DrawHorizontal(g, s, height, clipRegion);
        }

        public void DrawVertical(Graphics g, LiveSplitState s, float width, Region clipRegion)
        {
            if (!Shown) return;
            Colors(s);
            line.DrawVertical(g, s, width, clipRegion);
        }

        public Control GetSettingsControl(LayoutMode mode) => settings;

        // The switches live in the layout; the address doesn't (see the top of this file).
        public XmlNode GetSettings(XmlDocument document)
        {
            var root = document.CreateElement("Settings");
            void Add(string name, string value)
            {
                var el = document.CreateElement(name);
                el.InnerText = value;
                root.AppendChild(el);
            }
            Add("Version", AddonVersion);
            Add("Share", settings.Share ? "True" : "False");
            Add("Remote", settings.Remote ? "True" : "False");
            Add("StatusLine", settings.StatusLine ? "True" : "False");
            return root;
        }

        public int GetSettingsHashCode() => (settings.Share ? 1 : 0) | (settings.Remote ? 2 : 0) | (settings.StatusLine ? 4 : 0);

        public void SetSettings(XmlNode node)
        {
            bool Flag(string name, bool fallback)
            {
                var el = node?[name];
                return el == null ? fallback : string.Equals(el.InnerText, "True", StringComparison.OrdinalIgnoreCase);
            }
            share = Flag("Share", true);
            remote = Flag("Remote", true);
            settings.SetSwitches(share, remote, Flag("StatusLine", false));
            connection.SendInfo();
        }

        public void Update(IInvalidator invalidator, LiveSplitState s, float width, float height, LayoutMode mode)
        {
            // Another splits file was opened: the relay reads the new splits when the info says so.
            if (!ReferenceEquals(s.Run, lastRun))
            {
                lastRun = s.Run;
                connection.SendInfo();
            }
            if (s.CurrentTimingMethod != lastMethod)
            {
                lastMethod = s.CurrentTimingMethod;
                connection.Send(Commands.Event("TimingMethodChanged"));
            }
            if (Shown) line.Update(invalidator, s, width, height, mode);
        }

        public void Dispose()
        {
            state.OnStart -= OnStart;
            state.OnSplit -= OnSplit;
            state.OnSkipSplit -= OnSkipSplit;
            state.OnUndoSplit -= OnUndoSplit;
            state.OnReset -= OnReset;
            state.OnPause -= OnPause;
            state.OnResume -= OnResume;
            state.OnUndoAllPauses -= OnUndoAllPauses;
            state.OnSwitchComparisonNext -= OnComparison;
            state.OnSwitchComparisonPrevious -= OnComparison;
            state.RunManuallyModified -= OnRunEdited;
            connection.Dispose();
            settings.Dispose();
        }
    }

    /// <summary>The private address, in the runner's app data folder (one for every layout on this computer).</summary>
    static class AddressStore
    {
        static string PathOf() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "GameShuffle", "livesplit-address.txt");

        public static string Load()
        {
            try { var p = PathOf(); return File.Exists(p) ? File.ReadAllText(p).Trim() : ""; }
            catch { return ""; }
        }

        public static void Save(string text)
        {
            try
            {
                var p = PathOf();
                Directory.CreateDirectory(Path.GetDirectoryName(p));
                File.WriteAllText(p, text ?? "");
            }
            catch { /* a read-only profile: the address works until LiveSplit closes */ }
        }
    }

    public sealed class GameShuffleFactory : IComponentFactory
    {
        public string ComponentName => "GameShuffle";
        public string Description => "Sends your splits to your GameShuffle speedrun overlay.";
        public ComponentCategory Category => ComponentCategory.Other;
        public IComponent Create(LiveSplitState state) => new GameShuffleComponent(state);
        public string UpdateName => "GameShuffle for LiveSplit";
        public string XMLURL => "https://www.gameshuffle.co/livesplit/update.xml";
        public string UpdateURL => "https://www.gameshuffle.co/livesplit/";
        public Version Version => typeof(GameShuffleFactory).Assembly.GetName().Version;
    }
}
