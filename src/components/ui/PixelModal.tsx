import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { assetUrl } from '../../utils/assetUrl';
import { PixelFrame } from './PixelFrame';

const CLOSE_MS = 220;

const pixelModalIconSrc = {
  clue: assetUrl('assets/ui/penpot/pc/icon-modal-clue.svg'),
  map: assetUrl('assets/ui/penpot/pc/icon-modal-map.svg'),
  investigate: assetUrl('assets/ui/penpot/pc/icon-modal-investigate.svg'),
  action: assetUrl('assets/ui/penpot/pc/icon-modal-action.svg'),
  warning: assetUrl('assets/ui/penpot/pc/icon-modal-warning.svg'),
  close: assetUrl('assets/ui/penpot/pc/icon-modal-close.svg'),
} as const;

type PixelModalIconName = keyof typeof pixelModalIconSrc;

type PixelModalInteractionContextValue = {
  requestClose: () => void;
  interactive: boolean;
};

const PixelModalCloseContext = createContext<PixelModalInteractionContextValue | null>(null);

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => element.tabIndex >= 0);
}

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
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setRendered(true);
      return;
    }

    previousFocusRef.current?.focus();
    const timer = window.setTimeout(() => {
      setRendered(false);
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

  useEffect(() => {
    if (!open || !rendered) return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    (getFocusableElements(dialog)[0] ?? dialog).focus();
  }, [open, rendered]);

  if (!rendered) return null;

  const requestClose = () => {
    if (open && !closeBlocked) onClose();
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = getFocusableElements(dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusEscaped = !dialog.contains(activeElement);

    if (event.shiftKey && (activeElement === firstElement || focusEscaped)) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && (activeElement === lastElement || focusEscaped)) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      className={`pixel-modal-shell ${open ? 'is-open' : 'is-closing'} ${compact ? 'is-compact' : ''} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-hidden={!open ? 'true' : undefined}
      inert={!open}
      tabIndex={-1}
      data-testid="pixel-modal-backdrop"
      onKeyDown={trapFocus}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <PixelModalCloseContext.Provider value={{ requestClose, interactive: open }}>
        <PixelFrame variant="modal" className="pixel-modal-frame" contentClassName="pixel-modal-frame-content">
          {children}
        </PixelFrame>
      </PixelModalCloseContext.Provider>
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
  const modalInteraction = useContext(PixelModalCloseContext);
  const resolvedIconSrc = iconSrc && (pixelModalIconSrc[iconSrc as PixelModalIconName] ?? iconSrc);

  return (
    <header className="pixel-modal-header">
      {resolvedIconSrc && <img className="pixel-modal-header-icon" src={resolvedIconSrc} alt="" />}
      <div className="pixel-modal-header-copy">
        <h2 id={titleId} className="pixel-modal-title">{title}</h2>
        {meta && <p className="pixel-modal-meta">{meta}</p>}
      </div>
      <button
        type="button"
        className="pixel-modal-close"
        onClick={modalInteraction?.requestClose ?? onClose}
        aria-label={closeLabel}
        disabled={modalInteraction ? !modalInteraction.interactive : false}
      >
        <img className="pixel-modal-close-icon" src={pixelModalIconSrc.close} alt="" />
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
  disabled = false,
  type = 'button',
  ...rest
}: PixelModalActionProps) {
  const modalInteraction = useContext(PixelModalCloseContext);
  const interactionDisabled = disabled || (modalInteraction ? !modalInteraction.interactive : false);
  return (
    <button
      type={type}
      className={`pixel-modal-action ${className}`}
      data-active={active}
      disabled={interactionDisabled}
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
  const modalInteraction = useContext(PixelModalCloseContext);
  const interactionDisabled = disabled || (modalInteraction ? !modalInteraction.interactive : false);
  return (
    <button
      type={type}
      className={`pixel-modal-list-item ${className}`}
      data-selected={selected}
      data-disabled={interactionDisabled}
      disabled={interactionDisabled}
      {...rest}
    >
      {children}
    </button>
  );
}
