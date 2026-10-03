import { sortByName } from './sortByName';

// Which subjects a class studies: every institution-wide subject, plus the
// subjects scoped to specific classes that list this one. Pure, so the rule the
// Class detail page uses is unit-tested.

type SubjectRef = {
  id: string;
  name: string;
  classScope: 'institution' | 'class';
  classIds: string[];
};

export function subjectsForClass<T extends SubjectRef>(subjects: T[] | undefined, classId: string): T[] {
  const covering = (subjects ?? []).filter(
    (s) => s.classScope === 'institution' || (s.classIds ?? []).includes(classId),
  );
  return sortByName(covering, (s) => s.name);
}

// "12 of 30" or, with no capacity set, just "12". Used by the Class detail card.
export function formatCapacity(enrolled: number, capacity: number | null | undefined): string {
  return capacity && capacity > 0 ? `${enrolled} of ${capacity}` : String(enrolled);
}

// True when more students are enrolled than the class's capacity allows.
export function isOverCapacity(enrolled: number, capacity: number | null | undefined): boolean {
  return !!capacity && capacity > 0 && enrolled > capacity;
}
