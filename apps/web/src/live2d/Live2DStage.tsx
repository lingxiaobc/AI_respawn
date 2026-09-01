import { useEffect, useRef, useState } from "react";
import { BlinkController } from "../../../../packages/live2d/src/blink.ts";
import { PortraitRuntime, type PortraitParameters } from "./PortraitRuntime.ts";

const debugEnabled = import.meta.env.DEV && new URLSearchParams(location.search).has("live2dDebug");

export interface Live2DHandle {
  setParameters(parameters: Partial<PortraitParameters>): void;
}

interface Live2DStageProps {
  onReady?(handle: Live2DHandle | null): void;
}

export function Live2DStage({ onReady }: Live2DStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let disposed = false;
    let frame = 0;
    let renderedFrames = 0;
    let runtime: PortraitRuntime | null = null;
    let handlePublished = false;
    const blink = new BlinkController(performance.now());

    const resize = () => {
      if (!runtime) return;
      const rect = host.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      runtime.resize(Math.max(1, Math.round(rect.width * scale)), Math.max(1, Math.round(rect.height * scale)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const draw = () => {
      if (disposed || !runtime) return;
      const eyeOpen = blink.update(performance.now());
      if (debugEnabled) host.dataset.eyeOpen = eyeOpen.toFixed(3);
      runtime.setParameters({ eyeLeftOpen: eyeOpen, eyeRightOpen: eyeOpen });
      runtime.render();
      renderedFrames += 1;
      if (!handlePublished && renderedFrames >= 30 && renderedFrames % 30 === 0) {
        if (!runtime.hasVisiblePixels()) {
          if (renderedFrames < 180) {
            frame = requestAnimationFrame(draw);
            return;
          }
          console.warn("[Live2D] Model loaded without visible WebGL pixels");
          setError("Live2D 已加载，但 WebGL 未绘制出可见像素");
          setStatus("error");
          return;
        }
        handlePublished = true;
        const handle: Live2DHandle = {
          setParameters: (parameters) => runtime?.setParameters(parameters),
        };
        onReady?.(handle);
        setStatus("ready");
      }
      frame = requestAnimationFrame(draw);
    };

    void PortraitRuntime.create(canvas).then((created) => {
      if (disposed) {
        created.release();
        return;
      }
      runtime = created;
      resize();
      frame = requestAnimationFrame(draw);
    }).catch((cause: unknown) => {
      if (disposed) return;
      const message = cause instanceof Error ? cause.message : "Live2D 模型加载失败";
      setError(message);
      setStatus("error");
    });

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      onReady?.(null);
      runtime?.release();
    };
  }, [onReady]);

  return (
    <div className={`live2d-stage is-${status}`} ref={hostRef}>
      <canvas aria-label="Live2D 肖像舞台" ref={canvasRef} />
      {status === "loading" && <div className="live2d-message">正在载入肖像模型</div>}
      {status === "error" && <div className="live2d-message is-error">{error}</div>}
    </div>
  );
}
