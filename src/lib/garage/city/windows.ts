import * as THREE from 'three';
import type { SceneKit } from './types';

/** Small furnished room paintings sit behind the glazing, with view-dependent depth. */
export function createWindowGlass(kit: SceneKit, warm: boolean) {
  const map = kit.texture(512, 512, (c) => {
    const wall = c.createLinearGradient(0, 0, 0, 512);
    wall.addColorStop(0, warm ? '#79694f' : '#45585b');
    wall.addColorStop(0.7, warm ? '#b2a183' : '#778a88');
    wall.addColorStop(1, '#393e35');
    c.fillStyle = wall;
    c.fillRect(0, 0, 512, 512);
    c.fillStyle = '#3a423b';
    c.fillRect(0, 394, 512, 118);
    c.fillStyle = '#5a4935';
    c.fillRect(54, 270, 115, 165);
    for (const y of [310, 350, 390]) {
      c.fillStyle = '#292e2a';
      c.fillRect(62, y, 99, 5);
    }
    for (let i = 0; i < 9; i++) {
      c.fillStyle = ['#8b7862', '#657164', '#a28d69'][i % 3];
      c.fillRect(66 + i * 9, 279, 6, 24);
    }
    c.fillStyle = '#3c4c45';
    c.fillRect(236, 347, 199, 18);
    c.fillRect(249, 365, 8, 100);
    c.fillRect(414, 365, 8, 100);
    c.fillStyle = '#82785e';
    c.fillRect(293, 270, 5, 75);
    c.beginPath();
    c.moveTo(282, 237);
    c.lineTo(311, 237);
    c.lineTo(325, 270);
    c.lineTo(268, 270);
    c.closePath();
    c.fillStyle = warm ? '#e9c38b' : '#b5bfb1';
    c.fill();
    const glow = c.createRadialGradient(296, 280, 0, 296, 280, 160);
    glow.addColorStop(0, warm ? '#f4ca7544' : '#b0d2df0c');
    glow.addColorStop(1, '#f4ca7500');
    c.fillStyle = glow;
    c.fillRect(130, 110, 330, 330);
    c.strokeStyle = '#463f32';
    c.lineWidth = 9;
    c.strokeRect(230, 88, 107, 104);
    c.fillStyle = '#647466';
    c.fillRect(236, 94, 95, 92);
    c.fillStyle = '#9e9b78';
    c.beginPath();
    c.arc(287, 135, 25, 0, Math.PI * 2);
    c.fill();
    for (const x of [0, 456]) {
      c.fillStyle = warm ? '#a29b7e' : '#596e68';
      c.fillRect(x, 0, 56, 394);
      for (let j = 0; j < 6; j++) {
        c.fillStyle = j % 2 ? '#ffffff0a' : '#00000013';
        c.fillRect(x + j * 9, 0, 4, 394);
      }
    }
  });
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map,
    color: '#aab9b2',
    roughness: 0.2,
    metalness: 0.2,
    emissive: warm ? '#ffd6a0' : '#6f8cb6',
    emissiveMap: map,
    emissiveIntensity: warm ? 1.05 : 0.045,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 roomWorld; varying vec2 roomUv;',
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
      roomWorld=(modelMatrix*vec4(transformed,1.0)).xyz;roomUv=uv;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 roomWorld; varying vec2 roomUv;',
      )
      .replace(
        '#include <map_fragment>',
        `
      vec3 eyeDirection=normalize(cameraPosition-roomWorld);
      vec3 right=dFdx(roomWorld)*dFdy(roomUv.y)-dFdy(roomWorld)*dFdx(roomUv.y);
      vec3 up=-dFdx(roomWorld)*dFdy(roomUv.x)+dFdy(roomWorld)*dFdx(roomUv.x);
      // Degenerate UV derivatives must not feed NaNs into the HDR/bloom buffers.
      right*=inversesqrt(max(dot(right,right),1e-20));
      up*=inversesqrt(max(dot(up,up),1e-20));
      vec3 windowNormal=cross(right,up);
      windowNormal*=inversesqrt(max(dot(windowNormal,windowNormal),1e-20));
      float facing=clamp(abs(dot(eyeDirection,windowNormal)),.25,1.0);
      vec2 back=roomUv+vec2(dot(eyeDirection,right),dot(eyeDirection,up))*.18/facing;
      vec3 room=texture2D(map,clamp(back,vec2(.01),vec2(.99))).rgb;
      float wall=step(0.0,back.x)*step(back.x,1.0)*step(0.0,back.y)*step(back.y,1.0);
      room=mix(room*.44,room,wall);
      float grazing=1.0-facing;
      float edge=grazing*grazing*grazing;
      diffuseColor.rgb*=mix(room,vec3(.18,.25,.25),edge*.35);
    `,
      );
  };
  material.customProgramCacheKey = () => `garage-window-${warm}`;
  kit.mats.add(material);
  return material;
}
