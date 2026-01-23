'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useScheduleStore } from '../../store/scheduleStore';
import { apiFetch } from '../../lib/apiClient';
import { getUserRole, isManagerRole } from '../../utils/role';

type LocationRow = {
  id: string;
  organization_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export default function LocationsPage() {
  const router = useRouter();
  const { currentUser, init, isInitialized, activeRestaurantId } = useAuthStore();
  const { setLocations } = useScheduleStore();

  const [locations, setLocalLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedSortOrder, setEditedSortOrder] = useState('0');

  const role = getUserRole(currentUser?.role);
  const canManage = isManagerRole(role);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && (!currentUser || !canManage)) {
      router.push('/dashboard?notice=forbidden');
    }
  }, [isInitialized, currentUser, canManage, router]);

  const loadLocations = async () => {
    if (!activeRestaurantId) return;
    setLoading(true);
    setError('');
    const result = await apiFetch<{ locations: LocationRow[] }>(
      `/api/locations/list?organizationId=${activeRestaurantId}`
    );
    if (!result.ok) {
      setError(result.error || 'Unable to load locations.');
      setLoading(false);
      return;
    }
    const rows = result.data?.locations ?? [];
    setLocalLocations(rows);
    setLocations(
      rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        sortOrder: Number(row.sort_order ?? 0),
        createdAt: row.created_at,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    if (activeRestaurantId && isInitialized && currentUser && canManage) {
      loadLocations();
    }
  }, [activeRestaurantId, isInitialized, currentUser, canManage]);

  const handleCreate = async () => {
    if (!activeRestaurantId || !newName.trim()) {
      setError('Location name is required.');
      return;
    }

    const result = await apiFetch<{ location: LocationRow }>('/api/locations/create', {
      method: 'POST',
      json: {
        organizationId: activeRestaurantId,
        name: newName.trim(),
        sortOrder: Number(newSortOrder || 0),
      },
    });

    if (!result.ok) {
      setError(result.error || 'Unable to create location.');
      return;
    }

    setNewName('');
    setNewSortOrder('0');
    await loadLocations();
  };

  const handleStartEdit = (location: LocationRow) => {
    setEditingId(location.id);
    setEditedName(location.name);
    setEditedSortOrder(String(location.sort_order ?? 0));
    setError('');
  };

  const handleSaveEdit = async () => {
    if (!activeRestaurantId || !editingId || !editedName.trim()) {
      setError('Location name is required.');
      return;
    }

    const result = await apiFetch<{ location: LocationRow }>('/api/locations/update', {
      method: 'POST',
      json: {
        id: editingId,
        organizationId: activeRestaurantId,
        name: editedName.trim(),
        sortOrder: Number(editedSortOrder || 0),
      },
    });

    if (!result.ok) {
      setError(result.error || 'Unable to update location.');
      return;
    }

    setEditingId(null);
    setEditedName('');
    setEditedSortOrder('0');
    await loadLocations();
  };

  const handleDelete = async (location: LocationRow) => {
    if (!activeRestaurantId) return;
    const confirmed = window.confirm(
      `Delete "${location.name}"? Any shifts using it will be cleared.`
    );
    if (!confirmed) return;

    const result = await apiFetch('/api/locations/delete', {
      method: 'POST',
      json: {
        id: location.id,
        organizationId: activeRestaurantId,
      },
    });

    if (!result.ok) {
      setError(result.error || 'Unable to delete location.');
      return;
    }

    await loadLocations();
  };

  if (!isInitialized || !currentUser || !canManage) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-theme-primary">Locations</h1>
          <p className="text-theme-tertiary">Manage shift locations for this restaurant.</p>
        </header>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold text-theme-primary">Add location</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              placeholder="Front, Patio, Bar..."
            />
            <input
              type="number"
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(e.target.value)}
              className="w-28 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              placeholder="Order"
            />
            <button
              type="button"
              onClick={handleCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-theme-primary mb-3">Current locations</h2>
          {loading ? (
            <p className="text-theme-secondary">Loading locations...</p>
          ) : locations.length === 0 ? (
            <p className="text-theme-muted">No locations yet.</p>
          ) : (
            <div className="space-y-3">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-theme-tertiary border border-theme-primary rounded-xl p-4"
                >
                  {editingId === location.id ? (
                    <div className="flex-1 flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="flex-1 px-3 py-2 bg-theme-secondary border border-theme-primary rounded-lg text-theme-primary"
                      />
                      <input
                        type="number"
                        value={editedSortOrder}
                        onChange={(e) => setEditedSortOrder(e.target.value)}
                        className="w-28 px-3 py-2 bg-theme-secondary border border-theme-primary rounded-lg text-theme-primary"
                      />
                    </div>
                  ) : (
                    <div>
                      <p className="text-theme-primary font-medium">{location.name}</p>
                      <p className="text-xs text-theme-muted">Sort: {location.sort_order ?? 0}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {editingId === location.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditedName('');
                            setEditedSortOrder('0');
                          }}
                          className="px-3 py-1.5 rounded-md bg-theme-secondary text-theme-secondary hover:bg-theme-hover transition-colors text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-3 py-1.5 rounded-md bg-emerald-500 text-zinc-900 hover:bg-emerald-400 transition-colors text-xs font-semibold"
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(location)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-theme-secondary text-theme-secondary hover:bg-theme-hover transition-colors text-xs"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(location)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
