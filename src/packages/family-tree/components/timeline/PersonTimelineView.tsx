import { memo, useState, useMemo, useEffect, useRef } from 'react';
import { useLanguage } from '../../../../i18n/LanguageContext.js';
import { usePersonTimeline } from '../../hooks/usePersonTimeline.js';
import { useFamilyTreeStore } from '../../state/useFamilyTreeStore.js';
import type { PersonEventRecord } from '../../types/event.types.js';
import { FactCard } from './FactCard.js';
import { AddEditFactModal } from './AddEditFactModal.js';
import { GalleryPhotoPicker } from './GalleryPhotoPicker.js';
import { filterRelativeEvents, deduplicateTimelineEvents } from '../../utils/timelineDeduplication.js';
import { exportPersonTimeline, type ExportImageFormat } from '../../utils/treeExportService.js';

interface PersonTimelineViewProps {
  personId: string;
  personName: string;
}

export const PersonTimelineView = memo(({ personId, personName }: PersonTimelineViewProps) => {
  const { t } = useLanguage();
  const { lifeFactsConfig } = useFamilyTreeStore();
  const {
    events,
    isLoading,
    createEvent,
    updateEvent,
    deleteEvent,
    pinMediaToEvent,
    unpinMedia,
  } = usePersonTimeline(personId);

  const [activeCategory, setActiveCategory] = useState('ALL');
  const [relativeEvents, setRelativeEvents] = useState<PersonEventRecord[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [factToEdit, setFactToEdit] = useState<PersonEventRecord | null>(null);
  const [pinTargetEventId, setPinTargetEventId] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!personId) {
      setRelativeEvents([]);
      return;
    }

    const hasAnyRelativesEnabled =
      lifeFactsConfig.showParentsFacts ||
      lifeFactsConfig.showSiblingsFacts ||
      lifeFactsConfig.showChildrenFacts ||
      lifeFactsConfig.showSpousesFacts;

    if (!hasAnyRelativesEnabled) {
      setRelativeEvents([]);
      return;
    }

    async function loadRelativeEvents() {
      try {
        const ctxRes = await fetch(`/api/family-tree/public/person-context?personId=${encodeURIComponent(personId)}`);
        if (!ctxRes.ok) return;
        const ctx = await ctxRes.json();
        if (cancelled || !ctx?.immediateFamily) return;

        const relativesToFetch: Array<{ id: string; name: string; relation: string }> = [];
        if (lifeFactsConfig.showParentsFacts && ctx.immediateFamily.parents) {
          relativesToFetch.push(...ctx.immediateFamily.parents);
        }
        if (lifeFactsConfig.showSiblingsFacts && ctx.immediateFamily.siblings) {
          relativesToFetch.push(...ctx.immediateFamily.siblings);
        }
        if (lifeFactsConfig.showChildrenFacts && ctx.immediateFamily.children) {
          relativesToFetch.push(...ctx.immediateFamily.children);
        }
        if (lifeFactsConfig.showSpousesFacts && ctx.immediateFamily.spouses) {
          relativesToFetch.push(...ctx.immediateFamily.spouses);
        }

        const seenUnionEventKeys = new Set<string>();
        const seenChildBornIds = new Set<string>();
        const seenBirthPersonIds = new Set<string>();

        const allFetched: PersonEventRecord[] = [];
        for (const rel of relativesToFetch) {
          const res = await fetch(`/api/family-tree/persons/${rel.id}/timeline`);
          if (res.ok) {
            const evts: PersonEventRecord[] = await res.json();
            const filtered = filterRelativeEvents(evts, rel, {
              currentPersonId: personId,
              currentPersonName: personName,
              ownEvents: events,
              seenUnionEventKeys,
              seenChildBornIds,
              seenBirthPersonIds,
            });

            for (const ev of filtered) {
              allFetched.push({
                ...ev,
                id: `rel_${ev.id}`,
                is_system_generated: 1,
                ...({ relativeName: rel.name, relativeRelation: rel.relation } as any),
              });
            }
          }
        }
        if (!cancelled) {
          setRelativeEvents(allFetched);
        }
      } catch {
        // ignore
      }
    }

    loadRelativeEvents();
    return () => {
      cancelled = true;
    };
  }, [
    personId,
    personName,
    events,
    lifeFactsConfig.showParentsFacts,
    lifeFactsConfig.showSiblingsFacts,
    lifeFactsConfig.showChildrenFacts,
    lifeFactsConfig.showSpousesFacts,
  ]);

  const allAvailableEvents = useMemo(() => {
    const ownPart = lifeFactsConfig.showOwnFacts !== false ? events : [];
    let result = deduplicateTimelineEvents(ownPart, relativeEvents, personId);

    // Filter by lifeFactsConfig
    if (lifeFactsConfig?.includedFactTypes && lifeFactsConfig.includedFactTypes.length > 0) {
      result = result.filter((e) => lifeFactsConfig.includedFactTypes.includes(e.event_type));
    }

    // Sort chronologically
    result.sort((a, b) => {
      const d1 = a.event_date || '9999-99-99';
      const d2 = b.event_date || '9999-99-99';
      return d1.localeCompare(d2);
    });

    return result;
  }, [events, relativeEvents, lifeFactsConfig, personId]);

  const categoryFilters = useMemo(() => [
    { id: 'ALL', label: t('filterCategoryAll') },
    { id: 'MILESTONES', label: t('filterCategoryMilestones') },
    { id: 'RELATIONSHIP', label: t('filterCategoryRelationships') },
    { id: 'GRADUATION', label: t('filterCategoryEducation') },
    { id: 'RELOCATION', label: t('filterCategoryRelocation') },
    { id: 'TRAVEL', label: t('filterCategoryTravel') },
    { id: 'CAREER', label: t('filterCategoryCareer') },
    { id: 'MILITARY', label: t('filterCategoryMilitary') },
    { id: 'CUSTOM', label: t('filterCategoryCustom') },
  ], [t]);

  // Only show filter buttons for categories that exist for this person
  const availableCategories = useMemo(() => {
    if (allAvailableEvents.length === 0) return [];
    return categoryFilters.filter((cat) => {
      if (cat.id === 'ALL') return true;
      if (cat.id === 'MILESTONES') {
        return allAvailableEvents.some((e: PersonEventRecord) =>
          ['BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'CHILD_BORN'].includes(e.event_type),
        );
      }
      return allAvailableEvents.some((e: PersonEventRecord) => e.event_type === cat.id);
    });
  }, [allAvailableEvents, categoryFilters]);

  const filteredEvents = useMemo(() => {
    if (activeCategory === 'ALL') return allAvailableEvents;
    if (activeCategory === 'MILESTONES') {
      return allAvailableEvents.filter((e: PersonEventRecord) =>
        ['BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'CHILD_BORN'].includes(e.event_type),
      );
    }
    return allAvailableEvents.filter((e: PersonEventRecord) => e.event_type === activeCategory);
  }, [allAvailableEvents, activeCategory]);

  const handleOpenAdd = () => {
    setFactToEdit(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (evt: PersonEventRecord) => {
    setFactToEdit(evt);
    setIsAddModalOpen(true);
  };

  const handleSaveFact = async (data: any) => {
    if (factToEdit) {
      await updateEvent(factToEdit.id, data);
    } else {
      await createEvent(data);
    }
  };

  const handlePinMedia = (eventId: string) => {
    setPinTargetEventId(eventId);
  };

  const handleSelectPhotosToPin = async (photos: any[]) => {
    if (!pinTargetEventId) return;
    for (const p of photos) {
      await pinMediaToEvent(pinTargetEventId, p);
    }
    setPinTargetEventId(null);
  };

  const handleQuickExport = async (format: ExportImageFormat) => {
    setIsExportMenuOpen(false);
    try {
      await exportPersonTimeline({
        timelineEl: timelineContainerRef.current,
        personName,
        personId,
        format,
        quality: 'high',
      });
    } catch (err) {
      console.error('Quick timeline export failed:', err);
    }
  };

  return (
    <div
      ref={timelineContainerRef}
      className="person-timeline-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Header with "+ Add Life Fact" and Filter Pills */}
      <div style={{ padding: '0 0 14px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('timelineChronologicalTitle')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {events.length} {t('timelineMilestonesCount')} {personName}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Quick Export Button */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                style={{
                  background: 'var(--nav-tab-bg)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                title={t('exportQuickBtn')}
              >
                <span>🖼️</span>
                <span>{t('exportQuickBtn')}</span>
                <span style={{ fontSize: 9 }}>▼</span>
              </button>

              {isExportMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    zIndex: 50,
                    background: 'var(--card-bg-solid, #1e293b)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    boxShadow: 'var(--shadow-modal)',
                    minWidth: 140,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <button
                    type="button"
                    style={{ padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => handleQuickExport('png')}
                  >
                    PNG ({t('exportQualityHigh')})
                  </button>
                  <button
                    type="button"
                    style={{ padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => handleQuickExport('jpeg')}
                  >
                    JPG
                  </button>
                  <button
                    type="button"
                    style={{ padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => handleQuickExport('svg')}
                  >
                    SVG
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
              }}
              onClick={handleOpenAdd}
            >
              ➕ {t('btnAddFact')}
            </button>
          </div>
        </div>

        {/* Filter Pills with multiline support fitting width of screen */}
        {availableCategories.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingBottom: 4 }}>
            {availableCategories.map((cat) => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  style={{
                    background: isSelected ? 'var(--nav-tab-active-bg)' : 'var(--nav-tab-bg)',
                    border: isSelected ? '1px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                    borderRadius: 20,
                    color: isSelected ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.1s ease',
                  }}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Timeline List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 4px 16px 0', position: 'relative' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            {t('loadingTimelineFacts')}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📜</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('noFactsRecordedInCategory')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('clickAddFactToDocument')}
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            {/* Timeline vertical guide line */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                bottom: 8,
                left: 6,
                width: 2,
                background: 'linear-gradient(to bottom, var(--primary-color, #6366f1), var(--accent-color, #a855f7), var(--border-color))',
              }}
            />

            {filteredEvents.map((evt: PersonEventRecord) => (
              <div key={evt.id} style={{ position: 'relative' }}>
                {/* Node dot on timeline line */}
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    left: -19,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: evt.is_system_generated ? '#a855f7' : '#6366f1',
                    border: '2px solid var(--card-bg-solid)',
                    boxShadow: '0 0 8px rgba(99, 102, 241, 0.6)',
                  }}
                />

                <FactCard
                  event={evt}
                  onEdit={handleOpenEdit}
                  onDelete={deleteEvent}
                  onPinMedia={handlePinMedia}
                  onUnpinMedia={unpinMedia}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Fact Modal */}
      <AddEditFactModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveFact}
        factToEdit={factToEdit}
        personName={personName}
      />

      {/* Gallery Photo Picker */}
      <GalleryPhotoPicker
        isOpen={Boolean(pinTargetEventId)}
        onClose={() => setPinTargetEventId(null)}
        defaultPersonName={personName}
        onSelectPhotos={handleSelectPhotosToPin}
      />
    </div>
  );
});

PersonTimelineView.displayName = 'PersonTimelineView';
