import {
  Color,
  HalfFloatType,
  NoBlending,
  ShaderMaterial,
  UniformsUtils,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

function sceneTarget(width: number, height: number, samples: number) {
  const target = new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    depthBuffer: true,
    samples,
    resolveDepthBuffer: false,
  });
  target.texture.name = 'GarageScene.color';
  return target;
}

/** Keep scene depth and MSAA separate from the composer's fullscreen-effect buffers. */
export class SceneRenderPass extends RenderPass {
  private target: WebGLRenderTarget;
  private copyMaterial = new ShaderMaterial({
    name: 'GarageScene.copy',
    uniforms: UniformsUtils.clone(CopyShader.uniforms),
    vertexShader: CopyShader.vertexShader,
    fragmentShader: CopyShader.fragmentShader,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private quad = new FullScreenQuad(this.copyMaterial);
  private output?: OutputPass;
  private savedClearColor = new Color();
  private disposed = false;

  constructor(scene: Scene, camera: Camera, samples = 0) {
    super(scene, camera);
    this.target = sceneTarget(1, 1, samples);
  }

  /** Queue the same linear-HDR shader variants used by the beauty pass. */
  async compileAsync(renderer: WebGLRenderer) {
    if (this.disposed) return;
    const previousTarget = renderer.getRenderTarget(),
      previousFace = renderer.getActiveCubeFace(),
      previousMip = renderer.getActiveMipmapLevel();
    try {
      renderer.setRenderTarget(this.target);
      // Do not await here: compilation is queued synchronously, so restore the
      // caller's target before polling shader completion yields to other work.
      return renderer.compileAsync(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
    }
  }

  setSamples(samples: number) {
    if (this.disposed || samples === this.target.samples) return;
    const previous = this.target;
    this.target = sceneTarget(previous.width, previous.height, samples);
    previous.dispose();
  }

  setSize(width: number, height: number) {
    if (!this.disposed) this.target.setSize(width, height);
  }

  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    if (this.disposed) return;
    const previousTarget = renderer.getRenderTarget(),
      previousFace = renderer.getActiveCubeFace(),
      previousMip = renderer.getActiveMipmapLevel(),
      previousAutoClear = renderer.autoClear,
      toScreen = this.renderToScreen,
      previousOverride = this.scene.overrideMaterial,
      restoreClear = this.clearColor !== null || this.clearAlpha !== null,
      previousAlpha = restoreClear ? renderer.getClearAlpha() : 0;
    if (restoreClear) renderer.getClearColor(this.savedClearColor);
    try {
      this.renderToScreen = false;
      // RenderPass clears depth before binding its destination; bind ours first.
      renderer.setRenderTarget(this.target);
      super.render(renderer, writeBuffer, this.target, deltaTime, maskActive);
      renderer.autoClear = false;
      if (toScreen) {
        // Offscreen scene colour is linear HDR, so standalone use still needs output conversion.
        this.output ??= new OutputPass();
        this.output.renderToScreen = true;
        this.output.render(renderer, writeBuffer, this.target, deltaTime, maskActive);
      } else {
        this.copyMaterial.uniforms.tDiffuse.value = this.target.texture;
        renderer.setRenderTarget(readBuffer);
        this.quad.render(renderer);
      }
    } finally {
      this.renderToScreen = toScreen;
      this.scene.overrideMaterial = previousOverride;
      if (restoreClear) renderer.setClearColor(this.savedClearColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.target.dispose();
    this.copyMaterial.dispose();
    this.quad.dispose();
    this.output?.dispose();
  }
}
