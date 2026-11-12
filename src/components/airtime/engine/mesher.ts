/**
 * Low-poly building blocks (client, three.js): a Mesher collects simple solids
 * (boxes, cylinders, cones, blobs, prisms, quads) with a color and a placement
 * and merges them into one flat-shaded, vertex-colored geometry, so a whole row
 * of buildings is one draw call. three.js space is the sim's: x forward, y up;
 * z is depth (the running line is z = 0, the camera looks down -z).
 */

import * as THREE from "three";

export type Tint = string | THREE.Color;

const tmp = new THREE.Color();

/** A placement: position, turn about y (radians), and scale. */
export function at(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
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

  get empty(): boolean {
    return this.pos.length === 0;
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Adds any geometry (flat shaded), placed by `m`, in one color. */
  add(geo: THREE.BufferGeometry, tint: Tint, m?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const c = tint instanceof THREE.Color ? tint : tmp.set(tint);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(c.r, c.g, c.b);
    }
    g.dispose();
    if (geo !== g) geo.dispose();
    return this;
  }

  /** A box sitting on its base (y from 0 to h), centered on x and z. */
  box(w: number, h: number, d: number, tint: Tint, m: THREE.Matrix4): this {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(g, tint, m);
  }

  /** A box from corner (x0, y0, z0) to (x1, y1, z1). */
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tint: Tint): this {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(g, tint);
  }

  /** A cylinder standing on its base. */
  cyl(rTop: number, rBottom: number, h: number, sides: number, tint: Tint, m: THREE.Matrix4): this {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, sides);
    g.translate(0, h / 2, 0);
    return this.add(g, tint, m);
  }

  /** A faceted ball. */
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

  /** A flat rectangle facing +z (toward the camera) at depth z. */
  quad(x0: number, y0: number, x1: number, y1: number, z: number, tint: Tint): this {
    const c = tint instanceof THREE.Color ? tint : tmp.set(tint);
    this.pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z);
    for (let i = 0; i < 6; i++) {
      this.nor.push(0, 0, 1);
      this.col.push(c.r, c.g, c.b);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** The merged mesh (Lambert, flat, vertex colors), or null if nothing was added. */
  mesh(material: THREE.Material): THREE.Mesh | null {
    if (this.empty) return null;
    return new THREE.Mesh(this.build(), material);
  }
}

/** A Lambert material for vertex-colored meshes. */
export function paint(extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
}

/** An unlit vertex-colored material (lit windows, glows). */
export function glow(extra: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, ...extra });
}

/** Mixes two hex colors (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** A color, darkened (k < 1) or brightened (k > 1). */
export function shade(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}
