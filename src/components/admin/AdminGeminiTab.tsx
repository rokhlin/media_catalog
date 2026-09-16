import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../services/authContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { SettingsData } from '../../models/settings';

export interface GeminiStatusResponse {
  configured: boolean;
  is_gemini_api_key_set?: boolean;
  gemini_api_key_masked?: string;
  model: string;
  rpm_limit: number;
  active_slots: number;
  provider: string;
  lastValidation?: GeminiValidationResult | null;
}

export interface GeminiValidationResult {
  ok: boolean;
  message: string;
  model: string;
  latencyMs?: number;
  timestamp: string;
  errorDetails?: string;
}

export default function AdminGeminiTab() {
  const { authFetch } = useAuth();
  const { t } = useLanguage();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Configuration state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');

  const [modelProvider, setModelProvider] = useState('gemini');
  const [geminiModel, setGeminiModel] = useState('gemini-3.6-flash');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelName, setCustomModelName] = useState('');
  const [rpmLimit, setRpmLimit] = useState(15);
  const [maxWorkers, setMaxWorkers] = useState(3);
  const [visionPromptTemplate, setVisionPromptTemplate] = useState('');
  const [defaultVisionPromptTemplate, setDefaultVisionPromptTemplate] = useState('');

  // Status & Validation state
  const [status, setStatus] = useState<GeminiStatusResponse | null>(null);
  const [validationResult, setValidationResult] = useState<GeminiValidationResult | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Preset models
  const KNOWN_MODELS = [
    { id: 'gemini-3.6-flash', label: 'gemini-3.6-flash (Recommended · SOTA Vision & Tagging)' },
    { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Fast & Efficient Multimodal)' },
    { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (High Reasoning & Detailed Analysis)' },
    { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Legacy Fast)' },
    { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro (Legacy Precision)' },
    { id: 'custom', label: 'Custom Model Name...' },
  ];

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Fetch settings & initial status
  const fetchConfigAndStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch system settings
      const settingsRes = await authFetch('/api/settings');
      if (settingsRes.ok) {
        const data: SettingsData = await settingsRes.json();
        setIsKeyConfigured(Boolean(data.is_gemini_api_key_set));
        setMaskedKey(data.gemini_api_key_masked || '');
        setModelProvider(data.model_provider || 'gemini');

        const model = data.gemini_model || 'gemini-3.6-flash';
        const isKnown = KNOWN_MODELS.some((m) => m.id === model);
        if (isKnown) {
          setGeminiModel(model);
          setIsCustomModel(false);
        } else {
          setGeminiModel('custom');
          setIsCustomModel(true);
          setCustomModelName(model);
        }

        setRpmLimit(data.rpm_limit ? Number(data.rpm_limit) : 15);
        setMaxWorkers(data.gemini_max_workers ? Number(data.gemini_max_workers) : 3);
        setVisionPromptTemplate(data.vision_prompt_template || '');
        setDefaultVisionPromptTemplate(data.default_vision_prompt_template || '');
      }

      // 2. Fetch Gemini integration status
      const statusRes = await authFetch('/api/gemini/status');
      if (statusRes.ok) {
        const statusData: GeminiStatusResponse = await statusRes.json();
        setStatus(statusData);
        if (statusData.lastValidation) {
          setValidationResult(statusData.lastValidation);
        }
      }
    } catch (err: any) {
      console.error('[AdminGeminiTab] Failed to fetch settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchConfigAndStatus();
  }, [fetchConfigAndStatus]);

  // Handle Model Dropdown Change
  const handleModelSelect = (val: string) => {
    if (val === 'custom') {
      setIsCustomModel(true);
      setGeminiModel('custom');
    } else {
      setIsCustomModel(false);
      setGeminiModel(val);
    }
  };

  const effectiveModelName = isCustomModel ? (customModelName.trim() || 'gemini-3.6-flash') : geminiModel;

  // Validate Connection
  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);

    const payload: { apiKey?: string; model?: string } = {
      model: effectiveModelName,
    };

    if (apiKeyInput.trim()) {
      payload.apiKey = apiKeyInput.trim();
    }

    try {
      const res = await authFetch('/api/gemini/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: GeminiValidationResult = await res.json();
      setValidationResult(data);

      if (data.ok) {
        showToast('success', `✓ ${data.message} (${data.latencyMs}ms)`);
      } else {
        showToast('error', `✕ ${data.message}`);
      }

      // Update local status record
      setStatus((prev) => (prev ? { ...prev, lastValidation: data, configured: data.ok || prev.configured } : null));
    } catch (err: any) {
      const fallbackResult: GeminiValidationResult = {
        ok: false,
        message: err.message || 'Validation request failed',
        model: effectiveModelName,
        timestamp: new Date().toISOString(),
      };
      setValidationResult(fallbackResult);
      showToast('error', `✕ ${fallbackResult.message}`);
    } finally {
      setIsValidating(false);
    }
  };

  // Save Settings
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        model_provider: modelProvider,
        gemini_model: effectiveModelName,
        rpm_limit: Number(rpmLimit),
        gemini_max_workers: Number(maxWorkers),
        vision_prompt_template: visionPromptTemplate,
      };

      if (apiKeyInput.trim() && !apiKeyInput.includes('••••')) {
        payload.gemini_api_key = apiKeyInput.trim();
      }

      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast('success', t('geminiSuccessToast' as any) || 'Gemini configuration successfully saved!');
        setApiKeyInput('');
        await fetchConfigAndStatus();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast('error', errData.message || t('geminiErrorToast' as any) || 'Failed to save configuration.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error occurred while saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // Clear/Remove API Key
  const handleClearKey = async () => {
    if (!confirm('Are you sure you want to remove the configured Google Gemini API key?')) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clear_gemini_api_key: true,
        }),
      });

      if (res.ok) {
        showToast('info', t('geminiClearedToast' as any) || 'Gemini API key cleared successfully.');
        setApiKeyInput('');
        setMaskedKey('');
        setIsKeyConfigured(false);
        setValidationResult(null);
        await fetchConfigAndStatus();
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to clear key.');
    } finally {
      setIsSaving(false);
    }
  };

  const isError = validationResult ? !validationResult.ok : false;
  const isUnconfigured = !isKeyConfigured && !apiKeyInput.trim();

  return (
    <div className="admin-gemini-container" id="admin-gemini-root">
      {/* Toast message notification */}
      {toastMessage && (
        <div
          className={`gemini-toast ${toastMessage.type}`}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '12px',
            background: toastMessage.type === 'success' ? '#065f46' : toastMessage.type === 'error' ? '#991b1b' : '#1e3a8a',
            color: '#fff',
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 500,
            fontSize: '0.92rem',
            animation: 'fadeIn 0.25s ease-out',
          }}
        >
          <span>{toastMessage.type === 'success' ? '✓' : toastMessage.type === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header & Status Card */}
      <div className="admin-card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)' }}>
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', fontSize: '1.25rem' }}>
              <span>🤖</span> {t('geminiConfigTitle' as any) || 'Google Gemini AI Configuration & Diagnostics'}
            </h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>
              {t('geminiConfigSubtitle' as any) || 'Manage secure API credentials, active model provider, rate limits, and live connection health.'}
            </p>
          </div>

          {/* Connection Status Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isValidating ? (
              <div className="admin-stat-pill" style={{ borderColor: '#3b82f6', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.15)' }}>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: '12px', height: '12px', marginRight: '6px' }}></span>
                {t('geminiStatusChecking' as any) || 'Validating...'}
              </div>
            ) : isUnconfigured ? (
              <div className="admin-stat-pill warning" style={{ borderColor: '#f59e0b', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)' }}>
                <span>🟡</span> {t('geminiStatusNotConfigured' as any) || 'Not Configured'}
              </div>
            ) : isError ? (
              <div className="admin-stat-pill error" style={{ borderColor: '#ef4444', color: '#f87171', background: 'rgba(239, 68, 68, 0.15)' }}>
                <span>🔴</span> {t('geminiStatusError' as any) || 'Connection Error'}
              </div>
            ) : (
              <div className="admin-stat-pill active" style={{ borderColor: '#10b981', color: '#34d399', background: 'rgba(16, 185, 129, 0.15)' }}>
                <span>🟢</span> {t('geminiStatusConnected' as any) || 'Operational & Connected'}
                {validationResult?.latencyMs !== undefined ? (
                  <span style={{ fontSize: '0.75rem', opacity: 0.85, marginLeft: '4px' }}>({validationResult.latencyMs}ms)</span>
                ) : status?.configured ? (
                  <span style={{ fontSize: '0.75rem', opacity: 0.85, marginLeft: '4px' }}>({status.model})</span>
                ) : null}
              </div>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleValidate}
              disabled={isValidating || isLoading}
              id="btn-gemini-validate"
              style={{ padding: '0.55rem 1rem', fontSize: '0.88rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <span>⚡</span> {isValidating ? (t('geminiValidatingBtn' as any) || 'Testing...') : (t('geminiValidateBtn' as any) || 'Test Connection')}
            </button>
          </div>
        </div>

        {/* Validation Details Drawer if validation ran */}
        {validationResult && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1rem',
              borderRadius: '10px',
              background: validationResult.ok ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${validationResult.ok ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>{validationResult.ok ? '✅' : '❌'}</span>
                <strong style={{ color: validationResult.ok ? '#34d399' : '#f87171' }}>
                  {validationResult.message}
                </strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {t('geminiLastTestedLabel' as any) || 'Tested'}: {new Date(validationResult.timestamp).toLocaleTimeString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem', color: '#cbd5e1', flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Model Tested:</span> <strong>{validationResult.model}</strong>
              </div>
              {validationResult.latencyMs !== undefined && (
                <div>
                  <span style={{ color: '#94a3b8' }}>Ping Latency:</span>{' '}
                  <strong style={{ color: validationResult.latencyMs < 800 ? '#34d399' : '#fbbf24' }}>
                    {validationResult.latencyMs} ms
                  </strong>
                </div>
              )}
              <div>
                <span style={{ color: '#94a3b8' }}>Encryption:</span> <strong style={{ color: '#38bdf8' }}>AES-256-GCM at Rest</strong>
              </div>
            </div>

            {validationResult.errorDetails && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.35)', fontSize: '0.75rem', color: '#fca5a5', fontFamily: 'monospace', overflowX: 'auto' }}>
                {validationResult.errorDetails}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
        {/* Card 1: API Key & Credentials */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
              <span>🔐</span> {t('geminiApiKeyLabel' as any) || 'Google Gemini API Key'}
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
            {/* Backend Key Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Status on Server</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: isKeyConfigured ? '#34d399' : '#fbbf24', marginTop: '2px' }}>
                  {isKeyConfigured
                    ? (t('geminiApiKeyConfiguredBadge' as any) || '✓ Encrypted & Active on Backend')
                    : (t('geminiApiKeyNotConfiguredBadge' as any) || 'Missing Credentials')}
                </div>
                {maskedKey && (
                  <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#94a3b8', marginTop: '2px' }}>
                    Active: {maskedKey}
                  </div>
                )}
              </div>

              {isKeyConfigured && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClearKey}
                  disabled={isSaving}
                  id="btn-gemini-clear-key"
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  title="Remove the saved API key from backend"
                >
                  🗑️ {t('geminiApiKeyClearBtn' as any) || 'Clear Key'}
                </button>
              )}
            </div>

            {/* Input field for new / update key */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                <span>{isKeyConfigured ? 'Replace or Update API Key' : 'Enter New API Key'}</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Starts with AIzaSy...</span>
              </label>

              <div style={{ position: 'relative' }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="input-control"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={isKeyConfigured ? '•••••••••••••••••••• (Leave blank to keep existing key)' : (t('geminiApiKeyPlaceholder' as any) || 'AIzaSy...')}
                  autoComplete="off"
                  id="input-gemini-api-key"
                  style={{ paddingRight: '42px', width: '100%', fontFamily: 'monospace', letterSpacing: showApiKey ? 'normal' : '2px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    padding: '4px',
                  }}
                  title={showApiKey ? 'Hide key' : 'Show key'}
                  aria-label={showApiKey ? 'Hide key' : 'Show key'}
                >
                  {showApiKey ? '👁️' : '🔒'}
                </button>
              </div>

              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                🛡️ {t('geminiApiKeyHelp' as any) || 'Credentials are encrypted at rest with AES-256-GCM and never exposed to client browsers.'}
              </p>
            </div>

            {/* AI Studio External Link */}
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.84rem', color: '#93c5fd' }}>
                Need a Google Gemini API Key?
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.84rem', color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}
              >
                <span>Google AI Studio</span> ↗
              </a>
            </div>
          </div>
        </div>

        {/* Card 2: Model & Rate Limits Configuration */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
              <span>⚙️</span> Model Engine & Rate Limits
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
            {/* Model Provider */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.4rem', display: 'block' }}>
                {t('geminiProviderLabel' as any) || 'Model Engine Provider'}
              </label>
              <select
                className="input-control"
                value={modelProvider}
                onChange={(e) => setModelProvider(e.target.value)}
                id="select-gemini-provider"
                style={{ width: '100%' }}
              >
                <option value="gemini">Gemini API (Google Cloud AI - Recommended)</option>
                <option value="local">LM Studio / Local LLM (Local GPU/CPU)</option>
                <option value="hybrid">Hybrid (Gemini Cloud with Local Fallback)</option>
              </select>
            </div>

            {/* Model Name Select */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.4rem', display: 'block' }}>
                {t('geminiModelLabel' as any) || 'Active Gemini Vision & Multimodal Model'}
              </label>
              <select
                className="input-control"
                value={isCustomModel ? 'custom' : geminiModel}
                onChange={(e) => handleModelSelect(e.target.value)}
                id="select-gemini-model"
                style={{ width: '100%' }}
              >
                {KNOWN_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>

              {isCustomModel && (
                <input
                  type="text"
                  className="input-control"
                  value={customModelName}
                  onChange={(e) => setCustomModelName(e.target.value)}
                  placeholder="e.g. gemini-2.0-flash-exp"
                  id="input-gemini-custom-model"
                  style={{ marginTop: '0.5rem', width: '100%' }}
                />
              )}

              <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                {t('geminiModelHelp' as any) || 'Used for semantic analysis, tag generation, OCR, and defect audits.'}
              </p>
            </div>

            {/* Concurrency & RPM Limits Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.4rem', display: 'block' }}>
                  {t('geminiRpmLimitLabel' as any) || 'Rate Limit (RPM)'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  className="input-control"
                  value={rpmLimit}
                  onChange={(e) => setRpmLimit(Math.max(1, parseInt(e.target.value, 10) || 15))}
                  id="input-gemini-rpm-limit"
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  Free tier: 15 RPM
                </span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '0.4rem', display: 'block' }}>
                  {t('geminiMaxWorkersLabel' as any) || 'Parallel Workers'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="input-control"
                  value={maxWorkers}
                  onChange={(e) => setMaxWorkers(Math.max(1, parseInt(e.target.value, 10) || 3))}
                  id="input-gemini-max-workers"
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  Default: 3 workers
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vision Prompt Template Section */}
      <div
        className="admin-card"
        style={{
          background: 'rgba(30, 41, 59, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '1.25rem',
          marginTop: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h4 style={{ margin: '0 0 0.2rem 0', fontSize: '1rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📝</span> {t('visionPromptTemplateLabel' as any) || 'Vision Prompt Template'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
              {t('visionPromptTemplateDesc' as any) || 'Customize prompt template used for Gemini / Vision model analysis.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setVisionPromptTemplate(defaultVisionPromptTemplate)}
            title="Reset to system default template"
          >
            {t('btnResetPromptTemplate' as any) || '↺ Reset to Default'}
          </button>
        </div>

        {/* Placeholders Cheat Sheet */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '0.65rem 0.85rem',
            marginBottom: '0.75rem',
            fontSize: '0.82rem',
          }}
        >
          <span style={{ fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.4rem' }}>
            💡 {t('placeholdersCheatSheet' as any) || 'Available Dynamic Placeholders'}:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span
              className="badge-pill"
              style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#818cf8' }}
              onClick={() => {
                if (!visionPromptTemplate.includes('{media_type}')) {
                  setVisionPromptTemplate((prev) => prev + '\n{media_type}');
                }
              }}
              title={t('placeholderMediaTypeDesc' as any) || 'Type of media: "photo" or "video"'}
            >
              {'{media_type}'} — {t('placeholderMediaTypeDesc' as any) || '"photo" / "video"'}
            </span>
            <span
              className="badge-pill"
              style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)', color: '#4ade80' }}
              onClick={() => {
                if (!visionPromptTemplate.includes('{people}')) {
                  setVisionPromptTemplate((prev) => prev + '\n{people}');
                }
              }}
              title={t('placeholderPeopleDesc' as any) || 'Names and bounding boxes of recognized people [x1, y1, x2, y2]'}
            >
              {'{people}'} — {t('placeholderPeopleDesc' as any) || 'Recognized people list'}
            </span>
            <span
              className="badge-pill"
              style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', color: '#facc15' }}
              onClick={() => {
                if (!visionPromptTemplate.includes('{context}')) {
                  setVisionPromptTemplate((prev) => prev + '\n{context}');
                }
              }}
              title={t('placeholderContextDesc' as any) || 'Metadata, EXIF, audio transcription context'}
            >
              {'{context}'} — {t('placeholderContextDesc' as any) || 'Metadata & EXIF context'}
            </span>
            <span
              className="badge-pill"
              style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)', color: '#c084fc' }}
              onClick={() => {
                if (!visionPromptTemplate.includes('{tag_instructions}')) {
                  setVisionPromptTemplate((prev) => prev + '\n{tag_instructions}');
                }
              }}
              title={t('placeholderTagInstructionsDesc' as any) || 'Tag formatting rules and category taxonomy instructions'}
            >
              {'{tag_instructions}'} — {t('placeholderTagInstructionsDesc' as any) || 'Tag instructions'}
            </span>
          </div>
        </div>

        <textarea
          className="input-control"
          rows={6}
          style={{
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '0.85rem',
            lineHeight: '1.45',
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
          value={visionPromptTemplate}
          onChange={(e) => setVisionPromptTemplate(e.target.value)}
          placeholder="Enter vision prompt template..."
        />
      </div>

      {/* Save Actions Bar */}
      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1.25rem' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleValidate}
          disabled={isValidating || isSaving}
          id="btn-gemini-test-bottom"
          style={{ padding: '0.65rem 1.25rem', borderRadius: '10px' }}
        >
          <span>⚡</span> {isValidating ? 'Testing...' : 'Test Connection'}
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={isSaving || isValidating}
          id="btn-gemini-save"
          style={{ padding: '0.65rem 1.75rem', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <span>💾</span> {isSaving ? (t('geminiSavingBtn' as any) || 'Saving Configuration...') : (t('geminiSaveBtn' as any) || 'Save Gemini Configuration')}
        </button>
      </div>
    </div>
  );
}
