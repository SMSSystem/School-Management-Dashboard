import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotAvailableYet, { NotAvailableNote } from '../../components/forms/NotAvailableYet';
import formModalRaw from '../../components/FormModal.tsx?raw';
import announcementsCardRaw from '../../components/Announcements.tsx?raw';
import eventsCardRaw from '../../components/EventCalendar.tsx?raw';
import eventsPageRaw from '../../scenes/(dashboard)/list/events/index.tsx?raw';
import announcementsPageRaw from '../../scenes/(dashboard)/list/announcements/index.tsx?raw';
import lessonsPageRaw from '../../scenes/(dashboard)/list/lessons/index.tsx?raw';

// The Events, Announcements and Lessons Add/Edit forms used to be complete-looking forms that logged what was typed
// with console.log and closed; nothing in the app writes those collections. They are a "not available yet" panel now.

const lf = (s: string) => s.split('\r\n').join('\n');
const formModal = lf(formModalRaw);

describe('NotAvailableYet', () => {
  it('explains, offers Close, and has nothing to fill in', () => {
    const html = renderToStaticMarkup(createElement(NotAvailableYet, { what: 'events' }));
    expect(html).toContain('Events are not available yet');
    expect(html).toContain('Creating and editing events is not built yet. Nothing you enter here would be saved.');
    expect(html).toContain('>Close</button>');
    for (const tag of ['<input', '<select', '<textarea', '<form']) expect(html).not.toContain(tag);
  });

  it('names the feature', () => {
    expect(renderToStaticMarkup(createElement(NotAvailableYet, { what: 'announcements' }))).toContain('Announcements are not available yet');
    expect(renderToStaticMarkup(createElement(NotAvailableNote, { what: 'lessons' }))).toContain('Lessons cannot be created yet, so this list stays empty.');
  });
});

describe('where it is used', () => {
  it('the form registry answers the three tables with it and no longer loads their forms', () => {
    for (const [table, what] of [['lesson', 'lessons'], ['event', 'events'], ['announcement', 'announcements']] as const) {
      expect(formModal, table).toContain(`${table}:`.padEnd(14) + `(_type, _data, onClose) => <NotAvailableYet what="${what}" onClose={onClose} />`);
    }
    for (const gone of ['EventForm', 'AnnouncementForm', 'LessonForm']) expect(formModal, gone).not.toContain(gone);
    const files = Object.keys(import.meta.glob('../../components/forms/*.tsx'));
    for (const gone of ['EventForm', 'AnnouncementForm', 'LessonForm']) expect(files.some((f) => f.endsWith(`/${gone}.tsx`)), gone).toBe(false);
  });

  it('each of the three list pages says why it is empty', () => {
    expect(lf(eventsPageRaw)).toContain('<NotAvailableNote what="events" />');
    expect(lf(announcementsPageRaw)).toContain('<NotAvailableNote what="announcements" />');
    expect(lf(lessonsPageRaw)).toContain('<NotAvailableNote what="lessons" />');
  });

  it('the Home cards say "coming soon" when they have nothing to show', () => {
    expect(lf(announcementsCardRaw)).toContain('Announcements are coming soon.');
    expect(lf(eventsCardRaw)).toContain('Events are coming soon.');
    expect(lf(announcementsCardRaw)).not.toContain('No announcements to display');
    expect(lf(eventsCardRaw)).not.toContain('No upcoming events');
  });
});
