import { useState } from 'react';
import { sendPasswordResetEmail, getAuth } from 'firebase/auth';

interface Props {
  email: string;
}

export function AccountActionsCard({ email }: Props) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(getAuth(), email);
      setSent(true);
    } catch {
      setError('Failed to send reset email. Verify the email address is correct.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md">
      <h2 className="text-base font-semibold mb-3">Account Actions</h2>
      <hr className="mb-3 border-gray-200 dark:border-gray-700" />
      {sent ? (
        <p className="text-sm text-green-600 dark:text-green-400">
          Password reset email sent to {email}.
        </p>
      ) : (
        <button
          onClick={handleReset}
          disabled={loading}
          className="text-sm px-4 py-2 rounded-md border border-sky-400 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send Password Reset Email'}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
