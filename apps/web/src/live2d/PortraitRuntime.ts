import { CubismFramework, LogLevel } from "@live2d-framework/live2dcubismframework";
import { CubismMatrix44 } from "@live2d-framework/math/cubismmatrix44";
import { CubismUserModel } from "@live2d-framework/model/cubismusermodel";
import { CubismWebGLOffscreenManager } from "@live2d-framework/rendering/cubismoffscreenmanager";

const MODEL_URL = "/live2d/models/portrait/portrait.model3.json";
const SHADER_PATH = "/live2d/shaders/";
const PARAM_MOUTH = "ParamMouthOpenY";
const PARAM_EYE_LEFT = "ParamEyeLOpen";
const PARAM_EYE_RIGHT = "ParamEyeROpen";

interface ModelSettings {
  FileReferences: {
    Moc: string;
    Textures: string[];
  };
}

export interface PortraitParameters {
  mouthOpen: number;
  eyeLeftOpen: number;
  eyeRightOpen: number;
}

let frameworkReady = false;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function ensureFramework(): void {
  if (frameworkReady) return;
  const started = CubismFramework.startUp({
    loggingLevel: LogLevel.LogLevel_Warning,
    logFunction: (message) => console.warn(`[Live2D] ${message.trim()}`),
  });
  if (!started) throw new Error("Cubism Framework 无法启动，请检查本地 SDK Core");
  CubismFramework.initialize();
  frameworkReady = true;
}

async function fetchRequired(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Live2D 资源加载失败：${url} (${response.status})`);
  return response;
}

async function loadTexture(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  url: string,
): Promise<WebGLTexture> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();

  const texture = gl.createTexture();
  if (!texture) throw new Error("无法创建 Live2D WebGL 纹理");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export class PortraitRuntime extends CubismUserModel {
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly textures: WebGLTexture[] = [];
  private readonly parameterIds: { mouth: unknown; eyeLeft: unknown; eyeRight: unknown };
  private parameters: PortraitParameters = { mouthOpen: 0, eyeLeftOpen: 1, eyeRightOpen: 1 };
  private released = false;

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    super();
    this.canvas = canvas;
    this.gl = gl;
    const ids = CubismFramework.getIdManager();
    this.parameterIds = {
      mouth: ids.getId(PARAM_MOUTH),
      eyeLeft: ids.getId(PARAM_EYE_LEFT),
      eyeRight: ids.getId(PARAM_EYE_RIGHT),
    };
  }

  static async create(canvas: HTMLCanvasElement): Promise<PortraitRuntime> {
    ensureFramework();
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    }) ?? canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error("当前浏览器不支持 Live2D 所需的 WebGL");

    const runtime = new PortraitRuntime(canvas, gl);
    try {
      await runtime.initialize();
      return runtime;
    } catch (cause) {
      runtime.release();
      throw cause;
    }
  }

  private async initialize(): Promise<void> {
    const modelUrl = new URL(MODEL_URL, location.href);
    const settings = await (await fetchRequired(modelUrl.href)).json() as ModelSettings;
    const mocUrl = new URL(settings.FileReferences.Moc, modelUrl);
    this.loadModel(await (await fetchRequired(mocUrl.href)).arrayBuffer(), true);
    if (!this.getModel()) throw new Error("Cubism Core 无法创建肖像模型");

    this.createRenderer(this.canvas.width, this.canvas.height);
    const renderer = this.getRenderer();
    renderer.startUp(this.gl);
    renderer.loadShaders(SHADER_PATH);

    for (const [index, texturePath] of settings.FileReferences.Textures.entries()) {
      const texture = await loadTexture(this.gl, new URL(texturePath, modelUrl).href);
      this.textures.push(texture);
      renderer.bindTexture(index, texture);
    }
    renderer.setIsPremultipliedAlpha(true);
  }

  setParameters(next: Partial<PortraitParameters>): void {
    this.parameters = {
      mouthOpen: clamp01(next.mouthOpen ?? this.parameters.mouthOpen),
      eyeLeftOpen: clamp01(next.eyeLeftOpen ?? this.parameters.eyeLeftOpen),
      eyeRightOpen: clamp01(next.eyeRightOpen ?? this.parameters.eyeRightOpen),
    };
  }

  resize(width: number, height: number): void {
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.setRenderTargetSize(width, height);
  }

  render(): void {
    if (this.released || this.canvas.width === 0 || this.canvas.height === 0) return;
    const model = this.getModel();
    model.setParameterValueById(this.parameterIds.mouth, this.parameters.mouthOpen);
    model.setParameterValueById(this.parameterIds.eyeLeft, this.parameters.eyeLeftOpen);
    model.setParameterValueById(this.parameterIds.eyeRight, this.parameters.eyeRightOpen);
    model.update();

    const manager = CubismWebGLOffscreenManager.getInstance();
    manager.beginFrameProcess(this.gl);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    const projection = new CubismMatrix44();
    if (model.getCanvasWidth() > 1 && this.canvas.width < this.canvas.height) {
      this.getModelMatrix().setWidth(2);
      projection.scale(1, this.canvas.width / this.canvas.height);
    } else {
      projection.scale(this.canvas.height / this.canvas.width, 1);
    }
    projection.multiplyByMatrix(this.getModelMatrix());

    const renderer = this.getRenderer();
    renderer.setMvpMatrix(projection);
    renderer.setRenderState(
      this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
      [0, 0, this.canvas.width, this.canvas.height],
    );
    renderer.drawModel(SHADER_PATH);
    manager.endFrameProcess(this.gl);
    manager.releaseStaleRenderTextures(this.gl);
  }

  hasVisiblePixels(): boolean {
    if (this.released || this.canvas.width === 0 || this.canvas.height === 0) return false;
    const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    this.gl.readPixels(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      pixels,
    );
    for (let alpha = 3; alpha < pixels.length; alpha += 16) {
      if (pixels[alpha]! > 0) return true;
    }
    return false;
  }

  override release(): void {
    if (this.released) return;
    this.released = true;
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.textures.length = 0;
    super.release();
  }
}
