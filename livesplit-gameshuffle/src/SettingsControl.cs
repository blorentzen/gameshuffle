// The GameShuffle tab in LiveSplit's Layout Settings (picks 2026-11-10): your address (kept hidden, it's private),
// the connection's status, a link to the setup page, and three switches. Built in code: no designer files.

using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace GameShuffle.Link
{
    sealed class SettingsControl : UserControl
    {
        public event Action<string> AddressChanged;
        public event Action OptionsChanged;

        readonly TextBox address = new TextBox { UseSystemPasswordChar = true, Dock = DockStyle.Fill, Margin = new Padding(3, 4, 3, 3) };
        readonly Label addressNote = new Label { AutoSize = true, ForeColor = Color.FromArgb(160, 32, 32), Margin = new Padding(3, 0, 3, 3), Visible = false };
        readonly Panel dot = new Panel { Size = new Size(10, 10), Margin = new Padding(3, 7, 4, 3) };
        readonly Label status = new Label { AutoSize = true, MaximumSize = new Size(380, 0), Margin = new Padding(0, 3, 3, 3) };
        readonly CheckBox share = new CheckBox { Text = "Send the game, category and attempt count from these splits", AutoSize = true, Checked = true };
        readonly CheckBox remote = new CheckBox { Text = "Let my phone remote start, split and reset this timer", AutoSize = true, Checked = true };
        readonly CheckBox statusLine = new CheckBox { Text = "Show a status line in the timer", AutoSize = true, Checked = false };
        bool loading;

        public bool Share => share.Checked;
        public bool Remote => remote.Checked;
        public bool StatusLine => statusLine.Checked;

        public SettingsControl(string version)
        {
            AutoScaleMode = AutoScaleMode.Dpi;
            Padding = new Padding(7);
            Size = new Size(476, 320);

            var root = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1 };

            var connection = new GroupBox { Text = "Connection", Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(8) };
            var rows = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 1 };

            var field = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 4 };
            field.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            field.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            field.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            field.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            field.Controls.Add(new Label { Text = "Your address", AutoSize = true, Margin = new Padding(3, 7, 3, 3) }, 0, 0);
            field.Controls.Add(address, 1, 0);
            var paste = new Button { Text = "Paste", AutoSize = true };
            paste.Click += (s, e) =>
            {
                if (!Clipboard.ContainsText()) return;
                address.Text = Clipboard.GetText().Trim();
                Commit();
            };
            var clear = new Button { Text = "Clear", AutoSize = true };
            clear.Click += (s, e) => { address.Text = ""; Commit(); };
            field.Controls.Add(paste, 2, 0);
            field.Controls.Add(clear, 3, 0);
            address.Leave += (s, e) => Commit();
            address.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; Commit(); } };

            var statusRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
            dot.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                using (var b = new SolidBrush(dot.Tag is Color c ? c : Color.Gray)) e.Graphics.FillEllipse(b, 0, 0, 9, 9);
            };
            statusRow.Controls.Add(dot);
            statusRow.Controls.Add(status);

            var link = new LinkLabel { Text = "Open my GameShuffle setup", AutoSize = true, Margin = new Padding(3, 6, 3, 3) };
            link.LinkClicked += (s, e) => { try { Process.Start("https://www.gameshuffle.co/speedrun"); } catch { /* no browser */ } };

            rows.Controls.Add(field);
            rows.Controls.Add(addressNote);
            rows.Controls.Add(statusRow);
            rows.Controls.Add(link);
            connection.Controls.Add(rows);

            var options = new GroupBox { Text = "Options", Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(8) };
            var optionRows = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false };
            foreach (var box in new[] { share, remote, statusLine })
            {
                box.CheckedChanged += (s, e) => { if (!loading) OptionsChanged?.Invoke(); };
                optionRows.Controls.Add(box);
            }
            options.Controls.Add(optionRows);

            var foot = new Label { Text = "GameShuffle for LiveSplit " + version + " · open source (MIT)", AutoSize = true, ForeColor = SystemColors.GrayText, Margin = new Padding(3, 8, 3, 3) };

            root.Controls.Add(connection);
            root.Controls.Add(options);
            root.Controls.Add(foot);
            Controls.Add(root);
            ShowStatus(LinkStatus.NoAddress, "Paste your address from gameshuffle.co/speedrun.");
        }

        /// <summary>Puts the saved address and switches in without raising change events.</summary>
        public void Fill(string savedAddress, bool shareOn, bool remoteOn, bool statusOn)
        {
            loading = true;
            address.Text = savedAddress ?? "";
            committed = address.Text.Trim();
            share.Checked = shareOn;
            remote.Checked = remoteOn;
            statusLine.Checked = statusOn;
            loading = false;
        }

        public void SetSwitches(bool shareOn, bool remoteOn, bool statusOn) => Fill(address.Text, shareOn, remoteOn, statusOn);

        string committed = "";
        void Commit()
        {
            var text = address.Text.Trim();
            if (text == committed) return;
            committed = text;
            var ok = text.Length == 0 || Connection.Normalize(text, GameShuffleComponent.DefaultBase) != null;
            addressNote.Text = ok ? "" : "That isn't a GameShuffle timer address. Copy it again from gameshuffle.co/speedrun.";
            addressNote.Visible = !ok;
            if (ok) AddressChanged?.Invoke(text);
        }

        /// <summary>Safe from any thread.</summary>
        public void ShowStatus(LinkStatus s, string detail)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                try { BeginInvoke(new Action(() => ShowStatus(s, detail))); } catch (InvalidOperationException) { }
                return;
            }
            dot.Tag = s switch
            {
                LinkStatus.Connected => Color.FromArgb(19, 161, 14),
                LinkStatus.Connecting => Color.FromArgb(0, 120, 212),
                LinkStatus.Waiting => Color.FromArgb(202, 138, 4),
                LinkStatus.Refused => Color.FromArgb(196, 43, 28),
                _ => Color.Gray,
            };
            dot.Invalidate();
            status.Text = detail;
        }
    }
}
