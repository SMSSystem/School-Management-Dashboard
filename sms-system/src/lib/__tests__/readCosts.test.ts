import { beforeEach, describe, expect, it } from 'vitest';
import { FEEDBACK_LIST_LIMIT } from '../feedbackComment';
import { PERSISTABLE_QUERY_ROOTS } from '../queryPersistence';
import { queryClient } from '../queryClient';
import {
  TRACKING_QUERY_ROOT,
  TRACKING_STALE_MS,
  cachedTrackingData,
  rosterFromCounts,
  trackingQueryKey,
  type TrackingData,
} from '../gradeTrackingCache';
import feedbackRaw from '../../scenes/(dashboard)/list/feedback/index.tsx?raw';
import trackingRaw from '../../scenes/(dashboard)/admin/grade-entry-tracking/index.tsx?raw';
import loaderRaw from '../gradeTrackingLoader.ts?raw';

// Firebase free tier (Spark: 50,000 reads a day). Two pages used to read thousands of documents
// per visit once an institution had a few hundred students; these pin the cheaper behaviour.

const norm = (s: string) => s.split('\r\n').join('\n');
const feedback = norm(feedbackRaw);
const tracking = norm(trackingRaw);
const loader = norm(loaderRaw);

describe('the Feedback list read cost', () => {
  it('reads only the newest comments, not the whole collection', () => {
    expect(FEEDBACK_LIST_LIMIT).toBe(100);
    expect(feedback).toContain('orderBy("createdAt", "desc"),');
    expect(feedback).toContain('limit(FEEDBACK_LIST_LIMIT),');
    expect(feedback).not.toMatch(/subscribeSnapshot\(`feedback:\$\{institutionId\}`,\s*institutionCollection\(institutionId, "feedback_comments"\),/);
    expect(feedback.match(/subscribeSnapshot\(/g)).toHaveLength(1);
  });

  it('says so when the cap is reached, and stops "loading" if the read fails', () => {
    expect(feedback).toContain('liveFeedback.length >= FEEDBACK_LIST_LIMIT');
    expect(feedback).toContain('Showing the newest {FEEDBACK_LIST_LIMIT} comments.');
    expect(feedback).toContain('console.error("Could not load feedback comments:", err);');
  });
});

describe('rosterFromCounts', () => {
  it('keeps classes that have students and leaves out empty ones', () => {
    const roster = rosterFromCounts([
      { classId: 'a', count: 21 },
      { classId: 'b', count: 0 },
      { classId: 'c', count: 3 },
    ]);
    expect([...roster.entries()]).toEqual([
      ['a', 21],
      ['c', 3],
    ]);
  });
});

describe('the Grade-Entry Tracking cache', () => {
  const data: TrackingData = { assignments: [], results: [], feedback: [], rosters: new Map(), docsRead: 5 };
  const key = trackingQueryKey('inst1', 'term1');

  beforeEach(() => queryClient.clear());

  it('keeps data for five minutes and never persists it (it holds student ids)', () => {
    expect(TRACKING_STALE_MS).toBe(300_000);
    expect(key).toEqual([TRACKING_QUERY_ROOT, 'inst1', 'term1']);
    expect(PERSISTABLE_QUERY_ROOTS).not.toContain(TRACKING_QUERY_ROOT);
  });

  it('serves fresh cached data without a read, and nothing once it has gone stale or is missing', () => {
    expect(cachedTrackingData('inst1', 'term1')).toBeUndefined();
    queryClient.setQueryData(key, data);
    expect(cachedTrackingData('inst1', 'term1')).toBe(data);
    expect(cachedTrackingData('inst1', 'term2')).toBeUndefined();
    queryClient.setQueryData(key, data, { updatedAt: Date.now() - TRACKING_STALE_MS - 1000 });
    expect(cachedTrackingData('inst1', 'term1')).toBeUndefined();
  });
});

describe('the Grade-Entry Tracking page and loader', () => {
  it('no longer reads Firestore when the page opens: it waits for "Load tracking"', () => {
    expect(tracking).not.toContain('getDocs');
    expect(tracking).toContain("import { doc, getDoc, updateDoc } from 'firebase/firestore';");
    expect(tracking).toContain('Load tracking');
    expect(tracking).toContain('onClick={() => void loadTracking(false)}');
    // the term effect only looks in the cache
    expect(tracking).toContain('cachedTrackingData(institutionId, termId) ?? null');
    expect(tracking).toContain('onClick={() => void loadTracking(true)}');
  });

  it('loads through the cache, and counts the roster instead of reading every student', () => {
    expect(loader).toContain('staleTime: force ? 0 : TRACKING_STALE_MS,');
    expect(loader).toContain('queryClient.fetchQuery(');
    expect(loader).toContain('getCountFromServer(');
    expect(loader).toContain("where('classIds', 'array-contains', c.id),");
    expect(loader).not.toMatch(/getDocs\(query\(\s*collection\(db, 'users'\)/);
  });
});
