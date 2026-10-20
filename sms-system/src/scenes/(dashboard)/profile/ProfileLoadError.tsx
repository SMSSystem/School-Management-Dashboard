// The card shown when the profile could not be loaded, with a Retry button.
const ProfileLoadError = ({ onRetry }: { onRetry: () => void }) => (
  <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
    <div className="bg-white dark:bg-gray-800 rounded-md p-8 shadow-sm max-w-md w-full flex flex-col items-center gap-4 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-12 h-12 text-red-500"
      >
        <path
          fillRule="evenodd"
          d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"
          clipRule="evenodd"
        />
      </svg>
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Failed to load profile
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          There was a problem loading your profile data. Please try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
      >
        Retry
      </button>
    </div>
  </div>
);

export default ProfileLoadError;
