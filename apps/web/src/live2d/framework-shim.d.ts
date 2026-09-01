declare module "@live2d-framework/live2dcubismframework" {
  export enum LogLevel {
    LogLevel_Verbose,
    LogLevel_Debug,
    LogLevel_Info,
    LogLevel_Warning,
    LogLevel_Error,
    LogLevel_Off,
  }

  export interface Option {
    logFunction?: (message: string) => void;
    loggingLevel?: LogLevel;
  }

  export class CubismFramework {
    static startUp(option?: Option): boolean;
    static initialize(memorySize?: number): void;
    static dispose(): void;
    static cleanUp(): void;
    static getIdManager(): { getId(id: string): unknown };
  }
}

declare module "@live2d-framework/math/cubismmatrix44" {
  export class CubismMatrix44 {
    scale(x: number, y: number): void;
    multiplyByMatrix(matrix: CubismMatrix44): void;
  }
}

declare module "@live2d-framework/model/cubismusermodel" {
  import type { CubismMatrix44 } from "@live2d-framework/math/cubismmatrix44";

  interface CubismModelLike {
    getCanvasWidth(): number;
    setParameterValueById(id: unknown, value: number): void;
    update(): void;
  }

  interface CubismModelMatrixLike extends CubismMatrix44 {
    setWidth(width: number): void;
  }

  interface CubismRendererLike {
    startUp(gl: WebGLRenderingContext | WebGL2RenderingContext): void;
    loadShaders(path: string): void;
    bindTexture(index: number, texture: WebGLTexture): void;
    setIsPremultipliedAlpha(value: boolean): void;
    setMvpMatrix(matrix: CubismMatrix44): void;
    setRenderState(framebuffer: WebGLFramebuffer | null, viewport: number[]): void;
    drawModel(shaderPath?: string): void;
  }

  export class CubismUserModel {
    loadModel(buffer: ArrayBuffer, shouldCheckMocConsistency?: boolean): void;
    getModel(): CubismModelLike;
    getModelMatrix(): CubismModelMatrixLike;
    createRenderer(width: number, height: number, maskBufferCount?: number): void;
    getRenderer(): CubismRendererLike;
    setRenderTargetSize(width: number, height: number): void;
    release(): void;
  }
}

declare module "@live2d-framework/rendering/cubismoffscreenmanager" {
  export class CubismWebGLOffscreenManager {
    static getInstance(): CubismWebGLOffscreenManager;
    beginFrameProcess(gl: WebGLRenderingContext | WebGL2RenderingContext): void;
    endFrameProcess(gl: WebGLRenderingContext | WebGL2RenderingContext): void;
    releaseStaleRenderTextures(gl: WebGLRenderingContext | WebGL2RenderingContext): void;
  }
}
