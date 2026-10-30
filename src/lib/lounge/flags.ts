/**
 * Country flags (MMR card feedback, 2026-10-29, M2): our own copies of the open-source flag-icons
 * set (MIT, v7.2.3, public/images/flags/LICENSE.txt), drawn as pictures because emoji flags show
 * as two letters on Windows, where most OBS runs. Two-letter codes only, as the lounge stores them.
 */

const CODES = new Set("ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cp cr cu cv cw cx cy cz de dg dj dk dm do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu ic id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pc pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um un us uy uz va vc ve vg vi vn vu wf ws xk xx ye yt za zm zw".split(" "));
/** Codes people use that aren't the ISO one. */
const ALIAS: Record<string, string> = { uk: "gb", el: "gr" };

/** The flag picture for a two-letter country code, or null when we have none. */
export function flagUrl(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toLowerCase();
  const cc = ALIAS[c] ?? c;
  return CODES.has(cc) ? `/images/flags/${cc}.svg` : null;
}
