import * as THREE from 'three';
import type { SceneKit } from './types';
import type { TrafficPosition } from './layout';
import {
  headlightGain,
  headlightPose,
  headlightProfile,
  headlightRoadBounds,
  headlightTuning,
  nearestHeadlightVehicles,
} from './headlight-layout.ts';

/** Moving low beams: real PBR illumination nearby and lightweight road pools farther away. */
export function createTrafficHeadlights(kit: SceneKit, traffic: readonly TrafficPosition[]) {
  const root = new THREE.Group();
  root.name = 'traffic-headlights';
  root.userData.dynamic = true;
  kit.root.add(root);

  const slots = Array.from({ length: headlightTuning.activeVehicles }, (_, index) => {
    const lights = [-1, 1].map((side) => {
      const light = new THREE.SpotLight(
        '#ffe3af',
        0,
        headlightTuning.range,
        headlightTuning.coneAngle,
        0.6,
        2,
      );
      light.name = `vehicle-low-beam-${index}-${side}`;
      // No moving shadow maps: the cones remain along the road, well away from the house.
      light.castShadow = false;
      root.add(light, light.target);
      return light;
    });
    return { vehicle: -1, gain: 0, lights };
  });

  // One two-lobed pool per vehicle, shared geometry. The shader keeps it on the asphalt.
  const geometry = new THREE.PlaneGeometry(
    headlightTuning.projectionWidth,
    headlightTuning.projectionLength,
  );
  kit.geos.add(geometry);
  const pools = traffic.map((vehicle, index) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0.2 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      vertexShader: `varying vec2 poolUv; varying vec3 poolWorld;
        void main() {poolUv=uv; vec4 world=modelMatrix*vec4(position,1.0);poolWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader: `uniform float strength;varying vec2 poolUv;varying vec3 poolWorld;
        void main() {
          float along=clamp(1.0-poolUv.y,0.0,1.0);
          float spread=mix(.025,.22,sqrt(along));
          // GLSL pow is undefined for negative bases, even with exponent 2.
          // Signed offsets must be squared directly or NaNs spread through bloom.
          float leftOffset=(poolUv.x-.38)/spread;
          float rightOffset=(poolUv.x-.62)/spread;
          float left=exp(-leftOffset*leftOffset*2.2);
          float right=exp(-rightOffset*rightOffset*2.2);
          float falloff=smoothstep(.01,.12,along)*(1.0-smoothstep(.60,1.0,along))*exp(-along*1.45);
          float road=smoothstep(${headlightRoadBounds.near},${headlightRoadBounds.near + 0.15},poolWorld.z)*(1.0-smoothstep(${headlightRoadBounds.far - 0.15},${headlightRoadBounds.far},poolWorld.z));
          float alpha=(left+right)*falloff*road*strength;
          if(alpha<.001)discard;
          gl_FragColor=vec4(1.0,.78,.43,alpha);
        }`,
    });
    kit.mats.add(material);
    const pool = kit.mesh(geometry, material, [0, -0.009, 0], root, [-Math.PI / 2, 0, 0]);
    pool.name = `road-headlight-pool-${index}`;
    pool.castShadow = false;
    pool.receiveShadow = false;
    pool.renderOrder = 1;
    return { pool, material, profile: headlightProfile(vehicle.kind) };
  });

  let lastTime = 0;
  function animate(time: number, vehicles: readonly TrafficPosition[], observer = { x: 0, z: 15 }) {
    const dt = Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    const selected = nearestHeadlightVehicles(vehicles, observer);
    const desired = new Set(selected.map((item) => item.index));
    // Hold an assignment while its car stays near. A replacement fades out before moving.
    for (const slot of slots) {
      const keep = desired.has(slot.vehicle);
      slot.gain = THREE.MathUtils.damp(slot.gain, keep ? 1 : 0, keep ? 8 : 14, dt);
      if ((!keep && slot.gain < 0.015) || slot.vehicle < 0) {
        const replacement = selected.find(
          (item) => !slots.some((other) => other.vehicle === item.index),
        );
        slot.vehicle = replacement?.index ?? -1;
        slot.gain = 0;
      }
      const vehicle = vehicles[slot.vehicle];
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const light = slot.lights[sideIndex];
        if (!vehicle) {
          light.intensity = 0;
          continue;
        }
        const pose = headlightPose(vehicle, sideIndex === 0 ? -1 : 1);
        light.position.set(pose.source.x, pose.source.y, pose.source.z);
        light.target.position.set(pose.target.x, pose.target.y, pose.target.z);
        light.intensity =
          pose.intensity *
          slot.gain *
          headlightGain(Math.hypot(vehicle.x - observer.x, vehicle.z - observer.z));
      }
    }
    for (let i = 0; i < pools.length; i++) {
      const vehicle = vehicles[i],
        { pool, profile, material } = pools[i];
      const direction = Math.sign(vehicle.speed) || 1;
      pool.position.set(
        vehicle.x + direction * (profile.front + headlightTuning.projectionLength / 2),
        -0.009,
        vehicle.z,
      );
      // The top UV edge is the near end; it stays next to the moving front bumper.
      pool.rotation.set(-Math.PI / 2, 0, direction > 0 ? Math.PI / 2 : -Math.PI / 2);
      const actual = slots.find((slot) => slot.vehicle === i)?.gain ?? 0;
      const distance = Math.hypot(vehicle.x - observer.x, vehicle.z - observer.z);
      material.uniforms.strength.value = (0.19 - actual * 0.1) * Math.max(0, 1 - distance / 100);
    }
  }
  animate(0, traffic);
  return { animate };
}
