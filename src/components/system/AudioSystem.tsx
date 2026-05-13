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
      // 用户交互后，如果 BGM 被自动播放策略阻止，尝试恢复播放
      if (bgmRef.current && bgmRef.current.paused) {
        bgmRef.current.play().catch(() => {});
      }
    };

    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);

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
    const bgmPath = bgm.includes('.') ? bgm : `${bgm}.mp3`;
    audio.src = bgm.startsWith('http') ? bgm : assetUrl(`assets/audio/bgm/${bgmPath}`);
    audio.loop = true;
    audio.volume = 0.5;

    const playAudio = async () => {
      try {
        await audio.play();
      } catch {
        // 浏览器自动播放策略可能阻止播放
      }
    };

    // 音频加载完成后尝试播放（解决首次加载时 play() 过早调用失败）
    audio.addEventListener('canplay', playAudio, { once: true });

    // 立即也尝试一次（文件已缓存时直接成功）
    playAudio();

    if (bgmRef.current) {
      bgmRef.current.pause();
    }

    bgmRef.current = audio;

    return () => {
      audio.pause();
      audio.removeEventListener('canplay', playAudio);
    };
  }, [bgm]);

  return null;
}
