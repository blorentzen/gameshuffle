// The link to GameShuffle's relay: connects to the runner's timer address, answers the relay's commands in order, sends
// LiveSplit's events and the add-on's info message, and reconnects by itself (LiveSplit One can't, which is half the
// reason this add-on exists). Everything sent goes through one queue so replies and events keep their order.

using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace GameShuffle.Link
{
    public enum LinkStatus { NoAddress, Connecting, Connected, Waiting, Refused }

    public sealed class Connection : IDisposable
    {
        /// <summary>Raised on the connection's thread whenever the status or its words change.</summary>
        public event Action<LinkStatus, string> Changed;
        public LinkStatus Status { get; private set; } = LinkStatus.NoAddress;
        public string Detail { get; private set; } = "Paste your address from gameshuffle.co/speedrun.";

        readonly Commands commands;
        readonly Func<string> infoMessage;
        readonly object gate = new object();
        string address;
        CancellationTokenSource stop;
        Session session;
        bool disposed;

        const int MaxMessage = 1 << 20;
        static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(15);
        static readonly TimeSpan MaxDelay = TimeSpan.FromSeconds(30);

        public Connection(Commands commands, Func<string> infoMessage)
        {
            this.commands = commands;
            this.infoMessage = infoMessage;
        }

        /// <summary>Accepts the address the way the setup page copies it (wss://.../lso/t1....), or just the token.</summary>
        public static string Normalize(string input, string defaultBase)
        {
            var s = (input ?? "").Trim();
            if (s.Length == 0) return null;
            if (s.StartsWith("t1.", StringComparison.Ordinal) && s.IndexOf('/') < 0) s = defaultBase.TrimEnd('/') + "/lso/" + s;
            if (!Uri.TryCreate(s, UriKind.Absolute, out var uri)) return null;
            if (uri.Scheme != "wss" && uri.Scheme != "ws") return null;
            if (!uri.AbsolutePath.Contains("/lso/")) return null;
            return uri.ToString();
        }

        public void SetAddress(string url)
        {
            lock (gate)
            {
                if (disposed || url == address) return;
                address = url;
                stop?.Cancel();
                stop = null;
                if (url == null)
                {
                    SetStatus(LinkStatus.NoAddress, "Paste your address from gameshuffle.co/speedrun.");
                    return;
                }
                var cts = new CancellationTokenSource();
                stop = cts;
                Task.Run(() => Loop(url, cts.Token));
            }
        }

        /// <summary>Queues a message for the relay (dropped while not connected: the relay reads everything again when it reconnects).</summary>
        public void Send(string text) => session?.Enqueue(text);

        /// <summary>Sends the info message again (new splits, a new attempt count, changed settings).</summary>
        public void SendInfo()
        {
            var msg = SafeInfo();
            if (msg != null) Send(msg);
        }

        string SafeInfo()
        {
            try { return infoMessage(); } catch { return null; }
        }

        void SetStatus(LinkStatus status, string detail)
        {
            Status = status;
            Detail = detail;
            try { Changed?.Invoke(status, detail); } catch { /* a settings window that's closing */ }
        }

        async Task Loop(string url, CancellationToken ct)
        {
            var delay = TimeSpan.FromSeconds(1);
            while (!ct.IsCancellationRequested)
            {
                SetStatus(LinkStatus.Connecting, "Connecting to GameShuffle…");
                var wait = delay;
                Session mine = null;
                using (var ws = new ClientWebSocket())
                {
                    ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
                    try
                    {
                        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct))
                        {
                            timeout.CancelAfter(ConnectTimeout);
                            await ws.ConnectAsync(new Uri(url), timeout.Token).ConfigureAwait(false);
                        }
                        var s = new Session(ws);
                        mine = s;
                        session = s;
                        var sender = s.Pump(ct);
                        SetStatus(LinkStatus.Connected, "Connected. Your splits are going to your overlay.");
                        var info = SafeInfo();
                        if (info != null) s.Enqueue(info);
                        delay = TimeSpan.FromSeconds(1);
                        await Receive(ws, s, ct).ConfigureAwait(false);
                        s.Done();
                        await sender.ConfigureAwait(false);

                        var code = (int?)ws.CloseStatus;
                        if (code == 4001 || code == 4003)
                        {
                            // The address was replaced or is wrong: trying again won't help until a new one is pasted.
                            SetStatus(LinkStatus.Refused, code == 4001
                                ? "This address was replaced. Copy the new one from gameshuffle.co/speedrun."
                                : "This address isn't valid. Copy it again from gameshuffle.co/speedrun.");
                            return;
                        }
                        if (code == 4000) wait = MaxDelay; // another timer (LiveSplit One?) took the address over
                    }
                    catch (OperationCanceledException) when (ct.IsCancellationRequested)
                    {
                        return;
                    }
                    catch (Exception)
                    {
                        // Offline, the relay restarting, a proxy: try again in a moment.
                    }
                    finally
                    {
                        // Only this loop's own session: a newer address may have started its own already.
                        if (mine != null)
                        {
                            mine.Done();
                            Interlocked.CompareExchange(ref session, null, mine);
                        }
                    }
                }
                if (ct.IsCancellationRequested) return;
                SetStatus(LinkStatus.Waiting, "Can't reach GameShuffle. Trying again in " + Math.Round(wait.TotalSeconds) + " seconds.");
                try { await Task.Delay(wait, ct).ConfigureAwait(false); } catch (OperationCanceledException) { return; }
                delay = TimeSpan.FromTicks(Math.Min(MaxDelay.Ticks, delay.Ticks * 2));
            }
        }

        async Task Receive(ClientWebSocket ws, Session s, CancellationToken ct)
        {
            var buffer = new byte[8192];
            var message = new MemoryStream();
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                WebSocketReceiveResult r;
                try { r = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false); }
                catch (WebSocketException) { return; }
                if (r.MessageType == WebSocketMessageType.Close)
                {
                    try { await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).ConfigureAwait(false); } catch { }
                    return;
                }
                message.Write(buffer, 0, r.Count);
                if (message.Length > MaxMessage) return;
                if (!r.EndOfMessage) continue;
                var bytes = message.ToArray();
                message.SetLength(0);
                if (r.MessageType != WebSocketMessageType.Text) continue;
                // One at a time, in order: the relay matches replies to its commands by their order.
                var reply = commands.Handle(Encoding.UTF8.GetString(bytes));
                if (reply != null) s.Enqueue(reply);
            }
        }

        public void Dispose()
        {
            lock (gate)
            {
                disposed = true;
                stop?.Cancel();
                stop = null;
            }
            // Never wait here: the connection thread may be waiting on LiveSplit's window, which is the thread disposing.
            session?.Done();
        }

        /// <summary>One open socket's send queue, drained by one task so nothing is sent out of order.</summary>
        sealed class Session
        {
            readonly ClientWebSocket ws;
            readonly ConcurrentQueue<string> queue = new ConcurrentQueue<string>();
            readonly SemaphoreSlim ready = new SemaphoreSlim(0);
            volatile bool done;

            public Session(ClientWebSocket ws) { this.ws = ws; }

            public void Enqueue(string text)
            {
                if (done) return;
                queue.Enqueue(text);
                ready.Release();
            }

            public void Done()
            {
                if (done) return;
                done = true;
                ready.Release();
            }

            public async Task Pump(CancellationToken ct)
            {
                while (!ct.IsCancellationRequested)
                {
                    try { await ready.WaitAsync(ct).ConfigureAwait(false); } catch (OperationCanceledException) { return; }
                    if (done) return;
                    if (!queue.TryDequeue(out var text)) continue;
                    try
                    {
                        var bytes = Encoding.UTF8.GetBytes(text);
                        await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct).ConfigureAwait(false);
                    }
                    catch
                    {
                        // The receive side notices the socket closing and reconnects.
                        return;
                    }
                }
            }
        }
    }
}
