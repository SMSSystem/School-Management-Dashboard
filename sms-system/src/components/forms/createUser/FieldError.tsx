// Always rendered (even with no message) so its line-height reserves a
// constant min-h-4 slot under every field — otherwise a field's row in
// the surrounding grid grows the moment an error appears, pushing every
// row below it down.
export function FieldError({ message }: { message?: string }) {
  return <p className="min-h-4 text-xs font-medium text-red-500">{message}</p>;
}
