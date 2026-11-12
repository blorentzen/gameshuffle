/**
 * Pictures painted once per race (client, three.js): the asphalt, the lawn,
 * the sidewalk, road lines, the finish line and banner, the ramp's planks and
 * lip, the shopping cart's wire, the lemonade sign and a sky picture for the
 * puddle to reflect. Every color comes from content.ts (TRACK_LOOK).
 */

import * as THREE from "three";
import { TRACK_LOOK } from "@/lib/kart/content";
import { seeded } from "@/lib/kart/rng";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** World units one repeat of each ground picture covers. */
export const TILE = { asphalt: 160, lawn: 128, sidewalk: 64 };

export interface Pictures {
  asphalt: THREE.CanvasTexture;
  lawn: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  line: THREE.CanvasTexture;
  dash: THREE.CanvasTexture;
  checker: THREE.CanvasTexture;
  banner: THREE.CanvasTexture;
  planks: THREE.CanvasTexture;
  lip: THREE.CanvasTexture;
  wire: THREE.CanvasTexture;
  sign: THREE.CanvasTexture;
  sky: THREE.CanvasTexture;
  all: THREE.Texture[];
}

/** The shopping cart's wire: a grid with holes (drawn with alphaTest). */
export function wirePicture(): THREE.CanvasTexture {
  const [c, w] = canvas(128, 128);
  w.strokeStyle = "#ffffff";
  w.lineWidth = 7;
  for (let k = 0; k <= 128; k += 32) {
    w.beginPath();
    w.moveTo(k, 0);
    w.lineTo(k, 128);
    w.moveTo(0, k);
    w.lineTo(128, k);
    w.stroke();
  }
  return texture(c, { repeat: true, srgb: false });
}

