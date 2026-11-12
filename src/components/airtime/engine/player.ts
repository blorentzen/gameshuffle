/**
 * The player model (client, three.js). THIS FILE IS THE SEAM: the engine gets
 * the player only through buildPlayer(), and only uses what PlayerRig exposes
 * (a Group with feet at y = 0 facing +x, the jetpack nozzles and the blaster's
 * muzzle for effects, and update() each frame). When Britton picks a character
 * look from the shared 3D character module (src/components/games3d/character/,
 * poses "stand" and "fly"), swap the body below for that module's model here
 * and map PlayerPose onto its poses (the aim turns the gun arm only: the body
 * always faces forward); nothing else in Airtime changes.
 *
 * For now: your avatar picture as a round badge for a head, on a simple
 * low-poly body in a jacket with a twin-tank jetpack and a blaster.
 */

import * as THREE from "three";
import { at, Mesher, paint } from "./mesher";

export interface PlayerLook {
  jacket: string;
  jacketDark: string;
  stripe: string;
  pants: string;
  shoes: string;
  tank: string;
  cap: string;
}

export const PLAYER_LOOK: PlayerLook = {
  jacket: "#2f66ec",
  jacketDark: "#1f4bb8",
  stripe: "#ffffff",
  pants: "#27324a",
  shoes: "#f4f4f2",
  tank: "#d7dde5",
  cap: "#ff8a3d",
};

export interface PlayerPose {
  /** Seconds since the run started (for cycles), and this frame's seconds. */
  t: number;
  dt: number;
  vy: number;
  grounded: boolean;
  /** Jetpack flame 0..1 (smoothed by the engine). */
  thrust: number;
  /** Forward speed (sets the running stride). */
  speed: number;
  /** Where the blaster points (radians: 0 straight ahead, pi/2 straight up, -pi/2 straight down). */
  aim: number;
  /** Hidden this frame (the blink after a hit). */
  hidden: boolean;
  /** Animate at all (false with reduced motion: no bob or tilt). */
  motion: boolean;
}

export interface PlayerRig {
  group: THREE.Group;
  /** Where the flames come out (rig space). */
  nozzles: THREE.Vector3[];
  /** The blaster's muzzle in world space (call after update). */
  muzzle(out: THREE.Vector3): THREE.Vector3;
  update(pose: PlayerPose): void;
  dispose(): void;
}

