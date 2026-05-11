import { useGameStore } from '../../stores/gameStore';

export function CharacterSprite() {
  const character = useGameStore(state => state.game.currentState.character);

  if (!character) return null;

  return (
    <div
      className="absolute bottom-[10%] left-[5%] w-[500px] h-[800px] bg-contain bg-bottom bg-no-repeat transition-all duration-500 ease-out"
      style={{
        backgroundImage: `url(${character.startsWith('http') ? character : `/assets/characters/${character}`})`,
        filter: 'grayscale(100%) contrast(120%)',
      }}
    />
  );
}
