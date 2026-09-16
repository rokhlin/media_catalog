import { useState, useEffect, useCallback } from 'react';
import type { TreeGraphData, TreeRecord } from '../types/tree.types.js';
import { notifyFamilyTreeUpdated } from '../state/useFamilyTreeStore.js';

export function useFamilyTreeData(activeTreeId: string = 'default_tree') {
  const [graphData, setGraphData] = useState<TreeGraphData | null>(null);
  const [trees, setTrees] = useState<TreeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async (treeId: string = activeTreeId) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = treeId && treeId !== 'default_tree'
        ? `/api/family-tree/trees/${treeId}/graph`
        : '/api/family-tree/graph';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setGraphData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load family tree graph');
    } finally {
      setIsLoading(false);
    }
  }, [activeTreeId]);

  const fetchTrees = useCallback(async () => {
    try {
      const res = await fetch('/api/family-tree/trees');
      if (res.ok) {
        const data = await res.json();
        setTrees(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchGraph();
    fetchTrees();
  }, [fetchGraph, fetchTrees]);

  const createPerson = async (data: Record<string, any>) => {
    const res = await fetch('/api/family-tree/persons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create person');
    }
    const created = await res.json();
    await fetchGraph();
    notifyFamilyTreeUpdated();
    return created;
  };

  const updatePerson = async (id: string, data: Record<string, any>) => {
    const res = await fetch(`/api/family-tree/persons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update person');
    }
    const updated = await res.json();
    await fetchGraph();
    notifyFamilyTreeUpdated();
    return updated;
  };

  const deletePerson = async (id: string) => {
    const res = await fetch(`/api/family-tree/persons/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // NestJS wraps message as string or string[]
      const msg = Array.isArray(err.message) ? err.message.join('; ') : (err.message || 'Failed to delete person');
      throw new Error(msg);
    }
    await fetchGraph();
    notifyFamilyTreeUpdated();
  };

  const quickAddRelative = async (data: {
    relationship: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';
    target_person_id: string;
    other_parent_id?: string;
    person: Record<string, any>;
    filiation?: string;
  }) => {
    const res = await fetch('/api/family-tree/persons/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to add relative');
    }
    const result = await res.json();
    await fetchGraph();
    notifyFamilyTreeUpdated();
    return result;
  };

  const createUnion = async (data: Record<string, any>) => {
    const res = await fetch('/api/family-tree/unions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create union');
    }
    const result = await res.json();
    await fetchGraph();
    notifyFamilyTreeUpdated();
    return result;
  };

  const updateUnion = async (id: string, data: Record<string, any>) => {
    const res = await fetch(`/api/family-tree/unions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update union');
    }
    const result = await res.json();
    await fetchGraph();
    notifyFamilyTreeUpdated();
    return result;
  };

  const deleteUnion = async (id: string) => {
    const res = await fetch(`/api/family-tree/unions/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete union');
    }
    await fetchGraph();
    notifyFamilyTreeUpdated();
  };

  const addChildToUnion = async (unionId: string, data: { person_id: string; filiation?: string; birth_order?: number }) => {
    const res = await fetch(`/api/family-tree/unions/${unionId}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to add child to union');
    }
    await fetchGraph();
    notifyFamilyTreeUpdated();
  };

  const removeChildFromUnion = async (unionId: string, personId: string) => {
    const res = await fetch(`/api/family-tree/unions/${unionId}/children/${personId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to remove child');
    }
    await fetchGraph();
    notifyFamilyTreeUpdated();
  };

  const linkFace = async (data: { tree_person_id: string; media_person_name: string; media_face_id: string; is_primary_avatar?: boolean }) => {
    const res = await fetch('/api/family-tree/link-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to link face');
    }
    const result = await res.json();
    await fetchGraph();
    notifyFamilyTreeUpdated();
    return result;
  };

  const unlinkFace = async (linkId: string) => {
    const res = await fetch(`/api/family-tree/link-face/${linkId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to unlink face');
    }
    await fetchGraph();
    notifyFamilyTreeUpdated();
  };

  const setRootPerson = async (treeId: string, personId: string) => {
    const res = await fetch(`/api/family-tree/trees/${treeId}/root/${personId}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to set root person');
    }
    await fetchGraph();
    notifyFamilyTreeUpdated();
  };

  const recordTreeHistory = async (actionType: string, description: string, details?: any) => {
    try {
      const treeId = activeTreeId || 'default_tree';
      const res = await fetch(`/api/family-tree/trees/${treeId}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_type: actionType, description, details }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
  };

  const getTreeHistory = async (treeId: string = activeTreeId, limit: number = 30) => {
    try {
      const tId = treeId || 'default_tree';
      const res = await fetch(`/api/family-tree/trees/${tId}/history?limit=${limit}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
    return [];
  };

  return {
    graphData,
    trees,
    isLoading,
    error,
    refreshGraph: fetchGraph,
    createPerson,
    updatePerson,
    deletePerson,
    quickAddRelative,
    createUnion,
    updateUnion,
    deleteUnion,
    addChildToUnion,
    removeChildFromUnion,
    linkFace,
    unlinkFace,
    setRootPerson,
    recordTreeHistory,
    getTreeHistory,
  };
};
