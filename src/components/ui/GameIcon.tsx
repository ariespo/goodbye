import type { CSSProperties } from 'react';

import { assetUrl } from '../../utils/assetUrl';



const iconNames = {

  observe: 'observe',

  investigate: 'investigate',

  action: 'action',

  map: 'map',

  history: 'history',

  lorebook: 'lorebook',

  preset: 'preset',

  settings: 'settings',

  prompt: 'prompt',

  ending: 'ending',

  close: 'close',

  back: 'back',

  fastForward: 'fast-forward',

  auto: 'auto',

  pause: 'pause',

  restart: 'restart',

  play: 'play',
  save: 'save',
  trash: 'trash',
  clock: 'clock',
  warning: 'warning',
  info: 'info',
  success: 'success',
  error: 'error',
  plus: 'plus',
  upload: 'upload',
  download: 'download',
  edit: 'edit',
  stack: 'stack',
  lightning: 'lightning',
  copy: 'copy',
  key: 'key',

} as const;



export type GameIconName = keyof typeof iconNames;



interface GameIconProps {

  name: GameIconName;

  size?: number;

  className?: string;

  style?: CSSProperties;

  title?: string;

}



export function GameIcon({ name, size = 24, className, style, title }: GameIconProps) {

  const href = `${assetUrl('assets/icons/game-icons.svg')}#game-icon-${iconNames[name]}`;



  return (

    <svg

      width={size}

      height={size}

      viewBox="0 0 16 16"

      aria-hidden={title ? undefined : true}

      role={title ? 'img' : undefined}

      className={className}

      style={{ display: 'inline-block', flex: '0 0 auto', imageRendering: 'pixelated', ...style }}

    >

      {title && <title>{title}</title>}

      <use href={href} />

    </svg>

  );

}

