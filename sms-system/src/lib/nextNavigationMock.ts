// Stands in for `next/navigation` in the production build. nextstepjs (the product tour) ships a Next.js adapter that
// imports useRouter and usePathname from `next/navigation`; this app uses the React Router adapter and never loads
// that file, but the bundler still resolves the import, and without an alias the build fails with MISSING_EXPORT.
// vite.config.ts points `next/navigation` here. Do not delete it unless nextstepjs stops importing next/navigation.
export const useRouter = () => ({
  push: (_url: string) => {},
  replace: (_url: string) => {},
  prefetch: (_url: string) => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
});
export const usePathname = () => '';
export const useSearchParams = () => new URLSearchParams();
export const useParams = (): Record<string, string> => ({});
