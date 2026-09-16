import type {
  TreeGraphPerson,
  TreeGraphData,
  Gender,
  FiliationType,
  KinshipCategory,
} from '../types/tree.types.js';

interface AncestorNode {
  personId: string;
  depth: number;
  filiation?: FiliationType;
  path: string[];
}

interface KinshipResult {
  primaryTerm: string;
  category: KinshipCategory;
  generationalDistance: number;
}

/**
 * Traverses upwards through child relations and union partners to collect all ancestors with generational depth.
 */
function getAncestorsWithDepth(personId: string, graphData: TreeGraphData): Map<string, AncestorNode> {
  const ancestors = new Map<string, AncestorNode>();
  const queue: Array<{ id: string; depth: number; path: string[] }> = [
    { id: personId, depth: 0, path: [personId] },
  ];
  const visited = new Set<string>([personId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const u of graphData.unions) {
      const childRelation = u.children.find((c) => c.person_id === current.id);
      if (childRelation) {
        for (const parentId of u.partner_ids) {
          if (!visited.has(parentId)) {
            visited.add(parentId);
            const nextDepth = current.depth + 1;
            const nextPath = [...current.path, parentId];
            ancestors.set(parentId, {
              personId: parentId,
              depth: nextDepth,
              filiation: childRelation.filiation,
              path: nextPath,
            });
            queue.push({ id: parentId, depth: nextDepth, path: nextPath });
          }
        }
      }
    }
  }

  return ancestors;
}

/**
 * Helper to collect all spouse/partner person IDs for a given person.
 */
function getSpouseIds(personId: string, graphData: TreeGraphData): string[] {
  const sIds: string[] = [];
  for (const u of graphData.unions) {
    if (u.partner_ids.includes(personId)) {
      for (const id of u.partner_ids) {
        if (id !== personId && !sIds.includes(id)) {
          sIds.push(id);
        }
      }
    }
  }
  return sIds;
}

/**
 * 1. Checks if target is direct spouse or partner of root.
 */
function checkDirectSpouse(
  rootId: string,
  targetId: string,
  targetGender: Gender,
  graphData: TreeGraphData
): KinshipResult | null {
  const union = graphData.unions.find(
    (u) => u.partner_ids.includes(rootId) && u.partner_ids.includes(targetId)
  );
  if (!union) return null;

  let term = 'Spouse';
  if (union.union_type === 'DIVORCED') {
    term = targetGender === 'MALE' ? 'Ex-Husband' : targetGender === 'FEMALE' ? 'Ex-Wife' : 'Ex-Spouse';
  } else {
    term = targetGender === 'MALE' ? 'Husband' : targetGender === 'FEMALE' ? 'Wife' : 'Spouse';
  }

  return { primaryTerm: term, category: 'SPOUSE_PARTNER', generationalDistance: 0 };
}

/**
 * 2. Checks if target is direct parent or child of root.
 */
function checkDirectParentChild(
  rootId: string,
  targetId: string,
  targetGender: Gender,
  graphData: TreeGraphData
): KinshipResult | null {
  // Target as child of root
  for (const u of graphData.unions) {
    if (u.partner_ids.includes(rootId)) {
      const child = u.children.find((c) => c.person_id === targetId);
      if (child) {
        const isAdopted = child.filiation === 'ADOPTED';
        const isStep = child.filiation === 'STEP';
        const term = targetGender === 'MALE' ? 'Son' : targetGender === 'FEMALE' ? 'Daughter' : 'Child';
        const prefix = isAdopted ? 'Adopted ' : isStep ? 'Step-' : '';
        return {
          primaryTerm: `${prefix}${term}`,
          category: isStep ? 'AFFINITY' : 'DIRECT_DESCENDANT',
          generationalDistance: -1,
        };
      }
    }
  }

  // Root as child of target
  for (const u of graphData.unions) {
    if (u.partner_ids.includes(targetId)) {
      const child = u.children.find((c) => c.person_id === rootId);
      if (child) {
        const isAdopted = child.filiation === 'ADOPTED';
        const isStep = child.filiation === 'STEP';
        const term = targetGender === 'MALE' ? 'Father' : targetGender === 'FEMALE' ? 'Mother' : 'Parent';
        const prefix = isAdopted ? 'Adoptive ' : isStep ? 'Step-' : '';
        return {
          primaryTerm: `${prefix}${term}`,
          category: isStep ? 'AFFINITY' : 'DIRECT_ANCESTOR',
          generationalDistance: 1,
        };
      }
    }
  }

  return null;
}

