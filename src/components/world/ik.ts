// Two-bone IK for planting an arm or leg on a point, on the MakeHuman rig. Pure three.js on the
// bones it is given, so it can be tested without a renderer.
import * as THREE from "three";

/**
 * Kneeling: thighs upright, shins flat. The hips drop by this share of the body's own leg length
 * (calibrated on the shipped rig so the knees and shins rest on the floor), and the feet point back in line
 * with the shins (KNEEL_ANKLE, radians toes-up; negative is toes down).
 */
export const KNEEL_DROP = 0.487;
export const KNEEL_ANKLE = -1.2;

const tmp = {
  p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(),
  q: new THREE.Quaternion(), pq: new THREE.Quaternion(), wq: new THREE.Quaternion(),
};

/** Turns `bone` so that the direction from it to `child` (world space) becomes `toward`. */
function aim(bone: THREE.Bone, child: THREE.Object3D, toward: THREE.Vector3) {
  bone.updateWorldMatrix(true, true);
  const from = new THREE.Vector3().subVectors(child.getWorldPosition(tmp.p2), bone.getWorldPosition(tmp.p0)).normalize();
  const delta = tmp.q.setFromUnitVectors(from, toward.clone().normalize());
  bone.getWorldQuaternion(tmp.wq);
  bone.parent!.getWorldQuaternion(tmp.pq);
  bone.quaternion.copy(tmp.pq.invert().multiply(delta.multiply(tmp.wq)));
  bone.updateWorldMatrix(false, true);
}

export interface PlantResult {
  /** Distance from the end bone to the target afterwards, metres (0 when reached). */
  miss: number;
  /** The target was beyond reach, so the limb stretched toward it instead. */
  clamped: boolean;
}

/**
 * Bends `upper` and `lower` so `end` reaches `target` (world space), keeping the elbow or knee on
 * the side it already bends to. Out of reach, the limb straightens toward the target (never snaps).
 * `weight` blends from the pose the bones are in (0) to the solved pose (1).
 */
export function solveTwoBone(upper: THREE.Bone, lower: THREE.Bone, end: THREE.Object3D, target: THREE.Vector3, weight: number): PlantResult {
  const w = Math.max(0, Math.min(1, weight));
  const miss0 = end.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  if (w === 0) return { miss: miss0, clamped: false };
  upper.updateWorldMatrix(true, true);
  const p0 = upper.getWorldPosition(new THREE.Vector3());
  const p1 = lower.getWorldPosition(new THREE.Vector3());
  const p2 = end.getWorldPosition(new THREE.Vector3());
  const l1 = p0.distanceTo(p1), l2 = p1.distanceTo(p2);
  const to = new THREE.Vector3().subVectors(target, p0);
  const reach = to.length();
  const clamped = reach > l1 + l2 - 1e-4;
  const d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(reach, l1 + l2 - 1e-4));
  const u = to.normalize();
  // The elbow stays on the side it is on: the part of the current upper-limb direction across the aim.
  const bend = new THREE.Vector3().subVectors(p1, p0);
  const pole = bend.sub(u.clone().multiplyScalar(bend.dot(u)));
  if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
  pole.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const elbow = p0.clone().addScaledVector(u, a).addScaledVector(pole, h);
  const hand = p0.clone().addScaledVector(u, d);
  const startUpper = upper.quaternion.clone(), startLower = lower.quaternion.clone();
  aim(upper, lower, elbow.clone().sub(p0));
  aim(lower, end, hand.clone().sub(lower.getWorldPosition(tmp.p1)));
  if (w < 1) {
    const solvedUpper = upper.quaternion.clone(), solvedLower = lower.quaternion.clone();
    upper.quaternion.slerpQuaternions(startUpper, solvedUpper, w);
    lower.quaternion.slerpQuaternions(startLower, solvedLower, w);
    upper.updateWorldMatrix(false, true);
  }
  return { miss: end.getWorldPosition(new THREE.Vector3()).distanceTo(target), clamped };
}

/** The keyed (pre-IK) world positions of a body's two hands. */
export interface KeyedHands { armL: THREE.Vector3; armR: THREE.Vector3 }

