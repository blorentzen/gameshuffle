/**
 * Low-poly building blocks (client, three.js): a Mesher collects simple solids
 * (boxes, cylinders, cones, blobs, prisms, any BufferGeometry) with a color and
 * a placement, and merges them into one flat-shaded, vertex-colored geometry,
 * so a whole town is one draw call. Model space everywhere is three.js's: x and
 * z on the ground, y up.
 *
 * World mapping: the race's world is x right, y down the map, z up; in three.js
 * that's (x, z, y). A map heading h (0 = east, clockwise positive) is a turn of
 * -h about y.
 */

import * as THREE from "three";

export type Tint = string | THREE.Color;

const tmpColor = new THREE.Color();

/** A placement: position, turn about y (radians), and scale. */
export function at(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

/** A placement with a full rotation (Euler, radians). */
export function atR(x: number, y: number, z: number, rx: number, ry: number, rz: number, s = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  return m;
}

export class Mesher {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];

  get empty(): boolean {
    return this.pos.length === 0;
  }

  /** Adds any geometry (flat shaded), placed by `m`, in one color (null keeps the geometry's own vertex colors). */
  add(geo: THREE.BufferGeometry, tint: Tint | null, m?: THREE.Matrix4, smooth = false): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    if (!smooth || !g.getAttribute("normal")) g.computeVertexNormals();
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const t = g.getAttribute("uv");
    const own = tint === null ? g.getAttribute("color") : null;
    const c = tint === null ? tmpColor.set("#ffffff") : tint instanceof THREE.Color ? tint : tmpColor.set(tint);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (own) this.col.push(own.getX(i), own.getY(i), own.getZ(i));
      else this.col.push(c.r, c.g, c.b);
      if (t) this.uv.push(t.getX(i), t.getY(i));
      else this.uv.push(0, 0);
    }
    g.dispose();
    if (geo !== g) geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, tint: Tint, m: THREE.Matrix4): this {
    // Sits on its base (y from 0 to h).
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(g, tint, m);
  }

  /** A cylinder standing on its base. */
  cyl(rTop: number, rBottom: number, h: number, sides: number, tint: Tint, m: THREE.Matrix4): this {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, sides);
    g.translate(0, h / 2, 0);
    return this.add(g, tint, m);
  }

  /** A faceted ball (leaves, bushes, clouds). */
  blob(r: number, tint: Tint, m: THREE.Matrix4, detail = 0): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), tint, m);
  }

  /** A prism from a 2D outline (x across, y up) extruded `depth` along z, centered on z. */
  prism(outline: [number, number][], depth: number, tint: Tint, m: THREE.Matrix4): this {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -depth / 2);
    return this.add(g, tint, m);
  }

  /** Raw triangles (three points each; their winding sets which way they face). */
  tris(points: number[], tint: Tint, m?: THREE.Matrix4): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return this.add(g, tint, m);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A Lambert material for vertex-colored meshes. */
export function paintMaterial(extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
}

/** A color from a hex string (converted to the working color space). */
export function tint(hex: string, k = 1): THREE.Color {
  const c = new THREE.Color(hex);
  if (k !== 1) c.multiplyScalar(k);
  return c;
}

/** Mixes two hex colors (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
