export const HUD_DESIGN_WIDTH = 1672;
export const HUD_DESIGN_HEIGHT = 941;

export type HudLayout = {
  scale: number;
  virtualWidth: number;
  virtualHeight: number;
  offsetX: number;
  offsetY: number;
};

export type HudLayoutOptions = {
  nativePhone?: boolean;
};

export function calculateHudLayout(
  viewportWidth: number,
  viewportHeight: number,
  options: HudLayoutOptions = {},
): HudLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  if (options.nativePhone && safeWidth <= 800) {
    return {
      scale: 1,
      virtualWidth: safeWidth,
      virtualHeight: safeHeight,
      offsetX: 0,
      offsetY: 0,
    };
  }
  const scale = Math.min(safeWidth / HUD_DESIGN_WIDTH, safeHeight / HUD_DESIGN_HEIGHT);

  return {
    scale,
    virtualWidth: HUD_DESIGN_WIDTH,
    virtualHeight: HUD_DESIGN_HEIGHT,
    offsetX: (safeWidth - HUD_DESIGN_WIDTH * scale) / 2,
    offsetY: (safeHeight - HUD_DESIGN_HEIGHT * scale) / 2,
  };
}
