import React, { useState, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useLanguage } from '../../../../i18n/LanguageContext.js';
import { useFamilyTreeStore, notifyFamilyTreeUpdated } from '../../state/useFamilyTreeStore.js';
import { exportTreeToCSV, parseTreeFromCSV, getSampleTreeCSV, validateTreeCSV, type CsvValidationResult } from '../../utils/csvTreeService.js';
import { formatTreeDate } from '../../utils/dateUtils.js';
import type { TreeGraphData, DateFormatStyle, TreeHistoryRecord } from '../../types/tree.types.js';
import type { PersonEventRecord } from '../../types/event.types.js';
import {
  exportTreeDiagram,
  exportPersonTimeline,
  type ExportImageFormat,
  type ExportQualityPreset,
  type ExportBackgroundStyle,
} from '../../utils/treeExportService.js';

interface TreeSettingsTabProps {
  graphData: TreeGraphData | null;
  refreshGraph: () => Promise<void>;
  createPerson?: (data: any) => Promise<any>;
  updatePerson?: (id: string, data: any) => Promise<any>;
  createUnion?: (data: any) => Promise<any>;
  updateUnion?: (id: string, data: any) => Promise<any>;
  addChildToUnion?: (unionId: string, data: { person_id: string; filiation?: any; birth_order?: number }) => Promise<any>;
  recordTreeHistory?: (actionType: string, description: string, details?: any) => Promise<any>;
  getTreeHistory?: (treeId?: string, limit?: number) => Promise<TreeHistoryRecord[]>;
  onBackToCanvas: () => void;
}

