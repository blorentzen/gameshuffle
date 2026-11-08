/**
 * The shop's order emails as HTML (shop picks 2026-11-08: build the excitement): our band and logo, where the order
 * is (ordered, being made, shipped, delivered, with dates), the products with their pictures, and a next step:
 * "While we make it" on the order email, "Pair it with" on the shipped one. Tables and inline styles, since that's
 * what inboxes read; the logo is a PNG (Gmail blocks SVG). The plain text version still goes with every send.
 */

import { formatPrice } from "@/lib/store/copy";
import type { OrderEmailFacts } from "@/lib/store/orderEmail";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = "#16181f";
const MUTED = "#5b6070";
const LINE = "#e3e5ec";
const BLUE = "#2f66ec";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Step = { label: string; date: string; state: "done" | "now" | "later" };

function steps(list: Step[]): string {
  const dot = (s: Step["state"]) => {
    const bg = s === "done" ? "#1f9d55" : s === "now" ? BLUE : "#dfe2ea";
    const mark = s === "done" ? "&#10003;" : s === "now" ? "&#9679;" : "&nbsp;";
    return `<div style="width:24px;height:24px;line-height:24px;margin:0 auto 6px;border-radius:12px;background:${bg};color:#fff;font-size:${s === "now" ? 10 : 14}px;font-weight:700;text-align:center">${mark}</div>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${list.map((s) => `
    <td width="${Math.floor(100 / list.length)}%" align="center" valign="top" style="padding:0 4px;font-family:${FONT}">
      ${dot(s.state)}
      <div style="font-size:14px;font-weight:700;color:${s.state === "later" ? MUTED : INK}">${esc(s.label)}</div>
      <div style="font-size:13px;color:${MUTED}">${esc(s.date)}</div>
    </td>`).join("")}</tr></table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td bgcolor="${BLUE}" style="border-radius:10px">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)}</a>
  </td></tr></table>`;
}

function lineRows(f: OrderEmailFacts, prices: boolean): string {
  return f.lines.map((l) => `
    <tr>
      <td width="72" valign="middle" style="padding:8px 0">
        ${l.image ? `<img src="${esc(l.image)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;border-radius:10px;border:1px solid ${LINE};object-fit:cover;background:#fff">` : ""}
      </td>
      <td valign="middle" style="padding:8px 12px;font-family:${FONT}">
        <div style="font-size:16px;font-weight:700;color:${INK}">${l.quantity > 1 ? `${l.quantity} &times; ` : ""}${esc(l.name)}</div>
        ${l.detail ? `<div style="font-size:14px;color:${MUTED}">${esc(l.detail)}</div>` : ""}
      </td>
      ${prices ? `<td align="right" valign="middle" style="padding:8px 0;font-family:${FONT};font-size:15px;color:${INK};white-space:nowrap">${formatPrice(l.amountCents)}</td>` : ""}
    </tr>`).join("");
}

function totals(f: OrderEmailFacts): string {
  const row = (label: string, value: string, strong = false, color = INK) => `
    <tr>
      <td style="padding:3px 0;font-family:${FONT};font-size:15px;color:${strong ? INK : MUTED};${strong ? "font-weight:700;" : ""}">${label}</td>
      <td align="right" style="padding:3px 0;font-family:${FONT};font-size:15px;color:${color};${strong ? "font-weight:700;" : ""}">${value}</td>
    </tr>`;
  const t = f.totals;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${LINE};margin-top:8px">
    <tr><td colspan="2" style="height:8px"></td></tr>
    ${row("Subtotal", formatPrice(t.subtotal))}
    ${row("Shipping", t.shipping === 0 ? "Free" : formatPrice(t.shipping), false, t.shipping === 0 ? "#1a7f45" : INK)}
    ${t.discount > 0 ? row("Discount", `&minus;${formatPrice(t.discount)}`) : ""}
    ${t.tax > 0 ? row("Tax", formatPrice(t.tax)) : ""}
    ${row("Total", formatPrice(t.total), true)}
  </table>`;
}

function tile(href: string, bg: string, from: string, to: string, title: string, line: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-top:10px"><tr>
    <td bgcolor="${bg}" style="border-radius:12px;background:${bg};background-image:linear-gradient(135deg,${from},${to})">
      <a href="${esc(href)}" style="display:block;padding:14px 16px;font-family:${FONT};color:#ffffff;text-decoration:none">
        <span style="display:block;font-size:17px;font-weight:800">${esc(title)}</span>
        <span style="display:block;font-size:14px;opacity:.92">${esc(line)}</span>
      </a>
    </td></tr></table>`;
}

function pairs(f: OrderEmailFacts): string {
  if (!f.pairs.length) return "";
  const w = Math.floor(100 / f.pairs.length);
  return `
    <tr><td style="padding:24px 28px 0"><div style="border-top:1px solid ${LINE}"></div></td></tr>
    <tr><td style="padding:20px 28px 0;font-family:${FONT};font-size:19px;font-weight:800;color:${INK}">Pair it with</td></tr>
    <tr><td style="padding:12px 22px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        ${f.pairs.map((p) => `
        <td width="${w}%" valign="top" style="padding:0 6px">
          <a href="${esc(p.url)}" style="text-decoration:none;color:${INK};font-family:${FONT}">
            ${p.image ? `<img src="${esc(p.image)}" width="160" alt="" style="display:block;width:100%;max-width:160px;height:auto;border-radius:12px;border:1px solid ${LINE};background:#fff">` : ""}
            <span style="display:block;margin-top:8px;font-size:15px;font-weight:700;line-height:1.3">${esc(p.name)}</span>
            <span style="display:block;font-size:14px;color:${MUTED}">${esc(p.price)}</span>
          </a>
        </td>`).join("")}
      </tr></table>
    </td></tr>`;
}

function shell(base: string, preheader: string, title: string, sub: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eef0f5">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f5"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border-collapse:separate">
      <tr><td bgcolor="#1f1b5e" style="background:#1f1b5e;background-image:linear-gradient(135deg,#2b1d84,#141a3c);padding:28px 28px 30px">
        <img src="${base}/images/email/gameshuffle-wht.png" width="158" alt="GameShuffle" style="display:block;width:158px;height:auto;border:0">
        <h1 style="margin:22px 0 8px;font-family:${FONT};font-size:26px;line-height:1.2;color:#ffffff">${esc(title)}</h1>
        <p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.5;color:#e6e7f5">${esc(sub)}</p>
      </td></tr>
      ${body}
      <tr><td style="height:28px"></td></tr>
    </table>
    <p style="margin:18px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};text-align:center">
      Questions? Reply to this email.<br><a href="${base}/shop/policies" style="color:${MUTED}">Shipping and returns</a>
    </p>
  </td></tr></table>
</body></html>`;
}

/** The order email: where it is, what's coming, the totals, then something to play while it's made. */
export function orderReceivedHtml(f: OrderEmailFacts, o: {
  base: string; viewUrl?: string | null; shipTo: string; afterCutoff: boolean; lists?: { title: string; url: string }[] | null;
}): string {
  const title = f.firstName ? `Your order is in, ${f.firstName}.` : "Your order is in.";
  const sub = f.merch ? "We're making it now. Every piece is printed or stitched just for you." : "Thanks for your order. Here's what's coming.";
  const body = `
    <tr><td style="padding:24px 20px 4px">${steps([
      { label: "Ordered", date: f.orderedOn, state: "done" },
      { label: f.merch ? "Being made" : "Packing", date: "Now", state: "now" },
      { label: "Shipped", date: `By ${f.shipBy}`, state: "later" },
      { label: "Delivered", date: f.arrives, state: "later" },
    ])}</td></tr>
    <tr><td style="padding:22px 28px 0;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">Order ${esc(f.code)}</td></tr>
    <tr><td style="padding:6px 28px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${lineRows(f, true)}</table>
      ${totals(f)}
    </td></tr>
    <tr><td style="padding:18px 28px 0;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK}">
      Shipping to ${esc(o.shipTo)}. We'll email you a tracking link the moment it ships.${o.afterCutoff ? " This order will arrive after Christmas." : ""}
    </td></tr>
    ${o.lists?.length ? `<tr><td style="padding:12px 28px 0;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK}">Your digital lists: ${o.lists.map((l) => `<a href="${esc(l.url)}" style="color:${BLUE}">${esc(l.title)}</a>`).join(", ")}</td></tr>` : ""}
    ${o.viewUrl ? `<tr><td style="padding:20px 28px 0">${button(o.viewUrl, "View your order")}</td></tr>` : ""}
    <tr><td style="padding:26px 28px 0"><div style="border-top:1px solid ${LINE}"></div></td></tr>
    <tr><td style="padding:20px 28px 0;font-family:${FONT};font-size:19px;font-weight:800;color:${INK}">While we make it</td></tr>
    <tr><td style="padding:2px 28px 0">
      ${tile(`${o.base}/daily?utm_source=email&utm_medium=email&utm_campaign=order`, "#4a32c8", "#5a3fd6", "#8b5cf6", "Today's Daily Shuffle", "Guess today's character in six. A new one every day.")}
      ${tile(`${o.base}/daily-duel?utm_source=email&utm_medium=email&utm_campaign=order`, "#16224f", "#16224f", "#6b4f17", "Today's Daily Duel", "Beat today's trainer in as few turns as you can.")}
    </td></tr>`;
  return shell(o.base, `Order ${f.code}: ships by ${f.shipBy}.`, title, sub, body);
}

/** The shipped email: a big Track button, what's in the box, and three things to pair with it. */
export function orderShippedHtml(f: OrderEmailFacts, o: { base: string; trackUrl: string; carrier?: string | null; viewUrl?: string | null }): string {
  const by = o.carrier ? ` by ${o.carrier}` : "";
  const body = `
    <tr><td style="padding:24px 20px 4px">${steps([
      { label: "Ordered", date: f.orderedOn, state: "done" },
      { label: f.merch ? "Made" : "Packed", date: "Done", state: "done" },
      { label: "Shipped", date: f.shippedOn ?? "Today", state: "done" },
      { label: "Delivered", date: f.arrives, state: "now" },
    ])}</td></tr>
    <tr><td style="padding:20px 28px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td style="background:#eef3ff;border-radius:12px;padding:18px 20px;font-family:${FONT}">
        <div style="font-size:16px;color:${INK};margin-bottom:12px">Arriving <b>${esc(f.arrives)}</b>${esc(by)}</div>
        ${button(o.trackUrl, "Track your package")}
        <div style="font-size:14px;color:${MUTED};margin-top:10px">Tracking can take up to a day to show its first update.</div>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:22px 28px 0;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">In this box</td></tr>
    <tr><td style="padding:6px 28px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${lineRows(f, false)}</table>
    </td></tr>
    ${o.viewUrl ? `<tr><td style="padding:12px 28px 0;font-family:${FONT};font-size:15px"><a href="${esc(o.viewUrl)}" style="color:${BLUE}">View your order</a></td></tr>` : ""}
    ${pairs(f)}`;
  return shell(o.base, `Order ${f.code} is on the way. Arriving ${f.arrives}.`, "It's on the way.", f.merch ? "Your GameShuffle merch left our print partner." : "Your GameShuffle order left today.", body);
}

/**
 * An order update (order tracking picks 2026-11-08): running late, delivered, a box that came back, a reply to a
 * request. The band says what happened, then a few short paragraphs, the tracker when there is one, and a button.
 */
export function orderUpdateHtml(o: {
  base: string; preheader: string; title: string; sub: string; paragraphs: string[];
  steps?: { label: string; date: string; state: "done" | "now" | "later" }[] | null;
  quote?: string | null; button?: { href: string; label: string } | null;
}): string {
  const body = `
    ${o.steps?.length ? `<tr><td style="padding:24px 20px 4px">${steps(o.steps)}</td></tr>` : ""}
    ${o.quote ? `<tr><td style="padding:20px 28px 0"><div style="border-left:4px solid #c9d5ff;padding:4px 0 4px 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};white-space:pre-line">${esc(o.quote)}</div></td></tr>` : ""}
    ${o.paragraphs.map((p) => `<tr><td style="padding:16px 28px 0;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK}">${esc(p)}</td></tr>`).join("")}
    ${o.button ? `<tr><td style="padding:22px 28px 0">${button(o.button.href, o.button.label)}</td></tr>` : ""}`;
  return shell(o.base, o.preheader, o.title, o.sub, body);
}
