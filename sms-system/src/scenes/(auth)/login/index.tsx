import { FormEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError('Invalid email or password.');
      setLoading(false);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-1/2 bg-[#0ea5e9] items-center justify-center p-12 text-white">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="logo" width={40} height={40} />
            <h1 className="text-2xl font-bold">School Management</h1>
          </div>
          <p className="text-lg opacity-90">
            Welcome back! Sign in to access your dashboard and manage your daily tasks.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="logo" width={32} height={32} />
            <h2 className="text-xl font-semibold">Sign in</h2>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-slate-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-slate-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white font-medium py-2.5 rounded-md transition ${loading ? 'bg-sky-400 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600'}`}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-sm text-gray-600">
            <span className="mr-2">Don&apos;t have an account?</span>
            <Link to="#" className="text-sky-600 hover:underline">Contact admin</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
