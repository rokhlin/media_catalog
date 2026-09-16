import React, { useState, useEffect } from 'react';
import type { GalleryMediaFile } from '../../models';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../services/authContext';

export interface MetadataEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaFile: GalleryMediaFile | null;
  onSaved: (updatedFile: GalleryMediaFile) => void;
}

type TabType = 'descriptions' | 'scene' | 'camera' | 'tags';

export default function MetadataEditorModal({
  isOpen,
  onClose,
  mediaFile,
  onSaved,
}: MetadataEditorModalProps) {
  const { t } = useLanguage();
  const { authFetch } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('descriptions');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form fields
  const [summary, setSummary] = useState('');
  const [summaryRu, setSummaryRu] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionRu, setDescriptionRu] = useState('');
  const [environment, setEnvironment] = useState('');
  const [lighting, setLighting] = useState('');
  const [lightingRu, setLightingRu] = useState('');
  const [weather, setWeather] = useState('');
  const [weatherRu, setWeatherRu] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');
  const [timeOfDayRu, setTimeOfDayRu] = useState('');
  const [locationName, setLocationName] = useState('');
  const [mediaDate, setMediaDate] = useState('');
  const [cameraMake, setCameraMake] = useState('');
  const [cameraModel, setCameraModel] = useState('');
  const [lensModel, setLensModel] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [transcription, setTranscription] = useState('');
  const [transcriptionRu, setTranscriptionRu] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Sync form state when modal opens or mediaFile changes
  useEffect(() => {
    if (isOpen && mediaFile) {
      setSummary(mediaFile.summary || '');
      setSummaryRu(mediaFile.summary_ru || '');
      setDescription(mediaFile.description || '');
      setDescriptionRu(mediaFile.description_ru || '');
      setEnvironment(mediaFile.environment || '');
      setLighting(mediaFile.lighting || '');
      setLightingRu(mediaFile.lighting_ru || '');
      setWeather(mediaFile.weather || '');
      setWeatherRu(mediaFile.weather_ru || '');
      setTimeOfDay(mediaFile.time_of_day || '');
      setTimeOfDayRu(mediaFile.time_of_day_ru || '');
      setLocationName(mediaFile.location_name || '');
      setMediaDate(mediaFile.media_date || mediaFile.capture_date || '');
      setCameraMake(mediaFile.camera_make || '');
      setCameraModel(mediaFile.camera_model || '');
      setLensModel(mediaFile.lens_model || '');
      setOcrText(mediaFile.ocr_text || '');
      setTranscription(mediaFile.transcription || '');
      setTranscriptionRu(mediaFile.transcription_ru || '');

      if (Array.isArray(mediaFile.tags)) {
        setTags([...mediaFile.tags]);
      } else if (typeof mediaFile.tags === 'string' && mediaFile.tags) {
        try {
          const parsed = JSON.parse(mediaFile.tags);
          setTags(Array.isArray(parsed) ? parsed : [mediaFile.tags]);
        } catch {
          setTags((mediaFile.tags as string).split(',').map((t) => t.trim()).filter(Boolean));
        }
      } else {
        setTags([]);
      }

      setNewTagInput('');
      setErrorMessage(null);
      setSuccessMessage(null);
      setActiveTab('descriptions');
    }
  }, [isOpen, mediaFile]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mediaFile) return null;

  const handleAddTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaFile) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      file: mediaFile.file_path || mediaFile.filename,
      summary: summary.trim() || undefined,
      summary_ru: summaryRu.trim() || undefined,
      description: description.trim() || undefined,
      description_ru: descriptionRu.trim() || undefined,
      environment: environment.trim() || undefined,
      lighting: lighting.trim() || undefined,
      lighting_ru: lightingRu.trim() || undefined,
      weather: weather.trim() || undefined,
      weather_ru: weatherRu.trim() || undefined,
      time_of_day: timeOfDay.trim() || undefined,
      time_of_day_ru: timeOfDayRu.trim() || undefined,
      location_name: locationName.trim() || undefined,
      media_date: mediaDate.trim() || undefined,
      camera_make: cameraMake.trim() || undefined,
      camera_model: cameraModel.trim() || undefined,
      lens_model: lensModel.trim() || undefined,
      ocr_text: ocrText.trim() || undefined,
      transcription: transcription.trim() || undefined,
      transcription_ru: transcriptionRu.trim() || undefined,
      tags: tags,
    };

    try {
      const fetchFn = authFetch || fetch;
      const res = await fetchFn('/api/media/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || t('metadataSaveError'));
      }

      const updatedFile: GalleryMediaFile = {
        ...mediaFile,
        summary: payload.summary,
        summary_ru: payload.summary_ru,
        description: payload.description,
        description_ru: payload.description_ru,
        environment: payload.environment,
        lighting: payload.lighting,
        lighting_ru: payload.lighting_ru,
        weather: payload.weather,
        weather_ru: payload.weather_ru,
        time_of_day: payload.time_of_day,
        time_of_day_ru: payload.time_of_day_ru,
        location_name: payload.location_name,
        media_date: payload.media_date,
        camera_make: payload.camera_make,
        camera_model: payload.camera_model,
        lens_model: payload.lens_model,
        ocr_text: payload.ocr_text,
        transcription: payload.transcription,
        transcription_ru: payload.transcription_ru,
        tags: payload.tags,
      };

      setSuccessMessage(t('metadataSavedSuccess'));
      onSaved(updatedFile);

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || t('metadataSaveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay active"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content glassmorphism-card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-panel, #1e2029)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.2rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary, #fff)', fontWeight: 600 }}>
              {t('metadataEditorTitle')}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', display: 'block', marginTop: '2px' }}>
              {mediaFile.filename}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.6rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(0, 0, 0, 0.2)',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            className={`btn ${activeTab === 'descriptions' ? 'btn-accent' : 'btn-secondary'}`}
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem', borderRadius: '8px' }}
            onClick={() => setActiveTab('descriptions')}
          >
            📝 {t('tabDescriptions')}
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'scene' ? 'btn-accent' : 'btn-secondary'}`}
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem', borderRadius: '8px' }}
            onClick={() => setActiveTab('scene')}
          >
            🌍 {t('tabSceneLocation')}
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'camera' ? 'btn-accent' : 'btn-secondary'}`}
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem', borderRadius: '8px' }}
            onClick={() => setActiveTab('camera')}
          >
            📷 {t('tabExifCamera')}
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'tags' ? 'btn-accent' : 'btn-secondary'}`}
            style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem', borderRadius: '8px' }}
            onClick={() => setActiveTab('tags')}
          >
            🏷️ {t('tabTagsNotes')}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '1.2rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {errorMessage && (
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '0.85rem' }}>
                ⚠️ {errorMessage}
              </div>
            )}
            {successMessage && (
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#86efac', fontSize: '0.85rem' }}>
                ✓ {successMessage}
              </div>
            )}

            {/* TAB 1: DESCRIPTIONS & AI */}
            {activeTab === 'descriptions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🇬🇧 {t('editSummaryEn')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Short punchy summary in English..."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🇷🇺 {t('editSummaryRu')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={summaryRu}
                    onChange={(e) => setSummaryRu(e.target.value)}
                    placeholder="Краткое резюме на русском языке..."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🇬🇧 {t('editDescriptionEn')}
                  </label>
                  <textarea
                    className="input-control"
                    style={{ width: '100%', minHeight: '80px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', resize: 'vertical' }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detailed semantic description in English..."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🇷🇺 {t('editDescriptionRu')}
                  </label>
                  <textarea
                    className="input-control"
                    style={{ width: '100%', minHeight: '80px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', resize: 'vertical' }}
                    value={descriptionRu}
                    onChange={(e) => setDescriptionRu(e.target.value)}
                    placeholder="Подробное семантическое описание на русском..."
                  />
                </div>
              </div>
            )}

            {/* TAB 2: SCENE & LOCATION */}
            {activeTab === 'scene' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    📍 {t('editLocationName')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="e.g. Central Park, New York"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    📅 {t('editCaptureDate')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={mediaDate}
                    onChange={(e) => setMediaDate(e.target.value)}
                    placeholder="YYYY-MM-DD or ISO timestamp"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🏞️ {t('editEnvironment')}
                  </label>
                  <select
                    className="input-control select-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                  >
                    <option value="">-- {t('editEnvironment')} --</option>
                    <option value="indoor">🏠 {t('environmentIndoor')}</option>
                    <option value="outdoor">🌲 {t('environmentOutdoor')}</option>
                    <option value="studio">🎭 Studio</option>
                    <option value="nature">⛰️ Nature</option>
                    <option value="urban">🏙️ Urban / City</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    ☀️ {t('editLightingEn')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={lighting}
                    onChange={(e) => setLighting(e.target.value)}
                    placeholder="e.g. golden hour, soft studio light"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    ☀️ {t('editLightingRu')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={lightingRu}
                    onChange={(e) => setLightingRu(e.target.value)}
                    placeholder="напр. золотой час, мягкий студийный свет"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🌤️ {t('editWeatherEn')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                    placeholder="e.g. sunny, clear sky, overcast"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🌤️ {t('editWeatherRu')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={weatherRu}
                    onChange={(e) => setWeatherRu(e.target.value)}
                    placeholder="напр. солнечно, ясно, пасмурно"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    ⏰ {t('editTimeOfDayEn')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                    placeholder="e.g. morning, afternoon, sunset, night"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    ⏰ {t('editTimeOfDayRu')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={timeOfDayRu}
                    onChange={(e) => setTimeOfDayRu(e.target.value)}
                    placeholder="напр. утро, день, закат, вечер, ночь"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: CAMERA & EXIF */}
            {activeTab === 'camera' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      📸 {t('editCameraMake')}
                    </label>
                    <input
                      type="text"
                      className="input-control"
                      style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                      value={cameraMake}
                      onChange={(e) => setCameraMake(e.target.value)}
                      placeholder="e.g. Sony, Canon, Apple, Nikon"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      📷 {t('editCameraModel')}
                    </label>
                    <input
                      type="text"
                      className="input-control"
                      style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                      value={cameraModel}
                      onChange={(e) => setCameraModel(e.target.value)}
                      placeholder="e.g. ILCE-7RM4, EOS R5, iPhone 15 Pro"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🔍 {t('editLensModel')}
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={lensModel}
                    onChange={(e) => setLensModel(e.target.value)}
                    placeholder="e.g. FE 24-70mm F2.8 GM, 50mm F1.4"
                  />
                </div>
              </div>
            )}

            {/* TAB 4: TAGS & TEXT/AUDIO */}
            {activeTab === 'tags' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Tags Management */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🏷️ {t('editTags')}
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <input
                      type="text"
                      className="input-control"
                      style={{ flex: 1, padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder={t('tagsPlaceholder')}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
                      onClick={handleAddTag}
                      disabled={!newTagInput.trim()}
                    >
                      {t('addTagBtn')}
                    </button>
                  </div>

                  {/* Tags Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', minHeight: '32px' }}>
                    {tags.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No tags added yet.
                      </span>
                    ) : (
                      tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#93c5fd',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                          }}
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#93c5fd',
                              cursor: 'pointer',
                              padding: 0,
                              fontSize: '0.75rem',
                              lineHeight: 1,
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* OCR Text */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    🔤 {t('editOcrText')}
                  </label>
                  <textarea
                    className="input-control"
                    style={{ width: '100%', minHeight: '60px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', resize: 'vertical' }}
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder="Text recognized on image..."
                  />
                </div>

                {/* Audio Speech Transcriptions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      🎙️ {t('editTranscriptionEn')}
                    </label>
                    <textarea
                      className="input-control"
                      style={{ width: '100%', minHeight: '60px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', resize: 'vertical' }}
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="Audio transcription in English..."
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      🎙️ {t('editTranscriptionRu')}
                    </label>
                    <textarea
                      className="input-control"
                      style={{ width: '100%', minHeight: '60px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', resize: 'vertical' }}
                      value={transcriptionRu}
                      onChange={(e) => setTranscriptionRu(e.target.value)}
                      placeholder="Транскрипция аудио на русском..."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              background: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              {t('btnCancel')}
            </button>
            <button
              type="submit"
              className="btn btn-accent"
              disabled={isSaving}
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', fontWeight: 600 }}
            >
              {isSaving ? `⏳ ${t('btnSavingMetadata')}` : `💾 ${t('btnSaveMetadata')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
