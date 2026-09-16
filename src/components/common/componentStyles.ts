/**
 * Component Style Registry & Definitions
 * Exported styles from the component tree to allow consistent styling across the application.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon-only';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  disabled?: boolean;
}

export interface ToggleStyleOptions {
  checked?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export interface ModalStyleOptions {
  size?: 'sm' | 'md' | 'lg' | 'fullscreen';
}

export interface ImageViewStyleOptions {
  fit?: 'contain' | 'cover';
  rounded?: boolean;
}

export interface ComponentStyleResult {
  className: string;
  style?: React.CSSProperties;
}

export const componentStyles = {
  button: {
    baseClass: 'common-btn',
    variants: {
      primary: 'common-btn-primary',
      secondary: 'common-btn-secondary',
      danger: 'common-btn-danger',
      ghost: 'common-btn-ghost',
      'icon-only': 'common-btn-icon-only',
    } as Record<ButtonVariant, string>,
    sizes: {
      sm: 'size-sm',
      md: '',
      lg: 'size-lg',
    } as Record<ButtonSize, string>,
    states: {
      active: 'active',
      disabled: 'disabled',
    },
    resolve(options?: ButtonStyleOptions): ComponentStyleResult {
      const variant = options?.variant || 'secondary';
      const size = options?.size || 'md';
      const classes: string[] = [componentStyles.button.baseClass];

      if (componentStyles.button.variants[variant]) {
        classes.push(componentStyles.button.variants[variant]);
      }
      if (size !== 'md' && componentStyles.button.sizes[size]) {
        classes.push(componentStyles.button.sizes[size]);
      }
      if (options?.active) {
        classes.push(componentStyles.button.states.active);
      }
      if (options?.disabled) {
        classes.push(componentStyles.button.states.disabled);
      }

      return {
        className: classes.join(' '),
      };
    },
  },

  toggle: {
    baseClass: 'common-toggle-container',
    trackClass: 'common-toggle-track',
    thumbClass: 'common-toggle-thumb',
    labelClass: 'common-toggle-label',
    states: {
      checked: 'active',
      disabled: 'disabled',
    },
    resolve(options?: ToggleStyleOptions): ComponentStyleResult {
      const classes: string[] = [componentStyles.toggle.baseClass];
      if (options?.checked) classes.push(componentStyles.toggle.states.checked);
      if (options?.disabled) classes.push(componentStyles.toggle.states.disabled);
      return { className: classes.join(' ') };
    },
  },

  modal: {
    backdropClass: 'common-modal-backdrop',
    containerClass: 'common-modal-container',
    headerClass: 'common-modal-header',
    bodyClass: 'common-modal-body',
    footerClass: 'common-modal-footer',
    closeBtnClass: 'common-modal-close-btn',
    sizes: {
      sm: 'common-modal-sm',
      md: 'common-modal-md',
      lg: 'common-modal-lg',
      fullscreen: 'common-modal-fullscreen',
    },
    resolve(options?: ModalStyleOptions): ComponentStyleResult {
      const size = options?.size || 'md';
      const classes: string[] = [componentStyles.modal.containerClass];
      if (componentStyles.modal.sizes[size]) {
        classes.push(componentStyles.modal.sizes[size]);
      }
      return { className: classes.join(' ') };
    },
  },

  imageView: {
    containerClass: 'common-image-view-container',
    imageClass: 'common-image-view-img',
    placeholderClass: 'common-image-view-placeholder',
    zoomControlsClass: 'common-image-view-zoom-controls',
    resolve(options?: ImageViewStyleOptions): ComponentStyleResult {
      const classes: string[] = [componentStyles.imageView.containerClass];
      if (options?.fit) classes.push(`fit-${options.fit}`);
      if (options?.rounded) classes.push('rounded');
      return { className: classes.join(' ') };
    },
  },
} as const;

export type ComponentName = keyof typeof componentStyles;
