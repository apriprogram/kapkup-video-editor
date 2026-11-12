import React from "react";
import { Composition } from "remotion";
import { createEmptyProject, durationInFrames } from "../lib/project/schema";
import { KapkupComposition, type KapkupProps } from "./KapkupComposition";

const defaultProps: KapkupProps = {
  project: createEmptyProject("Kosong"),
  mediaBase: "",
  preview: false,
};

/** Dipakai hanya oleh proses render (scripts/render.ts). Ukuran dan durasi diambil dari project. */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Kapkup"
      component={KapkupComposition}
      defaultProps={defaultProps}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={1}
      calculateMetadata={({ props }) => ({
        width: props.project.settings.width,
        height: props.project.settings.height,
        fps: props.project.settings.fps,
        durationInFrames: durationInFrames(props.project),
      })}
    />
  );
};
