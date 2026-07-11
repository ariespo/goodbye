import { useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';

export function TitleMusic() {
  const titleRevealed = useGameStore(state => state.ui.titleRevealed);
  const musicVolume = useGameStore(state => state.tavern.settings?.musicVolume ?? 0.5);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blockedRef = useRef(false);

  useEffect(() => {
    if (!titleRevealed) return;

    const volume = useGameStore.getState().tavern.settings?.musicVolume ?? 0.5;
    const audio = new Audio(assetUrl('assets/audio/bgm/title.mp3'));
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;
    blockedRef.current = false;

    audio.play().then(() => {
      blockedRef.current = false;
    }).catch(() => {
      blockedRef.current = true;
    });

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [titleRevealed]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  useEffect(() => {
    if (!titleRevealed || !blockedRef.current) return;

    const resume = () => {
      const audio = audioRef.current;
      if (!audio || !blockedRef.current) return;
      audio.play().then(() => {
        blockedRef.current = false;
      }).catch(() => {});
    };

    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });

    return () => {
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };
  }, [titleRevealed]);

  return null;
}
