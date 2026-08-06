import { useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';

import { assetUrl } from '../../utils/assetUrl';

import { characterCanvasSize, resolveCharacterSprite } from '../../utils/characterAssets';
import { playSfx } from '../../utils/sfx';
import { CharacterAnimationPlayer } from './CharacterAnimationPlayer';
import {
  FUMI_ANIMATION_CLIPS,
  FUMI_ANGRY_TALK_CLIP,
  FUMI_ANGRY_TALK_FRAMES,
  FUMI_ANGRY_TAIL_BLINK,
  FUMI_HAPPY_TALK_CLIP,
  FUMI_HAPPY_TALK_FRAMES,
  FUMI_HAPPY_TAIL_BLINK,
  FUMI_SAD_TALK_CLIP,
  FUMI_SAD_TALK_FRAMES,
  FUMI_SAD_TAIL_BLINK,
  FUMI_TAIL_BLINKS,
  TOUKO_ANIMATION_CLIPS,
  TOUKO_SAD_TALK_CLIP,
  TOUKO_SAD_TALK_FRAMES,
  TOUKO_SAD_TAIL_BLINK,
  TOUKO_TAIL_BLINKS,
  resolveFumiAnimation,
  resolveToukoAnimation,
} from '../../data/characterAnimations';



export function CharacterSprite() {

  const character = useGameStore(state => state.game.currentState.character);
  const mood = useGameStore(state => state.game.currentState.mood);
  const currentLine = useGameStore(state => {
    const scene = state.game.currentScene;
    return scene?.lines[state.game.currentLineIndex];
  });
  const previousMoodRef = useRef<string | null>(null);

  useEffect(() => {
    if (!character) return;
    if (previousMoodRef.current === null) {
      previousMoodRef.current = mood;
      return;
    }
    if (previousMoodRef.current === mood) return;
    previousMoodRef.current = mood;
    playSfx(`emotion-${mood}`, 0.45);
  }, [character, mood]);



  if (!character) return null;



  const sprite = resolveCharacterSprite(character);

  const size = characterCanvasSize(character);
  const src = sprite.startsWith('http') ? sprite : assetUrl(`assets/characters/${sprite}`);
  const isCalm = mood === 'calm';
  const fumiCalm = isCalm && /^fumi-(normal|calm)\.png$/i.test(sprite);
  const toukoCalm = isCalm && /^touko-(normal|calm)\.png$/i.test(sprite);
  const fumiHappy = mood === 'happy' && /^fumi-happy(?:-normalized)?\.png$/i.test(sprite);
  const fumiSad = mood === 'sad' && /^fumi-sad(?:-normalized)?\.png$/i.test(sprite);
  const fumiAngry = mood === 'angry' && /^fumi-angry(?:-normalized)?\.png$/i.test(sprite);
  const toukoSad = mood === 'sad' && /^touko-sad(?:-normalized)?\.png$/i.test(sprite);
  const fumiAnimationId = resolveFumiAnimation(currentLine?.animation, currentLine?.speaker ?? '');
  const toukoAnimationId = resolveToukoAnimation(currentLine?.animation, currentLine?.speaker ?? '');
  const animationClip = fumiHappy
    ? FUMI_HAPPY_TALK_CLIP
    : fumiSad
      ? FUMI_SAD_TALK_CLIP
      : fumiAngry
        ? FUMI_ANGRY_TALK_CLIP
        : fumiCalm
          ? FUMI_ANIMATION_CLIPS[fumiAnimationId]
          : toukoSad
            ? TOUKO_SAD_TALK_CLIP
            : toukoCalm
              ? TOUKO_ANIMATION_CLIPS[toukoAnimationId]
              : null;
  const tailBlink = fumiHappy
    ? FUMI_HAPPY_TAIL_BLINK
    : fumiSad
      ? FUMI_SAD_TAIL_BLINK
      : fumiAngry
        ? FUMI_ANGRY_TAIL_BLINK
        : fumiCalm
          ? FUMI_TAIL_BLINKS[fumiAnimationId]
          : toukoSad
            ? TOUKO_SAD_TAIL_BLINK
            : toukoCalm
              ? TOUKO_TAIL_BLINKS[toukoAnimationId]
              : undefined;
  const stopAfterCycle = fumiCalm
    ? fumiAnimationId === 'fold'
    : toukoCalm
      ? toukoAnimationId === 'reset-cuff'
      : false;



  return (

    <div

      className="character-sprite absolute bottom-[10%] left-[5%] z-10 bg-contain bg-bottom bg-no-repeat transition-all duration-500 ease-out"
      data-stage-layer
      data-emotion={mood}
      key={`${character}-${mood}`}

      style={{
        width: `min(${size.width}px, 34vw)`,
        aspectRatio: `${size.width} / ${size.height}`,
        backgroundImage: animationClip ? undefined : `url(${src})`,
        imageRendering: 'pixelated',
      }}

    >
      {animationClip && (
        <CharacterAnimationPlayer
          key={`${sprite}:${mood}:${currentLine?.animation ?? 'idle'}:${currentLine?.speaker ?? ''}`}
          clip={animationClip}
          fallbackSrc={fumiHappy
            ? FUMI_HAPPY_TALK_FRAMES[0]
            : fumiSad
              ? FUMI_SAD_TALK_FRAMES[0]
              : fumiAngry
                ? FUMI_ANGRY_TALK_FRAMES[0]
                : toukoSad
                  ? TOUKO_SAD_TALK_FRAMES[0]
                  : src}
          tailBlink={tailBlink}
          stopAfterCycle={stopAfterCycle}
          className="h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
    </div>

  );

}
