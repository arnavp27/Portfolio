import {
  BufferAttribute,
  type BufferGeometry,
  type Group,
  type Light,
  type Matrix4,
  type Object3D,
} from 'three';

/** Clone merge-compatible indices without welding authored normals or UV seams. */
export function cloneBatchGeometry(source: BufferGeometry, transform: Matrix4) {
  // The room builder synthesizes flat normals when they are absent. Retain separate
  // triangle corners in that case so indexing cannot turn its fallback into smoothing.
  const geometry = (
    source.index && !source.getAttribute('normal') ? source.toNonIndexed() : source.clone()
  ).applyMatrix4(transform);
  if (!geometry.index) {
    const count = geometry.getAttribute('position').count;
    // 0xffff is reserved for fixed primitive restart, matching Three's setIndex(array).
    const indices = count >= 65536 ? new Uint32Array(count) : new Uint16Array(count);
    for (let index = 0; index < count; index++) indices[index] = index;
    geometry.setIndex(new BufferAttribute(indices, 1));
  }
  return geometry;
}

/** Remove only empty static transform groups left behind by mesh batching. */
export function pruneEmptyStaticGroups(root: Object3D, lightScope: Object3D = root) {
  // A subtree can be animated or interactive through a parent outside the pruning root.
  for (let ancestor = root.parent; ancestor; ancestor = ancestor.parent)
    if (ancestor.userData.dynamic || ancestor.userData.action) return 0;

  const targets = new Set<Object3D>();
  const collectTarget = (object: Object3D) => {
    const light = object as Light & { target?: Object3D };
    if (light.isLight && light.target) targets.add(light.target);
  };
  // Lights elsewhere in the scene can reference an otherwise empty group below root.
  lightScope.traverse(collectTarget);
  if (lightScope !== root) root.traverse(collectTarget);

  let removed = 0;
  function prune(object: Object3D) {
    if (
      object.userData.dynamic ||
      object.userData.action ||
      (object as Light).isLight ||
      targets.has(object)
    )
      return;
    // Descend before removing a group so newly empty ancestors can also be retired.
    for (let i = object.children.length - 1; i >= 0; i--) prune(object.children[i]);
    if (object !== root && (object as Group).isGroup && object.children.length === 0) {
      object.removeFromParent();
      removed++;
    }
  }
  prune(root);
  return removed;
}

/** Retire registry-owned construction geometry only after all scene objects are attached. */
export function releaseUnusedGeometries(scene: Object3D, owned: Set<BufferGeometry>) {
  const live = new Set<BufferGeometry>();
  // Visibility and renderable type do not affect ownership: hidden objects, rain,
  // instanced actors and skinned meshes may all need their geometry on a later frame.
  scene.traverse((object) => {
    const geometry = (object as Object3D & { geometry?: BufferGeometry }).geometry;
    if (geometry?.isBufferGeometry) live.add(geometry);
  });
  let released = 0;
  for (const geometry of owned) {
    if (live.has(geometry)) continue;
    // Remove ownership before disposal so normal world teardown cannot release it twice.
    owned.delete(geometry);
    geometry.dispose();
    released++;
  }
  return released;
}
