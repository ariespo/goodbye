import { useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';

export function AudioSystem() {
  const bgm = useGameStore(state => state.game.currentState.bgm);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, []);

  useEffect(() => {
    if (!bgm) {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current = null;
      }
      return;
    }

    const audio = new Audio();
    audio.src = bgm.startsWith('http') ? bgm : assetUrl(`assets/audio/bgm/${bgm}`);
    audio.loop = true;
    audio.volume = 0.5;

    const playAudio = async () => {
      try {
        await audio.play();
      } catch {
        // 浏览器自动播放策略可能阻止播放
      }
    };

    if (bgmRef.current) {
      bgmRef.current.pause();
    }

    bgmRef.current = audio;
    playAudio();

    return () => {
      audio.pause();
    };
  }, [bgm]);

  return null;
}