/**
 * 3. Consanguineous Kinship via Lowest Common Ancestor (LCA).
 */
function checkConsanguinity(
  rootId: string,
  targetId: string,
  targetGender: Gender,
  graphData: TreeGraphData
): KinshipResult | null {
  const ancestorsRoot = getAncestorsWithDepth(rootId, graphData);
  const ancestorsTarget = getAncestorsWithDepth(targetId, graphData);

  // Case A: Target is a direct ancestor of Root
  if (ancestorsRoot.has(targetId)) {
    const node = ancestorsRoot.get(targetId)!;
    const g = node.depth;
    const isAdopted = node.filiation === 'ADOPTED';
    const isStep = node.filiation === 'STEP';
    let term = '';
    if (g === 1) {
      term = targetGender === 'MALE' ? 'Father' : targetGender === 'FEMALE' ? 'Mother' : 'Parent';
    } else if (g === 2) {
      term = targetGender === 'MALE' ? 'Grandfather' : targetGender === 'FEMALE' ? 'Grandmother' : 'Grandparent';
    } else if (g === 3) {
      term = targetGender === 'MALE' ? 'Great-Grandfather' : targetGender === 'FEMALE' ? 'Great-Grandmother' : 'Great-Grandparent';
    } else {
      const prefix = `${g - 2}x Great-`;
      term = targetGender === 'MALE' ? `${prefix}Grandfather` : targetGender === 'FEMALE' ? `${prefix}Grandmother` : `${prefix}Grandparent`;
    }
    const prefix = isAdopted ? 'Adoptive ' : isStep ? 'Step-' : '';
    return {
      primaryTerm: `${prefix}${term}`,
      category: isStep ? 'AFFINITY' : 'DIRECT_ANCESTOR',
      generationalDistance: g,
    };
  }

  // Case B: Target is a direct descendant of Root (Root is an ancestor of Target)
  if (ancestorsTarget.has(rootId)) {
    const node = ancestorsTarget.get(rootId)!;
    const g = node.depth;
    const isAdopted = node.filiation === 'ADOPTED';
    const isStep = node.filiation === 'STEP';
    let term = '';
    if (g === 1) {
      term = targetGender === 'MALE' ? 'Son' : targetGender === 'FEMALE' ? 'Daughter' : 'Child';
    } else if (g === 2) {
      term = targetGender === 'MALE' ? 'Grandson' : targetGender === 'FEMALE' ? 'Granddaughter' : 'Grandchild';
    } else if (g === 3) {
      term = targetGender === 'MALE' ? 'Great-Grandson' : targetGender === 'FEMALE' ? 'Great-Granddaughter' : 'Great-Grandchild';
    } else {
      const prefix = `${g - 2}x Great-`;
      term = targetGender === 'MALE' ? `${prefix}Grandson` : targetGender === 'FEMALE' ? `${prefix}Granddaughter` : `${prefix}Grandchild`;
    }
    const prefix = isAdopted ? 'Adopted ' : isStep ? 'Step-' : '';
    return {
      primaryTerm: `${prefix}${term}`,
      category: isStep ? 'AFFINITY' : 'DIRECT_DESCENDANT',
      generationalDistance: -g,
    };
  }

  // Case C: Collateral relatives sharing at least one common ancestor
  const commonAncestorIds: string[] = [];
  for (const ancId of ancestorsRoot.keys()) {
    if (ancestorsTarget.has(ancId)) {
      commonAncestorIds.push(ancId);
    }
  }

  if (commonAncestorIds.length === 0) return null;

  let bestLcaId = commonAncestorIds[0];
  let minDistance = Infinity;
  for (const ancId of commonAncestorIds) {
    const dist = ancestorsRoot.get(ancId)!.depth + ancestorsTarget.get(ancId)!.depth;
    if (dist < minDistance) {
      minDistance = dist;
      bestLcaId = ancId;
    }
  }

  const gRoot = ancestorsRoot.get(bestLcaId)!.depth;
  const gTarget = ancestorsTarget.get(bestLcaId)!.depth;

  // Siblings: gRoot === 1 && gTarget === 1
  if (gRoot === 1 && gTarget === 1) {
    const sharedParentCount = commonAncestorIds.filter(
      (id) => ancestorsRoot.get(id)!.depth === 1 && ancestorsTarget.get(id)!.depth === 1
    ).length;
    const isHalf = sharedParentCount === 1;
    const prefix = isHalf ? 'Half-' : '';
    const term = targetGender === 'MALE' ? 'Brother' : targetGender === 'FEMALE' ? 'Sister' : 'Sibling';
    return {
      primaryTerm: `${prefix}${term}`,
      category: 'COLLATERAL',
      generationalDistance: 0,
    };
  }

  // Aunt / Uncle (gRoot >= 2 && gTarget === 1)
  if (gRoot >= 2 && gTarget === 1) {
    const prefix = gRoot === 2 ? '' : gRoot === 3 ? 'Great-' : `${gRoot - 2}x Great-`;
    const term = targetGender === 'MALE' ? 'Uncle' : targetGender === 'FEMALE' ? 'Aunt' : 'Aunt / Uncle';
    return {
      primaryTerm: `${prefix}${term}`,
      category: 'COLLATERAL',
      generationalDistance: gRoot - 1,
    };
  }

  // Nephew / Niece (gRoot === 1 && gTarget >= 2)
  if (gRoot === 1 && gTarget >= 2) {
    const prefix = gTarget === 2 ? '' : gTarget === 3 ? 'Great-' : `${gTarget - 2}x Great-`;
    const term = targetGender === 'MALE' ? 'Nephew' : targetGender === 'FEMALE' ? 'Niece' : 'Niece / Nephew';
    return {
      primaryTerm: `${prefix}${term}`,
      category: 'COLLATERAL',
      generationalDistance: -(gTarget - 1),
    };
  }

  // Cousins
  const cousinDegree = Math.min(gRoot, gTarget) - 1;
  const removal = Math.abs(gRoot - gTarget);
  const ordinalStr =
    cousinDegree === 1 ? '1st' : cousinDegree === 2 ? '2nd' : cousinDegree === 3 ? '3rd' : `${cousinDegree}th`;
  const removalStr =
    removal === 0 ? '' : removal === 1 ? ' Once Removed' : removal === 2 ? ' Twice Removed' : ` ${removal}x Removed`;

  return {
    primaryTerm: `${ordinalStr} Cousin${removalStr}`,
    category: 'COLLATERAL',
    generationalDistance: gRoot - gTarget,
  };
}

