import { Injectable, Inject } from '@nestjs/common';
import { FamilyTreeDatabaseService } from './family-tree-db.service.js';
import type {
  KinshipInfo,
  Gender,
  FiliationType,
  PersonRecord,
} from './types/family-tree.types.js';

interface AncestorNode {
  personId: string;
  depth: number;
  filiation: FiliationType;
  path: string[];
}

@Injectable()
export class KinshipEngineService {
  constructor(
    @Inject(FamilyTreeDatabaseService) private readonly dbService: FamilyTreeDatabaseService,
  ) {}

  /**
   * Computes the kinship relationship of targetPersonId relative to rootPersonId.
   */
  public calculateKinship(rootPersonId: string, targetPersonId: string): KinshipInfo {
    if (!rootPersonId || !targetPersonId) {
      return this.unknownKinship();
    }

    if (rootPersonId === targetPersonId) {
      return {
        primaryTerm: 'Self',
        category: 'SELF',
        degreeOfConsanguinity: 0,
        generationalDistance: 0,
        isDirectBlood: true,
        pathDescription: 'Self',
        details: 'Anchor person',
      };
    }

    const targetPerson = this.getPerson(targetPersonId);
    const rootPerson = this.getPerson(rootPersonId);
    if (!targetPerson || !rootPerson) {
      return this.unknownKinship();
    }

    const targetGender = targetPerson.gender;

    // 1. Direct Spouses / Partners
    const spouseRel = this.checkSpouse(rootPersonId, targetPersonId, targetGender);
    if (spouseRel) return spouseRel;

    // 2. Direct Parent / Child
    const parentChildRel = this.checkDirectParentChild(rootPersonId, targetPersonId, targetGender);
    if (parentChildRel) return parentChildRel;

    // 3. Consanguineous / Blood Kinship via Lowest Common Ancestor (LCA)
    const bloodRel = this.checkConsanguinity(rootPersonId, targetPersonId, targetGender);
    if (bloodRel) return bloodRel;

    // 4. Affinity & In-Laws (Via Spouses & Step-relations)
    const affinityRel = this.checkAffinity(rootPersonId, targetPersonId, targetGender);
    if (affinityRel) return affinityRel;

    // 5. Fallback Shortest Path
    const pathRel = this.checkGraphPath(rootPersonId, targetPersonId);
    if (pathRel) return pathRel;

    return this.unknownKinship();
  }

  private getPerson(personId: string): PersonRecord | null {
    const db = this.dbService.getDb();
    return (db.prepare('SELECT * FROM ft_persons WHERE id = ?').get(personId) as PersonRecord) || null;
  }

  private checkSpouse(rootId: string, targetId: string, gender: Gender): KinshipInfo | null {
    const db = this.dbService.getDb();
    const unionRow = db
      .prepare(`
        SELECT u.union_type
        FROM ft_unions u
        JOIN ft_union_partners up1 ON u.id = up1.union_id
        JOIN ft_union_partners up2 ON u.id = up2.union_id
        WHERE up1.person_id = ? AND up2.person_id = ?
        LIMIT 1
      `)
      .get(rootId, targetId) as { union_type: string } | undefined;

    if (unionRow) {
      let term = 'Spouse';
      if (unionRow.union_type === 'DIVORCED') {
        term = gender === 'MALE' ? 'Ex-Husband' : gender === 'FEMALE' ? 'Ex-Wife' : 'Ex-Spouse';
      } else {
        term = gender === 'MALE' ? 'Husband' : gender === 'FEMALE' ? 'Wife' : 'Partner / Spouse';
      }

      return {
        primaryTerm: term,
        category: 'SPOUSE_PARTNER',
        degreeOfConsanguinity: 0,
        generationalDistance: 0,
        isDirectBlood: false,
        pathDescription: `${term}`,
        details: unionRow.union_type,
      };
    }

    return null;
  }

