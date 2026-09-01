import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../../utils/assetUrl';
import { PixelFrame } from './PixelFrame';

const CLOSE_MS = 220;

const pixelModalIconSrc = {
  clue: assetUrl('assets/ui/penpot/pc/icon-modal-clue.svg'),
  map: assetUrl('assets/ui/penpot/pc/icon-modal-map.svg'),
  investigate: assetUrl('assets/ui/penpot/pc/icon-modal-investigate.svg'),
  action: assetUrl('assets/ui/penpot/pc/icon-modal-action.svg'),
  warning: assetUrl('assets/ui/penpot/pc/icon-modal-warning.svg'),
} as const;

type PixelModalIconName = keyof typeof pixelModalIconSrc;

interface PixelModalShellProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  closeBlocked?: boolean;
}

export function PixelModalShell({
  open,
  onClose,
  labelledBy,
  children,
  className = '',
  compact = false,
  closeBlocked = false,
}: PixelModalShellProps) {
  const [rendered, setRendered] = useState(open);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setRendered(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setRendered(false);
      previousFocusRef.current?.focus();
    }, CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeBlocked) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeBlocked, onClose, open]);

  if (!rendered) return null;

  const requestClose = () => {
    if (!closeBlocked) onClose();
  };

  return (
    <div
      className={`pixel-modal-shell ${open ? 'is-open' : 'is-closing'} ${compact ? 'is-compact' : ''} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-testid="pixel-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <PixelFrame variant="modal" className="pixel-modal-frame" contentClassName="pixel-modal-frame-content">
        {children}
      </PixelFrame>
    </div>
  );
}

interface PixelModalHeaderProps {
  titleId: string;
  title: ReactNode;
  meta?: ReactNode;
  iconSrc?: PixelModalIconName | string;
  onClose: () => void;
  closeLabel?: string;
}

export function PixelModalHeader({
  titleId,
  title,
  meta,
  iconSrc,
  onClose,
  closeLabel = '关闭',
}: PixelModalHeaderProps) {
  const resolvedIconSrc = iconSrc && (pixelModalIconSrc[iconSrc as PixelModalIconName] ?? iconSrc);

  return (
    <header className="pixel-modal-header">
      {resolvedIconSrc && <img className="pixel-modal-header-icon" src={resolvedIconSrc} alt="" />}
      <div className="pixel-modal-header-copy">
        <h2 id={titleId} className="pixel-modal-title">{title}</h2>
        {meta && <p className="pixel-modal-meta">{meta}</p>}
      </div>
      <button type="button" className="pixel-modal-close" onClick={onClose} aria-label={closeLabel}>
        <span aria-hidden="true">×</span>
      </button>
    </header>
  );
}

export function PixelModalContent({ children, className = '', ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={`pixel-modal-content ${className}`} {...rest}>{children}</section>;
}

export function PixelModalFooter({ children, className = '', ...rest }: HTMLAttributes<HTMLElement>) {
  return <footer className={`pixel-modal-footer ${className}`} {...rest}>{children}</footer>;
}

interface PixelModalActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
}

export function PixelModalAction({
  active = false,
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: PixelModalActionProps) {
  return (
    <button
      type={type}
      className={`pixel-modal-action ${className}`}
      data-active={active}
      {...rest}
    >
      {icon && <span className="pixel-modal-action-icon" aria-hidden="true">{icon}</span>}
      <span className="pixel-modal-action-label">{children}</span>
    </button>
  );
}

export function PixelModalStatus({ children, className = '', ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`pixel-modal-status ${className}`} {...rest}>{children}</span>;
}

interface PixelModalListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function PixelModalListItem({
  selected = false,
  children,
  className = '',
  disabled = false,
  type = 'button',
  ...rest
}: PixelModalListItemProps) {
  return (
    <button
      type={type}
      className={`pixel-modal-list-item ${className}`}
      data-selected={selected}
      data-disabled={disabled}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
