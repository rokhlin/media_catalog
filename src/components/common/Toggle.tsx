import React from 'react';
import './common.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
  title?: string;
}

export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className = '',
  id,
  title,
}: ToggleProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  return (
    <label
      className={`common-toggle-container ${disabled ? 'disabled' : ''} ${size !== 'md' ? `size-${size}` : ''} ${className}`.trim()}
      title={title}
    >
      <input
        type="checkbox"
        id={id}
        className="common-toggle-input"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
      />
      <span className="common-toggle-track" aria-hidden="true">
        <span className="common-toggle-thumb" />
      </span>
      {label && <span className="common-toggle-label">{label}</span>}
    </label>
  );
}

export { Toggle };
