import { Component, type ErrorInfo, type ReactNode } from "react";

// Catches an error thrown while ONE dashboard card renders (for example a chart given a document
// shape it does not expect), so that card shows a short message in its own place instead of
// PageErrorBoundary replacing the whole page. When nothing fails it renders its children as they
// are: no wrapper element, so grid cells, heights and the tour's #tour-* ids are untouched.
// The page unmounting on navigation resets it.
type Props = { children: ReactNode };
type State = { failed: boolean };

class CardErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("A dashboard card failed to render:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="h-full bg-white dark:bg-gray-800 rounded-md p-4 text-sm text-gray-500 dark:text-gray-400"
      >
        This section couldn't be shown.
      </div>
    );
  }
}

export default CardErrorBoundary;
