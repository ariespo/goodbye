import { assetUrl } from '../../utils/assetUrl';
import { useGameStore } from '../../stores/gameStore';
import { getRainOverlayOpacity, hasRainOverlay } from '../../utils/sceneEnvironment';

export function RainOverlay() {
  const environment = useGameStore(state => state.game.currentState.environment);
  if (!hasRainOverlay(environment)) return null;

  return (
    <div
      className="rain-overlay absolute inset-0 pointer-events-none z-[4]"
      style={{
        backgroundImage: `url(${assetUrl('assets/effects/rain-overlay.gif')})`,
        backgroundRepeat: 'repeat',
        backgroundSize: '192px 192px',
        imageRendering: 'pixelated',
        opacity: getRainOverlayOpacity(environment),
        mixBlendMode: 'screen',
      }}
    />
  );
}