/**
 * 4. Affinity & In-Law Relationships (via Spouses and Step-relations).
 */
function checkAffinity(
  rootId: string,
  targetId: string,
  targetGender: Gender,
  graphData: TreeGraphData
): KinshipResult | null {
  // 1. Spouses of Root
  const rootSpouseIds = getSpouseIds(rootId, graphData);
  for (const sId of rootSpouseIds) {
    const spouseKinship = checkConsanguinity(sId, targetId, targetGender, graphData);
    if (spouseKinship) {
      // Direct Ancestor of Spouse (e.g. spouse's father is Father-in-law)
      if (spouseKinship.category === 'DIRECT_ANCESTOR') {
        if (spouseKinship.generationalDistance === 1) {
          const term = targetGender === 'MALE' ? 'Father-in-law' : targetGender === 'FEMALE' ? 'Mother-in-law' : 'Parent-in-law';
          return { primaryTerm: term, category: 'AFFINITY', generationalDistance: 1 };
        }
        if (spouseKinship.generationalDistance === 2) {
          const term = targetGender === 'MALE' ? 'Grandfather-in-law' : targetGender === 'FEMALE' ? 'Grandmother-in-law' : 'Grandparent-in-law';
          return { primaryTerm: term, category: 'AFFINITY', generationalDistance: 2 };
        }
        if (spouseKinship.generationalDistance >= 3) {
          const prefix = spouseKinship.generationalDistance === 3 ? 'Great-' : `${spouseKinship.generationalDistance - 2}x Great-`;
          const term = targetGender === 'MALE' ? 'Grandfather-in-law' : targetGender === 'FEMALE' ? 'Grandmother-in-law' : 'Grandparent-in-law';
          return { primaryTerm: `${prefix}${term}`, category: 'AFFINITY', generationalDistance: spouseKinship.generationalDistance };
        }
      }

      // Sibling of Spouse (spouse's brother/sister is Brother-in-law / Sister-in-law)
      if (
        spouseKinship.category === 'COLLATERAL' &&
        spouseKinship.generationalDistance === 0 &&
        (spouseKinship.primaryTerm.includes('Brother') ||
          spouseKinship.primaryTerm.includes('Sister') ||
          spouseKinship.primaryTerm.includes('Sibling'))
      ) {
        const term = targetGender === 'MALE' ? 'Brother-in-law' : targetGender === 'FEMALE' ? 'Sister-in-law' : 'Sibling-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: 0 };
      }

      // Aunt / Uncle of Spouse
      if (
        spouseKinship.category === 'COLLATERAL' &&
        (spouseKinship.primaryTerm.includes('Uncle') || spouseKinship.primaryTerm.includes('Aunt'))
      ) {
        const term = targetGender === 'MALE' ? 'Uncle-in-law' : targetGender === 'FEMALE' ? 'Aunt-in-law' : 'Aunt / Uncle-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: spouseKinship.generationalDistance };
      }

      // Nephew / Niece of Spouse
      if (
        spouseKinship.category === 'COLLATERAL' &&
        (spouseKinship.primaryTerm.includes('Nephew') || spouseKinship.primaryTerm.includes('Niece'))
      ) {
        const term = targetGender === 'MALE' ? 'Nephew-in-law' : targetGender === 'FEMALE' ? 'Niece-in-law' : 'Niece / Nephew-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: spouseKinship.generationalDistance };
      }

      // Direct Descendant of Spouse (not shared with root) -> Step-child
      if (spouseKinship.category === 'DIRECT_DESCENDANT') {
        if (spouseKinship.generationalDistance === -1) {
          const term = targetGender === 'MALE' ? 'Step-son' : targetGender === 'FEMALE' ? 'Step-daughter' : 'Step-child';
          return { primaryTerm: term, category: 'AFFINITY', generationalDistance: -1 };
        }
        if (spouseKinship.generationalDistance === -2) {
          const term = targetGender === 'MALE' ? 'Step-grandson' : targetGender === 'FEMALE' ? 'Step-granddaughter' : 'Step-grandchild';
          return { primaryTerm: term, category: 'AFFINITY', generationalDistance: -2 };
        }
      }
    }
  }

  // 2. Spouses of Target (Target is married to a relative of root)
  const targetSpouseIds = getSpouseIds(targetId, graphData);
  for (const tSpouseId of targetSpouseIds) {
    const rootToSpouse = checkConsanguinity(rootId, tSpouseId, 'UNKNOWN', graphData);
    if (rootToSpouse) {
      // Spouse of root's sibling (Brother's wife, Sister's husband)
      if (
        rootToSpouse.category === 'COLLATERAL' &&
        rootToSpouse.generationalDistance === 0 &&
        (rootToSpouse.primaryTerm.includes('Brother') ||
          rootToSpouse.primaryTerm.includes('Sister') ||
          rootToSpouse.primaryTerm.includes('Sibling'))
      ) {
        const term = targetGender === 'MALE' ? 'Brother-in-law' : targetGender === 'FEMALE' ? 'Sister-in-law' : 'Sibling-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: 0 };
      }

      // Spouse of root's child (Daughter's husband = Son-in-law, Son's wife = Daughter-in-law)
      if (rootToSpouse.category === 'DIRECT_DESCENDANT' && rootToSpouse.generationalDistance === -1) {
        const term = targetGender === 'MALE' ? 'Son-in-law' : targetGender === 'FEMALE' ? 'Daughter-in-law' : 'Child-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: -1 };
      }

      // Spouse of root's grandchild
      if (rootToSpouse.category === 'DIRECT_DESCENDANT' && rootToSpouse.generationalDistance === -2) {
        const term = targetGender === 'MALE' ? 'Grandson-in-law' : targetGender === 'FEMALE' ? 'Granddaughter-in-law' : 'Grandchild-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: -2 };
      }

      // Spouse of root's parent (not root's parent) -> Step-parent
      if (rootToSpouse.category === 'DIRECT_ANCESTOR' && rootToSpouse.generationalDistance === 1) {
        const term = targetGender === 'MALE' ? 'Step-father' : targetGender === 'FEMALE' ? 'Step-mother' : 'Step-parent';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: 1 };
      }

      // Spouse of root's aunt / uncle
      if (
        rootToSpouse.category === 'COLLATERAL' &&
        (rootToSpouse.primaryTerm.includes('Uncle') || rootToSpouse.primaryTerm.includes('Aunt'))
      ) {
        const term = targetGender === 'MALE' ? 'Uncle-in-law' : targetGender === 'FEMALE' ? 'Aunt-in-law' : 'Aunt / Uncle-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: rootToSpouse.generationalDistance };
      }

      // Spouse of root's nephew / niece
      if (
        rootToSpouse.category === 'COLLATERAL' &&
        (rootToSpouse.primaryTerm.includes('Nephew') || rootToSpouse.primaryTerm.includes('Niece'))
      ) {
        const term = targetGender === 'MALE' ? 'Nephew-in-law' : targetGender === 'FEMALE' ? 'Niece-in-law' : 'Niece / Nephew-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: rootToSpouse.generationalDistance };
      }
    }
  }

  // 3. Spouse's Sibling's Spouse (Co-in-laws, e.g. spouse's brother's wife)
  for (const sId of rootSpouseIds) {
    for (const tSpouseId of targetSpouseIds) {
      const spouseToTSpouse = checkConsanguinity(sId, tSpouseId, 'UNKNOWN', graphData);
      if (
        spouseToTSpouse &&
        spouseToTSpouse.category === 'COLLATERAL' &&
        spouseToTSpouse.generationalDistance === 0 &&
        (spouseToTSpouse.primaryTerm.includes('Brother') ||
          spouseToTSpouse.primaryTerm.includes('Sister') ||
          spouseToTSpouse.primaryTerm.includes('Sibling'))
      ) {
        const term = targetGender === 'MALE' ? 'Brother-in-law' : targetGender === 'FEMALE' ? 'Sister-in-law' : 'Sibling-in-law';
        return { primaryTerm: term, category: 'AFFINITY', generationalDistance: 0 };
      }
    }
  }

  // 4. Step-Siblings (Parent is married to a partner who has children from another union)
  const rootParentIds = new Set<string>();
  for (const u of graphData.unions) {
    if (u.children.some((c) => c.person_id === rootId)) {
      for (const pid of u.partner_ids) rootParentIds.add(pid);
    }
  }
  for (const pId of rootParentIds) {
    const pSpouseIds = getSpouseIds(pId, graphData);
    for (const pSpouse of pSpouseIds) {
      if (!rootParentIds.has(pSpouse)) {
        for (const u of graphData.unions) {
          if (u.partner_ids.includes(pSpouse) && u.children.some((c) => c.person_id === targetId)) {
            const term = targetGender === 'MALE' ? 'Step-brother' : targetGender === 'FEMALE' ? 'Step-sister' : 'Step-sibling';
            return { primaryTerm: term, category: 'AFFINITY', generationalDistance: 0 };
          }
        }
      }
    }
  }

  return null;
}

