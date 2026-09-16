import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { FamilyTreeDatabaseService } from './family-tree-db.service.js';

@Injectable()
export class GraphIntegrityService {
  constructor(
    @Inject(FamilyTreeDatabaseService) private readonly dbService: FamilyTreeDatabaseService,
  ) {}

  /**
   * Retrieves all ancestor person IDs for a given person by traversing backwards:
   * Person -> Child relations -> Unions -> Union partners -> ...
   */
  public getAncestors(personId: string): Set<string> {
    const db = this.dbService.getDb();
    const ancestors = new Set<string>();
    const queue: string[] = [personId];
    const visited = new Set<string>([personId]);

    const findParentsStmt = db.prepare(`
      SELECT up.person_id
      FROM ft_child_relations cr
      JOIN ft_unions u ON cr.union_id = u.id
      JOIN ft_union_partners up ON u.id = up.union_id
      WHERE cr.person_id = ?
    `);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const rows = findParentsStmt.all(current) as Array<{ person_id: string }>;

      for (const row of rows) {
        if (!visited.has(row.person_id)) {
          visited.add(row.person_id);
          ancestors.add(row.person_id);
          queue.push(row.person_id);
        }
      }
    }

    return ancestors;
  }

  /**
   * Retrieves all descendant person IDs for a given person by traversing forward:
   * Person -> Union partner -> Unions -> Child relations -> ...
   */
  public getDescendants(personId: string): Set<string> {
    const db = this.dbService.getDb();
    const descendants = new Set<string>();
    const queue: string[] = [personId];
    const visited = new Set<string>([personId]);

    const findChildrenStmt = db.prepare(`
      SELECT cr.person_id
      FROM ft_union_partners up
      JOIN ft_unions u ON up.union_id = u.id
      JOIN ft_child_relations cr ON u.id = cr.union_id
      WHERE up.person_id = ?
    `);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const rows = findChildrenStmt.all(current) as Array<{ person_id: string }>;

      for (const row of rows) {
        if (!visited.has(row.person_id)) {
          visited.add(row.person_id);
          descendants.add(row.person_id);
          queue.push(row.person_id);
        }
      }
    }

    return descendants;
  }

  /**
   * Validates that making childPersonId a child of parentPersonIds will not introduce a cycle.
   */
  public assertNoCycle(childPersonId: string, parentPersonIds: string[]): void {
    if (!parentPersonIds || parentPersonIds.length === 0) return;

    for (const parentId of parentPersonIds) {
      if (parentId === childPersonId) {
        throw new BadRequestException('A person cannot be their own parent or child.');
      }
    }

    // If any parent is a descendant of the child, adding the edge creates a cycle!
    const childDescendants = this.getDescendants(childPersonId);
    for (const parentId of parentPersonIds) {
      if (childDescendants.has(parentId)) {
        throw new BadRequestException(
          `Cycle detected: Person "${parentId}" is already a descendant of "${childPersonId}". Cannot set as parent.`,
        );
      }
    }
  }

  /**
   * Validates adding a child to a specific union.
   */
  public assertNoChildToUnionCycle(unionId: string, childPersonId: string): void {
    const db = this.dbService.getDb();
    const partnerRows = db
      .prepare('SELECT person_id FROM ft_union_partners WHERE union_id = ?')
      .all(unionId) as Array<{ person_id: string }>;

    const partnerIds = partnerRows.map((r) => r.person_id);
    this.assertNoCycle(childPersonId, partnerIds);
  }

  /**
   * Validates adding a partner to a union that already has children.
   */
  public assertNoUnionPartnerCycle(unionId: string, partnerPersonId: string): void {
    const db = this.dbService.getDb();
    const childRows = db
      .prepare('SELECT person_id FROM ft_child_relations WHERE union_id = ?')
      .all(unionId) as Array<{ person_id: string }>;

    const childIds = childRows.map((r) => r.person_id);
    for (const childId of childIds) {
      this.assertNoCycle(childId, [partnerPersonId]);
    }
  }
}
