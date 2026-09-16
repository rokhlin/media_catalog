import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OrganizeService } from '../organize.service.js';

describe('OrganizeService', () => {
  let organizeService: OrganizeService;
  let mockDbService: any;
  let mockMediaService: any;
  let mockLogBuffer: any;

  beforeEach(() => {
    let currentJob: any = null;
    const itemsStore: any[] = [];

    mockDbService = {
      createOrganizationJob: (data: any) => {
        currentJob = {
          ...data,
          total_files: data.total_files || 0,
          processed_files: 0,
          percent: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return currentJob;
      },
      getOrganizationJob: (jobId?: string) => {
        if (jobId && currentJob && currentJob.id === jobId) return currentJob;
        return currentJob;
      },
      updateOrganizationJob: (id: string, updates: any) => {
        if (currentJob && currentJob.id === id) {
          Object.assign(currentJob, updates);
        }
      },
      clearOrganizationJob: (jobId: string) => {
        if (currentJob && currentJob.id === jobId) {
          currentJob = null;
        }
        itemsStore.length = 0;
      },
      insertOrganizationItems: (items: any[]) => {
        for (const item of items) {
          itemsStore.push({ ...item, id: itemsStore.length + 1 });
        }
      },
      getOrganizationItems: (_jobId: string, limit: number = 200, offset: number = 0, status?: string) => {
        const filtered = status ? itemsStore.filter((i) => i.status === status) : itemsStore;
        return {
          items: filtered.slice(offset, offset + limit),
          total: filtered.length,
        };
      },
      getOrganizationItemById: (id: number) => {
        return itemsStore.find((i) => i.id === id) || null;
      },
      updateOrganizationItem: (id: number, updates: any) => {
        const item = itemsStore.find((i) => i.id === id);
        if (item) {
          Object.assign(item, updates);
        }
        return item;
      },
      getDb: () => ({
        prepare: () => ({
          all: () => [
            {
              id: 'media-1',
              file_path: '/media/photos/IMG_20230515_120000.jpg',
              file_name: 'IMG_20230515_120000.jpg',
              folder: 'photos',
              media_date: '2023-05-15T12:00:00Z',
              mtime: 1684152000000,
              media_type: 'IMAGE',
              summary: 'Отпуск на море',
              environment: 'outdoor, beach',
              ocr_text: '',
            },
            {
              id: 'media-2',
              file_path: '/media/docs/scan_passport.pdf',
              file_name: 'scan_passport.pdf',
              folder: 'docs',
              media_date: null,
              mtime: 1684152000000,
              media_type: 'IMAGE',
              summary: '',
              environment: '',
              ocr_text: 'Паспорт гражданина серия номер выдан кем и когда',
            },
            {
              id: 'media-3',
              file_path: '/media/social/Screenshot_20240101_1000.png',
              file_name: 'Screenshot_20240101_1000.png',
              folder: 'social',
              media_date: null,
              mtime: 1704100000000,
              media_type: 'IMAGE',
              summary: '',
              environment: '',
              ocr_text: '',
            },
          ],
          run: () => {},
          get: () => null,
        }),
      }),
    };

    mockMediaService = {
      findSidecarFile: () => null,
    };

    mockLogBuffer = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    organizeService = new OrganizeService(
      mockDbService,
      mockMediaService as any,
      mockLogBuffer as any,
    );
  });

  it('should return idle status if no job has been created', () => {
    const status = organizeService.getScanStatus();
    assert.equal(status.status, 'idle');
    assert.equal(status.total_files, 0);
  });

  it('should start an organization job in semi_automatic mode and return initial status', async () => {
    const job = await organizeService.startJob({
      mode: 'semi_automatic',
      criteria: {
        groupByYear: true,
        groupByMonth: true,
        eventName: 'Vacation',
      },
    });

    assert.ok(job.id.startsWith('org_'));
    assert.equal(job.mode, 'semi_automatic');
  });

  it('should prevent concurrent execution if a job is already in progress', async () => {
    await organizeService.startJob({
      mode: 'semi_automatic',
      criteria: { groupByYear: true },
    });

    await assert.rejects(
      async () => {
        await organizeService.startJob({
          mode: 'semi_automatic',
          criteria: { groupByYear: true },
        });
      },
      {
        message: 'An organization job is already in progress.',
      },
    );
  });

  it('should support job cancellation', async () => {
    const job = await organizeService.startJob({
      mode: 'semi_automatic',
      criteria: { groupByYear: true },
    });

    const cancelled = organizeService.cancelJob(job.id);
    assert.equal(cancelled.status, 'cancelled');
  });

  it('should allow updating an item in the plan (edit target folder or tags)', () => {
    mockDbService.insertOrganizationItems([
      {
        id: 1,
        job_id: 'org_test',
        original_path: '/media/photo.jpg',
        original_filename: 'photo.jpg',
        target_folder: '2023/05',
        target_filename: 'photo.jpg',
        assigned_tags: ['Year: 2023'],
        status: 'pending',
      },
    ]);

    const updated = organizeService.updateItem(1, {
      target_folder: 'Custom/Folder',
      assigned_tags: ['Year: 2023', 'CustomTag'],
    });

    assert.equal(updated.target_folder, 'Custom/Folder');
    assert.deepEqual(updated.assigned_tags, ['Year: 2023', 'CustomTag']);
  });
});
