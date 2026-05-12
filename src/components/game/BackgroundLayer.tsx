import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';

export function BackgroundLayer() {
  const background = useGameStore(state => state.game.currentState.background);

  return (
    <div
      className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
      style={{
        backgroundImage: background ? `url(${background.startsWith('http') ? background : assetUrl(`assets/backgrounds/${background}`)})` : 'none',
        filter: 'grayscale(100%) contrast(150%)',
      }}
    />
  );
}
