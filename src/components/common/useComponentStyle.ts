import { useMemo } from 'react';
import {
  componentStyles,
  type ComponentName,
  type ButtonStyleOptions,
  type ToggleStyleOptions,
  type ModalStyleOptions,
  type ImageViewStyleOptions,
  type ComponentStyleResult,
  type ButtonVariant,
  type ButtonSize,
} from './componentStyles';

export type StyleOptionsMap = {
  button: ButtonStyleOptions;
  toggle: ToggleStyleOptions;
  modal: ModalStyleOptions;
  imageView: ImageViewStyleOptions;
};

/**
 * Pure function to resolve component styles statically or outside hooks.
 */
export function getComponentStyle<K extends ComponentName>(
  name: K,
  options?: StyleOptionsMap[K]
): ComponentStyleResult {
  const comp = componentStyles[name];
  if (!comp) {
    return { className: '' };
  }
  return comp.resolve(options as any);
}

/**
 * Hook to retrieve specific component styles by name from the component tree.
 * Usage:
 *   const { className } = useComponentStyle('button', { variant: 'primary', size: 'sm' });
 */
export function useComponentStyle<K extends ComponentName>(
  name: K,
  options?: StyleOptionsMap[K]
): ComponentStyleResult {
  return useMemo(() => {
    return getComponentStyle(name, options);
  }, [name, JSON.stringify(options)]);
}

/**
 * Specialized hook for button styling.
 */
export function useButtonStyle(options?: ButtonStyleOptions): ComponentStyleResult {
  return useComponentStyle('button', options);
}

export {
  componentStyles,
  type ComponentName,
  type ButtonStyleOptions,
  type ButtonVariant,
  type ButtonSize,
  type ToggleStyleOptions,
  type ModalStyleOptions,
  type ImageViewStyleOptions,
  type ComponentStyleResult,
};
