import { useState, useEffect } from 'react';
import type { TreeGraphPerson } from '../../types/tree.types.js';
import { useLanguage } from '../../../../i18n/LanguageContext.js';

interface FaceLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  person: TreeGraphPerson | null;
  onLinkFace: (data: {
    tree_person_id: string;
    media_person_name: string;
    media_face_id: string;
    is_primary_avatar?: boolean;
  }) => Promise<void>;
  onUnlinkFace: (linkId: string) => Promise<void>;
}

export const FaceLinkModal = ({
  isOpen,
  onClose,
  person,
  onLinkFace,
  onUnlinkFace,
}: FaceLinkModalProps) => {
  const { t } = useLanguage();
  const [knownPersons, setKnownPersons] = useState<any[]>([]);
  const [unrecognizedFaces, setUnrecognizedFaces] = useState<any[]>([]);
  const [personFaceLinks, setPersonFaceLinks] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'known' | 'unrecognized' | 'linked'>('known');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isOpen || !person) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const [pRes, unrecRes, linksRes] = await Promise.all([
          fetch('/api/faces/persons'),
          fetch('/api/faces/unrecognized'),
          fetch(`/api/family-tree/persons/${person.id}/faces`),
        ]);

        if (pRes.ok) setKnownPersons(await pRes.json());
        if (unrecRes.ok) setUnrecognizedFaces(await unrecRes.json());
        if (linksRes.ok) setPersonFaceLinks(await linksRes.json());
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    setSearchQuery(person.first_name || '');
  }, [isOpen, person]);

  if (!isOpen || !person) return null;

  const handleLinkPersonFace = async (p: any) => {
    const faceId = p.reference_faces?.[0]?.face_id || p.sample_image || p.person_id;
    await onLinkFace({
      tree_person_id: person.id,
      media_person_name: p.name,
      media_face_id: faceId,
      is_primary_avatar: true,
    });
    onClose();
  };

  const handleLinkUnrecFace = async (f: any) => {
    const imgName = f.image_path ? f.image_path.split(/[/\\]/).pop() : f.face_id;
    await onLinkFace({
      tree_person_id: person.id,
      media_person_name: person.full_name || person.first_name,
      media_face_id: imgName,
      is_primary_avatar: true,
    });
    onClose();
  };

  const filteredKnown = knownPersons.filter((p) =>
    searchQuery ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) : true,
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 640,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('modalFaceLinkTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('connectingVisualIdentityFor')} {person.full_name || person.first_name}
            </div>
          </div>
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 16,
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--card-bg)',
            padding: '0 12px',
          }}
        >
          <button
            type="button"
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'known' ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'known' ? '2px solid var(--primary-color, #6366f1)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('known')}
          >
            👥 {t('tabKnownFaces')} ({knownPersons.length})
          </button>

          <button
            type="button"
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'unrecognized' ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'unrecognized' ? '2px solid var(--primary-color, #6366f1)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('unrecognized')}
          >
            👤 {t('tabUnrecFaces')} ({unrecognizedFaces.length})
          </button>

          <button
            type="button"
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'linked' ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'linked' ? '2px solid var(--primary-color, #6366f1)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={() => setActiveTab('linked')}
          >
            🔗 {t('tabActiveLinks')} ({personFaceLinks.length})
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {activeTab === 'known' && (
            <div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('filterKnownPersonsPlaceholder')}
                style={{
                  width: '100%',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                  marginBottom: 14,
                  boxSizing: 'border-box',
                }}
              />

              {isLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>{t('loadingFaces')}</div>
              ) : filteredKnown.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>{t('noMatchingKnownPersons')}</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                  {filteredKnown.map((p) => {
                    const sampleImg = p.sample_image ? p.sample_image.split(/[/\\]/).pop() : null;
                    const thumbUrl = sampleImg ? `/api/faces/image/${sampleImg}` : null;

                    return (
                      <div
                        key={p.person_id || p.name}
                        style={{
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 10,
                          padding: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          transition: 'border 0.15s ease',
                        }}
                        onClick={() => handleLinkPersonFace(p)}
                      >
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={p.name}
                            style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 54,
                              height: 54,
                              borderRadius: '50%',
                              background: '#6366f1',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                              fontWeight: 700,
                            }}
                          >
                            {p.name[0]}
                          </div>
                        )}
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {p.reference_count || 1} {p.reference_count === 1 ? t('photoCountSingle') : t('photoCountPlural')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'unrecognized' && (
            <div>
              {isLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>{t('loadingFaces')}</div>
              ) : unrecognizedFaces.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>{t('noUnrecognizedFaces')}</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                  {unrecognizedFaces.slice(0, 50).map((f) => {
                    const imgName = f.image_path ? f.image_path.split(/[/\\]/).pop() : null;
                    const thumbUrl = imgName ? `/api/faces/image/${imgName}` : null;

                    return (
                      <div
                        key={f.face_id}
                        style={{
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          gap: 4,
                        }}
                        onClick={() => handleLinkUnrecFace(f)}
                      >
                        {thumbUrl && (
                          <img
                            src={thumbUrl}
                            alt={f.face_id}
                            style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover' }}
                          />
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                          {f.face_id}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'linked' && (
            <div>
              {personFaceLinks.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>
                  {t('noLinkedFaces')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {personFaceLinks.map((link) => (
                    <div
                      key={link.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                          src={`/api/faces/image/${link.media_face_id}`}
                          alt={link.media_person_name}
                          style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {link.media_person_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Face ID: {link.media_face_id} {link.is_primary_avatar ? `• ⭐ ${t('primaryAvatarBadge')}` : ''}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: 6,
                          padding: '4px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        onClick={async () => {
                          await onUnlinkFace(link.id);
                          setPersonFaceLinks((prev) => prev.filter((l) => l.id !== link.id));
                        }}
                      >
                        {t('btnUnlinkFace')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
