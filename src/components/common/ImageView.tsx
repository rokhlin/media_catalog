import React, { useState } from 'react';
import './common.css';

export interface ImageViewProps {
  src: string;
  alt?: string;
  fallbackSrc?: string;
  fallbackIcon?: React.ReactNode;
  aspectRatio?: string | number;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  loading?: 'lazy' | 'eager';
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onLoad?: () => void;
  onError?: () => void;
}

export default function ImageView({
  src,
  alt = '',
  fallbackSrc,
  fallbackIcon = '🖼️',
  aspectRatio,
  objectFit = 'cover',
  loading = 'lazy',
  className = '',
  style,
  onClick,
  onLoad,
  onError,
}: ImageViewProps) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  const handleImageLoad = () => {
    setHasLoaded(true);
    if (onLoad) onLoad();
  };

  const handleImageError = () => {
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    } else {
      setHasError(true);
      if (onError) onError();
    }
  };

  const containerStyle: React.CSSProperties = {
    ...style,
    ...(aspectRatio ? { aspectRatio: String(aspectRatio) } : {}),
  };

  return (
    <div
      className={`common-image-view ${hasLoaded ? 'loaded' : 'loading'} ${hasError ? 'has-error' : ''} ${className}`.trim()}
      style={containerStyle}
      onClick={onClick}
    >
      {!hasLoaded && !hasError && (
        <div className="common-image-placeholder" aria-hidden="true">
          <div className="common-image-spinner" />
        </div>
      )}

      {hasError ? (
        <div className="common-image-error" role="img" aria-label={alt || 'Image failed to load'}>
          <span style={{ fontSize: '1.5rem' }}>{fallbackIcon}</span>
          <span>{alt || 'Preview unavailable'}</span>
        </div>
      ) : (
        <img
          src={currentSrc}
          alt={alt}
          loading={loading}
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{ objectFit }}
        />
      )}
    </div>
  );
}

export { ImageView };
