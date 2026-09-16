import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MediaOrganizationWorker } from '../mediaOrganization.worker';
import { MediaCacheService } from '../mediaCacheService';
import type { GalleryMediaFile } from '../../models/media';

describe('MediaOrganizationWorker', () => {
  const sampleFiles: GalleryMediaFile[] = [
    {
      filename: 'photo1.jpg',
      file_path: '/input/2024/summer/photo1.jpg',
      folder: '/input',
      is_image: true,
      mtime: 1720000000, // ~July 2024
      file_size: 1048576, // 1MB
      status: 'PROCESSED',
      face_count: 2,
      face_names: ['Alice', 'Bob'],
      has_unassigned_faces: false,
    },
    {
      filename: 'photo2.jpg',
      file_path: '/input/2024/summer/photo2.jpg',
      folder: '/input',
      is_image: true,
      mtime: 1720100000, // ~July 2024
      file_size: 2097152, // 2MB
      status: 'UNPROCESSED',
      face_count: 1,
      face_names: ['Alice'],
      has_unassigned_faces: false,
    },
    {
      filename: 'video1.mp4',
      file_path: '/input/2023/winter/video1.mp4',
      folder: '/input',
      is_video: true,
      mtime: 1672531199, // ~Dec 2022 / Jan 2023
      file_size: 10485760, // 10MB
      status: 'PROCESSED',
      face_count: 0,
      face_names: [],
      has_unassigned_faces: false,
    },
    {
      filename: 'unrec.jpg',
      file_path: '/input/unrec.jpg',
      folder: '/input',
      is_image: true,
      mtime: 1720200000,
      file_size: 512000,
      status: 'UNPROCESSED',
      face_count: 1,
      face_names: ['face_1'],
      has_unassigned_faces: true,
    },
  ];

  const worker = new MediaOrganizationWorker();

  it('should build a nested folder tree structure with accurate file and processed counts', () => {
    const tree = worker.buildFolderTree(sampleFiles);
    assert.strictEqual(tree.length, 1, 'Should have 1 root node');
    const root = tree[0];
    assert.strictEqual(root.fileCount, 4, 'Root should have 4 total files');
    assert.strictEqual(root.processedCount, 2, 'Root should have 2 processed files');

    // Should have subfolders
    assert.ok(root.children.length > 0, 'Root should have children subfolders');
    const f2024 = root.children.find((c) => c.name === '2024');
    assert.ok(f2024, 'Should have 2024 folder');
    assert.strictEqual(f2024.fileCount, 2, '2024 should have 2 files');
  });

  it('should group files chronologically by Date / Timeline', () => {
    const dateGroups = worker.groupByDate(sampleFiles, 'en');
    assert.ok(dateGroups.length >= 2, 'Should create date groups');
    const july2024 = dateGroups.find((g) => g.key.startsWith('2024'));
    assert.ok(july2024, 'Should have 2024 group');
    assert.strictEqual(july2024.count >= 2, true);
  });

  it('should group files by recognized person, unassigned faces, and no faces', () => {
    const personGroups = worker.groupByPerson(sampleFiles);
    const aliceGroup = personGroups.find((g) => g.personName === 'Alice');
    assert.ok(aliceGroup, 'Alice group should exist');
    assert.strictEqual(aliceGroup.count, 2, 'Alice has 2 photos');

    const bobGroup = personGroups.find((g) => g.personName === 'Bob');
    assert.ok(bobGroup, 'Bob group should exist');
    assert.strictEqual(bobGroup.count, 1);

    const unrecGroup = personGroups.find((g) => g.isUnassigned);
    assert.ok(unrecGroup, 'Unassigned group should exist');

    const noFacesGroup = personGroups.find((g) => g.personName.includes('No Faces'));
    assert.ok(noFacesGroup, 'No Faces group should exist');
  });

  it('should sort media files by various fields and orders', () => {
    const sortedByNameAsc = worker.sortMediaFiles(sampleFiles, 'name', 'asc');
    assert.strictEqual(sortedByNameAsc[0].filename, 'photo1.jpg');
    assert.strictEqual(sortedByNameAsc[sortedByNameAsc.length - 1].filename, 'video1.mp4');

    const sortedBySizeDesc = worker.sortMediaFiles(sampleFiles, 'size', 'desc');
    assert.strictEqual(sortedBySizeDesc[0].filename, 'video1.mp4'); // 10MB
  });

  it('should group series shots (burst photos) into a single representative card with item count badge', () => {
    const burstFiles: GalleryMediaFile[] = [
      {
        filename: 'DSC_0001.JPG',
        file_path: '/photos/events/DSC_0001.JPG',
        folder: '/photos/events',
        is_image: true,
        capture_date: '2023-11-14T22:13:20',
        phash: '0000000000000000',
        file_size: 4000000,
        status: 'PROCESSED',
      },
      {
        filename: 'DSC_0002.JPG',
        file_path: '/photos/events/DSC_0002.JPG',
        folder: '/photos/events',
        is_image: true,
        capture_date: '2023-11-14T22:13:21', // 1s later
        phash: '0000000000000001', // 1 bit difference (visual match)
        file_size: 4100000,
        status: 'UNPROCESSED',
      },
      {
        filename: 'DSC_0003.JPG',
        file_path: '/photos/events/DSC_0003.JPG',
        folder: '/photos/events',
        is_image: true,
        capture_date: '2023-11-14T22:13:22', // 2s later
        phash: '0000000000000003', // 2 bits difference (visual match)
        file_size: 4200000,
        status: 'UNPROCESSED',
      },
      {
        filename: 'DSC_0050.JPG',
        file_path: '/photos/events/DSC_0050.JPG',
        folder: '/photos/events',
        is_image: true,
        capture_date: '2023-11-14T23:13:20', // 1 hour later (standalone)
        phash: 'ffffffffffffffff',
        file_size: 3500000,
        status: 'PROCESSED',
      },
    ];

    const grouped = worker.groupBySimilarity(burstFiles, 0.90, 3.0);
    assert.strictEqual(grouped.length, 2, 'Should collapse 3 burst files into 1 + 1 standalone file = 2 cards');

    // Find the representative card for the burst series
    const seriesCard = grouped.find((f) => f.similarity_group_id?.startsWith('series_') || f.similarity_group_id?.startsWith('burst_'));
    assert.ok(seriesCard, 'Series card should exist');
    assert.strictEqual(seriesCard.similar_files_count, 3, 'Series badge count should be 3');
    assert.ok(seriesCard.similar_group_files, 'similar_group_files should be populated');
    assert.strictEqual(seriesCard.similar_group_files?.length, 3, 'All 3 series items attached in group');

    // Verify all members in the group have series context
    seriesCard.similar_group_files?.forEach((member) => {
      assert.strictEqual(member.similar_files_count, 3);
    });

    // Verify non-circular JSON serialization
    assert.doesNotThrow(() => JSON.stringify(seriesCard), 'Series card must be serializable to JSON without circular dependency');

    // Standalone file verification
    const standaloneCard = grouped.find((f) => f.filename === 'DSC_0050.JPG');
    assert.ok(standaloneCard);
    assert.strictEqual(standaloneCard.similar_files_count, 1);
    assert.strictEqual(standaloneCard.similar_group_files, undefined);
  });

  it('should correctly group 10 HEIC images and 7 MOV videos when interleaved in the same folder', () => {
    const mixedFiles: GalleryMediaFile[] = [];

    // 10 HEIC photos: IMG_8427_1.HEIC ... IMG_8427_10.HEIC
    for (let i = 1; i <= 10; i++) {
      mixedFiles.push({
        filename: `IMG_8427_${i}.HEIC`,
        file_path: `/photos/trip/IMG_8427_${i}.HEIC`,
        folder: '/photos/trip',
        is_image: true,
        is_video: false,
        mtime: 1700000000 + i * 2,
        file_size: 2600000,
        status: i === 1 ? 'PROCESSED' : 'UNPROCESSED',
      });
    }

    // 7 MOV videos: IMG_8407.MOV, IMG_8407_1.MOV ... IMG_8407_6.MOV
    mixedFiles.push({
      filename: 'IMG_8407.MOV',
      file_path: '/photos/trip/IMG_8407.MOV',
      folder: '/photos/trip',
      is_image: false,
      is_video: true,
      mtime: 1700000001,
      file_size: 15400000,
      status: 'PROCESSED',
    });
    for (let i = 1; i <= 6; i++) {
      mixedFiles.push({
        filename: `IMG_8407_${i}.MOV`,
        file_path: `/photos/trip/IMG_8407_${i}.MOV`,
        folder: '/photos/trip',
        is_image: false,
        is_video: true,
        mtime: 1700000001 + i * 2,
        file_size: 15400000,
        status: 'UNPROCESSED',
      });
    }

    // Interleave them by sorting by mtime
    mixedFiles.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
    assert.strictEqual(mixedFiles.length, 17);

    const grouped = worker.groupBySimilarity(mixedFiles, 0.90, 3.0);
    // Should produce exactly 2 cards: 1 for the 10 HEIC photos, 1 for the 7 MOV videos!
    assert.strictEqual(grouped.length, 2, 'Should produce exactly 2 representative cards (1 photo series, 1 video series)');

    const photoCard = grouped.find((f) => f.is_image);
    assert.ok(photoCard, 'Photo series card must exist');
    assert.strictEqual(photoCard.similar_files_count, 10, 'Photo series badge must be 10');
    assert.strictEqual(photoCard.similar_group_files?.length, 10, 'Photo series must contain all 10 files');

    const videoCard = grouped.find((f) => f.is_video);
    assert.ok(videoCard, 'Video series card must exist');
    assert.strictEqual(videoCard.similar_files_count, 7, 'Video series badge must be 7');
    assert.strictEqual(videoCard.similar_group_files?.length, 7, 'Video series must contain all 7 files');
  });

  it('should NOT merge series shots across different folders', () => {
    const crossFolderFiles: GalleryMediaFile[] = [
      {
        filename: '20150412_190907.jpg',
        file_path: '/folderA/20150412_190907.jpg',
        folder: '/folderA',
        is_image: true,
        mtime: 1428854947,
        file_size: 529200,
      },
      {
        filename: '20150412_190907.jpg',
        file_path: '/folderB/20150412_190907.jpg',
        folder: '/folderB',
        is_image: true,
        mtime: 1428854947,
        file_size: 9300000,
      },
    ];

    const grouped = worker.groupBySimilarity(crossFolderFiles, 0.90, 3.0);
    assert.strictEqual(grouped.length, 2, 'Files in different folders must NOT be merged in gallery series grouping');
    assert.strictEqual(grouped[0].similar_files_count, 1);
    assert.strictEqual(grouped[1].similar_files_count, 1);
  });

  it('should NOT group 16 unrelated photos with close mtimes when real capture dates or phashes differ (Issue 8 fix)', () => {
    // 16 photos copied at the same millisecond, but with different capture dates across months
    const unrelatedPhotos: GalleryMediaFile[] = [
      { filename: '2016-07-02 12-25-42.JPG', file_path: '/photos/2016-07-02 12-25-42.JPG', folder: '/photos', is_image: true, mtime: 1787230449.79 },
      { filename: '2016-07-02 12-28-17.JPG', file_path: '/photos/2016-07-02 12-28-17.JPG', folder: '/photos', is_image: true, mtime: 1787230449.80 },
      { filename: '2016-08-07 08-17-01.JPG', file_path: '/photos/2016-08-07 08-17-01.JPG', folder: '/photos', is_image: true, mtime: 1787230449.81 },
      { filename: '2016-08-20 15-26-23.JPG', file_path: '/photos/2016-08-20 15-26-23.JPG', folder: '/photos', is_image: true, mtime: 1787230449.86 },
      { filename: '2016-08-27 16-39-25.JPG', file_path: '/photos/2016-08-27 16-39-25.JPG', folder: '/photos', is_image: true, mtime: 1787230449.88 },
      { filename: '2016-08-27 16-40-21.JPG', file_path: '/photos/2016-08-27 16-40-21.JPG', folder: '/photos', is_image: true, mtime: 1787230449.89 },
      { filename: '2016-09-03 20-53-18.JPG', file_path: '/photos/2016-09-03 20-53-18.JPG', folder: '/photos', is_image: true, mtime: 1787230449.91 },
      { filename: '2016-09-04 17-03-12.JPG', file_path: '/photos/2016-09-04 17-03-12.JPG', folder: '/photos', is_image: true, mtime: 1787230449.91 },
      { filename: '2016-09-18 12-15-57.JPG', file_path: '/photos/2016-09-18 12-15-57.JPG', folder: '/photos', is_image: true, mtime: 1787230449.92 },
      { filename: '2016-09-18 12-21-13.JPG', file_path: '/photos/2016-09-18 12-21-13.JPG', folder: '/photos', is_image: true, mtime: 1787230449.93 },
      { filename: '2016-10-01 15-23-53.JPG', file_path: '/photos/2016-10-01 15-23-53.JPG', folder: '/photos', is_image: true, mtime: 1787230449.93 },
      { filename: '2016-10-05 15-30-58.JPG', file_path: '/photos/2016-10-05 15-30-58.JPG', folder: '/photos', is_image: true, mtime: 1787230449.94 },
      { filename: '2016-10-22 21-02-44.JPG', file_path: '/photos/2016-10-22 21-02-44.JPG', folder: '/photos', is_image: true, mtime: 1787230450.01 },
      { filename: '2016-10-22 21-10-52.JPG', file_path: '/photos/2016-10-22 21-10-52.JPG', folder: '/photos', is_image: true, mtime: 1787230450.01 },
      { filename: '2016-10-22 21-18-51.JPG', file_path: '/photos/2016-10-22 21-18-51.JPG', folder: '/photos', is_image: true, mtime: 1787230450.02 },
      { filename: '2016-10-23 00-30-28.JPG', file_path: '/photos/2016-10-23 00-30-28.JPG', folder: '/photos', is_image: true, mtime: 1787230450.05 },
    ];

    const grouped = worker.groupBySimilarity(unrelatedPhotos, 0.90, 3.0);
    // Because real timestamps parsed from filenames are months apart, NONE of them should be grouped together!
    assert.strictEqual(grouped.length, 16, 'All 16 photos must remain independent cards; none should be chained into a burst');
    grouped.forEach((item) => {
      assert.strictEqual(item.similar_files_count, 1);
      assert.strictEqual(item.similar_group_files, undefined);
    });
  });

  it('should NOT group videos with close timestamps into photo bursts (Issue 9 fix)', () => {
    const twoVideos: GalleryMediaFile[] = [
      {
        filename: 'VID-20260330-WA0000_1.mp4',
        file_path: '/videos/VID-20260330-WA0000_1.mp4',
        folder: '/videos',
        is_video: true,
        is_image: false,
        mtime: 1787236767.741, // Copied at same instant
      },
      {
        filename: 'VID-20260817-WA0001.mp4',
        file_path: '/videos/VID-20260817-WA0001.mp4',
        folder: '/videos',
        is_video: true,
        is_image: false,
        mtime: 1787236767.749, // Copied at same instant
      },
    ];

    const grouped = worker.groupBySimilarity(twoVideos, 0.90, 3.0);
    assert.strictEqual(grouped.length, 2, 'Two distinct videos must remain standalone cards and never be grouped into a burst series');
  });

  it('should anchor burst window to burst start timestamp rather than chaining transitively', () => {
    // 5 photos each 1.5s apart:
    // P0: t=0s
    // P1: t=1.5s (diff from start: 1.5s <= 3s -> grouped with P0)
    // P2: t=3.0s (diff from start: 3.0s <= 3s -> grouped with P0)
    // P3: t=4.5s (diff from start: 4.5s > 3s -> MUST NOT be in P0 burst even though diff from P2 is 1.5s!)
    // P4: t=6.0s (diff from P3: 1.5s <= 3s -> grouped with P3)
    const photos: GalleryMediaFile[] = [
      { filename: 'P0.JPG', file_path: '/p/P0.JPG', folder: '/p', is_image: true, capture_date: '2024-01-01T12:00:00', phash: '0000000000000000' },
      { filename: 'P1.JPG', file_path: '/p/P1.JPG', folder: '/p', is_image: true, capture_date: '2024-01-01T12:00:01.5', phash: '0000000000000000' },
      { filename: 'P2.JPG', file_path: '/p/P2.JPG', folder: '/p', is_image: true, capture_date: '2024-01-01T12:00:03', phash: '0000000000000000' },
      { filename: 'P3.JPG', file_path: '/p/P3.JPG', folder: '/p', is_image: true, capture_date: '2024-01-01T12:00:04.5', phash: '0000000000000000' },
      { filename: 'P4.JPG', file_path: '/p/P4.JPG', folder: '/p', is_image: true, capture_date: '2024-01-01T12:00:06', phash: '0000000000000000' },
    ];

    const grouped = worker.groupBySimilarity(photos, 0.90, 3.0);
    // Should split into two groups (P0..P2 of size 3, and P3..P4 of size 2) = 2 cards!
    assert.strictEqual(grouped.length, 2, 'Transitive chaining prevented: burst splits into 2 distinct groups based on window anchor');
    const group1 = grouped.find((g) => g.similar_files_count === 3);
    const group2 = grouped.find((g) => g.similar_files_count === 2);
    assert.ok(group1, 'Group 1 has 3 items');
    assert.ok(group2, 'Group 2 has 2 items');
  });

  it('should correctly apply cascade confidence: reject grouping when visual hashes do not match even if timestamps are close', () => {
    const diffVisualPhotos: GalleryMediaFile[] = [
      { filename: 'A.JPG', file_path: '/p/A.JPG', folder: '/p', is_image: true, capture_date: '2024-01-01T12:00:00', phash: '0000000000000000' },
      { filename: 'B.JPG', file_path: '/p/B.JPG', folder: '/p', is_image: true, capture_date: '2024-01-01T12:00:01', phash: 'ffffffffffffffff' }, // 64 bits diff
    ];

    const grouped = worker.groupBySimilarity(diffVisualPhotos, 0.90, 3.0);
    assert.strictEqual(grouped.length, 2, 'Photos with close timestamps but different visual hashes must NOT be grouped');
  });

  it('should correctly filter media files when selecting a folder with Windows backslashes and forward slashes', () => {
    const windowsFiles: GalleryMediaFile[] = [
      {
        filename: 'pic1.jpg',
        file_path: 'C:\\Users\\User\\media_input\\vacation\\pic1.jpg',
        folder: 'C:\\Users\\User\\media_input',
        is_image: true,
      },
      {
        filename: 'pic2.jpg',
        file_path: 'C:\\Users\\User\\media_input\\vacation\\sub\\pic2.jpg',
        folder: 'C:\\Users\\User\\media_input',
        is_image: true,
      },
      {
        filename: 'pic3.jpg',
        file_path: 'c:\\users\\user\\media_input\\work\\pic3.jpg',
        folder: 'c:\\users\\user\\media_input',
        is_image: true,
      },
      {
        filename: 'root_pic.jpg',
        file_path: 'C:\\Users\\User\\media_input\\root_pic.jpg',
        folder: 'C:\\Users\\User\\media_input',
        is_image: true,
      },
      {
        filename: 'other_vacation.jpg',
        file_path: 'C:\\Users\\User\\media_input\\vacation-other\\pic.jpg',
        folder: 'C:\\Users\\User\\media_input',
        is_image: true,
      },
    ];

    // 1. Filter by subfolder 'vacation' (using forward slashes from tree node)
    const vacationFiltered = worker.filterMediaFiles(windowsFiles, {
      selectedFolder: 'C:/Users/User/media_input/vacation',
    });
    assert.strictEqual(vacationFiltered.length, 2, 'Should include vacation/pic1.jpg and vacation/sub/pic2.jpg');
    const filenames = vacationFiltered.map((f) => f.filename);
    assert.ok(filenames.includes('pic1.jpg'));
    assert.ok(filenames.includes('pic2.jpg'));
    assert.ok(!filenames.includes('other_vacation.jpg'), 'Must not match vacation-other folder');

    // 2. Filter by root folder (should include all 5 files)
    const rootFiltered = worker.filterMediaFiles(windowsFiles, {
      selectedFolder: 'C:/Users/User/media_input',
    });
    assert.strictEqual(rootFiltered.length, 5, 'Root folder should include all descendant files');

    // 3. Filter with case difference (lowercase c: vs uppercase C:)
    const caseFiltered = worker.filterMediaFiles(windowsFiles, {
      selectedFolder: 'C:/users/user/media_input/work',
    });
    assert.strictEqual(caseFiltered.length, 1);
    assert.strictEqual(caseFiltered[0].filename, 'pic3.jpg');

    // 4. Build folder tree for Windows paths and verify tree hierarchy
    const tree = worker.buildFolderTree(windowsFiles);
    assert.strictEqual(tree.length, 1, 'Should have 1 root node for media_input');
    const rootNode = tree[0];
    assert.strictEqual(rootNode.fileCount, 5, 'Root node should contain 5 files');
    const vacationNode = rootNode.children.find((c) => c.name === 'vacation');
    assert.ok(vacationNode, 'Vacation node should exist');
    assert.strictEqual(vacationNode.fileCount, 2, 'Vacation folder should have 2 files');
  });
});

describe('MediaCacheService', () => {
  it('should merge chunks, maintain order, and allow individual lookups', async () => {
    const cache = new MediaCacheService();
    assert.strictEqual(cache.loadedCount, 0);

    const chunk1: GalleryMediaFile[] = [
      { filename: 'f1.jpg', file_path: '/input/f1.jpg' },
      { filename: 'f2.jpg', file_path: '/input/f2.jpg' },
    ];

    await cache.mergeChunk(chunk1, 10);
    assert.strictEqual(cache.loadedCount, 2);
    assert.strictEqual(cache.total, 10);
    assert.ok(cache.get('/input/f1.jpg'));

    // Upsert
    await cache.upsert({ filename: 'f1.jpg', file_path: '/input/f1.jpg', description: 'Updated' });
    assert.strictEqual(cache.get('/input/f1.jpg')?.description, 'Updated');
    assert.strictEqual(cache.loadedCount, 2);

    await cache.clear();
    assert.strictEqual(cache.loadedCount, 0);
  });
});