  private checkDirectParentChild(rootId: string, targetId: string, targetGender: Gender): KinshipInfo | null {
    const db = this.dbService.getDb();

    // Check if target is child of root
    const targetAsChild = db
      .prepare(`
        SELECT cr.filiation
        FROM ft_child_relations cr
        JOIN ft_union_partners up ON cr.union_id = up.union_id
        WHERE up.person_id = ? AND cr.person_id = ?
        LIMIT 1
      `)
      .get(rootId, targetId) as { filiation: FiliationType } | undefined;

    if (targetAsChild) {
      const isAdopted = targetAsChild.filiation === 'ADOPTED';
      const isStep = targetAsChild.filiation === 'STEP';
      let prefix = isAdopted ? 'Adopted ' : isStep ? 'Step-' : '';
      let term = targetGender === 'MALE' ? 'Son' : targetGender === 'FEMALE' ? 'Daughter' : 'Child';

      return {
        primaryTerm: `${prefix}${term}`,
        category: isStep ? 'AFFINITY' : 'DIRECT_DESCENDANT',
        degreeOfConsanguinity: isAdopted || isStep ? 0 : 1,
        generationalDistance: -1,
        isDirectBlood: !isAdopted && !isStep,
        pathDescription: `${prefix}${term}`,
        details: `Filiation: ${targetAsChild.filiation}`,
      };
    }

    // Check if target is parent of root
    const rootAsChild = db
      .prepare(`
        SELECT cr.filiation
        FROM ft_child_relations cr
        JOIN ft_union_partners up ON cr.union_id = up.union_id
        WHERE up.person_id = ? AND cr.person_id = ?
        LIMIT 1
      `)
      .get(targetId, rootId) as { filiation: FiliationType } | undefined;

    if (rootAsChild) {
      const isAdopted = rootAsChild.filiation === 'ADOPTED';
      const isStep = rootAsChild.filiation === 'STEP';
      let prefix = isAdopted ? 'Adoptive ' : isStep ? 'Step-' : '';
      let term = targetGender === 'MALE' ? 'Father' : targetGender === 'FEMALE' ? 'Mother' : 'Parent';

      return {
        primaryTerm: `${prefix}${term}`,
        category: isStep ? 'AFFINITY' : 'DIRECT_ANCESTOR',
        degreeOfConsanguinity: isAdopted || isStep ? 0 : 1,
        generationalDistance: 1,
        isDirectBlood: !isAdopted && !isStep,
        pathDescription: `${prefix}${term}`,
        details: `Filiation: ${rootAsChild.filiation}`,
      };
    }

    return null;
  }

  private getAncestorsWithDepth(personId: string): Map<string, AncestorNode> {
    const db = this.dbService.getDb();
    const ancestors = new Map<string, AncestorNode>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
      { id: personId, depth: 0, path: [personId] },
    ];
    const visited = new Set<string>([personId]);

    const parentsStmt = db.prepare(`
      SELECT up.person_id, cr.filiation
      FROM ft_child_relations cr
      JOIN ft_unions u ON cr.union_id = u.id
      JOIN ft_union_partners up ON u.id = up.union_id
      WHERE cr.person_id = ?
    `);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const rows = parentsStmt.all(current.id) as Array<{ person_id: string; filiation: FiliationType }>;

