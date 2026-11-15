"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Hand, Pause, Play, SkipBack, ZoomIn, ZoomOut } from "lucide-react";
import * as React from "react";
import { contentDurationMs, durationInFrames, frameToMs } from "@/lib/project/schema";
import { formatTime } from "@/lib/utils";
import { KapkupComposition } from "@/remotion/KapkupComposition";
import { registerPlayer, seekToFrame, togglePlay, useEditor } from "@/store/editor";
import { IconButton } from "@/components/ui/button";
import { StageOverlay, type StageView } from "./StageOverlay";

function TimeReadout() {
  const frame = useEditor((state) => state.frame);
  const fps = useEditor((state) => state.project?.settings.fps ?? 30);
  const total = useEditor((state) => (state.project ? contentDurationMs(state.project) : 0));
  return (
    <span className="font-mono text-xs tabular-nums" aria-label="Posisi waktu">
      <span className="text-foreground">{formatTime(frameToMs(frame, fps))}</span>
      <span className="text-muted-foreground"> / {formatTime(total)}</span>
    </span>
  );
}

export function Preview({ projectId, style }: { projectId: string; style?: React.CSSProperties }) {
  const project = useEditor((state) => state.project);
  const playing = useEditor((state) => state.playing);
  const playerRef = React.useRef<PlayerRef>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<StageView>({ zoom: 1, x: 0, y: 0 });
  const [panMode, setPanMode] = React.useState(false);
  const zoomBy = (factor: number) =>
    setView((current) => {
      const zoom = Math.min(8, Math.max(0.25, current.zoom * factor));
      const ratio = zoom / current.zoom;
      return { zoom, x: current.x * ratio, y: current.y * ratio };
    });

  const inputProps = React.useMemo(
    () => (project ? { project, mediaBase: `/api/projects/${projectId}/files`, preview: true } : null),
    [project, projectId],
  );

  React.useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    registerPlayer(player);
    const { setFrame, setPlaying } = useEditor.getState();
    const onFrame = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onPause);
      registerPlayer(null);
    };
  }, []);

  // Bila timeline memendek (hapus/undo), tarik playhead kembali ke dalam durasi.
  const totalFrames = project ? durationInFrames(project) : 1;
  React.useEffect(() => {
    if (useEditor.getState().frame > totalFrames - 1) seekToFrame(totalFrames - 1);
  }, [totalFrames]);

  if (!project || !inputProps) return null;
  const { width, height, fps } = project.settings;

  return (
    <section aria-label="Player" style={style} className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-3 text-xs">
        <span className="font-semibold">Player</span>
        <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {width}×{height} · {fps} fps
        </span>
      </div>
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-stage">
        <div className="size-full" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <Player
          ref={playerRef}
          component={KapkupComposition}
          inputProps={inputProps}
          durationInFrames={totalFrames}
          compositionWidth={width}
          compositionHeight={height}
          fps={fps}
          style={{ width: "100%", height: "100%" }}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          acknowledgeRemotionLicense
        />
        </div>
        <StageOverlay stageRef={stageRef} view={view} onViewChange={setView} panMode={panMode} />
      </div>
      <div className="grid h-12 shrink-0 grid-cols-3 items-center px-3">
        <TimeReadout />
        <div className="flex items-center justify-center gap-1.5">
          <IconButton label="Ke awal (Home)" onClick={() => seekToFrame(0)}>
            <SkipBack />
          </IconButton>
          <IconButton
            label={playing ? "Jeda (Spasi)" : "Putar (Spasi)"}
            onClick={togglePlay}
            variant="primary"
            className="size-8 rounded-full [&_svg]:fill-current"
          >
            {playing ? <Pause /> : <Play className="translate-x-px" />}
          </IconButton>
        </div>
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            label={panMode ? "Mode geser kanvas: aktif" : "Geser kanvas (atau seret dengan tombol tengah mouse)"}
            active={panMode}
            onClick={() => setPanMode((value) => !value)}
          >
            <Hand />
          </IconButton>
          <IconButton label="Perkecil kanvas" onClick={() => zoomBy(1 / 1.25)}>
            <ZoomOut />
          </IconButton>
          <button
            type="button"
            title="Kembalikan kanvas ke ukuran pas"
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
            className="h-7 min-w-11 cursor-pointer rounded-md px-1 text-xs text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground"
          >
            {Math.round(view.zoom * 100)}%
          </button>
          <IconButton label="Perbesar kanvas" onClick={() => zoomBy(1.25)}>
            <ZoomIn />
          </IconButton>
        </div>
      </div>
    </section>
  );
}
