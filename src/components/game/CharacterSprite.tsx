import { useGameStore } from '../../stores/gameStore';

import { assetUrl } from '../../utils/assetUrl';

import { characterCanvasSize, resolveCharacterSprite } from '../../utils/characterAssets';



export function CharacterSprite() {

  const character = useGameStore(state => state.game.currentState.character);



  if (!character) return null;



  const sprite = resolveCharacterSprite(character);

  const size = characterCanvasSize(character);



  return (

    <div

      className="character-sprite absolute bottom-[10%] left-[5%] bg-contain bg-bottom bg-no-repeat transition-all duration-500 ease-out"

      style={{

        width: `min(${size.width}px, 34vw)`,

        aspectRatio: `${size.width} / ${size.height}`,

        backgroundImage: `url(${sprite.startsWith('http') ? sprite : assetUrl(`assets/characters/${sprite}`)})`,

        filter: 'grayscale(100%) contrast(120%)',

        imageRendering: 'pixelated',

      }}

    />

  );

}
