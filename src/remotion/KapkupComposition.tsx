import React from "react";
import {
  AbsoluteFill,
  Freeze,
  Html5Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { ease, transformAt } from "../lib/project/animate";
import {
  applyVariables,
  itemEnd,
  msToFrame,
  type Adjust,
  type Animation,
  type Asset,
  type CaptionsItem,
  type Item,
  type Project,
  type TextStyle,
  type Track,
  type Transform,
  type Transition,
} from "../lib/project/schema";
import {
  ANIMATION_RENDERERS,
  EFFECT_RENDERERS,
  TRANSITION_RENDERERS,
  adjustFilter,
  maskStyle,
  revealText,
  scaleAdjust,
  temperatureMatrix,
  vignetteStyle,
  type AnimationResult,
} from "./fx";
import { useWebFonts } from "./web-fonts";

/**
 * Komposisi tunggal yang dipakai preview di editor DAN render MP4.
 * File ini dan impornya sengaja memakai path relatif, karena ikut dibundel
 * oleh Remotion saat export (di luar Next.js).
 */
export type KapkupProps = {
  project: Project;
  /** URL dasar folder project, mis. "/api/projects/demo/files". */
  mediaBase: string;
  /** Preview memakai file proxy bila ada; render memakai file asli. */
  preview: boolean;
};

function assetUrl(mediaBase: string, relative: string): string {
  return `${mediaBase}/${relative.split("/").map(encodeURIComponent).join("/")}`;
}

function fadeFactor(frame: number, total: number, fadeIn: number, fadeOut: number): number {
  let k = 1;
  if (fadeIn > 0) {
    k = Math.min(k, interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  }
  if (fadeOut > 0) {
    k = Math.min(
      k,
      interpolate(frame, [total - fadeOut, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );
  }
  return k;
}

function transformStyle(t: Transform, opacity: number): React.CSSProperties {
  return {
    opacity: t.opacity * opacity,
    transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale}) rotate(${t.rotation}deg)`,
  };
}

const fill: React.CSSProperties = { width: "100%", height: "100%" };

function filterId(prefix: string, id: string): string {
  return `kk-${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** Filter SVG untuk suhu warna; dirujuk dari CSS `filter: url(#id)`. */
const ColorMatrix: React.FC<{ id: string; adjust: Adjust }> = ({ id, adjust }) => {
  const values = temperatureMatrix(adjust.temperature, adjust.tint);
  if (!values) return null;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={values} />
      </filter>
    </svg>
  );
};

function textBoxStyle(s: TextStyle): React.CSSProperties {
  return {
    maxWidth: `${s.maxWidth * 100}%`,
    fontFamily: `"${s.fontFamily}", Arial, sans-serif`,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    fontStyle: s.italic ? "italic" : "normal",
    color: s.color,
    textAlign: s.align,
    lineHeight: s.lineHeight,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    WebkitTextStroke: s.strokeWidth > 0 ? `${s.strokeWidth}px ${s.strokeColor}` : undefined,
    paintOrder: "stroke fill",
    backgroundColor: s.background ?? undefined,
    padding: s.background ? "0.15em 0.45em" : 0,
    borderRadius: s.background ? "0.2em" : 0,
    textShadow: s.shadow ? "0 0.06em 0.18em rgba(0,0,0,0.65)" : undefined,
  };
}

/** Caption per kata: kelompok kata yang sedang aktif ditampilkan, kata yang diucapkan disorot. */
const CaptionsView: React.FC<{ item: CaptionsItem; localMs: number; opacity: number }> = ({ item, localMs, opacity }) => {
  const { words, pageMs } = item;
  const pages = React.useMemo(
    () =>
      createTikTokStyleCaptions({
        // Pustaka caption Remotion memakai spasi di depan kata sebagai pemisah.
        captions: words.map((word) => ({
          text: ` ${word.text.trim()}`,
          startMs: word.startMs,
          endMs: word.endMs,
          timestampMs: null,
          confidence: null,
        })),
        combineTokensWithinMilliseconds: pageMs,
      }).pages,
    [words, pageMs],
  );
  const at = localMs + item.inMs;
  const page = pages.find((candidate) => at >= candidate.startMs && at < candidate.startMs + candidate.durationMs);
  if (!page) return null;
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", ...transformStyle(transformAt(item, localMs), opacity) }}
    >
      <div
        data-kapkup-item={item.id}
        style={{ ...textBoxStyle(item.style), textTransform: item.uppercase ? "uppercase" : undefined }}
      >
        {page.tokens.map((token, index) => {
          const active = item.highlightColor !== null && at >= token.fromMs && at < token.toMs;
          const text = index === 0 ? token.text.trimStart() : token.text;
          return (
            <span key={`${token.fromMs}-${index}`} style={active ? { color: item.highlightColor ?? undefined } : undefined}>
              {text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Gaya animasi masuk/keluar pada frame ini, atau null bila klip sedang tidak beranimasi. */
function animationAt(
  item: { animationIn: Animation | null; animationOut: Animation | null },
  frame: number,
  total: number,
  fps: number,
): AnimationResult | null {
  const inFrames = item.animationIn ? Math.min(total, Math.max(1, msToFrame(item.animationIn.durationMs, fps))) : 0;
  const outFrames = item.animationOut
    ? Math.min(total - inFrames, Math.max(1, msToFrame(item.animationOut.durationMs, fps)))
    : 0;
  if (item.animationIn && frame < inFrames) {
    return ANIMATION_RENDERERS[item.animationIn.type](ease("ease-out", frame / inFrames));
  }
  if (item.animationOut && outFrames > 0 && frame >= total - outFrames) {
    return ANIMATION_RENDERERS[item.animationOut.type](ease("ease-out", (total - 1 - frame) / outFrames));
  }
  return null;
}

function animationStyle(result: AnimationResult | null): React.CSSProperties | undefined {
  if (!result) return undefined;
  return { opacity: result.opacity, transform: result.transform, filter: result.filter };
}

const ItemView: React.FC<{
  item: Item;
  asset: Asset | undefined;
  total: number;
  muted: boolean;
  mediaBase: string;
  preview: boolean;
  variables: Record<string, string>;
  /** Salinan beku untuk latar transisi: tanpa suara dan tidak bisa dipilih di player. */
  ghost?: boolean;
}> = ({ item, asset, total, muted, mediaBase, preview, variables, ghost = false }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const fadeIn = msToFrame(item.fadeInMs, fps);
  const fadeOut = msToFrame(item.fadeOutMs, fps);
  const k = fadeFactor(frame, total, fadeIn, fadeOut);
  const localMs = (frame / fps) * 1000;

  if (item.type === "effect" || item.type === "adjustment") return null;

  if (item.type === "text") {
    const animation = animationAt(item, frame, total, fps);
    const text = applyVariables(item.text, variables);
    const shown = revealText(text, animation);
    return (
      <AbsoluteFill style={transformStyle(transformAt(item, localMs), k)}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", ...animationStyle(animation) }}>
          <div
            data-kapkup-item={ghost ? undefined : item.id}
            // Sapuan dan jarak huruf dipasang di kotak teksnya, supaya mengikuti ukuran teks, bukan kanvas.
            style={{ ...textBoxStyle(item.style), clipPath: animation?.clipPath, letterSpacing: animation?.letterSpacing }}
          >
            {shown}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (item.type === "captions") {
    return <CaptionsView item={item} localMs={localMs} opacity={k} />;
  }

  if (!asset) return null;

  if (item.type === "audio") {
    return (
      <Html5Audio
        src={assetUrl(mediaBase, preview && asset.proxy ? asset.proxy : asset.path)}
        trimBefore={msToFrame(item.inMs, fps)}
        playbackRate={item.speed}
        volume={(f) => item.volume * fadeFactor(f, total, fadeIn, fadeOut)}
        muted={muted}
        pauseWhenBuffering
      />
    );
  }

  const id = filterId("c", item.id);
  const filter = adjustFilter(item.adjust, id);
  const animation = animationAt(item, frame, total, fps);
  const url = assetUrl(mediaBase, item.type === "video" && preview && asset.proxy ? asset.proxy : asset.path);
  // Dibaca player untuk menggambar kotak seleksi di sekeliling isi klip.
  const mark = ghost
    ? {}
    : {
        "data-kapkup-item": item.id,
        "data-fit": item.fit,
        "data-aspect": asset.height > 0 ? asset.width / asset.height : 1,
      };

  const flip = item.flipX || item.flipY ? `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})` : undefined;

  const media = (style: React.CSSProperties, silent: boolean) =>
    item.type === "image" ? (
      <Img src={url} style={style} />
    ) : (
      <OffthreadVideo
        src={url}
        trimBefore={msToFrame(item.inMs, fps)}
        playbackRate={item.speed}
        volume={(f) => (silent ? 0 : item.volume * fadeFactor(f, total, fadeIn, fadeOut))}
        muted={silent || ghost || muted || !asset.hasAudio}
        pauseWhenBuffering
        style={style}
      />
    );

  return (
    <>
      {item.backdropBlur > 0 && (
        // Salinan klip yang memenuhi kanvas dan diburamkan, untuk mengisi area kosong di sekelilingnya.
        <AbsoluteFill
          key="backdrop"
          style={{
            opacity: k * (animation?.opacity ?? 1),
            filter: `blur(${item.backdropBlur}px) brightness(0.8)`,
            transform: "scale(1.25)",
          }}
        >
          {media({ ...fill, objectFit: "cover" }, true)}
        </AbsoluteFill>
      )}
      <AbsoluteFill
        key="main"
        style={{
          ...transformStyle(transformAt(item, localMs), k),
          filter: filter || undefined,
          mixBlendMode: item.blendMode === "normal" ? undefined : item.blendMode,
        }}
        {...mark}
      >
        <ColorMatrix id={id} adjust={item.adjust} />
        <AbsoluteFill style={{ ...animationStyle(animation), clipPath: animation?.clipPath }}>
          <AbsoluteFill style={item.mask ? maskStyle(item.mask, width, height) : undefined}>
            {media({ ...fill, objectFit: item.fit, transform: flip }, false)}
          </AbsoluteFill>
        </AbsoluteFill>
      </AbsoluteFill>
    </>
  );
};

/** Menganimasikan klip yang masuk (atau frame beku klip yang keluar) selama transisi. */
const TransitionLayer: React.FC<{
  transition: Transition | null;
  frames: number;
  role: "incoming" | "outgoing";
  children: React.ReactNode;
}> = ({ transition, frames, role, children }) => {
  const frame = useCurrentFrame();
  const active = transition !== null && frames > 0 && frame < frames;
  const result = active ? TRANSITION_RENDERERS[transition.type](ease("ease-in-out", frame / frames)) : null;
  // Susunan elemen selalu sama supaya elemen video tidak dibuat ulang saat transisi selesai.
  return (
    <>
      <AbsoluteFill style={result ? (role === "incoming" ? result.incoming : result.outgoing) : undefined}>
        {children}
      </AbsoluteFill>
      {role === "incoming" && result?.overlay ? <AbsoluteFill style={result.overlay} /> : null}
    </>
  );
};

/** Efek dan penyesuaian pada track "fx": membungkus semua lapisan di bawahnya. */
const FxLayer: React.FC<{ track: Track; children: React.ReactNode }> = ({ track, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const filters: string[] = [];
  const transforms: string[] = [];
  const overlays: React.ReactNode[] = [];
  const defs: React.ReactNode[] = [];

  for (const item of track.items) {
    if (item.type !== "effect" && item.type !== "adjustment") continue;
    const from = msToFrame(item.startMs, fps);
    const total = Math.max(1, msToFrame(itemEnd(item), fps) - from);
    const local = frame - from;
    if (local < 0 || local >= total) continue;
    const k = fadeFactor(local, total, msToFrame(item.fadeInMs, fps), msToFrame(item.fadeOutMs, fps));

    if (item.type === "adjustment") {
      const adjust = scaleAdjust(item.adjust, k);
      const id = filterId("fx", item.id);
      const filter = adjustFilter(adjust, id);
      if (filter) filters.push(filter);
      defs.push(<ColorMatrix key={id} id={id} adjust={adjust} />);
      const vignette = vignetteStyle(adjust.vignette);
      if (vignette) overlays.push(<AbsoluteFill key={`${item.id}-v`} style={vignette} />);
    } else {
      const result = EFFECT_RENDERERS[item.effect]({ frame: local, fps, intensity: item.intensity * k, seed: item.id });
      if (result.filter) filters.push(result.filter);
      if (result.transform) transforms.push(result.transform);
      if (result.overlay) overlays.push(<AbsoluteFill key={`${item.id}-o`} style={result.overlay} />);
    }
  }

  return (
    <AbsoluteFill
      style={{
        filter: filters.length ? filters.join(" ") : undefined,
        transform: transforms.length ? transforms.join(" ") : undefined,
      }}
    >
      {defs}
      {children}
      {overlays}
    </AbsoluteFill>
  );
};

/**
 * Menyusun semua lapisan dari belakang ke depan. Sengaja fungsi biasa (bukan
 * komponen): daftar lapisan dibangun bertahap, lalu dibungkus oleh track efek.
 */
function buildLayers(project: Project, fps: number, mediaBase: string, preview: boolean): React.ReactNode[] {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const premount = Math.round(fps * 0.75);
  const assetOf = (item: Item) =>
    item.type === "video" || item.type === "image" || item.type === "audio" ? assets.get(item.assetId) : undefined;

  // Track pertama tampil paling depan, jadi disusun dari track terakhir (paling belakang).
  let layers: React.ReactNode[] = [];
  for (const track of [...project.tracks].reverse()) {
    if (track.kind === "fx") {
      if (!track.hidden && track.items.length > 0) {
        layers = [
          <FxLayer key={track.id} track={track}>
            {layers}
          </FxLayer>,
        ];
      }
      continue;
    }
    if (track.hidden && track.kind !== "audio") continue;

    for (const item of track.items) {
      const from = msToFrame(item.startMs, fps);
      // Akhir dihitung dari posisi akhir (bukan panjang) supaya klip bersebelahan tidak bercelah.
      const total = Math.max(1, msToFrame(itemEnd(item), fps) - from);
      const view = (
        <ItemView
          item={item}
          asset={assetOf(item)}
          total={total}
          muted={track.muted}
          mediaBase={mediaBase}
          preview={preview}
          variables={project.variables}
        />
      );

      if (item.type === "audio") {
        layers.push(
          <Sequence key={item.id} from={from} durationInFrames={total} layout="none">
            {view}
          </Sequence>,
        );
        continue;
      }

      const transition = item.type === "video" || item.type === "image" ? item.transitionIn : null;
      const transitionFrames = transition ? Math.min(total, Math.max(1, msToFrame(transition.durationMs, fps))) : 0;

      if (transition) {
        // Klip sebelumnya yang menempel: frame terakhirnya dibekukan sebagai latar transisi.
        const previous = track.items.find(
          (other) => other.id !== item.id && itemEnd(other) === item.startMs && other.type !== "audio",
        );
        if (previous) {
          const previousFrom = msToFrame(previous.startMs, fps);
          const previousTotal = Math.max(1, from - previousFrom);
          layers.push(
            <Sequence key={`${item.id}-out`} from={from} durationInFrames={transitionFrames} premountFor={premount}>
              <TransitionLayer transition={transition} frames={transitionFrames} role="outgoing">
                <Freeze frame={previousTotal - 1}>
                  <ItemView
                    item={previous}
                    asset={assetOf(previous)}
                    total={previousTotal}
                    muted
                    ghost
                    mediaBase={mediaBase}
                    preview={preview}
                    variables={project.variables}
                  />
                </Freeze>
              </TransitionLayer>
            </Sequence>,
          );
        }
      }

      layers.push(
        <Sequence key={item.id} from={from} durationInFrames={total} premountFor={item.type === "text" ? 0 : premount}>
          <TransitionLayer transition={transition} frames={transitionFrames} role="incoming">
            {view}
          </TransitionLayer>
        </Sequence>,
      );
    }
  }

  return layers;
}

export const KapkupComposition: React.FC<KapkupProps> = ({ project, mediaBase, preview }) => {
  const { fps } = useVideoConfig();
  useWebFonts(project);
  return (
    <AbsoluteFill data-kapkup-root style={{ backgroundColor: project.settings.background, overflow: "hidden" }}>
      {buildLayers(project, fps, mediaBase, preview)}
    </AbsoluteFill>
  );
};