/**
 * 5. Shortest path BFS across unions and child relations.
 */
function checkGraphPath(rootId: string, targetId: string, graphData: TreeGraphData): string | null {
  const queue: Array<{ id: string; dist: number }> = [{ id: rootId, dist: 0 }];
  const visited = new Set<string>([rootId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === targetId) {
      return current.dist <= 3 ? 'Relative' : 'Distant Relative';
    }

    const neighbors: string[] = [];
    for (const u of graphData.unions) {
      if (u.partner_ids.includes(current.id)) {
        for (const pid of u.partner_ids) {
          if (pid !== current.id) neighbors.push(pid);
        }
        for (const c of u.children) {
          neighbors.push(c.person_id);
        }
      }
      if (u.children.some((c) => c.person_id === current.id)) {
        for (const pid of u.partner_ids) {
          neighbors.push(pid);
        }
      }
    }

    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push({ id: n, dist: current.dist + 1 });
      }
    }
  }

  return null;
}

/**
 * Computes the familial relationship of a target person to the Root ("ME") person in the family tree.
 * Returns exact kinship terms such as "Me", "Father", "Mother", "Father-in-law", "Mother-in-law",
 * "Son", "Daughter", "Brother", "Sister", "Brother-in-law", "Sister-in-law", "Grandfather", etc.
 */
