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
