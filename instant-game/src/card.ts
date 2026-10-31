/**
 * The picture shared into a chat or the feed (Britton's pick: a card in our
 * style, like the Discord results card): Chat Brain's colors, the logo, the
 * day's question and how the player did. Drawn on a canvas, sent as a JPEG.
 */

const W = 1200, H = 630;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Wraps text into lines that fit `max` pixels, at most `limit` lines (the last one ends in "…"). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, limit: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= max) { line = next; continue; }
    if (line) lines.push(line);
    line = w;
    if (lines.length === limit) break;
  }
  if (lines.length < limit && line) lines.push(line);
  if (lines.length === limit && words.join(" ") !== lines.join(" ")) {
    let last = lines[limit - 1];
    while (last && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    lines[limit - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

export async function drawShareCard(args: { question: string; headline: string; detail: string; streak: number }): Promise<string> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#4a1243"); bg.addColorStop(1, "#c8447a");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // A quiet field of rings, like the site's glyph fields.
  ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 3;
  for (let y = 40; y < H; y += 92) for (let x = (y / 92) % 2 ? 46 : 0; x < W; x += 92) { ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke(); }

  const logo = await loadImage("logo.svg");
  if (logo) ctx.drawImage(logo, 64, 56, 292, 40);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 30px Outfit, system-ui, sans-serif";
  ctx.fillText("CHAT BRAIN DAILY", 64, 160);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px Gabarito, system-ui, sans-serif";
  wrap(ctx, args.question, W - 128, 3).forEach((l, i) => ctx.fillText(l, 64, 238 + i * 66));

  // The result band.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.roundRect(48, 448, W - 96, 136, 24); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px Gabarito, system-ui, sans-serif";
  ctx.fillText(wrap(ctx, args.headline, W - 200, 1)[0] ?? "", 84, 512);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "500 30px Outfit, system-ui, sans-serif";
  ctx.fillText(wrap(ctx, args.detail + (args.streak > 1 ? `  ·  ${args.streak} day streak` : ""), W - 200, 1)[0] ?? "", 84, 556);

  return canvas.toDataURL("image/jpeg", 0.9);
}

/** The dailies' card: the title, how it went, one row of squares per guess (never the answer), streak and time. */
export async function drawDailyCard(args: { title: string; headline: string; rows: ("match" | "close" | "miss")[][]; detail: string; colors: [string, string] }): Promise<string> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, args.colors[0]); bg.addColorStop(1, args.colors[1]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 3;
  for (let y = 40; y < H; y += 92) for (let x = (y / 92) % 2 ? 46 : 0; x < W; x += 92) { ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke(); }

  const logo = await loadImage("logo.svg");
  if (logo) ctx.drawImage(logo, 64, 56, 292, 40);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 30px Outfit, system-ui, sans-serif";
  ctx.fillText(args.title.toUpperCase(), 64, 158);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 76px Gabarito, system-ui, sans-serif";
  ctx.fillText(args.headline, 64, 250);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "500 32px Outfit, system-ui, sans-serif";
  ctx.fillText(args.detail, 64, 306);

  // Squares on the right: up to 6 rows (the last chance included).
  const rows = args.rows.slice(0, 6);
  const size = 46, gap = 10;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const left = W - 64 - cols * size - (cols - 1) * gap;
  const top = H - 64 - rows.length * size - (rows.length - 1) * gap;
  const fill = { match: "#2f9a5c", close: "#e2a336", miss: "rgba(255,255,255,0.28)" } as const;
  rows.forEach((r, i) => r.forEach((st, j) => {
    ctx.fillStyle = fill[st];
    ctx.beginPath(); ctx.roundRect(left + j * (size + gap), top + i * (size + gap), size, size, 10); ctx.fill();
  }));
  return canvas.toDataURL("image/jpeg", 0.9);
}