export function computeRelationshipToRoot(person: TreeGraphPerson, graphData: TreeGraphData): string {
  const rootId = graphData.root_person_id;
  if (!rootId) return 'Relative';
  if (person.id === rootId) return 'Me';

  // If already computed by backend kinship engine (and not generic fallback)
  if (person.kinship_to_root && person.kinship_to_root !== 'Relative') {
    return person.kinship_to_root;
  }

  const targetGender = person.gender;

  // 1. Direct Spouses / Partners of Root
  const spouseRel = checkDirectSpouse(rootId, person.id, targetGender, graphData);
  if (spouseRel) return spouseRel.primaryTerm;

  // 2. Direct Parents / Children of Root
  const parentChildRel = checkDirectParentChild(rootId, person.id, targetGender, graphData);
  if (parentChildRel) return parentChildRel.primaryTerm;

  // 3. Consanguinity Kinship via LCA (Ancestors, Descendants, Siblings, Aunts/Uncles, Nieces/Nephews, Cousins)
  const bloodRel = checkConsanguinity(rootId, person.id, targetGender, graphData);
  if (bloodRel) return bloodRel.primaryTerm;

  // 4. Affinity & In-Laws (Father-in-law, Mother-in-law, Brother-in-law, Sister-in-law, Son-in-law, etc.)
  const affinityRel = checkAffinity(rootId, person.id, targetGender, graphData);
  if (affinityRel) return affinityRel.primaryTerm;

  // 5. Fallback Shortest Graph Path
  const pathRel = checkGraphPath(rootId, person.id, graphData);
  if (pathRel) return pathRel;

  return 'Relative';
}

