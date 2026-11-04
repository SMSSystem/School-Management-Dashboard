// The arithmetic of the snapshot tool of the PDF import (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.2): a box
// dragged over a rendered page, in the pixels of the canvas the page was drawn on, kept inside the page and not too small,
// and the same box as percentages of the page for the number fields (the way to set it without a pointer). Pure.

export type PixelBox = { x: number; y: number; width: number; height: number };
export type PercentBox = { left: number; top: number; width: number; height: number };

/** A snapshot smaller than this on either side is a slip of the hand, not a figure. */
export const MIN_SNAPSHOT_PX = 16;
/** The page is drawn at this many pixels to a point, less when that would make a side longer than the cap. */
const SNAPSHOT_SCALE = 2;
export const SNAPSHOT_MAX_SIDE = 3000;

/** The scale to draw a page of `width` by `height` points at: 2, or less so that no side passes 3,000 pixels. */
export function snapshotScale(width: number, height: number, wanted: number = SNAPSHOT_SCALE, maxSide: number = SNAPSHOT_MAX_SIDE): number {
  const longest = Math.max(width, height);
  return longest > 0 ? Math.min(wanted, maxSide / longest) : wanted;
}

/** The box inside the canvas (whole pixels, edges clamped), or null when it ends up smaller than the minimum. */
export function clampBox(box: PixelBox, canvasWidth: number, canvasHeight: number): PixelBox | null {
  const left = Math.max(0, Math.min(canvasWidth, Math.round(Math.min(box.x, box.x + box.width))));
  const top = Math.max(0, Math.min(canvasHeight, Math.round(Math.min(box.y, box.y + box.height))));
  const right = Math.max(0, Math.min(canvasWidth, Math.round(Math.max(box.x, box.x + box.width))));
  const bottom = Math.max(0, Math.min(canvasHeight, Math.round(Math.max(box.y, box.y + box.height))));
  const width = right - left;
  const height = bottom - top;
  return width < MIN_SNAPSHOT_PX || height < MIN_SNAPSHOT_PX ? null : { x: left, y: top, width, height };
}

/** The box a drag from one point to another makes (either direction), clamped. */
export function boxFromDrag(from: { x: number; y: number }, to: { x: number; y: number }, canvasWidth: number, canvasHeight: number): PixelBox | null {
  return clampBox({ x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y }, canvasWidth, canvasHeight);
}

const tenth = (n: number) => Math.round(n * 10) / 10;

export function boxToPercent(box: PixelBox, canvasWidth: number, canvasHeight: number): PercentBox {
  return {
    left: tenth((box.x / canvasWidth) * 100),
    top: tenth((box.y / canvasHeight) * 100),
    width: tenth((box.width / canvasWidth) * 100),
    height: tenth((box.height / canvasHeight) * 100),
  };
}

/** The box the percentage fields describe, clamped; null for numbers that are not a box or leave less than the minimum. */
export function boxFromPercent(percent: PercentBox, canvasWidth: number, canvasHeight: number): PixelBox | null {
  const values = [percent.left, percent.top, percent.width, percent.height];
  if (!values.every((v) => Number.isFinite(v)) || percent.width <= 0 || percent.height <= 0) return null;
  return clampBox(
    {
      x: (percent.left / 100) * canvasWidth,
      y: (percent.top / 100) * canvasHeight,
      width: (percent.width / 100) * canvasWidth,
      height: (percent.height / 100) * canvasHeight,
    },
    canvasWidth,
    canvasHeight,
  );
}

/** The whole page as a box. */
export const wholePage = (canvasWidth: number, canvasHeight: number): PixelBox => ({ x: 0, y: 0, width: canvasWidth, height: canvasHeight });
