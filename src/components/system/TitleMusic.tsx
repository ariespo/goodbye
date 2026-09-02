import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';

export function TitleMusic() {
  const titleRevealed = useGameStore(state => state.ui.titleRevealed);
  const musicVolume = useGameStore(state => state.tavern.settings?.musicVolume ?? 0.5);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    if (!titleRevealed) return;

    const volume = useGameStore.getState().tavern.settings?.musicVolume ?? 0.5;
    const audio = new Audio(assetUrl('assets/audio/bgm/title.mp3'));
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;
    setPlaybackBlocked(false);
    let active = true;

    audio.play().then(() => {
      if (active) setPlaybackBlocked(false);
    }).catch(() => {
      if (active) setPlaybackBlocked(true);
    });

    return () => {
      active = false;
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
    if (!titleRevealed || !playbackBlocked) return;

    const resume = () => {
      const audio = audioRef.current;
      if (!audio) return;
      setPlaybackBlocked(false);
      audio.play().then(() => {
        setPlaybackBlocked(false);
      }).catch(() => {
        setPlaybackBlocked(true);
      });
    };

    document.addEventListener('click', resume);
    document.addEventListener('keydown', resume);

    return () => {
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };
  }, [playbackBlocked, titleRevealed]);

  return null;
}
