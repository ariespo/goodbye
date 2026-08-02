import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';

const EFFECT_DURATION: Record<string, number> = {
  'lightning-flash': 360,
  'lightning-flash.gif': 360,
  'loop-transition': 1100,
  'loop-transition.gif': 1100,
};

export function EffectOverlay() {
  const effect = useGameStore(state => state.game.currentState.effect);
  const [visibleEffect, setVisibleEffect] = useState<string | null>(null);

  useEffect(() => {
    if (!effect) return;
    setVisibleEffect(effect);
    const duration = EFFECT_DURATION[effect] || 700;
    const timer = window.setTimeout(() => setVisibleEffect(null), duration);
    return () => window.clearTimeout(timer);
  }, [effect]);

  if (!visibleEffect) return null;

  const filename = visibleEffect.includes('.') ? visibleEffect : `${visibleEffect}.gif`;
  const isLoopTransition = visibleEffect.startsWith('loop-transition');

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[18]"
      style={{
        backgroundImage: `url(${assetUrl(`assets/effects/${filename}`)})`,
        backgroundRepeat: isLoopTransition ? 'repeat' : 'repeat',
        backgroundSize: isLoopTransition ? '288px 192px' : '192px 192px',
        mixBlendMode: isLoopTransition ? 'normal' : 'screen',
        opacity: isLoopTransition ? 0.92 : 0.72,
        animation: isLoopTransition ? 'effectFadeOut 1.1s steps(5, end) both' : 'effectFlash 0.36s steps(2, end) both',
      }}
    />
  );
}
