import type { TreeGraphData, Gender, UnionType, FiliationType } from '../types/tree.types.js';

function escapeCsvField(field?: string | number | null): string {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Export full family tree graph into a standardized CSV string.
 */
export function exportTreeToCSV(graphData: TreeGraphData): string {
  const lines: string[] = [];

  // Section 1: Persons
  lines.push('# PERSONS');
  lines.push('id,first_name,middle_name,last_name,maiden_name,gender,birth_date,birth_place,is_living,death_date,death_place,bio');

  for (const p of graphData.persons) {
    lines.push([
      escapeCsvField(p.id),
      escapeCsvField(p.first_name),
      escapeCsvField(p.middle_name),
      escapeCsvField(p.last_name),
      escapeCsvField(p.maiden_name),
      escapeCsvField(p.gender),
      escapeCsvField(p.birth_date),
      escapeCsvField(p.birth_place),
      escapeCsvField(p.is_living),
      escapeCsvField(p.death_date),
      escapeCsvField(p.death_place),
      escapeCsvField(p.bio),
    ].join(','));
  }

  lines.push('');

  // Section 2: Unions & Children
  lines.push('# UNIONS');
  lines.push('id,union_type,partner_ids,start_date,start_place,end_date,notes,children');

  for (const u of graphData.unions) {
    const partnerIdsStr = u.partner_ids.join(';');
    const childrenStr = (u.children || [])
      .map((c) => `${c.person_id}:${c.filiation || 'BIOLOGICAL'}:${c.birth_order || 0}`)
      .join(';');

    lines.push([
      escapeCsvField(u.id),
      escapeCsvField(u.union_type),
      escapeCsvField(partnerIdsStr),
      escapeCsvField(u.start_date),
      escapeCsvField(u.start_place),
      escapeCsvField(u.end_date),
      escapeCsvField(u.notes),
      escapeCsvField(childrenStr),
    ].join(','));
  }

  lines.push('');

  // Section 3: Facts
  lines.push('# FACTS');
  lines.push('id,person_id,event_type,title,description,event_date,end_date,date_is_approximate,location_name,relationship_target_name,relationship_status');

  if (graphData.facts && graphData.facts.length > 0) {
    for (const f of graphData.facts) {
      lines.push([
        escapeCsvField(f.id),
        escapeCsvField(f.person_id),
        escapeCsvField(f.event_type),
        escapeCsvField(f.title),
        escapeCsvField(f.description),
        escapeCsvField(f.event_date),
        escapeCsvField(f.end_date),
        escapeCsvField(f.date_is_approximate),
        escapeCsvField(f.location_name),
        escapeCsvField(f.relationship_target_name),
        escapeCsvField(f.relationship_status),
      ].join(','));
    }
  }

  return lines.join('\n');
}

/**
 * Trigger download of CSV in browser.
 */
export function downloadTreeCSV(graphData: TreeGraphData, filename?: string): void {
  const csv = exportTreeToCSV(graphData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `family_tree_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ParsedCsvTree {
  persons: Array<{
    id: string;
    first_name: string;
    middle_name?: string;
    last_name?: string;
    maiden_name?: string;
    gender: Gender;
    birth_date?: string;
    birth_place?: string;
    is_living: boolean;
    death_date?: string;
    death_place?: string;
    bio?: string;
  }>;
  unions: Array<{
    id?: string;
    union_type: UnionType;
    partner_ids: string[];
    partner1_id?: string;
    partner2_id?: string;
    children_ids?: string[];
    start_date?: string;
    start_place?: string;
    end_date?: string;
    notes?: string;
    children: Array<{
      person_id: string;
      filiation: FiliationType;
      birth_order: number;
    }>;
  }>;
  facts?: Array<{
    id?: string;
    person_id: string;
    event_type: string;
    title: string;
    description?: string;
    event_date?: string;
    end_date?: string;
    date_is_approximate?: boolean;
    location_name?: string;
    relationship_target_name?: string;
    relationship_status?: string;
  }>;
}

/**
 * Parse CSV text containing persons and unions.
 */
export function parseTreeFromCSV(csvText: string): ParsedCsvTree {
  const lines = csvText.split(/\r?\n/);
  const result: ParsedCsvTree = { persons: [], unions: [] };

  let currentSection: 'PERSONS' | 'UNIONS' | 'FACTS' | 'UNKNOWN' = 'UNKNOWN';
  let personHeaderIndexMap: Record<string, number> = {};
  let unionHeaderIndexMap: Record<string, number> = {};
  let factHeaderIndexMap: Record<string, number> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# PERSONS')) {
      currentSection = 'PERSONS';
      personHeaderIndexMap = {};
      continue;
    }

    if (line.startsWith('# UNIONS')) {
      currentSection = 'UNIONS';
      unionHeaderIndexMap = {};
      continue;
    }

    if (line.startsWith('# FACTS')) {
      currentSection = 'FACTS';
      factHeaderIndexMap = {};
      continue;
    }

    if (line.startsWith('#')) continue; // comments

    const cols = parseCsvLine(line);

    if (currentSection === 'PERSONS') {
      if (Object.keys(personHeaderIndexMap).length === 0 && cols.includes('first_name')) {
        cols.forEach((col, idx) => {
          personHeaderIndexMap[col.toLowerCase()] = idx;
        });
        continue;
      }

      const getVal = (key: string): string => {
        const idx = personHeaderIndexMap[key];
        return idx !== undefined && cols[idx] ? cols[idx] : '';
      };

      const firstName = getVal('first_name') || cols[1] || 'Unknown';
      const id = getVal('id') || cols[0] || `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const gender = (getVal('gender') || 'UNKNOWN').toUpperCase() as Gender;
      const isLivingStr = getVal('is_living');
      const isLiving = isLivingStr === '' || isLivingStr === '1' || isLivingStr.toLowerCase() === 'true';

      result.persons.push({
        id,
        first_name: firstName,
        middle_name: getVal('middle_name') || undefined,
        last_name: getVal('last_name') || undefined,
        maiden_name: getVal('maiden_name') || undefined,
        gender: ['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'UNKNOWN'].includes(gender) ? gender : 'UNKNOWN',
        birth_date: getVal('birth_date') || undefined,
        birth_place: getVal('birth_place') || undefined,
        is_living: isLiving,
        death_date: !isLiving ? getVal('death_date') || undefined : undefined,
        death_place: !isLiving ? getVal('death_place') || undefined : undefined,
        bio: getVal('bio') || undefined,
      });
    } else if (currentSection === 'UNIONS') {
      if (Object.keys(unionHeaderIndexMap).length === 0 && cols.includes('union_type')) {
        cols.forEach((col, idx) => {
          unionHeaderIndexMap[col.toLowerCase()] = idx;
        });
        continue;
      }

      const getVal = (key: string): string => {
        const idx = unionHeaderIndexMap[key];
        return idx !== undefined && cols[idx] ? cols[idx] : '';
      };

      const uId = getVal('id') || cols[0] || undefined;
      const uTypeStr = (getVal('union_type') || cols[1] || 'MARRIAGE').toUpperCase();
      const unionType = ['MARRIAGE', 'CIVIL_UNION', 'PARTNERSHIP', 'DIVORCED', 'SEPARATED'].includes(uTypeStr)
        ? (uTypeStr as UnionType)
        : 'MARRIAGE';

      const partnerIdsStr = getVal('partner_ids') || cols[2] || '';
      const partnerIds = partnerIdsStr.split(';').map((p) => p.trim()).filter(Boolean);

      const childrenStr = getVal('children') || cols[7] || '';
      const children = childrenStr
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((item) => {
          const parts = item.split(':');
          return {
            person_id: parts[0],
            filiation: (parts[1] || 'BIOLOGICAL').toUpperCase() as FiliationType,
            birth_order: parseInt(parts[2], 10) || 0,
          };
        });

      result.unions.push({
        id: uId,
        union_type: unionType,
        partner_ids: partnerIds,
        partner1_id: partnerIds[0],
        partner2_id: partnerIds[1],
        children_ids: children.map((c) => c.person_id),
        start_date: getVal('start_date') || undefined,
        start_place: getVal('start_place') || undefined,
        end_date: getVal('end_date') || undefined,
        notes: getVal('notes') || undefined,
        children,
      });
    } else if (currentSection === 'FACTS') {
      if (Object.keys(factHeaderIndexMap).length === 0 && (cols.includes('event_type') || cols.includes('title'))) {
        cols.forEach((col, idx) => {
          factHeaderIndexMap[col.toLowerCase()] = idx;
        });
        continue;
      }

      const getVal = (key: string): string => {
        const idx = factHeaderIndexMap[key];
        return idx !== undefined && cols[idx] ? cols[idx] : '';
      };

      const pId = getVal('person_id') || cols[1];
      if (!pId) continue;

      if (!result.facts) result.facts = [];
      result.facts.push({
        id: getVal('id') || cols[0] || undefined,
        person_id: pId,
        event_type: getVal('event_type') || cols[2] || 'CUSTOM',
        title: getVal('title') || cols[3] || 'Event',
        description: getVal('description') || cols[4] || undefined,
        event_date: getVal('event_date') || cols[5] || undefined,
        end_date: getVal('end_date') || cols[6] || undefined,
        date_is_approximate: getVal('date_is_approximate') === '1' || getVal('date_is_approximate').toLowerCase() === 'true',
        location_name: getVal('location_name') || cols[8] || undefined,
        relationship_target_name: getVal('relationship_target_name') || cols[9] || undefined,
        relationship_status: getVal('relationship_status') || cols[10] || undefined,
      });
    }
  }

  return result;
}

/**
 * Generate a template CSV string for users to easily fill in.
 */
export function getSampleTreeCSV(): string {
  return `# PERSONS
id,first_name,middle_name,last_name,maiden_name,gender,birth_date,birth_place,is_living,death_date,death_place,bio
p_1,Alexander,James,Smith,,MALE,1955-03-20,Chicago IL,1,,,Founder and architect
p_2,Mary,Elizabeth,Smith,Davis,FEMALE,1958-07-14,Springfield IL,1,,,Artist and teacher
p_3,David,Alexander,Smith,,MALE,1984-11-02,Chicago IL,1,,,Engineer and photographer
p_4,Sarah,Jane,Johnson,Smith,FEMALE,1987-05-18,Chicago IL,1,,,Writer and traveler
p_5,Jessica,Anne,Taylor,,FEMALE,1960-09-08,Boston MA,1,,,Former spouse

# UNIONS
id,union_type,partner_ids,start_date,start_place,end_date,notes,children
u_1,MARRIAGE,p_1;p_2,1980-06-21,Chicago IL,,,p_3:BIOLOGICAL:1;p_4:BIOLOGICAL:2
u_2,DIVORCED,p_1;p_5,1976-05-10,Boston MA,1979-11-04,Amicable separation,

# FACTS
id,person_id,event_type,title,description,event_date,end_date,date_is_approximate,location_name,relationship_target_name,relationship_status
evt_1,p_1,GRADUATION,Architecture Degree,Graduated with honors,1978-06-15,,,MIT,Boston MA,
evt_2,p_3,CAREER,Senior Engineer,Promoted to Lead Architect,2015-04-01,,,Tech Corp,Chicago IL,
`;
}

export interface CsvDiffItem {
  id?: string;
  name?: string;
  status: 'CREATE' | 'UPDATE' | 'UNCHANGED';
  changedFields?: string[];
  details?: string;
}

export interface CsvDiffSummary {
  personsToCreate: CsvDiffItem[];
  personsToUpdate: CsvDiffItem[];
  personsUnchanged: number;

  unionsToCreate: CsvDiffItem[];
  unionsToUpdate: CsvDiffItem[];
  unionsUnchanged: number;

  factsToCreate: CsvDiffItem[];
  factsToUpdate: CsvDiffItem[];
  factsUnchanged: number;
}

export interface CsvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  diff: CsvDiffSummary;
}