const KINSHIP_TERMS_RU: Record<string, string> = {
  'Me': 'Я',
  'Relative': 'Родственник',
  'Father': 'Отец',
  'Mother': 'Мать',
  'Parent': 'Родитель',
  'Son': 'Сын',
  'Daughter': 'Дочь',
  'Child': 'Ребёнок',
  'Husband': 'Муж',
  'Wife': 'Жена',
  'Spouse': 'Супруг(а)',
  'Ex-Husband': 'Бывший муж',
  'Ex-Wife': 'Бывшая жена',
  'Ex-Spouse': 'Бывший(ая) супруг(а)',
  'Partner': 'Партнёр',
  'Brother': 'Брат',
  'Sister': 'Сестра',
  'Sibling': 'Брат / Сестра',
  'Grandfather': 'Дедушка',
  'Grandmother': 'Бабушка',
  'Grandson': 'Внук',
  'Granddaughter': 'Внучка',
  'Grandparent': 'Дедушка / Бабушка',
  'Grandchild': 'Внук / Внучка',
  'Great-Grandfather': 'Прадедушка',
  'Great-Grandmother': 'Прабабушка',
  'Great-Grandson': 'Правнук',
  'Great-Granddaughter': 'Правнучка',
  'Great-Grandparent': 'Прадедушка / Прабабушка',
  'Great-Grandchild': 'Правнук / Правнучка',
  'Great-Great-Grandfather': 'Прапрадедушка',
  'Great-Great-Grandmother': 'Прапрабабушка',
  'Great-Great-Grandson': 'Праправнук',
  'Great-Great-Granddaughter': 'Праправнучка',
  'Uncle': 'Дядя',
  'Aunt': 'Тётя',
  'Nephew': 'Племянник',
  'Niece': 'Племянница',
  'Cousin': 'Двоюродный брат / сестра',
  'Father-in-law': 'Свёкор / Тесть',
  'Mother-in-law': 'Свекровь / Тёща',
  'Brother-in-law': 'Шурин / Деверь / Зять',
  'Sister-in-law': 'Золовка / Свояченица / Невестка',
  'Son-in-law': 'Зять',
  'Daughter-in-law': 'Невестка / Сноха',
  'Stepfather': 'Отчим',
  'Stepmother': 'Мачеха',
  'Stepson': 'Пасынок',
  'Stepdaughter': 'Падчерица',
};

/**
 * Localizes kinship relation terms into Russian or English.
 */
export function localizeKinshipTerm(term?: string | null, language: 'en' | 'ru' = 'en'): string {
  if (!term) return '';
  if (language === 'ru') {
    return KINSHIP_TERMS_RU[term] || term;
  }
  return term;
}

/**
 * Localizes kinship categories into readable strings.
 */
export function localizeKinshipCategory(category?: KinshipCategory | string | null, language: 'en' | 'ru' = 'en'): string {
  if (!category) return '';
  if (language === 'ru') {
    switch (category) {
      case 'SELF': return 'Я / Корень';
      case 'SPOUSE_PARTNER': return 'Супруг(а) / Партнёр';
      case 'DIRECT_ANCESTOR': return 'Прямой предок';
      case 'DIRECT_DESCENDANT': return 'Прямой потомок';
      case 'COLLATERAL': return 'Боковая ветвь';
      case 'AFFINITY': return 'Свойство / Родство по браку';
      case 'DISTANT': return 'Дальнее родство';
      case 'UNKNOWN': return 'Неизвестно';
      case 'SIBLING': return 'Брат / Сестра';
      case 'IN_LAW': return 'Свойство / Родство по браку';
      case 'STEP': return 'Сводное родство';
      default: return String(category).replace('_', ' ');
    }
  }
  return String(category).replace('_', ' ');
}