export function paintPictures(trackName: string, anisotropy: number): Pictures {
  const L = TRACK_LOOK;
  const rnd = seeded(1701);

  // Asphalt: specks, a few darker patches.
  const [ac, a] = canvas(512, 512);
  a.fillStyle = L.road;
  a.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) {
    a.fillStyle = "rgba(30,34,44,0.07)";
    a.beginPath();
    a.ellipse(rnd() * 512, rnd() * 512, 40 + rnd() * 70, 20 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
    a.fill();
  }
  for (let i = 0; i < 9000; i++) {
    a.fillStyle = rnd() < 0.5 ? L.roadSpeck : "rgba(30,34,44,0.4)";
    const s = 1 + rnd() * 1.6;
    a.fillRect(rnd() * 512, rnd() * 512, s, s);
  }

  // Lawn: two mown stripes and a little noise.
  const [lc, l] = canvas(256, 256);
  l.fillStyle = L.grass[0];
  l.fillRect(0, 0, 256, 256);
  l.fillStyle = L.grass[1];
  l.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 2600; i++) {
    l.fillStyle = rnd() < 0.5 ? "rgba(255,255,230,0.07)" : "rgba(0,40,0,0.09)";
    l.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2.5, 2 + rnd() * 3);
  }

  // Sidewalk: concrete slabs with joints.
  const [sc, s] = canvas(256, 256);
  s.fillStyle = L.sidewalk;
  s.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    s.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.14)" : "rgba(60,60,50,0.08)";
    s.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  s.fillStyle = "rgba(90,88,80,0.35)";
  for (const k of [0, 128]) {
    s.fillRect(k, 0, 3, 256);
    s.fillRect(0, k, 256, 3);
  }

  // A soft road line across u (transparent at the sides), and dashes along v.
  const [nc, n] = canvas(64, 8);
  const g = n.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.22, "rgba(255,255,255,1)");
  g.addColorStop(0.78, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  n.fillStyle = g;
  n.fillRect(0, 0, 64, 8);
  const [dc, d] = canvas(64, 128);
  d.fillStyle = g;
  d.save();
  d.fillRect(0, 6, 64, 58);
  d.restore();

  // Checkers (2 by 2 cells; repeats across the road).
  const [cc, c] = canvas(128, 128);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      c.fillStyle = (x + y) % 2 === 0 ? L.finish[0] : L.finish[1];
      c.fillRect(x * 64, y * 64, 64, 64);
    }
  }

  // The arch's banner: checkers top and bottom, the track's name in the middle.
  const [bc, b] = canvas(1024, 224);
  b.fillStyle = L.finish[0];
  b.fillRect(0, 0, 1024, 224);
  for (const y0 of [0, 192]) {
    for (let x = 0; x < 1024 / 32; x++) {
      b.fillStyle = x % 2 === 0 ? L.finish[1] : L.finish[0];
      b.fillRect(x * 32, y0, 32, 32);
    }
  }
  b.fillStyle = L.finish[1];
  b.font = '800 104px system-ui, -apple-system, "Segoe UI", sans-serif';
  b.textAlign = "center";
  b.textBaseline = "middle";
  b.fillText(trackName.toUpperCase(), 512, 116, 940);

  // The ramp: planks running across, a few nail heads.
  const [pc, p] = canvas(256, 256);
  for (let i = 0; i < 8; i++) {
    p.fillStyle = i % 2 === 0 ? L.ramp : new THREE.Color(L.ramp).multiplyScalar(0.92).getStyle();
    p.fillRect(0, i * 32, 256, 32);
    p.fillStyle = "rgba(80,50,20,0.45)";
    p.fillRect(0, i * 32, 256, 2);
    for (let k = 0; k < 40; k++) {
      p.fillStyle = "rgba(120,80,40,0.18)";
      p.fillRect(rnd() * 256, i * 32 + 4 + rnd() * 24, 18 + rnd() * 40, 1);
    }
  }
  // An arrow up the ramp.
  p.fillStyle = "rgba(255,255,255,0.85)";
  p.beginPath();
  p.moveTo(128, 40);
  p.lineTo(200, 120);
  p.lineTo(160, 120);
  p.lineTo(160, 216);
  p.lineTo(96, 216);
  p.lineTo(96, 120);
  p.lineTo(56, 120);
  p.closePath();
  p.fill();

  // Hazard stripes for the ramp's lip.
  const [hc, h] = canvas(128, 32);
  h.fillStyle = L.rampLip[0];
  h.fillRect(0, 0, 128, 32);
  h.fillStyle = L.rampLip[1];
  for (let x = -32; x < 160; x += 32) {
    h.beginPath();
    h.moveTo(x, 32);
    h.lineTo(x + 16, 32);
    h.lineTo(x + 32, 0);
    h.lineTo(x + 16, 0);
    h.closePath();
    h.fill();
  }

  // The lemonade stand's sign.
  const [gc, gx] = canvas(512, 128);
  gx.fillStyle = "#fff8d6";
  gx.fillRect(0, 0, 512, 128);
  gx.strokeStyle = "#e0a82e";
  gx.lineWidth = 10;
  gx.strokeRect(5, 5, 502, 118);
  gx.fillStyle = "#b4421d";
  gx.font = '800 66px system-ui, -apple-system, "Segoe UI", sans-serif';
  gx.textAlign = "center";
  gx.textBaseline = "middle";
  gx.fillText("LEMONADE", 256, 68, 470);

  // The sky, for the puddle to reflect (a picture all round: horizon in the middle).
  const [kc, k] = canvas(256, 128);
  const sg = k.createLinearGradient(0, 0, 0, 128);
  sg.addColorStop(0, L.sky[0]);
  sg.addColorStop(0.5, L.sky[1]);
  sg.addColorStop(0.52, new THREE.Color(L.boundary).getStyle());
  sg.addColorStop(1, new THREE.Color(L.grass[1]).getStyle());
  k.fillStyle = sg;
  k.fillRect(0, 0, 256, 128);
  k.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 10; i++) {
    k.beginPath();
    k.ellipse(rnd() * 256, 18 + rnd() * 36, 14 + rnd() * 12, 5, 0, 0, Math.PI * 2);
    k.fill();
  }

  const asphalt = texture(ac, { repeat: true });
  const lawn = texture(lc, { repeat: true });
  const sidewalk = texture(sc, { repeat: true });
  const line = texture(nc);
  line.wrapT = THREE.RepeatWrapping;
  const dash = texture(dc, { repeat: true });
  const checker = texture(cc, { repeat: true });
  const banner = texture(bc);
  const planks = texture(pc);
  const lip = texture(hc, { repeat: true });
  const wire = wirePicture();
  const sign = texture(gc);
  const sky = texture(kc);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.generateMipmaps = false;
  sky.minFilter = THREE.LinearFilter;
  for (const t of [asphalt, lawn, sidewalk, checker, planks, dash, line]) t.anisotropy = anisotropy;
  const all = [asphalt, lawn, sidewalk, line, dash, checker, banner, planks, lip, wire, sign, sky];
  return { asphalt, lawn, sidewalk, line, dash, checker, banner, planks, lip, wire, sign, sky, all };
}
