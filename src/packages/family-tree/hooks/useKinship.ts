import { useState, useEffect, useCallback } from 'react';
import type { KinshipInfo, PersonContextResponse } from '../types/tree.types.js';

export function useKinship(rootPersonId?: string | null, targetPersonId?: string | null) {
  const [kinship, setKinship] = useState<KinshipInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchKinship = useCallback(async () => {
    if (!rootPersonId || !targetPersonId) {
      setKinship(null);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/family-tree/kinship?rootPersonId=${encodeURIComponent(rootPersonId)}&targetPersonId=${encodeURIComponent(targetPersonId)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setKinship(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [rootPersonId, targetPersonId]);

  useEffect(() => {
    fetchKinship();
  }, [fetchKinship]);

  const getPersonContext = async (params: {
    name?: string;
    mediaPersonId?: string;
    faceId?: string;
    personId?: string;
  }): Promise<PersonContextResponse> => {
    const q = new URLSearchParams();
    if (params.name) q.set('name', params.name);
    if (params.mediaPersonId) q.set('mediaPersonId', params.mediaPersonId);
    if (params.faceId) q.set('faceId', params.faceId);
    if (params.personId) q.set('personId', params.personId);

    const res = await fetch(`/api/family-tree/public/person-context?${q.toString()}`);
    if (res.ok) {
      return res.json();
    }
    return { found: false };
  };

  return { kinship, isLoading, refreshKinship: fetchKinship, getPersonContext };
}
