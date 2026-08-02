import { useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { playSfx, setSfxVolume, type SfxName } from '../../utils/sfx';
import { getRainAudioVolumeScale } from '../../utils/sceneEnvironment';

const SFX_NAMES = new Set<SfxName>([
  'ui-hover', 'ui-click', 'ui-confirm', 'ui-cancel', 'dialogue-advance', 'choice-open',
  'clue-add', 'deduction-start', 'warning', 'success', 'sanity-drop', 'ending-signal',
  'emotion-calm', 'emotion-happy', 'emotion-sad', 'emotion-angry', 'emotion-horror', 'emotion-insane',
  'rain-loop', 'rain-heavy', 'thunder-distant', 'phone-vibrate', 'phone-ring', 'clock-tick',
  'loop-reset', 'flashback-whoosh', 'investigate-paper', 'investigate-object', 'door-open', 'footstep-rain',
]);

export function AudioSystem() {
  const bgm = useGameStore(state => state.game.currentState.bgm);
  const musicVolume = useGameStore(state => state.tavern.settings?.musicVolume ?? 0.5);
  const soundVolume = useGameStore(state => state.tavern.settings?.soundVolume ?? 0.65);
  const environment = useGameStore(state => state.game.currentState.environment);
  const showTitle = useGameStore(state => state.ui.showTitle);
  const notifications = useGameStore(state => state.ui.notifications);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const rainRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const volumeRef = useRef(musicVolume);
  const soundVolumeRef = useRef(soundVolume);
  const knownNotificationsRef = useRef<Set<string> | null>(null);
  const lastHoverRef = useRef<{ element: Element; time: number } | null>(null);

  useEffect(() => {
    volumeRef.current = musicVolume;
    if (bgmRef.current) {
      bgmRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  useEffect(() => {
    setSfxVolume(soundVolume);
    soundVolumeRef.current = soundVolume;
    if (rainRef.current) {
      rainRef.current.volume = soundVolume * getRainAudioVolumeScale(environment);
    }
  }, [soundVolume, environment]);

  useEffect(() => {
    const known = knownNotificationsRef.current;
    if (!known) {
      knownNotificationsRef.current = new Set(notifications.map(notification => notification.id));
      return;
    }
    for (const notification of notifications) {
      if (known.has(notification.id)) continue;
      playSfx(notification.type === 'success' ? 'success' : notification.type === 'error' || notification.type === 'warning' ? 'warning' : 'ui-click');
      known.add(notification.id);
    }
    knownNotificationsRef.current = new Set(notifications.map(notification => notification.id));
  }, [notifications]);

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
      if (rainRef.current && rainRef.current.paused && getRainAudioVolumeScale(environment) > 0 && !showTitle) {
        rainRef.current.play().catch(() => {});
      }
    };

    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, [environment, showTitle]);

  useEffect(() => {
    const interactiveSelector = 'button, a, [role="button"], [data-cursor="pointer"], [data-sfx]';

    const handlePointerOver = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest(interactiveSelector);
      if (!element || element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled')) return;
      const now = performance.now();
      if (lastHoverRef.current?.element === element && now - lastHoverRef.current.time < 250) return;
      lastHoverRef.current = { element, time: now };
      playSfx('ui-hover', 0.7);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest(interactiveSelector);
      if (!element || element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled')) return;
      const requested = element.getAttribute('data-sfx') as SfxName | null;
      if (requested && SFX_NAMES.has(requested)) {
        playSfx(requested);
        return;
      }
      const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.toLowerCase();
      if (/关闭|取消|删除|close|cancel|delete/.test(label)) playSfx('ui-cancel');
      else if (/保存|确认|开始|读取|进入|save|confirm|start|load/.test(label)) playSfx('ui-confirm');
      else playSfx('ui-click');
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerdown', handlePointerDown);
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
    audio.volume = volumeRef.current;

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

  useEffect(() => {
    const rainVolumeScale = getRainAudioVolumeScale(environment);
    if (showTitle) {
      if (rainRef.current) {
        rainRef.current.pause();
      }
      return;
    }

    if (rainVolumeScale <= 0) {
      if (rainRef.current) {
        rainRef.current.pause();
      }
      return;
    }

    if (!rainRef.current) {
      const audio = new Audio(assetUrl('assets/audio/sfx/rain-loop.wav'));
      audio.loop = true;
      audio.volume = soundVolumeRef.current * rainVolumeScale;
      audio.preload = 'auto';
      rainRef.current = audio;
    }

    rainRef.current.volume = soundVolumeRef.current * rainVolumeScale;
    rainRef.current.play().catch(() => {});

    return () => {
      rainRef.current?.pause();
    };
  }, [showTitle, environment]);

  return null;
}
