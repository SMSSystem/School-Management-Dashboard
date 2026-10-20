// Types for cardBoundaryLogic.mjs, so the TypeScript tests can import it.

export interface UnwrappedCard {
  file: string;
  /** 1-based */
  line: number;
  /** the component, for example "UserCard" */
  name: string;
}

export function findUnwrappedCards(files: Map<string, string>): UnwrappedCard[];
