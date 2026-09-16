import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DuplicatesService } from '../duplicates.service.js';

describe('DuplicatesService', () => {
  let duplicatesService: DuplicatesService;
  let mockDbService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockDbService = {
      getDuplicateConfig: () => ({
        default_engine: 'cpu',
        similarity_threshold: 0.90,
        burst_window_seconds: 3.0,
        default_keep_strategy: 'highest_resolution',
        target_move_folder: null,
      }),
      saveDuplicateConfig: (cfg: any) => cfg,
      getAllMediaHashes: () => [],
      saveMediaHash: () => {},
      deleteMediaHashes: () => {},
      deleteMediaHash: () => {},
    };

    mockConfigService = {
      supportedPhotoExts: new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']),
      supportedVideoExts: new Set(['.mp4', '.mov', '.avi', '.mkv']),
      getConfig: () => ({
        input_folders: ['/test/photos'],
        output_folder: '/test/output',
      }),
    };

    duplicatesService = new DuplicatesService(
      mockConfigService as any,
      mockDbService,
      {
        verifyFileAccess: (p: string) => ({ accessible: true, resolvedPath: p }),
        invalidateCache: () => {},
      } as any,
    );
  });

  describe('Hamming Distance Calculation', () => {
    it('should return 0 for identical 64-bit hex hashes', () => {
      const hash = 'a1b2c3d4e5f60718';
      const distance = duplicatesService.calculateHammingDistance(hash, hash);
      assert.equal(distance, 0);
    });

    it('should correctly count differing bits between two 64-bit hex hashes', () => {
      // 0x0 vs 0x1 -> 1 bit difference
      const h1 = '0000000000000000';
      const h2 = '0000000000000001';
      assert.equal(duplicatesService.calculateHammingDistance(h1, h2), 1);

      // 0x0 vs 0xf -> 4 bit difference
      const h3 = '000000000000000f';
      assert.equal(duplicatesService.calculateHammingDistance(h1, h3), 4);

      // 0x00... vs 0xff... -> 64 bit difference
      const hAll = 'ffffffffffffffff';
      assert.equal(duplicatesService.calculateHammingDistance(h1, hAll), 64);
    });

    it('should handle invalid or null hash inputs gracefully', () => {
      assert.equal(duplicatesService.calculateHammingDistance('', 'ffffffffffffffff'), 64);
      assert.equal(duplicatesService.calculateHammingDistance('abc', 'def'), 64);
    });
  });

  describe('Duplicate Detection & Clustering', () => {
    it('should cluster exact duplicates having identical content hashes', async () => {
      const testHashes = [
        {
          file_path: '/photos/pic1.jpg',
          content_hash: 'md5_hash_aaa',
          phash: '1111222233334444',
          file_size: 5000000,
          width: 4000,
          height: 3000,
          mtime: 1600000000,
        },
        {
          file_path: '/photos/pic1_copy.jpg',
          content_hash: 'md5_hash_aaa',
          phash: '1111222233334444',
          file_size: 5000000,
          width: 4000,
          height: 3000,
          mtime: 1600000001,
        },
        {
          file_path: '/photos/unique.jpg',
          content_hash: 'md5_hash_bbb',
          phash: '9999888877776666',
          file_size: 3000000,
          width: 3000,
          height: 2000,
          mtime: 1600000002,
        },
      ];

      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups(
        'exact',
        0.90,
        3.0,
        'highest_resolution',
      );

      assert.equal(groups.length, 1);
      assert.equal(groups[0].matchType, 'exact');
      assert.equal(groups[0].totalFiles, 2);
      assert.equal(groups[0].reclaimableBytes, 5000000);
      assert.equal(groups[0].primaryFile.isPrimary, true);
      assert.equal(groups[0].duplicates.length, 1);
      assert.equal(groups[0].duplicates[0].isPrimary, false);
    });

    it('should cluster visually similar photos when dHash distance <= maxDistance', async () => {
      // 2 bits difference out of 64 bits = 96.8% similarity (>= 90%)
      const testHashes = [
        {
          file_path: '/photos/sunset_orig.jpg',
          content_hash: 'md5_1',
          phash: '0000000000000000',
          file_size: 8000000,
          width: 6000,
          height: 4000,
          mtime: 1600000000,
        },
        {
          file_path: '/photos/sunset_edit.jpg',
          content_hash: 'md5_2',
          phash: '0000000000000003', // 2 bits diff
          file_size: 4000000,
          width: 3000,
          height: 2000,
          mtime: 1600000010,
        },
      ];

      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups(
        'similar',
        0.90,
        3.0,
        'highest_resolution',
      );

      assert.equal(groups.length, 1);
      assert.equal(groups[0].matchType, 'visual');
      assert.equal(groups[0].totalFiles, 2);
      // Primary should be sunset_orig.jpg (higher resolution)
      assert.equal(groups[0].primaryFile.filePath, '/photos/sunset_orig.jpg');
    });

    it('should cluster burst photo series based on timestamp proximity and same folder', async () => {
      const testHashes = [
        {
          file_path: '/photos/burst/IMG_0001.jpg',
          content_hash: 'md5_a',
          phash: '1234567890abcdef',
          file_size: 4000000,
          width: 4000,
          height: 3000,
          mtime: 1600000000, // T
        },
        {
          file_path: '/photos/burst/IMG_0002.jpg',
          content_hash: 'md5_b',
          phash: '1234567890abcdee',
          file_size: 4100000,
          width: 4000,
          height: 3000,
          mtime: 1600000001.5, // T + 1.5s (within 3s window)
        },
        {
          file_path: '/photos/burst/IMG_0003.jpg',
          content_hash: 'md5_c',
          phash: '1234567890abcdff',
          file_size: 4050000,
          width: 4000,
          height: 3000,
          mtime: 1600000003.0, // T + 3.0s (within 3s from prev)
        },
        {
          file_path: '/photos/burst/IMG_0010.jpg',
          content_hash: 'md5_d',
          phash: 'ffffffffffffffff',
          file_size: 4000000,
          width: 4000,
          height: 3000,
          mtime: 1600000100, // 100s later (not in burst)
        },
      ];

      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups(
        'burst',
        0.90,
        3.0,
        'largest_file_size',
      );

      assert.equal(groups.length, 1);
      assert.equal(groups[0].matchType, 'burst');
      assert.equal(groups[0].totalFiles, 3);
      // Primary should be IMG_0002.jpg (largest file size: 4100000)
      assert.equal(groups[0].primaryFile.filePath, '/photos/burst/IMG_0002.jpg');
    });

    it('should NEVER cluster photos with null phash into bursts even if timestamps are identical (Issue 22 fix)', async () => {
      // 3 iPhone HEIC photos copied to Windows with identical mtimes, but unhashable/null phash
      const testHashes = [
        {
          file_path: '/photos/burst/IMG_1001.heic',
          content_hash: 'md5_1',
          phash: null,
          file_size: 2000000,
          width: 4032,
          height: 3024,
          mtime: 1600000000,
        },
        {
          file_path: '/photos/burst/IMG_1002.heic',
          content_hash: 'md5_2',
          phash: null,
          file_size: 2100000,
          width: 4032,
          height: 3024,
          mtime: 1600000000.5,
        },
        {
          file_path: '/photos/burst/IMG_1003.heic',
          content_hash: 'md5_3',
          phash: null,
          file_size: 2200000,
          width: 4032,
          height: 3024,
          mtime: 1600000001,
        },
      ];

      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups('burst', 0.85, 3.0, 'highest_resolution');
      // Must NOT form a burst group when perceptual hash cannot be verified!
      assert.equal(groups.length, 0);
    });

    it('should NEVER cluster visually distinct photos into bursts even if timestamps are 0.5s apart (Issue 22 fix)', async () => {
      // Different photos (e.g. kid photo, toy photo, car photo) with completely different phashes
      const testHashes = [
        {
          file_path: '/photos/burst/child.heic',
          content_hash: 'md5_child',
          phash: '0000000000000000',
          file_size: 2000000,
          width: 4032,
          height: 3024,
          mtime: 1600000000,
        },
        {
          file_path: '/photos/burst/toy.heic',
          content_hash: 'md5_toy',
          phash: 'ffffffffffffffff', // 64 bits diff (0% similarity)
          file_size: 2100000,
          width: 4032,
          height: 3024,
          mtime: 1600000000.8,
        },
        {
          file_path: '/photos/burst/street.heic',
          content_hash: 'md5_street',
          phash: 'aaaa5555aaaa5555', // ~50% similarity
          file_size: 2200000,
          width: 4032,
          height: 3024,
          mtime: 1600000001.2,
        },
      ];

      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups('burst', 0.85, 3.0, 'highest_resolution');
      assert.equal(groups.length, 0);
    });

    it('should dynamically calculate real similarity percentage for burst groups without hardcoding 0.95', async () => {
      // 4 bits diff out of 64 bits -> (64-4)/64 = 0.9375 (~93.8%)
      const testHashes = [
        {
          file_path: '/photos/burst/shot1.jpg',
          content_hash: 'md5_s1',
          phash: '0000000000000000',
          file_size: 2000000,
          width: 4000,
          height: 3000,
          mtime: 1600000000,
        },
        {
          file_path: '/photos/burst/shot2.jpg',
          content_hash: 'md5_s2',
          phash: '000000000000000f', // 4 bits diff = 0.9375
          file_size: 2050000,
          width: 4000,
          height: 3000,
          mtime: 1600000001,
        },
      ];

      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups('burst', 0.85, 3.0, 'highest_resolution');
      assert.equal(groups.length, 1);
      assert.notEqual(groups[0].similarity, 0.95, 'Similarity must not be hardcoded to 0.95');
      assert.equal(groups[0].similarity, 0.94);
      assert.equal(groups[0].duplicates[0].similarityToPrimary, 0.94);
    });

    it('should prioritize EXIF media_date over filesystem mtime for burst grouping', async () => {
      // mtime is identical (e.g. copied from iPhone at same second), but EXIF dates are hours apart
      const testHashes = [
        {
          file_path: '/photos/burst/morning.jpg',
          content_hash: 'md5_m',
          phash: '1111222233334444',
          file_size: 2000000,
          width: 4000,
          height: 3000,
          mtime: 1700000000, // Same copy mtime
          media_date: '2026-06-01T08:00:00Z',
        },
        {
          file_path: '/photos/burst/evening.jpg',
          content_hash: 'md5_e',
          phash: '1111222233334445', // 1 bit diff
          file_size: 2000000,
          width: 4000,
          height: 3000,
          mtime: 1700000000.5, // Same copy mtime
          media_date: '2026-06-01T20:00:00Z', // 12 hours later!
        },
      ];

      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups('burst', 0.85, 3.0, 'highest_resolution');
      // Should NOT cluster because real capture dates differ by 12 hours
      assert.equal(groups.length, 0);
    });
  });

  describe('Non-Destructive Principle Verification', () => {
    it('should never delete files automatically during grouping or scanning', async () => {
      let deleteCalled = false;
      mockDbService.deleteMediaHashes = () => {
        deleteCalled = true;
      };

      const testHashes = [
        {
          file_path: '/photos/a.jpg',
          content_hash: 'h1',
          phash: '0000000000000000',
          file_size: 1000,
          width: 100,
          height: 100,
          mtime: 1000,
        },
        {
          file_path: '/photos/b.jpg',
          content_hash: 'h1',
          phash: '0000000000000000',
          file_size: 1000,
          width: 100,
          height: 100,
          mtime: 2000,
        },
      ];
      mockDbService.getAllMediaHashes = () => testHashes;

      const groups = await duplicatesService.getDuplicateGroups('all', 0.90, 3.0, 'newest');
      const summary = duplicatesService.getSummary();

      assert.equal(groups.length, 1);
      assert.equal(typeof summary.totalGroups, 'number');
      assert.equal(deleteCalled, false); // strictly non-destructive
    });

    it('should rapidly cluster 500 visual items in under 500ms using BigInt popcount', async () => {
      const largeHashes: any[] = [];
      for (let i = 0; i < 500; i++) {
        // Create variations of hashes
        const hex = (BigInt('0x123456789abcdef0') + BigInt(i % 10)).toString(16).padStart(16, '0');
        largeHashes.push({
          file_path: `/photos/bulk_${i}.jpg`,
          content_hash: `hash_${i}`,
          phash: hex,
          file_size: 1000 + i,
          width: 1920,
          height: 1080,
          mtime: 1700000000 + i,
        });
      }
      mockDbService.getAllMediaHashes = () => largeHashes;

      const t0 = Date.now();
      const groups = await duplicatesService.getDuplicateGroups('visual', 0.90, 3.0, 'highest_resolution');
      const elapsed = Date.now() - t0;

      assert.ok(groups.length > 0, 'Should find groups among 500 items');
      assert.ok(elapsed < 500, `Clustering 500 items should take < 500ms, took ${elapsed}ms`);
    });
  });
});
