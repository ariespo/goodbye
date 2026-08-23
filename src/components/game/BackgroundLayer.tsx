import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { getBackgroundById, resolveBackgroundForTime } from '../../data/backgroundAssets';
import { assetUrl } from '../../utils/assetUrl';
import { preloadImage } from '../../utils/assetManager';

export function BackgroundLayer() {
  const background = useGameStore(state => state.game.currentState.background);
  const gameTime = useGameStore(state => state.game.gameStatus.time);
  const resolvedBackground = background ? resolveBackgroundForTime(background, gameTime) : background;
  const backgroundAsset = resolvedBackground && !resolvedBackground.startsWith('http') ? getBackgroundById(resolvedBackground) : undefined;
  const backgroundFile = backgroundAsset?.file || resolvedBackground;
  const targetUrl = backgroundFile
    ? backgroundFile.startsWith('http')
      ? backgroundFile
      : assetUrl(`assets/backgrounds/${backgroundFile}${backgroundFile.includes('.') ? '' : '.png'}`)
    : null;
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!targetUrl) {
      setDisplayedUrl(null);
      return;
    }
    let cancelled = false;
    void preloadImage(targetUrl).then(
      () => { if (!cancelled) setDisplayedUrl(targetUrl); },
      () => { if (!cancelled) setDisplayedUrl(targetUrl); },
    );
    return () => { cancelled = true; };
  }, [targetUrl]);

  return (
    <div
      data-stage-layer
      className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
      style={{
        backgroundImage: displayedUrl ? `url(${displayedUrl})` : 'none',
        filter: 'grayscale(100%) contrast(150%)',
      }}
    />
  );
}
