import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './i18n/LanguageContext';
import { ThemeProvider } from './theme/ThemeContext';
import { FeatureFlagsProvider } from './services/featureFlagsContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <FeatureFlagsProvider>
          <App />
        </FeatureFlagsProvider>
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>
);
