import { useState, useEffect, useCallback } from 'react';
import type {
  PersonEventRecord,
  CreateEventInput,
  UpdateEventInput,
  PinMediaInput,
} from '../types/event.types.js';
import { notifyFamilyTreeUpdated } from '../state/useFamilyTreeStore.js';

export function usePersonTimeline(personId: string | null) {
  const [events, setEvents] = useState<PersonEventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!personId) {
      setEvents([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/family-tree/persons/${personId}/timeline`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setEvents(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load timeline');
    } finally {
      setIsLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const createEvent = async (data: CreateEventInput) => {
    if (!personId) throw new Error('No person selected');
    const res = await fetch(`/api/family-tree/persons/${personId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create event');
    }
    const created = await res.json();
    await fetchTimeline();
    notifyFamilyTreeUpdated();
    return created;
  };

  const updateEvent = async (eventId: string, data: UpdateEventInput) => {
    const res = await fetch(`/api/family-tree/events/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update event');
    }
    const updated = await res.json();
    await fetchTimeline();
    notifyFamilyTreeUpdated();
    return updated;
  };

  const deleteEvent = async (eventId: string) => {
    const res = await fetch(`/api/family-tree/events/${eventId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete event');
    }
    await fetchTimeline();
    notifyFamilyTreeUpdated();
  };

  const pinMediaToEvent = async (eventId: string, data: PinMediaInput) => {
    const res = await fetch(`/api/family-tree/events/${eventId}/pin-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to pin photo');
    }
    const pin = await res.json();
    await fetchTimeline();
    return pin;
  };

  const unpinMedia = async (pinId: string) => {
    const res = await fetch(`/api/family-tree/media-pins/${pinId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to unpin photo');
    }
    await fetchTimeline();
  };

  return {
    events,
    isLoading,
    error,
    refreshTimeline: fetchTimeline,
    createEvent,
    updateEvent,
    deleteEvent,
    pinMediaToEvent,
    unpinMedia,
  };
}
