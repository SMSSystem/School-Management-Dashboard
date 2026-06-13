import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import BrandForm from '@/components/forms/BrandForm';
import type { InstitutionBrand } from '@/lib/AuthContext';

const BrandSettingsPage = () => {
  const { role, institutionId: authInstitutionId, institution: authInstitution, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();

  // super_admin resolves institutionId from query param; institution_admin uses their own
  const targetId =
    role === 'super_admin'
      ? searchParams.get('institutionId')
      : authInstitutionId;

  const [initialData, setInitialData] = useState<Partial<InstitutionBrand> | undefined>(
    role === 'institution_admin' ? (authInstitution ?? undefined) : undefined
  );
  const [loadError, setLoadError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // super_admin: fetch the target institution's current brand data
  useEffect(() => {
    if (role !== 'super_admin' || !targetId) return;
    getDoc(doc(db, 'institutions', targetId))
      .then((snap) => {
        if (snap.exists()) {
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
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true));
  }, [role, targetId]);

  if (role === 'super_admin' && !targetId) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">
          No institution specified. Navigate here via an institution link or append{' '}
          <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">
            ?institutionId=&lt;id&gt;
          </code>{' '}
          to the URL.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">Institution not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Settings</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Update your institution's brand data. Changes take effect immediately.
      </p>
      {successMessage && (
        <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
          {successMessage}
        </div>
      )}
      {targetId && (
        <BrandForm
          institutionId={targetId}
          initialData={initialData}
          onSuccess={() => {
            refreshProfile();
            setSuccessMessage('Brand data saved successfully.');
            setTimeout(() => setSuccessMessage(null), 4000);
          }}
        />
      )}
    </div>
  );
};

export default BrandSettingsPage;
