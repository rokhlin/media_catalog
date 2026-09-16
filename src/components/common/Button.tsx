import React, { useId } from 'react';
import './common.css';
import { useButtonStyle } from './useComponentStyle';
import { FlagsManager } from '../../services/featureFlagsContext';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon-only';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  id?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon-only';
  icon?: React.ReactNode;
  label?: React.ReactNode;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ButtonBase = React.forwardRef<HTMLButtonElement, ButtonProps>(function ButtonBase(
  {
    id: explicitId,
    variant = 'secondary',
    icon,
    label,
    active = false,
    size = 'md',
    className = '',
    children,
    type = 'button',
    disabled,
    ...props
  },
  ref
) {
  // Generate unique fallback ID if id prop is omitted
  const generatedReactId = useId();
  const fallbackId = `btn-${generatedReactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const effectiveId = explicitId?.trim() || fallbackId;

  // Resolve styles unconditionally before any conditional return
  const { className: resolvedStyleClass } = useButtonStyle({
    variant,
    size,
    active,
    disabled: Boolean(disabled),
  });

  // Check if button is disabled by a feature flag ID
  const isEnabledByFlag = FlagsManager.isButtonEnabled(effectiveId);
  if (!isEnabledByFlag) {
    return null;
  }

  return (
    <button
      ref={ref}
      id={effectiveId}
      type={type}
      disabled={disabled}
      className={`common-btn ${resolvedStyleClass} ${className}`.trim()}
      {...props}
    >
      {icon && (
        <span className="common-btn-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {label && <span className="common-btn-label">{label}</span>}
      {children}
    </button>
  );
});

export default function Button(props: ButtonProps) {
  return <ButtonBase {...props} />;
}

export { Button };
