import type { EffectId } from "@/lib/project/catalog";
import type { Adjust } from "@/lib/project/schema";

/** Jenis data seret-lepas dari panel pustaka ke timeline. */
export const ASSET_DRAG_TYPE = "application/x-kapkup-asset";
export const FX_DRAG_TYPE = "application/x-kapkup-fx";
export const TRANSITION_DRAG_TYPE = "application/x-kapkup-transition";

export type FxDragPayload = { type: "effect"; effect: EffectId } | { type: "adjustment"; adjust: Partial<Adjust> };
