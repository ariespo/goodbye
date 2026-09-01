export const HUD_DESIGN_WIDTH = 1672;
export const HUD_DESIGN_HEIGHT = 941;

export type HudLayout = {
  scale: number;
  virtualWidth: number;
  virtualHeight: number;
};

export function calculateHudLayout(viewportWidth: number, viewportHeight: number): HudLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const scale = Math.min(safeWidth / HUD_DESIGN_WIDTH, safeHeight / HUD_DESIGN_HEIGHT);

  return {
    scale,
    virtualWidth: safeWidth / scale,
    virtualHeight: safeHeight / scale,
  };
}