      for (const row of rows) {
        const nextDepth = current.depth + 1;
        const nextPath = [...current.path, row.person_id];

        if (!visited.has(row.person_id)) {
          visited.add(row.person_id);
          ancestors.set(row.person_id, {
            personId: row.person_id,
            depth: nextDepth,
            filiation: row.filiation,
            path: nextPath,
          });
          queue.push({ id: row.person_id, depth: nextDepth, path: nextPath });
        }
      }
    }

    return ancestors;
  }

  private checkConsanguinity(rootId: string, targetId: string, targetGender: Gender): KinshipInfo | null {
    const ancestorsRoot = this.getAncestorsWithDepth(rootId);
    const ancestorsTarget = this.getAncestorsWithDepth(targetId);

    // Case A: Target is a direct ancestor of Root
    if (ancestorsRoot.has(targetId)) {
      const node = ancestorsRoot.get(targetId)!;
      const g = node.depth; // e.g. 2 = grandparent, 3 = great-grandparent
      const isAdopted = node.filiation === 'ADOPTED';
      const isStep = node.filiation === 'STEP';
      const isDirectBlood = !isAdopted && !isStep;
      const degree = isDirectBlood ? g : 0;

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

      return {
        primaryTerm: isAdopted ? `Adoptive ${term}` : isStep ? `Step-${term}` : term,
        category: 'DIRECT_ANCESTOR',
        degreeOfConsanguinity: degree,
        generationalDistance: g,
        isDirectBlood,
        pathDescription: `Ancestor (${g} gen)`,
      };
    }

    // Case B: Target is a direct descendant of Root (Root is ancestor of Target)
    if (ancestorsTarget.has(rootId)) {
      const node = ancestorsTarget.get(rootId)!;
      const g = node.depth;
      const isAdopted = node.filiation === 'ADOPTED';
      const isStep = node.filiation === 'STEP';
      const isDirectBlood = !isAdopted && !isStep;
      const degree = isDirectBlood ? g : 0;

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

      return {
        primaryTerm: isAdopted ? `Adopted ${term}` : isStep ? `Step-${term}` : term,
        category: 'DIRECT_DESCENDANT',
        degreeOfConsanguinity: degree,
        generationalDistance: -g,
        isDirectBlood,
        pathDescription: `Descendant (${g} gen)`,
      };
    }

    // Case C: Collateral relatives sharing at least one common ancestor
    const commonAncestorIds: string[] = [];
    for (const ancId of ancestorsRoot.keys()) {
      if (ancestorsTarget.has(ancId)) {
        commonAncestorIds.push(ancId);
      }
    }

    if (commonAncestorIds.length === 0) {
      return null;
    }

    // Find Lowest Common Ancestor (minimizing depthRoot + depthTarget)
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
    const genDiff = gRoot - gTarget;
    const degreeOfConsanguinity = gRoot + gTarget;

    // Check sibling / half-sibling
    if (gRoot === 1 && gTarget === 1) {
      const sharedParentCount = commonAncestorIds.filter(
        (id) => ancestorsRoot.get(id)!.depth === 1 && ancestorsTarget.get(id)!.depth === 1,
      ).length;

      const isHalf = sharedParentCount === 1;
      const prefix = isHalf ? 'Half-' : '';
      const term = targetGender === 'MALE' ? 'Brother' : targetGender === 'FEMALE' ? 'Sister' : 'Sibling';

      return {
        primaryTerm: `${prefix}${term}`,
        category: 'COLLATERAL',
        degreeOfConsanguinity: isHalf ? 2 : 2,
        generationalDistance: 0,
        isDirectBlood: true,
        pathDescription: `${prefix}${term}`,
        details: isHalf ? 'Shares 1 parent' : 'Shares 2 parents',
      };
    }

    // Aunt / Uncle (gRoot = 2, gTarget = 1)
    if (gRoot === 2 && gTarget === 1) {
      const term = targetGender === 'MALE' ? 'Uncle' : targetGender === 'FEMALE' ? 'Aunt' : 'Pibling';
      return {
        primaryTerm: term,
        category: 'COLLATERAL',
        degreeOfConsanguinity: degreeOfConsanguinity,
        generationalDistance: 1,
        isDirectBlood: true,
        pathDescription: term,
      };
    }

    // Great-Uncle / Great-Aunt (gRoot >= 3, gTarget = 1)
    if (gRoot >= 3 && gTarget === 1) {
      const prefix = gRoot === 3 ? 'Great-' : `${gRoot - 2}x Great-`;
      const term = targetGender === 'MALE' ? 'Uncle' : targetGender === 'FEMALE' ? 'Aunt' : 'Pibling';
      return {
        primaryTerm: `${prefix}${term}`,
        category: 'COLLATERAL',
        degreeOfConsanguinity: degreeOfConsanguinity,
        generationalDistance: gRoot - 1,
        isDirectBlood: true,
        pathDescription: `${prefix}${term}`,
      };
    }

    // Nephew / Niece (gRoot = 1, gTarget = 2)
    if (gRoot === 1 && gTarget === 2) {
      const term = targetGender === 'MALE' ? 'Nephew' : targetGender === 'FEMALE' ? 'Niece' : 'Niblet';
      return {
        primaryTerm: term,
        category: 'COLLATERAL',
        degreeOfConsanguinity: degreeOfConsanguinity,
        generationalDistance: -1,
        isDirectBlood: true,
        pathDescription: term,
      };
    }

    // Grand-Nephew / Grand-Niece (gRoot = 1, gTarget >= 3)
    if (gRoot === 1 && gTarget >= 3) {
      const prefix = gTarget === 3 ? 'Great-' : `${gTarget - 2}x Great-`;
      const term = targetGender === 'MALE' ? 'Nephew' : targetGender === 'FEMALE' ? 'Niece' : 'Niblet';
      return {
        primaryTerm: `${prefix}${term}`,
        category: 'COLLATERAL',
        degreeOfConsanguinity: degreeOfConsanguinity,
        generationalDistance: -(gTarget - 1),
        isDirectBlood: true,
        pathDescription: `${prefix}${term}`,
      };
    }

    // Cousins calculation
    const cousinDegree = Math.min(gRoot, gTarget) - 1;
    const removal = Math.abs(gRoot - gTarget);

    const ordinalStr =
      cousinDegree === 1 ? '1st' : cousinDegree === 2 ? '2nd' : cousinDegree === 3 ? '3rd' : `${cousinDegree}th`;
    const removalStr =
      removal === 0 ? '' : removal === 1 ? ' Once Removed' : removal === 2 ? ' Twice Removed' : ` ${removal}x Removed`;

    return {
      primaryTerm: `${ordinalStr} Cousin${removalStr}`,
      category: 'COLLATERAL',
      degreeOfConsanguinity,
      generationalDistance: genDiff,
      isDirectBlood: true,
      pathDescription: `${ordinalStr} Cousin${removalStr}`,
      details: `LCA depth: Root ${gRoot}, Target ${gTarget}`,
    };
  }

  private checkAffinity(rootId: string, targetId: string, targetGender: Gender): KinshipInfo | null {
    const db = this.dbService.getDb();

    // 1. Spouses of root
    const rootSpouses = db
      .prepare(`
        SELECT up2.person_id
        FROM ft_union_partners up1
        JOIN ft_union_partners up2 ON up1.union_id = up2.union_id
        WHERE up1.person_id = ? AND up2.person_id != ?
      `)
      .all(rootId, rootId) as Array<{ person_id: string }>;

    for (const spouse of rootSpouses) {
      // Is target a blood relative of root's spouse?
      const spouseKinship = this.checkConsanguinity(spouse.person_id, targetId, targetGender);
      if (spouseKinship) {
        if (spouseKinship.generationalDistance === 1 && spouseKinship.category === 'DIRECT_ANCESTOR') {
          const term = targetGender === 'MALE' ? 'Father-in-law' : targetGender === 'FEMALE' ? 'Mother-in-law' : 'Parent-in-law';
          return {
            primaryTerm: term,
            category: 'AFFINITY',
            degreeOfConsanguinity: 0,
            generationalDistance: 1,
            isDirectBlood: false,
            pathDescription: term,
          };
        }
        if (spouseKinship.generationalDistance === 0 && spouseKinship.category === 'COLLATERAL') {
          const term = targetGender === 'MALE' ? 'Brother-in-law' : targetGender === 'FEMALE' ? 'Sister-in-law' : 'Sibling-in-law';
          return {
            primaryTerm: term,
            category: 'AFFINITY',
            degreeOfConsanguinity: 0,
            generationalDistance: 0,
            isDirectBlood: false,
            pathDescription: term,
          };
        }
      }
    }

    // 2. Spouse of root's blood relative (e.g. Brother's wife, Son's wife)
    const bloodKinship = this.checkConsanguinity(rootId, targetId, targetGender);
    if (!bloodKinship) {
      // Find spouses of target
      const targetSpouses = db
        .prepare(`
          SELECT up2.person_id
          FROM ft_union_partners up1
          JOIN ft_union_partners up2 ON up1.union_id = up2.union_id
          WHERE up1.person_id = ? AND up2.person_id != ?
        `)
        .all(targetId, targetId) as Array<{ person_id: string }>;

      for (const tSpouse of targetSpouses) {
        const rootToSpouse = this.checkConsanguinity(rootId, tSpouse.person_id, targetGender);
        if (rootToSpouse) {
          if (rootToSpouse.generationalDistance === 0 && rootToSpouse.category === 'COLLATERAL') {
            const term = targetGender === 'MALE' ? 'Brother-in-law' : targetGender === 'FEMALE' ? 'Sister-in-law' : 'Sibling-in-law';
            return {
              primaryTerm: term,
              category: 'AFFINITY',
              degreeOfConsanguinity: 0,
              generationalDistance: 0,
              isDirectBlood: false,
              pathDescription: term,
            };
          }
          if (rootToSpouse.generationalDistance === -1 && rootToSpouse.category === 'DIRECT_DESCENDANT') {
            const term = targetGender === 'MALE' ? 'Son-in-law' : targetGender === 'FEMALE' ? 'Daughter-in-law' : 'Child-in-law';
            return {
              primaryTerm: term,
              category: 'AFFINITY',
              degreeOfConsanguinity: 0,
              generationalDistance: -1,
              isDirectBlood: false,
              pathDescription: term,
            };
          }
        }
      }
    }

    return null;
  }

  private checkGraphPath(rootId: string, targetId: string): KinshipInfo | null {
    const db = this.dbService.getDb();
    // BFS on undirected graph of persons connected via unions
    const queue: Array<{ id: string; dist: number }> = [{ id: rootId, dist: 0 }];
    const visited = new Set<string>([rootId]);

    const neighborsStmt = db.prepare(`
      SELECT up2.person_id
      FROM ft_union_partners up1
      JOIN ft_union_partners up2 ON up1.union_id = up2.union_id
      WHERE up1.person_id = ? AND up2.person_id != ?
      UNION
      SELECT cr.person_id
      FROM ft_union_partners up
      JOIN ft_child_relations cr ON up.union_id = cr.union_id
      WHERE up.person_id = ?
      UNION
      SELECT up.person_id
      FROM ft_child_relations cr
      JOIN ft_union_partners up ON cr.union_id = up.union_id
      WHERE cr.person_id = ?
    `);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === targetId) {
        return {
          primaryTerm: current.dist <= 3 ? 'Relative' : 'Distant Relative',
          category: 'DISTANT',
          degreeOfConsanguinity: current.dist,
          generationalDistance: 0,
          isDirectBlood: false,
          pathDescription: `Graph distance: ${current.dist}`,
        };
      }

      if (current.dist >= 10) continue; // Limit search radius

      const rows = neighborsStmt.all(current.id, current.id, current.id, current.id) as Array<{
        person_id: string;
      }>;
      for (const row of rows) {
        if (!visited.has(row.person_id)) {
          visited.add(row.person_id);
          queue.push({ id: row.person_id, dist: current.dist + 1 });
        }
      }
    }

    return null;
  }

  private unknownKinship(): KinshipInfo {
    return {
      primaryTerm: 'Unrelated / Unknown',
      category: 'UNKNOWN',
      degreeOfConsanguinity: 0,
      generationalDistance: 0,
      isDirectBlood: false,
      pathDescription: 'None',
    };
  }
}