/** Builds the player: `face` is your round avatar badge (null draws a plain helmet). */
export function buildPlayer(face: HTMLCanvasElement | null, look: PlayerLook = PLAYER_LOOK): PlayerRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const mat = paint();
  const owned: { dispose(): void }[] = [mat];

  // Torso, belt and the jetpack (one mesh).
  const torso = new Mesher();
  torso.box(0.5, 0.58, 0.42, look.jacket, at(0.02, 0.56, 0));
  torso.box(0.52, 0.09, 0.44, look.jacketDark, at(0.02, 0.56, 0));
  torso.box(0.06, 0.4, 0.43, look.stripe, at(0.12, 0.66, 0));
  torso.box(0.32, 0.08, 0.36, look.jacketDark, at(0.04, 1.11, 0));
  torso.cyl(0.09, 0.1, 0.14, 8, "#e8c9a6", at(0.03, 1.12, 0));
  // Jetpack: a frame and two tanks with bright caps.
  torso.box(0.16, 0.46, 0.4, "#5b6472", at(-0.3, 0.62, 0));
  for (const z of [-0.12, 0.12]) {
    torso.cyl(0.11, 0.11, 0.5, 10, look.tank, at(-0.42, 0.62, z));
    torso.cyl(0.0, 0.11, 0.12, 10, look.cap, at(-0.42, 1.12, z));
    torso.cyl(0.11, 0.07, 0.1, 10, "#3a404c", at(-0.42, 0.52, z));
    torso.box(0.24, 0.04, 0.05, look.cap, at(-0.42, 0.86, z));
  }
  const torsoMesh = torso.mesh(mat)!;
  body.add(torsoMesh);
  owned.push(torsoMesh.geometry);

  // Legs: pivot at the hip.
  const legGeo = new Mesher();
  legGeo.box(0.2, 0.46, 0.2, look.pants, at(0, -0.48, 0));
  legGeo.box(0.3, 0.12, 0.22, look.shoes, at(0.05, -0.58, 0));
  legGeo.box(0.31, 0.03, 0.23, "#2b2f3a", at(0.05, -0.59, 0));
  const legG = legGeo.build();
  owned.push(legG);
  const legs: THREE.Group[] = [];
  for (const z of [0.11, -0.11]) {
    const hip = new THREE.Group();
    hip.position.set(0.02, 0.6, z);
    hip.add(new THREE.Mesh(legG, mat));
    body.add(hip);
    legs.push(hip);
  }

  // Arms: the front one holds the blaster and aims; the back one swings.
  const armGeo = new Mesher();
  armGeo.box(0.14, 0.44, 0.14, look.jacket, at(0, -0.44, 0));
  armGeo.box(0.15, 0.1, 0.15, "#e8c9a6", at(0, -0.52, 0));
  const armG = armGeo.build();
  owned.push(armG);
  const back = new THREE.Group();
  back.position.set(0.02, 1.02, -0.27);
  back.add(new THREE.Mesh(armG, mat));
  body.add(back);
  const front = new THREE.Group();
  front.position.set(0.04, 1.02, 0.27);
  const gunGeo = new Mesher();
  // The arm points along +x from the shoulder, the blaster at the hand.
  gunGeo.box(0.42, 0.13, 0.13, look.jacket, at(0.2, -0.065, 0));
  gunGeo.box(0.1, 0.12, 0.14, "#e8c9a6", at(0.44, -0.07, 0));
  gunGeo.box(0.36, 0.13, 0.11, "#eef2f7", at(0.6, -0.04, 0));
  gunGeo.box(0.08, 0.14, 0.12, look.cap, at(0.8, -0.045, 0));
  gunGeo.box(0.08, 0.16, 0.08, "#3a404c", at(0.5, -0.18, 0));
  const gunG = gunGeo.build();
  owned.push(gunG);
  front.add(new THREE.Mesh(gunG, mat));
  body.add(front);
  const muzzleLocal = new THREE.Vector3(0.86, 0.025, 0);

  // The head: your badge, always facing the camera.
  let faceMat: THREE.MeshBasicMaterial | null = null;
  let faceTex: THREE.CanvasTexture | null = null;
  const headGeo = new THREE.PlaneGeometry(0.9, 0.9);
  owned.push(headGeo);
  if (face) {
    faceTex = new THREE.CanvasTexture(face);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 4;
    faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.04, depthWrite: true });
    owned.push(faceTex, faceMat);
  }
  const head = new THREE.Group();
  head.position.set(0.04, 1.6, 0.26);
  if (faceMat) head.add(new THREE.Mesh(headGeo, faceMat));
  else {
    const helmet = new Mesher();
    helmet.blob(0.4, look.jacket, at(0, 0, -0.1), 1);
    const m = helmet.mesh(mat)!;
    owned.push(m.geometry);
    head.add(m);
  }
  body.add(head);

  // Flames out of both nozzles: a bright core in an orange cone (added light).
  const flameMat = new THREE.MeshBasicMaterial({ color: "#ff9a3c", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: "#fff1c4", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  // Cones with their base at the nozzle and the tip pointing down.
  const cone = new THREE.ConeGeometry(0.1, 1, 10);
  cone.rotateX(Math.PI);
  cone.translate(0, -0.5, 0);
  const coreCone = new THREE.ConeGeometry(0.05, 0.7, 8);
  coreCone.rotateX(Math.PI);
  coreCone.translate(0, -0.35, 0);
  owned.push(flameMat, coreMat, cone, coreCone);
  const nozzles = [new THREE.Vector3(-0.42, 0.5, -0.12), new THREE.Vector3(-0.42, 0.5, 0.12)];
  const flames: THREE.Group[] = nozzles.map((n) => {
    const f = new THREE.Group();
    f.position.copy(n);
    f.add(new THREE.Mesh(cone, flameMat), new THREE.Mesh(coreCone, coreMat));
    f.renderOrder = 15;
    body.add(f);
    return f;
  });

  let aimNow = 0;
  let tilt = 0;

  return {
    group,
    nozzles,
    muzzle(out: THREE.Vector3) {
      return front.localToWorld(out.copy(muzzleLocal));
    },
    update(p: PlayerPose) {
      group.visible = !p.hidden;
      const run = p.grounded;
      const k = Math.min(1, p.dt * 12);
      // Lean: a little forward when running, back when climbing, forward when falling.
      const want = !p.motion ? 0 : run ? -0.06 : Math.max(-0.28, Math.min(0.16, -p.vy * 0.018 - 0.04));
      tilt += (want - tilt) * k;
      body.rotation.z = tilt;
      const stride = p.t * (5 + p.speed * 0.9);
      if (run) {
        const s = Math.sin(stride);
        legs[0].rotation.z = s * 0.75;
        legs[1].rotation.z = -s * 0.75;
        back.rotation.z = -s * 0.6;
        body.position.y = p.motion ? Math.abs(Math.cos(stride)) * 0.05 : 0;
      } else {
        // Flying: legs trail back, a slow kick.
        const kick = p.motion ? Math.sin(p.t * 6) * 0.12 : 0;
        legs[0].rotation.z = 0.35 + kick + (p.vy < 0 ? -0.25 : 0);
        legs[1].rotation.z = 0.6 - kick + (p.vy < 0 ? -0.2 : 0);
        back.rotation.z = p.vy < 0 ? 2.2 : 0.5;
        body.position.y = 0;
      }
      // The blaster follows your aim; you keep facing forward, so only the arm turns.
      aimNow += (p.aim - aimNow) * Math.min(1, p.dt * 24 || 1);
      front.rotation.z = aimNow - tilt;
      for (const f of flames) {
        const flick = 0.85 + (p.motion ? Math.random() * 0.3 : 0.15);
        const len = p.thrust * flick;
        f.visible = len > 0.04;
        f.scale.set(0.8 + p.thrust * 0.5, len, 0.8 + p.thrust * 0.5);
      }
      flameMat.opacity = 0.55 + p.thrust * 0.35;
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}