const COLOR_PRESETS = [
  { label: 'Pink', value: '#ec4899' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Indigo', value: '#6366f1' },
];

const ICON_PRESETS = ['🎂', '🎉', '💍', '💐', '🕯️', '⭐', '🎈', '🏆'];

export const TreeSettingsTab: React.FC<TreeSettingsTabProps> = ({
  graphData,
  refreshGraph,
  createPerson,
  updatePerson,
  createUnion,
  updateUnion,
  addChildToUnion,
  recordTreeHistory,
  getTreeHistory,
  onBackToCanvas,
}) => {
  const { language, t } = useLanguage();
  const {
    nodeViewStyle,
    setNodeViewStyle,
    dateFormatStyle,
    setDateFormatStyle,
    celebrationConfig,
    setCelebrationConfig,
    lifeFactsConfig,
    setLifeFactsConfig,
    galleryKinshipFactsConfig,
    setGalleryKinshipFactsConfig,
    activeTreeId,
  } = useFamilyTreeStore();

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importStats, setImportStats] = useState<{ personsCount: number; unionsCount: number; factsCount?: number; errors: string[] } | null>(null);
  const [validationResult, setValidationResult] = useState<CsvValidationResult | null>(null);
  const [showDiffDetails, setShowDiffDetails] = useState(false);
  const [historyList, setHistoryList] = useState<TreeHistoryRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(null);
  const [importStatusType, setImportStatusType] = useState<'info' | 'success' | 'error'>('info');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tree history on mount or treeId change
  React.useEffect(() => {
    if (getTreeHistory && activeTreeId) {
      setIsLoadingHistory(true);
      getTreeHistory(activeTreeId, 25)
        .then((items) => {
          if (Array.isArray(items)) setHistoryList(items);
        })
        .catch(() => {})
        .finally(() => setIsLoadingHistory(false));
    }
  }, [getTreeHistory, activeTreeId]);

  // Expandable sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    exportMedia: true,
    viewStyles: true,
    celebrations: true,
    dateFormats: true,
    lifeFacts: true,
    galleryKinship: true,
    csvBackup: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ---------------------------------------------------------------------------
  // Export Tree & Timeline State & Handlers
  // ---------------------------------------------------------------------------
  const [exportTab, setExportTab] = useState<'tree' | 'timeline'>('tree');
  const [exportFormat, setExportFormat] = useState<ExportImageFormat>('png');
  const [exportQuality, setExportQuality] = useState<ExportQualityPreset>('high');
  const [exportBg, setExportBg] = useState<ExportBackgroundStyle>('theme');
  const [selectedExportPersonId, setSelectedExportPersonId] = useState<string>(() => {
    return graphData?.root_person_id || graphData?.persons?.[0]?.id || '';
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [previewEvents, setPreviewEvents] = useState<PersonEventRecord[]>([]);
  const timelineCaptureRef = useRef<HTMLDivElement>(null);

  // Load preview events when selected person changes
  React.useEffect(() => {
    const personId = selectedExportPersonId || graphData?.root_person_id || graphData?.persons?.[0]?.id;
    if (!personId) return;
    let cancelled = false;
    async function loadEvents() {
      try {
        const res = await fetch(`/api/family-tree/persons/${personId}/timeline`);
        if (res.ok && !cancelled) {
          const evts = await res.json();
          setPreviewEvents(evts);
        }
      } catch (err) {
        console.error('Failed to load timeline events for export preview', err);
      }
    }
    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [selectedExportPersonId, graphData?.root_person_id, graphData?.persons]);

  const reactFlow = useReactFlow();

  const handleExecuteExportTree = async () => {
    setIsExporting(true);
    setExportFeedback({ type: 'info', message: t('exportExporting') });
    try {
      const nodes = reactFlow?.getNodes ? reactFlow.getNodes() : [];
      const canvasSubtab = document.getElementById('canvas-subtab-container');
      let target = canvasSubtab?.querySelector('.react-flow__viewport') as HTMLElement ||
        document.querySelector('.react-flow__viewport') as HTMLElement ||
        canvasSubtab?.querySelector('.react-flow') as HTMLElement ||
        document.querySelector('.react-flow') as HTMLElement;

      if (!target) {
        throw new Error(language === 'ru' ? 'Холст древа не найден для экспорта' : 'Family tree canvas element not found for export');
      }

      const filename = await exportTreeDiagram({
        containerEl: target,
        nodes,
        treeId: activeTreeId || 'family_tree',
        format: exportFormat,
        quality: exportQuality,
        backgroundStyle: exportBg,
      });

      setExportFeedback({
        type: 'success',
        message: `${t('exportSuccess')} (${filename})`,
      });
    } catch (err: any) {
      console.error('Tree export error:', err);
      setExportFeedback({
        type: 'error',
        message: `${t('exportError')}: ${err?.message || err}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExecuteExportTimeline = async () => {
    const targetPersonId = selectedExportPersonId || graphData?.root_person_id || graphData?.persons?.[0]?.id;
    const person = graphData?.persons?.find((p) => p.id === targetPersonId);
    if (!person) {
      alert(t('exportSelectPersonPlaceholder'));
      return;
    }

    setIsExporting(true);
    setExportFeedback({ type: 'info', message: t('exportExporting') });
    try {
      let eventsToExport = previewEvents;
      if (eventsToExport.length === 0) {
        const res = await fetch(`/api/family-tree/persons/${person.id}/timeline`);
        if (res.ok) {
          eventsToExport = await res.json();
          setPreviewEvents(eventsToExport);
        }
      }

      // Small delay so capture container is freshly painted
      await new Promise((r) => setTimeout(r, 60));

      const target = timelineCaptureRef.current;
      if (!target) {
        throw new Error(language === 'ru' ? 'Контейнер хроники не готов' : 'Timeline capture container not ready');
      }

      const personFullName = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Person';
      const filename = await exportPersonTimeline({
        timelineEl: target,
        personName: personFullName,
        personId: person.id,
        format: exportFormat,
        quality: exportQuality,
        backgroundStyle: exportBg,
      });

      setExportFeedback({
        type: 'success',
        message: `${t('exportSuccess')} (${filename})`,
      });
    } catch (err: any) {
      console.error('Timeline export error:', err);
      setExportFeedback({
        type: 'error',
        message: `${t('exportError')}: ${err?.message || err}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CSV Handlers
  // ---------------------------------------------------------------------------
  const handleExportCSV = () => {
    if (!graphData || !graphData.persons || graphData.persons.length === 0) {
      alert(t('treeEmptyExportAlert') || (language === 'ru' ? 'Семейное древо пусто. Добавьте персон перед экспортом.' : 'Family tree is currently empty. Add members before exporting.'));
      return;
    }
    const csvContent = exportTreeToCSV(graphData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `family_tree_${activeTreeId || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSample = () => {
    const sample = getSampleTreeCSV();
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_family_tree.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        setCsvText(text);
        const parsed = parseTreeFromCSV(text);
        const validation = validateTreeCSV(parsed, graphData);
        setValidationResult(validation);
        setImportStats({
          personsCount: parsed.persons.length,
          unionsCount: parsed.unions.length,
          factsCount: parsed.facts?.length || 0,
          errors: validation.errors,
        });

        if (!validation.isValid) {
          setImportStatusMessage(
            language === 'ru'
              ? `Ошибки валидации CSV (${validation.errors.length}): исправьте ошибки перед импортом.`
              : `CSV Validation Failed (${validation.errors.length} error(s)): please resolve errors before importing.`
          );
          setImportStatusType('error');
        } else if (validation.warnings.length > 0) {
          setImportStatusMessage(
            language === 'ru'
              ? `CSV проверен с ${validation.warnings.length} предупреждениями. Готов к синхронизации.`
              : `CSV validated with ${validation.warnings.length} warning(s). Ready to merge.`
          );
          setImportStatusType('info');
        } else {
          setImportStatusMessage(
            language === 'ru'
              ? `CSV полностью валиден. Персоны: +${validation.diff.personsToCreate.length} новых, ${validation.diff.personsToUpdate.length} обновлений.`
              : `CSV is fully valid. Persons: +${validation.diff.personsToCreate.length} new, ${validation.diff.personsToUpdate.length} to update.`
          );
          setImportStatusType('info');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!csvText.trim()) {
      setImportStatusMessage('Please select or paste a CSV file first.');
      setImportStatusType('error');
      return;
    }

    const parsed = parseTreeFromCSV(csvText);
    const validation = validateTreeCSV(parsed, graphData);
    setValidationResult(validation);

    if (!validation.isValid) {
      setImportStatusMessage(`Cannot import: ${validation.errors.join('; ')}`);
      setImportStatusType('error');
      return;
    }

    setIsImporting(true);
    setImportStatusMessage(
      language === 'ru'
        ? 'Синхронизация данных: сопоставление ID и сохранение связей...'
        : 'Reconciling IDs and applying incremental updates...'
    );
    setImportStatusType('info');

    try {
      // Map old CSV person IDs to existing or newly created IDs
      const idMap = new Map<string, string>();

      let personsCreated = 0;
      let personsUpdated = 0;
      let personsUnchanged = 0;

      let unionsCreated = 0;
      let unionsUpdated = 0;
      let unionsUnchanged = 0;

      let factsCreated = 0;
      let factsUpdated = 0;

      // Build quick lookup maps for current graph
      const existingPersonMap = new Map<string, any>();
      const existingSecondaryMap = new Map<string, any>();
      if (graphData?.persons) {
        for (const ep of graphData.persons) {
          existingPersonMap.set(ep.id, ep);
          const nameKey = `${(ep.first_name || '').trim()} ${(ep.last_name || '').trim()} ${(ep.birth_date || '').trim()}`.toLowerCase();
          if (nameKey.trim()) existingSecondaryMap.set(nameKey, ep);
        }
      }

      // 1. Reconcile Persons
      for (const p of parsed.persons) {
        const nameKey = `${(p.first_name || '').trim()} ${(p.last_name || '').trim()} ${(p.birth_date || '').trim()}`.toLowerCase();
        const existing = existingPersonMap.get(p.id) || (nameKey.trim() ? existingSecondaryMap.get(nameKey) : undefined);

        if (existing) {
          idMap.set(p.id, existing.id);

          // Compute changed fields
          const changedData: Record<string, any> = {};
          if ((p.first_name || '') !== (existing.first_name || '')) changedData.first_name = p.first_name;
          if ((p.middle_name || '') !== (existing.middle_name || '')) changedData.middle_name = p.middle_name || null;
          if ((p.last_name || '') !== (existing.last_name || '')) changedData.last_name = p.last_name || null;
          if ((p.maiden_name || '') !== (existing.maiden_name || '')) changedData.maiden_name = p.maiden_name || null;
          if (p.gender && p.gender !== existing.gender) changedData.gender = p.gender;
          if ((p.birth_date || '') !== (existing.birth_date || '')) changedData.birth_date = p.birth_date || null;
          if ((p.birth_place || '') !== (existing.birth_place || '')) changedData.birth_place = p.birth_place || null;
          const existingLiving = existing.is_living === 1 || existing.is_living === true;
          if (Boolean(p.is_living) !== existingLiving) changedData.is_living = p.is_living;
          if ((p.death_date || '') !== (existing.death_date || '')) changedData.death_date = p.death_date || null;
          if ((p.death_place || '') !== (existing.death_place || '')) changedData.death_place = p.death_place || null;
          if ((p.bio || '') !== (existing.bio || '')) changedData.bio = p.bio || null;

          if (Object.keys(changedData).length > 0 && updatePerson) {
            await updatePerson(existing.id, changedData);
            personsUpdated++;
          } else {
            personsUnchanged++;
          }
        } else if (createPerson) {
          const created = await createPerson({
            id: p.id,
            tree_id: activeTreeId,
            first_name: p.first_name,
            middle_name: p.middle_name,
            last_name: p.last_name,
            maiden_name: p.maiden_name,
            gender: p.gender || 'UNKNOWN',
            birth_date: p.birth_date,
            birth_place: p.birth_place,
            is_living: p.is_living,
            death_date: p.death_date,
            death_place: p.death_place,
            bio: p.bio,
          });
          if (created && created.id) {
            idMap.set(p.id, created.id);
            personsCreated++;
          }
        }
      }

      // Map any existing person IDs so union references match
      if (graphData?.persons) {
        for (const ep of graphData.persons) {
          if (!idMap.has(ep.id)) {
            idMap.set(ep.id, ep.id);
          }
        }
      }

      // 2. Reconcile Unions
      const existingUnionMap = new Map<string, any>();
      const existingPartnersUnionMap = new Map<string, any>();
      if (graphData?.unions) {
        for (const eu of graphData.unions) {
          existingUnionMap.set(eu.id, eu);
          const partnerKey = [...(eu.partner_ids || [])].sort().join(';');
          if (partnerKey) existingPartnersUnionMap.set(partnerKey, eu);
        }
      }

      for (const u of parsed.unions) {
        const mappedPartners = u.partner_ids.map((pid) => idMap.get(pid) || pid).filter(Boolean);
        const partnerKey = [...mappedPartners].sort().join(';');
        const existingUnion = (u.id && existingUnionMap.get(u.id)) || (partnerKey ? existingPartnersUnionMap.get(partnerKey) : undefined);

        let targetUnionId = existingUnion?.id;

        if (existingUnion) {
          const unionChanges: Record<string, any> = {};
          if (u.union_type && u.union_type !== existingUnion.union_type) unionChanges.union_type = u.union_type;
          if ((u.start_date || '') !== (existingUnion.start_date || '')) unionChanges.start_date = u.start_date || null;
          if ((u.start_place || '') !== (existingUnion.start_place || '')) unionChanges.start_place = u.start_place || null;
          if ((u.end_date || '') !== (existingUnion.end_date || '')) unionChanges.end_date = u.end_date || null;
          if ((u.notes || '') !== (existingUnion.notes || '')) unionChanges.notes = u.notes || null;

          const existingPartnerSet = new Set(existingUnion.partner_ids || []);
          const hasPartnerChanges = mappedPartners.length !== (existingUnion.partner_ids || []).length ||
            mappedPartners.some((pid) => !existingPartnerSet.has(pid));
          if (hasPartnerChanges && mappedPartners.length > 0) {
            unionChanges.partner_ids = mappedPartners;
          }

          if (Object.keys(unionChanges).length > 0 && updateUnion) {
            await updateUnion(existingUnion.id, unionChanges);
            unionsUpdated++;
          } else {
            unionsUnchanged++;
          }
        } else if (createUnion && mappedPartners.length > 0) {
          const createdU = await createUnion({
            id: u.id,
            tree_id: activeTreeId,
            partner_ids: mappedPartners,
            union_type: u.union_type || 'MARRIAGE',
            start_date: u.start_date,
            end_date: u.end_date,
            start_place: u.start_place,
            notes: u.notes,
          });
          if (createdU && createdU.id) {
            targetUnionId = createdU.id;
            unionsCreated++;
          }
        }

        // Attach children to this union
        if (targetUnionId && u.children && u.children.length > 0 && addChildToUnion) {
          const existingChildSet = new Set((existingUnion?.children || []).map((c: any) => c.person_id));
          for (const childRef of u.children) {
            const mappedChildId = idMap.get(childRef.person_id) || childRef.person_id;
            if (mappedChildId && !existingChildSet.has(mappedChildId)) {
              await addChildToUnion(targetUnionId, {
                person_id: mappedChildId,
                filiation: childRef.filiation,
                birth_order: childRef.birth_order,
              });
              existingChildSet.add(mappedChildId);
            }
          }
        }
      }

      // 3. Reconcile Facts / Events
      if (parsed.facts && parsed.facts.length > 0) {
        const existingFactsMap = new Map<string, any>();
        const existingFactKeyMap = new Map<string, any>();
        if (graphData?.facts) {
          for (const ef of graphData.facts) {
            existingFactsMap.set(ef.id, ef);
            const fKey = `${ef.person_id}:${ef.event_type}:${(ef.title || '').trim().toLowerCase()}`;
            existingFactKeyMap.set(fKey, ef);
          }
        }

        for (const f of parsed.facts) {
          const targetPersonId = idMap.get(f.person_id) || f.person_id;
          if (!targetPersonId) continue;

          const fKey = `${targetPersonId}:${f.event_type}:${(f.title || '').trim().toLowerCase()}`;
          const existingFact = (f.id && existingFactsMap.get(f.id)) || existingFactKeyMap.get(fKey);

          if (existingFact) {
            const factChanges: Record<string, any> = {};
            if ((f.description || '') !== (existingFact.description || '')) factChanges.description = f.description || null;
            if ((f.event_date || '') !== (existingFact.event_date || '')) factChanges.event_date = f.event_date || null;
            if ((f.end_date || '') !== (existingFact.end_date || '')) factChanges.end_date = f.end_date || null;
            if ((f.location_name || '') !== (existingFact.location_name || '')) factChanges.location_name = f.location_name || null;

            if (Object.keys(factChanges).length > 0) {
              try {
                await fetch(`/api/family-tree/events/${existingFact.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(factChanges),
                });
                factsUpdated++;
              } catch {
                // ignore
              }
            }
          } else {
            try {
              const res = await fetch(`/api/family-tree/persons/${targetPersonId}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: f.id,
                  event_type: f.event_type,
                  title: f.title,
                  description: f.description,
                  event_date: f.event_date,
                  end_date: f.end_date,
                  date_is_approximate: f.date_is_approximate ? 1 : 0,
                  location_name: f.location_name,
                  relationship_target_name: f.relationship_target_name,
                  relationship_status: f.relationship_status,
                }),
              });
              if (res.ok) {
                const createdEvt = await res.json().catch(() => null);
                if (createdEvt && createdEvt.id) {
                  existingFactsMap.set(createdEvt.id, createdEvt);
                  existingFactKeyMap.set(fKey, createdEvt);
                }
                factsCreated++;
              }
            } catch {
              // ignore
            }
          }
        }
      }

      // 4. Record Audit Log in Tree History
      const historyDesc = `CSV Import: ${personsCreated} persons created, ${personsUpdated} persons updated (${personsUnchanged} unchanged); ${unionsCreated} unions created, ${unionsUpdated} unions updated; ${factsCreated} facts created, ${factsUpdated} facts updated.`;
      if (recordTreeHistory) {
        await recordTreeHistory('CSV_IMPORT', historyDesc, {
          personsCreated,
          personsUpdated,
          personsUnchanged,
          unionsCreated,
          unionsUpdated,
          unionsUnchanged,
          factsCreated,
          factsUpdated,
          timestamp: new Date().toISOString(),
        });
      }

      await refreshGraph();
      notifyFamilyTreeUpdated();
      if (getTreeHistory) {
        const hist = await getTreeHistory(activeTreeId, 25);
        if (Array.isArray(hist)) setHistoryList(hist);
      }

      setImportStatusMessage(
        language === 'ru'
          ? `Импорт завершен успешно! Персоны: +${personsCreated} создано, ${personsUpdated} обновлено (${personsUnchanged} без изменений). Союзы: +${unionsCreated} создано, ${unionsUpdated} обновлено. События: +${factsCreated} создано, ${factsUpdated} обновлено.`
          : `Import complete! Persons: +${personsCreated} created, ${personsUpdated} updated (${personsUnchanged} unchanged). Unions: +${unionsCreated} created, ${unionsUpdated} updated. Facts: +${factsCreated} created, ${factsUpdated} updated.`
      );
      setImportStatusType('success');
      setCsvText('');
      setImportStats(null);
      setValidationResult(null);
    } catch (err: any) {
      setImportStatusMessage(`Import error: ${err?.message || 'Failed to import tree'}`);
      setImportStatusType('error');
    } finally {
      setIsImporting(false);
    }
  };

  // Card header styles
  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: 20,
    boxShadow: 'var(--shadow-card)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    transition: 'all 0.2s ease',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
    gap: 12,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: 0,
    lineHeight: 1.3,
  };

  const sectionSubtextStyle: React.CSSProperties = {
    fontSize: 12.5,
    color: 'var(--text-secondary)',
    marginTop: 6,
    marginBottom: 0,
    lineHeight: 1.4,
  };

  return (
    <div
      className="tree-settings-container"
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '24px 32px 64px',
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {t('settingsHeaderTitle')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {t('settingsHeaderSubtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            id="toggle-all-sections-btn"
            onClick={() => {
              const allOpen = Object.values(expandedSections).every(Boolean);
              setExpandedSections({
                exportMedia: !allOpen,
                viewStyles: !allOpen,
                celebrations: !allOpen,
                dateFormats: !allOpen,
                lifeFacts: !allOpen,
                galleryKinship: !allOpen,
                csvBackup: !allOpen,
              });
            }}
            style={{
              background: 'var(--nav-tab-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span>{Object.values(expandedSections).every(Boolean) ? t('btnCollapseAllSections') : t('btnExpandAllSections')}</span>
          </button>

          <button
            type="button"
            onClick={onBackToCanvas}
            style={{
              background: 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)',
            }}
          >
            {t('btnBackToCanvas')}
          </button>
        </div>
      </div>

      {/* Quick Navigation Section Pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 0' }}>
        <button
          type="button"
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, viewStyles: true }));
            document.getElementById('section-header-view-styles')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: 'var(--nav-tab-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          🎨 {t('settingsViewStylesTitle')}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, celebrations: true }));
            document.getElementById('section-header-celebrations')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: 'var(--nav-tab-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          🎂 {t('settingsCelebrationsTitle')}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, dateFormats: true }));
            document.getElementById('section-header-date-formats')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: 'var(--nav-tab-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          📅 {t('settingsDateFormatsTitle')}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, lifeFacts: true }));
            document.getElementById('section-header-life-facts')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: 'var(--nav-tab-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          🧬 {t('settingsLifeFactsTitle')}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, galleryKinship: true }));
            document.getElementById('section-header-gallery-kinship')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: 'var(--nav-tab-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          🖼️ {t('settingsGalleryKinshipTitle') || 'Kinship in Gallery'}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, csvBackup: true }));
            document.getElementById('section-header-csv-backup')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: 'var(--nav-tab-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          💾 {t('settingsCsvBackupTitle')}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpandedSections((prev) => ({ ...prev, exportMedia: true }));
            document.getElementById('section-export-tree-timeline')?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(236, 72, 153, 0.25))',
            border: '1px solid var(--primary-color, #6366f1)',
            color: 'var(--text-primary)',
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          📤 {t('exportSectionTitle')}
        </button>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 1. Tree View Styles */}
      {/* --------------------------------------------------------------------- */}
      <div style={cardStyle}>
        <div
          style={sectionHeaderStyle}
          onClick={() => toggleSection('viewStyles')}
          id="section-header-view-styles"
        >
          <div>
            <div style={sectionTitleStyle}>
              <span>🎨</span> {t('settingsViewStylesTitle') || 'Tree Node View Style'}
            </div>
            <div style={sectionSubtextStyle}>
              {t('settingsViewStylesDesc')}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              transform: expandedSections.viewStyles ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              marginLeft: 12,
            }}
          >
            ▼
          </span>
        </div>

        {expandedSections.viewStyles && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Style 1: Default */}
            <div
              onClick={() => setNodeViewStyle('default')}
              style={{
                border: nodeViewStyle === 'default' ? '2px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                background: nodeViewStyle === 'default' ? 'var(--nav-tab-active-bg)' : 'var(--nav-tab-bg)',
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  {t('settingsStyleDefault')}
                </span>
                <input type="radio" checked={nodeViewStyle === 'default'} readOnly style={{ accentColor: 'var(--primary-color)' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('settingsStyleDefaultDesc')}
              </div>
              {/* Visual Mini Mockup */}
              <div
                style={{
                  height: 70,
                  background: 'var(--card-bg-solid)',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                  JD
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Johnathan Doe</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>1954 – 2018 • 📍 Boston</div>
                </div>
              </div>
            </div>

            {/* Style 2: Circle */}
            <div
              onClick={() => setNodeViewStyle('circle')}
              style={{
                border: nodeViewStyle === 'circle' ? '2px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                background: nodeViewStyle === 'circle' ? 'var(--nav-tab-active-bg)' : 'var(--nav-tab-bg)',
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  {t('settingsStyleCircle')}
                </span>
                <input type="radio" checked={nodeViewStyle === 'circle'} readOnly style={{ accentColor: 'var(--primary-color)' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('settingsStyleCircleDesc')}
              </div>
              {/* Visual Mini Mockup */}
              <div
                style={{
                  height: 70,
                  background: 'var(--card-bg-solid)',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#a855f7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                  JD
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Johnathan Doe</div>
              </div>
            </div>

            {/* Style 3: Square */}
            <div
              onClick={() => setNodeViewStyle('square')}
              style={{
                border: nodeViewStyle === 'square' ? '2px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                background: nodeViewStyle === 'square' ? 'var(--nav-tab-active-bg)' : 'var(--nav-tab-bg)',
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  {t('settingsStyleSquare')}
                </span>
                <input type="radio" checked={nodeViewStyle === 'square'} readOnly style={{ accentColor: 'var(--primary-color)' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('settingsStyleSquareDesc')}
              </div>
              {/* Visual Mini Mockup */}
              <div
                style={{
                  height: 70,
                  background: 'var(--card-bg-solid)',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 6, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                  JD
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Johnathan Doe</div>
                  <div style={{ fontSize: 10, color: '#10b981' }}>b. May 14, 1980</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 2. Celebration Badges */}
      {/* --------------------------------------------------------------------- */}
      <div style={cardStyle}>
        <div
          style={sectionHeaderStyle}
          onClick={() => toggleSection('celebrations')}
          id="section-header-celebrations"
        >
          <div>
            <div style={sectionTitleStyle}>
              <span>🎂</span> {t('settingsCelebrationsTitle') || 'Celebration & Milestone Badges'}
            </div>
            <div style={sectionSubtextStyle}>
              {t('settingsCelebrationsDesc')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }} onClick={(e) => e.stopPropagation()}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={celebrationConfig.enabled}
                onChange={(e) => setCelebrationConfig({ enabled: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--primary-color)' }}
              />
              {t('settingsEnableCelebrations')}
            </label>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                transform: expandedSections.celebrations ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s ease',
                display: 'inline-block',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('celebrations');
              }}
            >
              ▼
            </span>
          </div>
        </div>

        {expandedSections.celebrations && celebrationConfig.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
            {/* Event Types */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                {language === 'ru' ? 'Поводы для праздников' : 'Occasions to Celebrate'}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={celebrationConfig.showBirthday}
                    onChange={(e) => setCelebrationConfig({ showBirthday: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>{t('settingsShowBirthdays')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={celebrationConfig.showAnniversary}
                    onChange={(e) => setCelebrationConfig({ showAnniversary: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>{t('settingsShowAnniversaries')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={celebrationConfig.showMemorial}
                    onChange={(e) => setCelebrationConfig({ showMemorial: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>{t('settingsShowMemorials')}</span>
                </label>
              </div>
            </div>

            {/* Threshold & Presentation Style */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                  {t('settingsDaysThreshold')}: <strong>{celebrationConfig.daysThreshold} {language === 'ru' ? 'дн.' : 'days'}</strong>
                </label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={celebrationConfig.daysThreshold}
                  onChange={(e) => setCelebrationConfig({ daysThreshold: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', accentColor: 'var(--primary-color)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                  <span>{language === 'ru' ? '0 (В день события)' : '0 (Day of event only)'}</span>
                  <span>{language === 'ru' ? '15 дней' : '15 days'}</span>
                  <span>{language === 'ru' ? '30 дней заранее' : '30 days ahead'}</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                  {t('settingsBadgeStyle')}
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['pill', 'glow', 'ribbon'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setCelebrationConfig({ badgeStyle: style })}
                      style={{
                        flex: 1,
                        background: celebrationConfig.badgeStyle === style ? 'var(--primary-color, #6366f1)' : 'var(--nav-tab-bg)',
                        color: celebrationConfig.badgeStyle === style ? '#ffffff' : 'var(--text-primary)',
                        border: celebrationConfig.badgeStyle === style ? '1px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Badge Content Display Mode: Icon Only vs Icon and Text */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                {t('settingsDisplayContent')}
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id="celebration-mode-icon-and-text"
                  onClick={() => setCelebrationConfig({ contentDisplay: 'icon_and_text' })}
                  style={{
                    flex: 1,
                    minWidth: 180,
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: celebrationConfig.contentDisplay !== 'icon_only' ? 'var(--primary-color, #6366f1)' : 'var(--nav-tab-bg)',
                    color: celebrationConfig.contentDisplay !== 'icon_only' ? '#ffffff' : 'var(--text-primary)',
                    border: celebrationConfig.contentDisplay !== 'icon_only' ? '1px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{celebrationConfig.customIcon || '🎂'} {language === 'ru' ? 'День рождения через 3 дн.' : 'Birthday in 3d'}</span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>({language === 'ru' ? 'Значок и текст' : 'Icon & text'})</span>
                </button>

                <button
                  type="button"
                  id="celebration-mode-icon-only"
                  onClick={() => setCelebrationConfig({ contentDisplay: 'icon_only' })}
                  style={{
                    flex: 1,
                    minWidth: 180,
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: celebrationConfig.contentDisplay === 'icon_only' ? 'var(--primary-color, #6366f1)' : 'var(--nav-tab-bg)',
                    color: celebrationConfig.contentDisplay === 'icon_only' ? '#ffffff' : 'var(--text-primary)',
                    border: celebrationConfig.contentDisplay === 'icon_only' ? '1px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{celebrationConfig.customIcon || '🎂'}</span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>({language === 'ru' ? 'Только значок • при наведении' : 'Icon only • hover for details'})</span>
                </button>
              </div>
            </div>

            {/* Colors & Icon */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                  {t('settingsBadgeColor')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCelebrationConfig({ badgeColor: c.value })}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: c.value,
                        border: celebrationConfig.badgeColor === c.value ? '3px solid var(--text-primary)' : '1px solid var(--border-color)',
                        boxShadow: celebrationConfig.badgeColor === c.value ? '0 0 8px ' + c.value : undefined,
                        cursor: 'pointer',
                      }}
                      title={c.label}
                    />
                  ))}
                  <input
                    type="color"
                    value={celebrationConfig.badgeColor || '#ec4899'}
                    onChange={(e) => setCelebrationConfig({ badgeColor: e.target.value })}
                    style={{ width: 30, height: 30, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    title="Custom color"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                  {t('settingsCustomIcon')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {ICON_PRESETS.map((ico) => (
                    <button
                      key={ico}
                      type="button"
                      onClick={() => setCelebrationConfig({ customIcon: ico })}
                      style={{
                        fontSize: 16,
                        background: celebrationConfig.customIcon === ico ? 'var(--nav-tab-active-bg)' : 'var(--nav-tab-bg)',
                        border: celebrationConfig.customIcon === ico ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                        color: celebrationConfig.customIcon === ico ? 'var(--primary-color)' : 'var(--text-primary)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      {ico}
                    </button>
                  ))}
                  <input
                    type="text"
                    maxLength={3}
                    value={celebrationConfig.customIcon || '🎂'}
                    onChange={(e) => setCelebrationConfig({ customIcon: e.target.value })}
                    style={{
                      width: 44,
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      textAlign: 'center',
                      fontSize: 16,
                      color: 'var(--text-primary)',
                      padding: 4,
                    }}
                    title="Custom emoji or characters"
                  />
                </div>
              </div>
            </div>

            {/* Live Badge Preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--nav-tab-bg)', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{language === 'ru' ? 'Предпросмотр:' : 'Preview:'}</span>
              <div
                style={{
                  background: celebrationConfig.badgeColor || '#ec4899',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: celebrationConfig.contentDisplay === 'icon_only' ? '4px 8px' : '4px 10px',
                  borderRadius: celebrationConfig.badgeStyle === 'ribbon' ? 4 : 12,
                  boxShadow: celebrationConfig.badgeStyle === 'glow' ? `0 0 12px ${celebrationConfig.badgeColor || '#ec4899'}` : '0 2px 6px rgba(0,0,0,0.2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: celebrationConfig.contentDisplay === 'icon_only' ? 'help' : 'default',
                }}
                title={celebrationConfig.contentDisplay === 'icon_only' ? (language === 'ru' ? 'День рождения через 3 дня (наведите для подробностей)' : 'Birthday in 3 days (Hover to view details)') : undefined}
              >
                <span>{celebrationConfig.customIcon || '🎂'}</span>
                {celebrationConfig.contentDisplay !== 'icon_only' && <span>{language === 'ru' ? 'День рождения через 3 дня' : 'Birthday in 3 days'}</span>}
              </div>
              {celebrationConfig.contentDisplay === 'icon_only' && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({language === 'ru' ? 'Наведите курсор на значок для деталей' : 'Hover over badge to preview tooltip'})</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 3. Date Formats & Display */}
      {/* --------------------------------------------------------------------- */}
      <div style={cardStyle}>
        <div
          style={sectionHeaderStyle}
          onClick={() => toggleSection('dateFormats')}
          id="section-header-date-formats"
        >
          <div>
            <div style={sectionTitleStyle}>
              <span>📅</span> {t('settingsDateFormatsTitle') || 'Date Formats & Date Picker Configuration'}
            </div>
            <div style={sectionSubtextStyle}>
              {t('settingsDateFormatsDesc')}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              transform: expandedSections.dateFormats ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              marginLeft: 12,
            }}
          >
            ▼
          </span>
        </div>

        {expandedSections.dateFormats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                  {t('settingsDateFormatsTitle')}
                </label>
                <select
                  value={dateFormatStyle}
                  onChange={(e) => setDateFormatStyle(e.target.value as DateFormatStyle)}
                  style={{
                    width: '100%',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 1985-04-12, ISO Standard)</option>
                  <option value="DD Month YYYY">DD Month YYYY (e.g. 12 April 1985, Written)</option>
                  <option value="DD.MM.YYYY">DD.MM.YYYY (e.g. 12.04.1985, European)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 04/12/1985, US)</option>
                </select>
              </div>

              {/* Sample Format Preview */}
              <div style={{ background: 'var(--nav-tab-bg)', padding: '12px 18px', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {language === 'ru' ? 'Пример отображения на карточках:' : 'Example output on cards:'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-color, #6366f1)' }}>
                  {t('birthInformation')}: {formatTreeDate('1985-04-12', dateFormatStyle, language)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 2 }}>
                  {t('unionTypeMarriage')}: {formatTreeDate('2010-09-25', dateFormatStyle, language)}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--nav-tab-active-bg)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              💡 <strong>Smart Parser:</strong> {t('datePickerHint')}
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 4. Life Facts & Relatives Configuration */}
      {/* --------------------------------------------------------------------- */}
      <div style={cardStyle}>
        <div
          style={sectionHeaderStyle}
          onClick={() => toggleSection('lifeFacts')}
          id="section-header-life-facts"
        >
          <div>
            <div style={sectionTitleStyle}>
              <span>📜</span> {t('settingsLifeFactsTitle') || 'Person Life Facts & Relatives Filtering'}
            </div>
            <div style={sectionSubtextStyle}>
              {t('settingsLifeFactsDesc')}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              transform: expandedSections.lifeFacts ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              marginLeft: 12,
            }}
          >
            ▼
          </span>
        </div>

        {expandedSections.lifeFacts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
            {/* Checkbox Group 1: Whose facts to show */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>
                {language === 'ru' ? '1. Чьи события отображать в хронике' : '1. Whose Life Facts to Display in Person Timeline'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lifeFactsConfig.showOwnFacts}
                    onChange={(e) => setLifeFactsConfig({ showOwnFacts: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>👤 {t('settingsOwnFacts')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lifeFactsConfig.showParentsFacts}
                    onChange={(e) => setLifeFactsConfig({ showParentsFacts: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>👨‍👩‍👧 {t('labelParents')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lifeFactsConfig.showSiblingsFacts}
                    onChange={(e) => setLifeFactsConfig({ showSiblingsFacts: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>👫 {t('labelSiblings')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lifeFactsConfig.showChildrenFacts}
                    onChange={(e) => setLifeFactsConfig({ showChildrenFacts: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>👶 {t('labelChildren')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lifeFactsConfig.showGrandparentsFacts}
                    onChange={(e) => setLifeFactsConfig({ showGrandparentsFacts: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>👴 {language === 'ru' ? 'Дедушки и бабушки' : "Grandparents' Facts"}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lifeFactsConfig.showSpousesFacts}
                    onChange={(e) => setLifeFactsConfig({ showSpousesFacts: e.target.checked })}
                    style={{ accentColor: 'var(--primary-color)' }}
                  />
                  <span>💍 {t('sectionSpousesPartners')}</span>
                </label>
              </div>
            </div>

            {/* Checkbox Group 2: Categories to include */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>
                2. Fact Categories to Include
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {[
                  { type: 'BIRTH', label: '👶 Births & Milestones' },
                  { type: 'DEATH', label: '🕯️ Memorials / Passings' },
                  { type: 'MARRIAGE', label: '💍 Marriages' },
                  { type: 'DIVORCE', label: '💔 Divorces' },
                  { type: 'RELATIONSHIP', label: '💞 Relationships' },
                  { type: 'GRADUATION', label: '🎓 Education' },
                  { type: 'CAREER', label: '💼 Career & Jobs' },
                  { type: 'RELOCATION', label: '📍 Relocations' },
                  { type: 'TRAVEL', label: '✈️ Journeys & Travels' },
                  { type: 'MILITARY', label: '🎖️ Military Service' },
                  { type: 'CUSTOM', label: '📝 Custom Stories' },
                ].map((cat) => {
                  const isChecked = lifeFactsConfig.includedFactTypes?.includes(cat.type as any);
                  return (
                    <label key={cat.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        style={{ accentColor: 'var(--primary-color)' }}
                        onChange={(e) => {
                          const current = lifeFactsConfig.includedFactTypes || [];
                          const next = e.target.checked
                            ? [...current, cat.type as any]
                            : current.filter((t) => t !== cat.type);
                          setLifeFactsConfig({ includedFactTypes: next });
                        }}
                      />
                      <span>{cat.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 5. Kinship in Media Gallery Configuration                             */}
      {/* --------------------------------------------------------------------- */}
      <div style={cardStyle} id="section-gallery-kinship">
        <div
          style={sectionHeaderStyle}
          onClick={() => toggleSection('galleryKinship')}
          id="section-header-gallery-kinship"
        >
          <div>
            <div style={sectionTitleStyle}>
              <span>🖼️</span> {t('settingsGalleryKinshipTitle') || 'Kinship in Media Gallery Configuration'}
              <span className="badge-pill badge-pill-accent" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 6 }}>NEW</span>
            </div>
            <div style={sectionSubtextStyle}>
              {t('settingsGalleryKinshipDesc') || 'Configure which life facts and milestones are included in the media gallery for chained persons'}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              transform: expandedSections.galleryKinship ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              marginLeft: 12,
            }}
          >
            ▼
          </span>
        </div>

        {expandedSections.galleryKinship && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4 }}>
            {/* 1. Master Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={galleryKinshipFactsConfig.enabled}
                  onChange={(e) => {
                    const next = { ...galleryKinshipFactsConfig, enabled: e.target.checked };
                    setGalleryKinshipFactsConfig(next);
                    fetch('/api/family-tree/public/gallery-facts-config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(next),
                    }).catch(() => {});
                  }}
                  style={{ accentColor: 'var(--primary-color)' }}
                />
                <span>{t('galleryFactsEnable') || 'Include Kinship Facts in Media Gallery'}</span>
              </label>
            </div>

            {/* 2. Facts Scope Selector */}
            <div style={{ opacity: galleryKinshipFactsConfig.enabled ? 1 : 0.5, pointerEvents: galleryKinshipFactsConfig.enabled ? 'auto' : 'none' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>
                {language === 'ru' ? '1. Охват событий для отмеченных персон' : '1. Facts Scope for Chained Persons'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {[
                  {
                    scope: 'OWN' as const,
                    icon: '👤',
                    title: t('galleryFactsScopeOwn') || 'Only own facts',
                    desc: language === 'ru' ? 'Только факты самой отмеченной персоны' : 'Only milestones directly belonging to tagged persons',
                  },
                  {
                    scope: 'CLOSEST_FAMILY' as const,
                    icon: '👨‍👩‍👧‍👦',
                    title: t('galleryFactsScopeClosest') || 'Own and closest family members',
                    desc: language === 'ru' ? 'Факты персоны, а также родителей, детей, супругов и братьев/сестёр' : 'Milestones for tagged person plus parents, spouse, children, siblings',
                  },
                  {
                    scope: 'ALL' as const,
                    icon: '🌐',
                    title: t('galleryFactsScopeAll') || 'All relatives in tree',
                    desc: language === 'ru' ? 'Факты всех родственников семейного древа' : 'Milestones for all connected genealogical members in tree',
                  },
                ].map((item) => {
                  const isSelected = galleryKinshipFactsConfig.scope === item.scope;
                  return (
                    <div
                      key={item.scope}
                      id={`scope-${item.scope.toLowerCase()}`}
                      onClick={() => {
                        const next = { ...galleryKinshipFactsConfig, scope: item.scope };
                        setGalleryKinshipFactsConfig(next);
                        fetch('/api/family-tree/public/gallery-facts-config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(next),
                        }).catch(() => {});
                      }}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: isSelected ? '2px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                        background: isSelected ? 'var(--nav-tab-active-bg)' : 'var(--nav-tab-bg)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{item.icon}</span>
                        <span>{item.title}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {item.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Date Closeness & Threshold Period */}
            <div style={{ opacity: galleryKinshipFactsConfig.enabled ? 1 : 0.5, pointerEvents: galleryKinshipFactsConfig.enabled ? 'auto' : 'none', borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={galleryKinshipFactsConfig.onlyCloseEvents}
                  onChange={(e) => {
                    const next = { ...galleryKinshipFactsConfig, onlyCloseEvents: e.target.checked };
                    setGalleryKinshipFactsConfig(next);
                    fetch('/api/family-tree/public/gallery-facts-config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(next),
                    }).catch(() => {});
                  }}
                  style={{ accentColor: 'var(--primary-color)' }}
                />
                <span>📅 {t('galleryFactsOnlyClose') || 'Only include facts when date is close (Birthday, Marriage, Anniversary, Memorial)'}</span>
              </label>

              {galleryKinshipFactsConfig.onlyCloseEvents && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 24 }}>
                  {/* Closeness Event Types */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {language === 'ru' ? 'Типы событий для отображения по близости даты:' : 'Included Close Event Types:'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {[
                        { type: 'BIRTH', label: '🎂 ' + (language === 'ru' ? 'День рождения' : 'Birthday') },
                        { type: 'MARRIAGE', label: '💍 ' + (language === 'ru' ? 'Свадьба' : 'Marriage') },
                        { type: 'ANNIVERSARY', label: '🥂 ' + (language === 'ru' ? 'Годовщина' : 'Anniversary') },
                        { type: 'DEATH', label: '🕯️ ' + (language === 'ru' ? 'День памяти / Кончина' : 'Memorial / Passing') },
                      ].map((evt) => {
                        const isChecked = (galleryKinshipFactsConfig.closeEventTypes || ['BIRTH', 'MARRIAGE', 'ANNIVERSARY', 'DEATH']).includes(evt.type);
                        return (
                          <label key={evt.type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              style={{ accentColor: 'var(--primary-color)' }}
                              onChange={(e) => {
                                const curr = galleryKinshipFactsConfig.closeEventTypes || ['BIRTH', 'MARRIAGE', 'ANNIVERSARY', 'DEATH'];
                                const updated = e.target.checked
                                  ? [...curr, evt.type]
                                  : curr.filter((t) => t !== evt.type);
                                const next = { ...galleryKinshipFactsConfig, closeEventTypes: updated };
                                setGalleryKinshipFactsConfig(next);
                                fetch('/api/family-tree/public/gallery-facts-config', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(next),
                                }).catch(() => {});
                              }}
                            />
                            <span>{evt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Period Before Date Threshold Slider */}
                  <div style={{ maxWidth: 420 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {t('galleryFactsPeriodBefore') || 'Notification period before date'}:
                      </label>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-color)' }}>
                        {galleryKinshipFactsConfig.periodBeforeDays} {language === 'ru' ? 'дн.' : 'days'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        type="range"
                        min="1"
                        max="90"
                        value={galleryKinshipFactsConfig.periodBeforeDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const next = { ...galleryKinshipFactsConfig, periodBeforeDays: val };
                          setGalleryKinshipFactsConfig(next);
                        }}
                        onMouseUp={() => {
                          fetch('/api/family-tree/public/gallery-facts-config', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(galleryKinshipFactsConfig),
                          }).catch(() => {});
                        }}
                        style={{ flex: 1, accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                      />
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={galleryKinshipFactsConfig.periodBeforeDays}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 1));
                          const next = { ...galleryKinshipFactsConfig, periodBeforeDays: val };
                          setGalleryKinshipFactsConfig(next);
                          fetch('/api/family-tree/public/gallery-facts-config', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(next),
                          }).catch(() => {});
                        }}
                        style={{
                          width: 60,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border-color)',
                          background: 'var(--input-bg)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          textAlign: 'center',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {language === 'ru'
                        ? `События будут отображаться в галерее медиа, если до их наступления осталось от 0 до ${galleryKinshipFactsConfig.periodBeforeDays} дн.`
                        : `Events will appear in media gallery if their date is within 0 to ${galleryKinshipFactsConfig.periodBeforeDays} days in advance.`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 6. Export / Import Tree (CSV) */}
      {/* --------------------------------------------------------------------- */}
      <div style={cardStyle} id="section-csv-backup">
        <div
          style={sectionHeaderStyle}
          onClick={() => toggleSection('csvBackup')}
          id="section-header-csv-backup"
        >
          <div>
            <div style={sectionTitleStyle}>
              <span>📁</span> {t('settingsCsvBackupTitle') || 'Export & Import Family Tree (.csv)'}
            </div>
            <div style={sectionSubtextStyle}>
              {t('settingsCsvBackupDesc')}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              transform: expandedSections.csvBackup ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              marginLeft: 12,
            }}
          >
            ▼
          </span>
        </div>

        {expandedSections.csvBackup && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, paddingTop: 4 }}>
            {/* Export Section */}
            <div
              style={{
                background: 'var(--nav-tab-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                📤 {language === 'ru' ? 'Экспорт текущего древа' : 'Export Current Tree'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {language === 'ru'
                  ? `Скачать все персоны (${graphData?.persons?.length || 0}) и семейные союзы (${graphData?.unions?.length || 0}) в виде CSV файла.`
                  : `Download all ${graphData?.persons?.length || 0} persons and ${graphData?.unions?.length || 0} family unions as a comma-separated CSV file.`}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  📥 {t('btnExportCsv')}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSample}
                  style={{
                    background: 'var(--card-bg-solid)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Download sample template CSV"
                >
                  📄 {t('btnDownloadSampleCsv')}
                </button>
              </div>
            </div>

            {/* Import Section */}
            <div
              style={{
                background: 'var(--nav-tab-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                📥 {language === 'ru' ? 'Импорт древа из CSV' : 'Import Tree from CSV'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {language === 'ru'
                  ? 'Выберите файл .csv или вставьте содержимое CSV ниже для импорта членов семьи и союзов.'
                  : 'Select a .csv file or paste CSV content below to import members and unions into this tree.'}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: 'var(--card-bg-solid)',
                    border: '1px dashed var(--primary-color, #6366f1)',
                    color: 'var(--text-primary)',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  📂 {t('btnChooseCsvFile')}
                </button>
              </div>

              {/* Validation & Diff Review Card */}
              {validationResult && (
                <div
                  style={{
                    background: validationResult.isValid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${validationResult.isValid ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                    borderRadius: 10,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: validationResult.isValid ? '#10b981' : '#ef4444' }}>
                      {validationResult.isValid
                        ? `✅ ${language === 'ru' ? 'Проверка пройдена' : 'Validation Passed'}`
                        : `❌ ${language === 'ru' ? 'Ошибки валидации' : 'Validation Failed'} (${validationResult.errors.length})`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDiffDetails((prev) => !prev)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--primary-color, #6366f1)',
                        fontSize: 12,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {showDiffDetails
                        ? (language === 'ru' ? 'Скрыть детали' : 'Hide details')
                        : (language === 'ru' ? 'Показать детали изменений' : 'Show change details')}
                    </button>
                  </div>

                  {/* Errors */}
                  {validationResult.errors.length > 0 && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.15)', borderRadius: 6, padding: '8px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#ef4444', marginBottom: 4 }}>
                        {language === 'ru' ? 'Блокирующие ошибки:' : 'Blocking Errors:'}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#ef4444' }}>
                        {validationResult.errors.map((err, idx) => (
                          <li key={idx} style={{ marginBottom: 2 }}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warnings */}
                  {validationResult.warnings.length > 0 && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.12)', borderRadius: 6, padding: '8px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b', marginBottom: 4 }}>
                        {language === 'ru' ? 'Предупреждения:' : 'Warnings:'}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#f59e0b' }}>
                        {validationResult.warnings.map((warn, idx) => (
                          <li key={idx} style={{ marginBottom: 2 }}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Diff Summary Badges */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--nav-tab-bg)', border: '1px solid var(--border-color)' }}>
                        👤 <strong>{language === 'ru' ? 'Персоны' : 'Persons'}:</strong> +{validationResult.diff.personsToCreate.length} {language === 'ru' ? 'новых' : 'new'}, ✏️ {validationResult.diff.personsToUpdate.length} {language === 'ru' ? 'обновлений' : 'update'}, ⚪ {validationResult.diff.personsUnchanged} {language === 'ru' ? 'без изм.' : 'unchanged'}
                      </span>
                      <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--nav-tab-bg)', border: '1px solid var(--border-color)' }}>
                        💍 <strong>{language === 'ru' ? 'Союзы' : 'Unions'}:</strong> +{validationResult.diff.unionsToCreate.length} {language === 'ru' ? 'новых' : 'new'}, ✏️ {validationResult.diff.unionsToUpdate.length} {language === 'ru' ? 'обновлений' : 'update'}, ⚪ {validationResult.diff.unionsUnchanged} {language === 'ru' ? 'без изм.' : 'unchanged'}
                      </span>
                      <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--nav-tab-bg)', border: '1px solid var(--border-color)' }}>
                        📜 <strong>{language === 'ru' ? 'События' : 'Facts'}:</strong> +{validationResult.diff.factsToCreate.length} {language === 'ru' ? 'новых' : 'new'}, ✏️ {validationResult.diff.factsToUpdate.length} {language === 'ru' ? 'обновлений' : 'update'}, ⚪ {validationResult.diff.factsUnchanged} {language === 'ru' ? 'без изм.' : 'unchanged'}
                      </span>
                    </div>

                    {/* Granular Diff Review List */}
                    {showDiffDetails && (
                      <div
                        style={{
                          marginTop: 6,
                          maxHeight: 180,
                          overflowY: 'auto',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 11,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        {validationResult.diff.personsToUpdate.map((p, idx) => (
                          <div key={`p-up-${idx}`} style={{ color: 'var(--primary-color)' }}>
                            ✏️ <strong>Person "{p.name}"</strong>: {p.details}
                          </div>
                        ))}
                        {validationResult.diff.unionsToUpdate.map((u, idx) => (
                          <div key={`u-up-${idx}`} style={{ color: '#0ea5e9' }}>
                            ✏️ <strong>Union</strong>: {u.details}
                          </div>
                        ))}
                        {validationResult.diff.factsToUpdate.map((f, idx) => (
                          <div key={`f-up-${idx}`} style={{ color: '#f59e0b' }}>
                            ✏️ <strong>Fact "{f.name}"</strong>: {f.details}
                          </div>
                        ))}
                        {validationResult.diff.personsToCreate.map((p, idx) => (
                          <div key={`p-cr-${idx}`} style={{ color: '#10b981' }}>
                            + <strong>New Person "{p.name}"</strong>: {p.details}
                          </div>
                        ))}
                        {validationResult.diff.personsToUpdate.length === 0 &&
                          validationResult.diff.personsToCreate.length === 0 &&
                          validationResult.diff.unionsToUpdate.length === 0 &&
                          validationResult.diff.unionsToCreate.length === 0 && (
                            <div style={{ color: 'var(--text-muted)' }}>
                              {language === 'ru' ? 'Все данные совпадают с текущим древом (нет изменений).' : 'All records match current tree (no changes).'}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Import Status Message */}
              {importStatusMessage && !validationResult && (
                <div
                  style={{
                    fontSize: 12,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background:
                      importStatusType === 'success'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : importStatusType === 'error'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'var(--nav-tab-active-bg)',
                    color:
                      importStatusType === 'success'
                        ? 'var(--success-color, #10b981)'
                        : importStatusType === 'error'
                        ? 'var(--error-color, #ef4444)'
                        : 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {importStatusMessage}
                </div>
              )}

              {importStats && importStats.personsCount > 0 && (
                <button
                  type="button"
                  disabled={isImporting || (validationResult !== null && !validationResult.isValid)}
                  onClick={handleExecuteImport}
                  style={{
                    background:
                      validationResult !== null && !validationResult.isValid
                        ? 'var(--border-color)'
                        : 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: validationResult !== null && !validationResult.isValid ? 'not-allowed' : 'pointer',
                    marginTop: 'auto',
                    boxShadow: validationResult !== null && !validationResult.isValid ? 'none' : '0 2px 8px rgba(99, 102, 241, 0.3)',
                  }}
                  title={
                    validationResult !== null && !validationResult.isValid
                      ? 'Resolve validation errors to enable import'
                      : 'Commit import and merge changes'
                  }
                >
                  {isImporting
                    ? '...'
                    : `${t('btnCommitCsvImport')} (${importStats.personsCount} ${language === 'ru' ? 'персон' : 'persons'}, ${importStats.unionsCount} ${language === 'ru' ? 'союзов' : 'unions'})`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tree History & Audit Log Sub-Section */}
        {expandedSections.csvBackup && (
          <div
            style={{
              marginTop: 16,
              borderTop: '1px solid var(--border-color)',
              paddingTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📜</span> {language === 'ru' ? 'История изменений и журнал древа' : 'Tree History & Audit Trail'}
                {historyList.length > 0 && (
                  <span style={{ fontSize: 11, background: 'var(--nav-tab-active-bg)', padding: '2px 6px', borderRadius: 10, color: 'var(--text-secondary)' }}>
                    {historyList.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (getTreeHistory && activeTreeId) {
                    setIsLoadingHistory(true);
                    try {
                      const items = await getTreeHistory(activeTreeId, 25);
                      if (Array.isArray(items)) setHistoryList(items);
                    } finally {
                      setIsLoadingHistory(false);
                    }
                  }
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                🔄 {isLoadingHistory ? '...' : (language === 'ru' ? 'Обновить историю' : 'Refresh History')}
              </button>
            </div>

            {historyList.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                {language === 'ru'
                  ? 'История изменений пока пуста. После импорта CSV или обновлений здесь будут сохраняться записи аудита.'
                  : 'No tree history recorded yet. When CSV is imported or entities updated, audit events will appear here.'}
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  background: 'var(--nav-tab-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {historyList.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 12,
                      borderBottom: '1px solid var(--border-color)',
                      paddingBottom: 6,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: h.action_type === 'CSV_IMPORT' ? 'rgba(99, 102, 241, 0.2)' : 'var(--nav-tab-active-bg)',
                            color: h.action_type === 'CSV_IMPORT' ? 'var(--primary-color, #6366f1)' : 'var(--text-primary)',
                          }}
                        >
                          {h.action_type}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {h.created_at ? new Date(h.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontSize: 12 }}>{h.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 7. Export to PNG / JPG / SVG for Tree and Timeline                    */}
      {/* --------------------------------------------------------------------- */}
      <div style={cardStyle} id="section-export-tree-timeline">
        <div
          style={sectionHeaderStyle}
          onClick={() => toggleSection('exportMedia')}
          id="section-header-export-media"
        >
          <div>
            <div style={sectionTitleStyle}>
              <span>🖼️</span> {t('exportSectionTitle') || 'Export to PNG/JPG/SVG for Tree and Timeline'}
              <span className="badge-pill badge-pill-accent" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 6 }}>NEW</span>
            </div>
            <div style={sectionSubtextStyle}>
              {t('exportSectionDesc')}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              transform: expandedSections.exportMedia ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              marginLeft: 12,
            }}
          >
            ▼
          </span>
        </div>

        {expandedSections.exportMedia && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4 }}>
            {/* Subtabs: Export Tree | Export Timeline */}
            <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border-color)', paddingBottom: 14 }}>
              <button
                type="button"
                onClick={() => setExportTab('tree')}
                style={{
                  background: exportTab === 'tree' ? 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))' : 'var(--nav-tab-bg)',
                  color: exportTab === 'tree' ? '#ffffff' : 'var(--text-primary)',
                  border: exportTab === 'tree' ? 'none' : '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  boxShadow: exportTab === 'tree' ? '0 2px 8px rgba(99, 102, 241, 0.35)' : undefined,
                }}
              >
                <span>🌳</span>
                <span>{t('exportTabTree')}</span>
              </button>

              <button
                type="button"
                onClick={() => setExportTab('timeline')}
                style={{
                  background: exportTab === 'timeline' ? 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))' : 'var(--nav-tab-bg)',
                  color: exportTab === 'timeline' ? '#ffffff' : 'var(--text-primary)',
                  border: exportTab === 'timeline' ? 'none' : '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  boxShadow: exportTab === 'timeline' ? '0 2px 8px rgba(99, 102, 241, 0.35)' : undefined,
                }}
              >
                <span>⏳</span>
                <span>{t('exportTabTimeline')}</span>
              </button>
            </div>

            {/* Export Configuration Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {/* Format Selection */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('exportFormatLabel')}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['png', 'jpeg', 'svg'] as ExportImageFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setExportFormat(fmt)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: exportFormat === fmt ? '1px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                        background: exportFormat === fmt ? 'var(--nav-tab-active-bg)' : 'var(--input-bg)',
                        color: exportFormat === fmt ? 'var(--primary-color, #818cf8)' : 'var(--text-primary)',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                    >
                      {fmt === 'jpeg' ? 'JPG' : fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality Preset */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('exportQualityLabel')}
                </label>
                <select
                  value={exportQuality}
                  onChange={(e) => setExportQuality(e.target.value as ExportQualityPreset)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="high">{t('exportQualityHigh')}</option>
                  <option value="ultra">{t('exportQualityUltra')}</option>
                  <option value="standard">{t('exportQualityStandard')}</option>
                </select>
              </div>

              {/* Background Style */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('exportBackgroundLabel')}
                </label>
                <select
                  value={exportBg}
                  onChange={(e) => setExportBg(e.target.value as ExportBackgroundStyle)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="theme">{t('exportBgTheme')}</option>
                  <option value="dark">{t('exportBgDark')}</option>
                  <option value="light">{t('exportBgLight')}</option>
                  {exportFormat !== 'jpeg' && <option value="transparent">{t('exportBgTransparent')}</option>}
                </select>
              </div>
            </div>

            {/* TAB 1: TREE EXPORT DETAILS */}
            {exportTab === 'tree' && (
              <div
                style={{
                  background: 'var(--nav-tab-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                  <span>ℹ️</span>
                  <span>{t('exportCurrentSettingsNotice')}</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span className="badge-pill badge-pill-accent">
                    Style: {nodeViewStyle.toUpperCase()}
                  </span>
                  <span className="badge-pill badge-pill-success">
                    {graphData?.persons?.length || 0} {t('countPersonsSuffix')}
                  </span>
                  <span className="badge-pill badge-pill-accent">
                    {graphData?.unions?.length || 0} {t('countUnionsSuffix')}
                  </span>
                  <span className="badge-pill badge-pill-success">
                    Celebration Badges: {celebrationConfig.showBirthday ? 'ON' : 'OFF'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExecuteExportTree}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 22px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)',
                  }}
                >
                  <span>💾</span>
                  <span>{isExporting ? t('exportExporting') : `${t('exportBtnExportTree')} (${exportFormat.toUpperCase()})`}</span>
                </button>
              </div>
            )}

            {/* TAB 2: TIMELINE EXPORT DETAILS */}
            {exportTab === 'timeline' && (
              <div
                style={{
                  background: 'var(--nav-tab-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {language === 'ru' ? 'Персона для экспорта' : 'Person to Export'}
                  </label>
                  <select
                    value={selectedExportPersonId}
                    onChange={(e) => setSelectedExportPersonId(e.target.value)}
                    style={{
                      width: '100%',
                      maxWidth: 360,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border-color)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {graphData?.persons?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name || ''} {p.birth_date ? `(${p.birth_date.slice(0, 4)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Timeline Render & Capture Preview Container */}
                <div
                  ref={timelineCaptureRef}
                  className="timeline-export-capture-container"
                  style={{
                    background: exportBg === 'dark' ? '#0f172a' : exportBg === 'light' ? '#ffffff' : 'var(--card-bg-solid, #1e293b)',
                    color: exportBg === 'light' ? '#0f172a' : exportBg === 'dark' ? '#f8fafc' : 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: 20,
                    maxWidth: 720,
                  }}
                >
                  {(() => {
                    const activePerson = graphData?.persons?.find((p) => p.id === selectedExportPersonId) || graphData?.persons?.[0];
                    if (!activePerson) return <p>No person selected</p>;
                    const pName = `${activePerson.first_name || ''} ${activePerson.last_name || ''}`.trim();
                    return (
                      <div>
                        {/* Person Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
                          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#ffffff', fontWeight: 700 }}>
                            {activePerson.first_name?.[0] || '👤'}
                          </div>
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{pName}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              {activePerson.birth_date ? `* ${activePerson.birth_date}` : ''} {activePerson.death_date ? `✝ ${activePerson.death_date}` : ''}
                            </div>
                          </div>
                          <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 12, background: 'var(--nav-tab-active-bg)', color: 'var(--primary-color, #818cf8)' }}>
                            {previewEvents.length} {t('timelineMilestonesCount')}
                          </div>
                        </div>

                        {/* Chronological events list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {previewEvents.length === 0 ? (
                            <div style={{ padding: '12px 0', opacity: 0.6, fontSize: 12 }}>
                              {t('noFactsRecordedInCategory')}
                            </div>
                          ) : (
                            previewEvents.map((evt, i) => (
                              <div
                                key={evt.id || i}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 12,
                                  padding: '10px 14px',
                                  borderRadius: 8,
                                  background: exportBg === 'light' ? 'rgba(0, 0, 0, 0.03)' : 'var(--nav-tab-bg)',
                                  border: '1px solid var(--border-color)',
                                  color: 'inherit',
                                }}
                              >
                                <span style={{ fontSize: 16 }}>{evt.event_type === 'BIRTH' ? '👶' : evt.event_type === 'MARRIAGE' ? '💍' : evt.event_type === 'DEATH' ? '🕯️' : '📌'}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13 }}>{evt.title}</span>
                                    <span style={{ fontSize: 11, opacity: 0.7 }}>{evt.event_date || ''}</span>
                                  </div>
                                  {evt.description && (
                                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                                      {evt.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExecuteExportTimeline}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 22px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)',
                  }}
                >
                  <span>💾</span>
                  <span>{isExporting ? t('exportExporting') : `${t('exportBtnExportTimeline')} (${exportFormat.toUpperCase()})`}</span>
                </button>
              </div>
            )}

            {/* Status Feedback banner */}
            {exportFeedback && (
              <div
                style={{
                  fontSize: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background:
                    exportFeedback.type === 'success'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : exportFeedback.type === 'error'
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'var(--nav-tab-active-bg)',
                  color:
                    exportFeedback.type === 'success'
                      ? 'var(--success-color, #10b981)'
                      : exportFeedback.type === 'error'
                      ? 'var(--error-color, #ef4444)'
                      : 'var(--primary-color, #6366f1)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {exportFeedback.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

