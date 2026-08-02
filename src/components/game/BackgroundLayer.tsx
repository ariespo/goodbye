import { useGameStore } from '../../stores/gameStore';
import { getBackgroundById, resolveBackgroundForTime } from '../../data/backgroundAssets';
import { assetUrl } from '../../utils/assetUrl';

export function BackgroundLayer() {
  const background = useGameStore(state => state.game.currentState.background);
  const gameTime = useGameStore(state => state.game.gameStatus.time);
  const resolvedBackground = background ? resolveBackgroundForTime(background, gameTime) : background;
  const backgroundAsset = resolvedBackground && !resolvedBackground.startsWith('http') ? getBackgroundById(resolvedBackground) : undefined;
  const backgroundFile = backgroundAsset?.file || resolvedBackground;

  return (
    <div
      data-stage-layer
      className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
      style={{
        backgroundImage: backgroundFile ? `url(${backgroundFile.startsWith('http') ? backgroundFile : assetUrl(`assets/backgrounds/${backgroundFile}${backgroundFile.includes('.') ? '' : '.png'}`)})` : 'none',
        filter: 'grayscale(100%) contrast(150%)',
      }}
    />
  );
}
