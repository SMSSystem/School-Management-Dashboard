type NavigateFn = (url: string) => void;

const noopNavigate: NavigateFn = () => {};

export const useRouter = () => ({
  push: noopNavigate,
  replace: noopNavigate,
  prefetch: noopNavigate,
  back: () => {},
  forward: () => {},
  refresh: () => {},
});
export const usePathname = () => '';
export const useSearchParams = () => new URLSearchParams();
export const useParams = (): Record<string, string> => ({});