function normalizeField(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Validate parsed tree CSV data and generate a granular diff against the current tree graph.
 */
export function validateTreeCSV(
  parsed: ParsedCsvTree,
  currentGraph?: TreeGraphData | null,
): CsvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const diff: CsvDiffSummary = {
    personsToCreate: [],
    personsToUpdate: [],
    personsUnchanged: 0,
    unionsToCreate: [],
    unionsToUpdate: [],
    unionsUnchanged: 0,
    factsToCreate: [],
    factsToUpdate: [],
    factsUnchanged: 0,
  };

  // 1. Structure & Non-Empty Check
  if (!parsed.persons || parsed.persons.length === 0) {
    errors.push('No persons found in CSV (# PERSONS section is missing or has no rows).');
  }

  // 2. Duplicate IDs in CSV Check
  const csvPersonIds = new Set<string>();
  for (const p of parsed.persons) {
    if (p.id) {
      if (csvPersonIds.has(p.id)) {
        errors.push(`Duplicate person ID "${p.id}" found in CSV.`);
      } else {
        csvPersonIds.add(p.id);
      }
    }
  }

  const csvUnionIds = new Set<string>();
  for (const u of parsed.unions) {
    if (u.id) {
      if (csvUnionIds.has(u.id)) {
        errors.push(`Duplicate union ID "${u.id}" found in CSV.`);
      } else {
        csvUnionIds.add(u.id);
      }
    }
  }

  const csvFactIds = new Set<string>();
  if (parsed.facts) {
    for (const f of parsed.facts) {
      if (f.id) {
        if (csvFactIds.has(f.id)) {
          errors.push(`Duplicate fact/event ID "${f.id}" found in CSV.`);
        } else {
          csvFactIds.add(f.id);
        }
      }
    }
  }

  // 3. Available Person IDs set (CSV + Existing Graph)
  const existingPersonMap = new Map<string, any>();
  const existingSecondaryMap = new Map<string, any>();

  if (currentGraph?.persons && Array.isArray(currentGraph.persons)) {
    for (const ep of currentGraph.persons) {
      existingPersonMap.set(ep.id, ep);
      const fullNameKey = `${(ep.first_name || '').trim()} ${(ep.last_name || '').trim()} ${(ep.birth_date || '').trim()}`.toLowerCase();
      if (fullNameKey.trim()) {
        existingSecondaryMap.set(fullNameKey, ep);
      }
    }
  }

  const allAvailablePersonIds = new Set<string>([
    ...csvPersonIds,
    ...existingPersonMap.keys(),
  ]);

  // 4. Person Field Validation
  for (const p of parsed.persons) {
    const personName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id || 'Unnamed';
    if (!p.first_name || !p.first_name.trim()) {
      errors.push(`Person "${p.id}" is missing required field "first_name".`);
    }

    if (p.gender && !['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'UNKNOWN'].includes(p.gender)) {
      warnings.push(`Person "${personName}" (${p.id}) has unrecognized gender "${p.gender}". Will fallback to UNKNOWN.`);
    }

    if (p.birth_date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(p.birth_date)) {
      warnings.push(`Person "${personName}" (${p.id}) has non-standard birth date "${p.birth_date}". Recommended: YYYY-MM-DD or YYYY.`);
    }

    if (p.is_living && p.death_date) {
      warnings.push(`Person "${personName}" is marked as living (is_living=1), but has death date "${p.death_date}".`);
    }
  }

  // 5. Union Referential Integrity
  for (const u of parsed.unions) {
    const uLabel = u.id || `Union between [${u.partner_ids.join(', ')}]`;

    if (u.partner_ids.length === 0) {
      warnings.push(`${uLabel} has no partners listed.`);
    }

    for (const pid of u.partner_ids) {
      if (!allAvailablePersonIds.has(pid)) {
        errors.push(`${uLabel} references unknown partner ID "${pid}". Partner does not exist in CSV or existing tree.`);
      }
    }

    for (const c of u.children) {
      if (!allAvailablePersonIds.has(c.person_id)) {
        errors.push(`${uLabel} references unknown child ID "${c.person_id}". Child does not exist in CSV or existing tree.`);
      }
    }
  }

  // 6. Fact Referential Integrity
  if (parsed.facts) {
    for (const f of parsed.facts) {
      const fLabel = `Fact "${f.title || f.event_type}"`;
      if (!allAvailablePersonIds.has(f.person_id)) {
        errors.push(`${fLabel} references unknown person ID "${f.person_id}". Target person does not exist in CSV or existing tree.`);
      }
      if (!f.title || !f.title.trim()) {
        warnings.push(`${fLabel} for person "${f.person_id}" has an empty title.`);
      }
    }
  }

  // 7. Diff Computation Against Current Graph
  if (!currentGraph || !currentGraph.persons || currentGraph.persons.length === 0) {
    // Brand new tree import
    diff.personsToCreate = parsed.persons.map((p) => ({
      id: p.id,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id,
      status: 'CREATE',
      details: `${p.gender || 'UNKNOWN'}, born ${p.birth_date || 'N/A'}`,
    }));

    diff.unionsToCreate = parsed.unions.map((u) => ({
      id: u.id,
      status: 'CREATE',
      details: `${u.union_type || 'MARRIAGE'} with ${u.partner_ids.length} partner(s) and ${u.children.length} child(ren)`,
    }));

    if (parsed.facts) {
      diff.factsToCreate = parsed.facts.map((f) => ({
        id: f.id,
        name: f.title,
        status: 'CREATE',
        details: `${f.event_type} on ${f.event_date || 'N/A'}`,
      }));
    }
  } else {
    // Diff against existing tree records
    // A. Persons Diff
    for (const p of parsed.persons) {
      const pName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id;
      const fullNameKey = `${(p.first_name || '').trim()} ${(p.last_name || '').trim()} ${(p.birth_date || '').trim()}`.toLowerCase();
      const existing = existingPersonMap.get(p.id) || (fullNameKey.trim() ? existingSecondaryMap.get(fullNameKey) : undefined);

      if (existing) {
        const changedFields: string[] = [];
        if (normalizeField(p.first_name) !== normalizeField(existing.first_name)) changedFields.push('first_name');
        if (normalizeField(p.middle_name) !== normalizeField(existing.middle_name)) changedFields.push('middle_name');
        if (normalizeField(p.last_name) !== normalizeField(existing.last_name)) changedFields.push('last_name');
        if (normalizeField(p.maiden_name) !== normalizeField(existing.maiden_name)) changedFields.push('maiden_name');
        if (p.gender && p.gender !== existing.gender) changedFields.push('gender');
        if (normalizeField(p.birth_date) !== normalizeField(existing.birth_date)) changedFields.push('birth_date');
        if (normalizeField(p.birth_place) !== normalizeField(existing.birth_place)) changedFields.push('birth_place');
        const existingLiving = existing.is_living === 1 || existing.is_living === true;
        if (Boolean(p.is_living) !== existingLiving) changedFields.push('is_living');
        if (normalizeField(p.death_date) !== normalizeField(existing.death_date)) changedFields.push('death_date');
        if (normalizeField(p.death_place) !== normalizeField(existing.death_place)) changedFields.push('death_place');
        if (normalizeField(p.bio) !== normalizeField(existing.bio)) changedFields.push('bio');

        if (changedFields.length > 0) {
          diff.personsToUpdate.push({
            id: p.id,
            name: pName,
            status: 'UPDATE',
            changedFields,
            details: `Existing ID "${existing.id}". Updated fields: ${changedFields.join(', ')}`,
          });
        } else {
          diff.personsUnchanged++;
        }
      } else {
        diff.personsToCreate.push({
          id: p.id,
          name: pName,
          status: 'CREATE',
          details: `New person. ${p.gender || 'UNKNOWN'}, born ${p.birth_date || 'N/A'}`,
        });
      }
    }

    // B. Unions Diff
    const existingUnionMap = new Map<string, any>();
    const existingPartnersUnionMap = new Map<string, any>();

    if (currentGraph.unions && Array.isArray(currentGraph.unions)) {
      for (const eu of currentGraph.unions) {
        existingUnionMap.set(eu.id, eu);
        const partnerKey = [...(eu.partner_ids || [])].sort().join(';');
        if (partnerKey) {
          existingPartnersUnionMap.set(partnerKey, eu);
        }
      }
    }

    for (const u of parsed.unions) {
      const partnerKey = [...u.partner_ids].sort().join(';');
      const existingUnion = (u.id && existingUnionMap.get(u.id)) || (partnerKey ? existingPartnersUnionMap.get(partnerKey) : undefined);

      if (existingUnion) {
        const changedFields: string[] = [];
        if (u.union_type && u.union_type !== existingUnion.union_type) changedFields.push('union_type');
        if (normalizeField(u.start_date) !== normalizeField(existingUnion.start_date)) changedFields.push('start_date');
        if (normalizeField(u.start_place) !== normalizeField(existingUnion.start_place)) changedFields.push('start_place');
        if (normalizeField(u.end_date) !== normalizeField(existingUnion.end_date)) changedFields.push('end_date');
        if (normalizeField(u.notes) !== normalizeField(existingUnion.notes)) changedFields.push('notes');

        // Check if partner_ids changed
        const existingPartnerSet = new Set(existingUnion.partner_ids || []);
        const hasPartnerChanges = (u.partner_ids || []).length !== (existingUnion.partner_ids || []).length ||
          (u.partner_ids || []).some((pid) => !existingPartnerSet.has(pid));
        if (hasPartnerChanges) {
          changedFields.push('partner_ids');
        }

        // Check if new children to attach
        const existingChildIds = new Set((existingUnion.children || []).map((c: any) => c.person_id));
        const newChildren = u.children.filter((c) => !existingChildIds.has(c.person_id));
        if (newChildren.length > 0) {
          changedFields.push(`+${newChildren.length} new children`);
        }

        if (changedFields.length > 0) {
          diff.unionsToUpdate.push({
            id: u.id || existingUnion.id,
            status: 'UPDATE',
            changedFields,
            details: `Union (${existingUnion.id}). Changes: ${changedFields.join(', ')}`,
          });
        } else {
          diff.unionsUnchanged++;
        }
      } else {
        diff.unionsToCreate.push({
          id: u.id,
          status: 'CREATE',
          details: `${u.union_type || 'MARRIAGE'} with partners [${u.partner_ids.join(', ')}]`,
        });
      }
    }

    // C. Facts Diff
    const existingFactsMap = new Map<string, any>();
    const existingFactKeyMap = new Map<string, any>();

    if (currentGraph.facts && Array.isArray(currentGraph.facts)) {
      for (const ef of currentGraph.facts) {
        existingFactsMap.set(ef.id, ef);
        const fKey = `${ef.person_id}:${ef.event_type}:${(ef.title || '').trim().toLowerCase()}`;
        existingFactKeyMap.set(fKey, ef);
      }
    }

    if (parsed.facts) {
      for (const f of parsed.facts) {
        const fKey = `${f.person_id}:${f.event_type}:${(f.title || '').trim().toLowerCase()}`;
        const existingFact = (f.id && existingFactsMap.get(f.id)) || existingFactKeyMap.get(fKey);

        if (existingFact) {
          const changedFields: string[] = [];
          if (normalizeField(f.description) !== normalizeField(existingFact.description)) changedFields.push('description');
          if (normalizeField(f.event_date) !== normalizeField(existingFact.event_date)) changedFields.push('event_date');
          if (normalizeField(f.end_date) !== normalizeField(existingFact.end_date)) changedFields.push('end_date');
          if (normalizeField(f.location_name) !== normalizeField(existingFact.location_name)) changedFields.push('location_name');

          if (changedFields.length > 0) {
            diff.factsToUpdate.push({
              id: f.id || existingFact.id,
              name: f.title,
              status: 'UPDATE',
              changedFields,
              details: `Fact on person "${f.person_id}". Changes: ${changedFields.join(', ')}`,
            });
          } else {
            diff.factsUnchanged++;
          }
        } else {
          diff.factsToCreate.push({
            id: f.id,
            name: f.title,
            status: 'CREATE',
            details: `${f.event_type} for person "${f.person_id}" on ${f.event_date || 'N/A'}`,
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    diff,
  };
}

