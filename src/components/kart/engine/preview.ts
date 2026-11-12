/**
 * The roll card's turntable (client, three.js): the rolled ride with its
 * driver on a small patch of road and lawn, turning slowly (still under
 * reduced motion), lit like the race. Loaded with a dynamic import from
 * KartPreview, so three.js only comes down on /kart.
 */

import * as THREE from "three";
import { TRACK_LOOK, type RideId, type WheelId } from "@/lib/kart/content";
import { Character, CHARACTER_SIZE, type CharacterArt } from "@/components/games3d/character";
import { Mesher, paintMaterial, tint } from "./mesher";
import { RideModel, rideParts } from "./rides";
import { wirePicture } from "./textures";

export interface PreviewRide {
  body: RideId;
  wheels: WheelId;
  tone: [string, string];
  driver: HTMLCanvasElement | null;
  /** Development (?look=): a 3D driver in place of the picture. */
  figure?: CharacterArt | null;
  /** Development (?pose=): the 3D driver on its own, standing or flying (no ride). */
  pose?: "stand" | "fly" | null;
}

export interface Preview {
  show(ride: PreviewRide): void;
  /** Turning (on screen and not covered by the race) or still. */
  setRunning(on: boolean): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  dispose(): void;
}

const STILL = { x: 0, y: 0, z: 0, h: 0, steer: 0.35, speed: 0 };
const STILL_FX = { boost: 0, drift: 0, grounded: true };

export function createPreview(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }): Preview | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  const L = TRACK_LOOK;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 320 / 220, 1, 400);
  scene.add(new THREE.HemisphereLight(L.fill[0], L.fill[1], 1.9));
  const sun = new THREE.DirectionalLight(L.sun, 2.3);
  sun.position.set(-40, 80, -46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -34;
  sc.right = sc.top = 34;
  sc.near = 10;
  sc.far = 220;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);

  // A disc of road with a curb and a ring of lawn.
  const stage = new Mesher();
  stage.cyl(31, 32, 1, 40, L.grass[0], new THREE.Matrix4().makeTranslation(0, -1, 0));
  stage.cyl(26, 26, 1.12, 40, L.road, new THREE.Matrix4().makeTranslation(0, -1, 0));
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const g = new THREE.BoxGeometry(6.6, 0.6, 2.2);
    g.rotateY(-a + Math.PI / 2);
    g.translate(Math.cos(a) * 27.2, 0.1, Math.sin(a) * 27.2);
    stage.add(g, tint(L.curb[k % 2]));
  }
  const stageGeo = stage.build();
  const stageMat = paintMaterial();
  const stageMesh = new THREE.Mesh(stageGeo, stageMat);
  stageMesh.receiveShadow = true;
  const turn = new THREE.Group();
  turn.add(stageMesh);
  scene.add(turn);

  const wire = wirePicture();
  let ride: RideModel | null = null;
  let figured = false;
  let solo: Character | null = null;
  let driverTex: THREE.CanvasTexture | null = null;
  let running = false;
  let raf = 0;
  let angle = -2.35;
  let last = performance.now();

  const draw = () => {
    turn.rotation.y = angle;
    renderer.render(scene, camera);
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!opts.reducedMotion) angle += dt * 0.42;
    // Keep a 3D driver posed (the cutout turns toward the camera as the table turns).
    solo?.update(dt, { thrust: 0.7, motion: !opts.reducedMotion });
    if (figured) ride?.update(STILL, dt, STILL_FX, 0.2, !opts.reducedMotion);
    draw();
  };

  return {
    show(r) {
      ride?.dispose();
      ride = null;
      solo?.dispose();
      solo = null;
      driverTex?.dispose();
      driverTex = null;
      if (r.figure && r.pose) {
        // The character on its own: standing on the road, or flying above it.
        solo = new Character(r.figure);
        solo.setPose(r.pose);
        solo.setViewer(camera);
        solo.root.position.set(0, r.pose === "fly" ? 11 : CHARACTER_SIZE.standHip + 0.1, 0);
        solo.update(0, { thrust: 0.7, motion: !opts.reducedMotion });
        turn.add(solo.root);
        const lookY = r.pose === "fly" ? 14.5 : 11;
        camera.position.set(40, lookY + 9, 30);
        camera.lookAt(0, lookY, 0);
        draw();
        return;
      }
      if (r.driver) {
        driverTex = new THREE.CanvasTexture(r.driver);
        driverTex.colorSpace = THREE.SRGBColorSpace;
        driverTex.anisotropy = 4;
      }
      ride = new RideModel(rideParts(r.body, r.wheels, r.tone, { figure: !!r.figure }), driverTex, { wire, character: r.figure ?? null });
      ride.setShadows(true);
      ride.setViewer(camera);
      figured = !!r.figure;
      ride.update(STILL, 0, STILL_FX, 0.2);
      turn.add(ride.root);
      // Frame the ride: from the front corner, a little above.
      camera.position.set(64, 34, 52);
      camera.lookAt(0, 9, 0);
      draw();
    },
    setRunning(on) {
      if (on === running) return;
      running = on;
      cancelAnimationFrame(raf);
      if (on) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } else draw();
    },
    resize(w, h, dpr) {
      renderer.setPixelRatio(Math.min(2, dpr));
      renderer.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ride?.dispose();
      solo?.dispose();
      driverTex?.dispose();
      wire.dispose();
      stageGeo.dispose();
      stageMat.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
    },
  };
}
