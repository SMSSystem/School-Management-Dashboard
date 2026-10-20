import formModalRaw from '../../components/FormModal.tsx?raw';
import formRegistryRaw from '../../components/formRegistry.tsx?raw';
import deleteRecordRaw from '../deleteRecord.ts?raw';
import formTablesRaw from '../formTables.ts?raw';

// The Add/Edit/Delete dialog used to be one file (components/FormModal.tsx). It is now four: the tables and the Delete
// wording (lib/formTables.ts), what Delete does for each table (lib/deleteRecord.ts), the form registry
// (components/formRegistry.tsx) and the dialog itself. Tests that pin its behaviour read them as one text, in this
// order, so that the Delete branches come before the dialog's own close handler as they always did.
export const formModalSource = [formTablesRaw, deleteRecordRaw, formRegistryRaw, formModalRaw]
  .map((s) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)))
  .join(String.fromCharCode(10));