/**
 * Where a hand plant on another body aims. Always computed from keyed positions, never from solved ones, so
 * the target doesn't walk from frame to frame as the arms are solved.
 *  - `hand`, reciprocated (the other body plants a hand back): the midpoint of the two keyed hands. Your
 *    `armL` meets their `armR` (facing each other, left clasps right), so both bodies aim at the same point.
 *  - `hand`, not reciprocated: falls back to their opposite hand (`handR` for your `armL`); lint flags it.
 *  - `handL` / `handR`: that specific keyed hand of theirs, on its surface toward yours.
 */
export function handPlantTarget(
  point: "hand" | "handL" | "handR", limb: "armL" | "armR", mine: KeyedHands, theirs: KeyedHands,
  reciprocated: boolean, surface: number,
): THREE.Vector3 {
  const own = mine[limb];
  const opposite = limb === "armL" ? "armR" : "armL";
  const named = point === "handL" ? "armL" : point === "handR" ? "armR" : opposite;
  if (point === "hand" && reciprocated) return own.clone().add(theirs[opposite]).multiplyScalar(0.5);
  const hand = theirs[named];
  return hand.clone().addScaledVector(own.clone().sub(hand).normalize(), surface);
}

/**
 * All fours: hands and knees on the floor. The hips sit where kneeling puts them (thighs vertical, shins flat),
 * and the whole body pitches forward about the hips by the angle that brings the shoulders to the height a
 * straight, vertical arm needs to reach the floor. Everything is measured on the body itself, so it holds at
 * any scale.
 *
 * `hipY` is the hip joint's height above the floor, `shoulderUp`/`shoulderForward` the shoulder's offset from
 * the hip joint in the upright body, `armDrop` the shoulder-to-wrist length plus the wrist's height off the
 * floor. Returns the pitch from upright, radians (π/2 is a horizontal torso); a body whose arms are shorter
 * than its hips are high (children) gets a level torso at most.
 */
export function allFoursPitch(hipY: number, shoulderUp: number, shoulderForward: number, armDrop: number): number {
  // Shoulder height after pitching by θ: hipY + up·cosθ − forward·sinθ. Find θ where it equals armDrop.
  const height = (theta: number) => hipY + shoulderUp * Math.cos(theta) - shoulderForward * Math.sin(theta);
  let lo = 0, hi = Math.PI / 2;
  if (height(hi) >= armDrop) return hi;
  if (height(lo) <= armDrop) return lo;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (height(mid) > armDrop) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The all-fours pitch for a body, from its own bone positions at rest (`at` names a bone's world position, in the body's scaled units). */
export function measureAllFours(at: (bone: string) => THREE.Vector3, legLength: number, scale: number): number {
  const hip = at("thigh_l").add(at("thigh_r")).multiplyScalar(0.5);
  const shoulder = at("upperarm_l").add(at("upperarm_r")).multiplyScalar(0.5);
  const arm = at("upperarm_l").distanceTo(at("lowerarm_l")) + at("lowerarm_l").distanceTo(at("hand_l"));
  // Knees on the floor put the hips a thigh's length up (as kneeling does); the wrist rests a little off the floor.
  return allFoursPitch(legLength * (1 - KNEEL_DROP), shoulder.y - hip.y, shoulder.z - hip.z, arm + 0.04 * scale);
}

/**
 * On all fours a hand that is near the floor is put flat on it: straight down from where the pose keyed it. The
 * rig's forearm rests with a forward bend, so the keyed hand floats a few centimetres up at every scale; this
 * closes that. The weight is full within 0.2 of a leg's length of the floor and fades to nothing by 0.3, so a hand
 * the clip really lifts is left alone.
 */
export function allFoursGrip(hand: THREE.Vector3, legLength: number, scale: number): { target: THREE.Vector3; weight: number } {
  const weight = Math.max(0, Math.min(1, (0.3 * legLength - hand.y) / (0.1 * legLength)));
  return { target: new THREE.Vector3(hand.x, 0.04 * scale, hand.z), weight };
}
