import { useEffect, useState } from 'react';
import { collection, doc, getDocs, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import BrandForm from '@/components/forms/BrandForm';
import type { InstitutionBrand } from '@/lib/AuthContext';

const BrandSettingsPage = () => {
  const { role } = useAuth();

  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [initialData, setInitialData] = useState<Partial<InstitutionBrand> | undefined>();
  const [loadError, setLoadError] = useState(false);

  // Fetch all institutions for the picker
  useEffect(() => {
    if (role !== 'super_admin') return;
    setInstitutionsLoading(true);
    getDocs(collection(db, 'institutions'))
      .then((snap) => {
        setInstitutions(
          snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || d.id }))
        );
      })
      .catch(() => {})
      .finally(() => setInstitutionsLoading(false));
  }, [role]);

  // Fetch brand data whenever the selected institution changes
  useEffect(() => {
    if (!selectedId) { setInitialData(undefined); setLoadError(false); return; }
    setLoadError(false);
    setInitialData(undefined);
    getDoc(doc(db, 'institutions', selectedId))
      .then((snap) => {
        if (!snap.exists()) { setLoadError(true); return; }
        const d = snap.data();
        setInitialData({
          name:       d.name       as string | undefined,
          motto:      d.motto      as string | undefined,
          phone:      d.phone      as string | undefined,
          email:      d.email      as string | undefined,
          address:    d.address    as string | undefined,
          brandColor: d.brandColor as string | undefined,
          logoUrl:    d.logoUrl    as string | undefined,
        });
      })
      .catch(() => setLoadError(true));
  }, [selectedId]);

  if (role !== 'super_admin') {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">
          Access restricted. This page is only available to platform administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Settings</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Manage brand settings for any institution on the platform.
      </p>

      {/* Institution picker */}
      <div className="mt-4 max-w-sm">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          Select Institution
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
        >
          <option value="">— Select an institution —</option>
          {institutions.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
        {institutionsLoading && (
          <p className="text-xs text-gray-400 mt-1">Loading institutions…</p>
        )}
      </div>

      {!selectedId && !institutionsLoading && (
        <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">
          Select an institution above to manage its brand settings.
        </p>
      )}

      {loadError && (
        <p className="mt-4 text-sm text-red-600">Institution not found.</p>
      )}

      {selectedId && !loadError && (
        <BrandForm
          institutionId={selectedId}
          initialData={initialData}
          mode="full"
          onSuccess={() => {}}
        />
      )}
    </div>
  );
};

export default BrandSettingsPage;
