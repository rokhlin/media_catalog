import React, { useEffect, useCallback } from 'react';
import './common.css';

export interface ModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  id?: string;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
}

export default function ModalContainer({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
  className = '',
  id,
  closeOnEscape = true,
  closeOnBackdropClick = true,
}: ModalContainerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="common-modal-backdrop"
      onClick={closeOnBackdropClick ? onClose : undefined}
      id={id ? `${id}-backdrop` : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`common-modal-dialog size-${size} ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
        id={id}
      >
        {(title || icon) && (
          <div className="common-modal-header">
            <div className="common-modal-title-area">
              {icon && <span className="common-modal-icon">{icon}</span>}
              <div>
                {title && <h2>{title}</h2>}
                {subtitle && <p className="common-modal-subtitle">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              className="common-modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              &times;
            </button>
          </div>
        )}

        <div className="common-modal-body">{children}</div>

        {footer && <div className="common-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export { ModalContainer };
