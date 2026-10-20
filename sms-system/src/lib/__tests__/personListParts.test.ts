import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { PersonCell, ViewDetailsLink } from '../../components/PersonListParts';
import studentsPageRaw from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersPageRaw from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';

// The Students and Teachers lists each wrote out the same first cell (the photo or the initial, then name, email and
// badges) and the same eye button. These compare the shared pieces with the markup the pages wrote; the rows of both
// lists were also captured in the browser before and after (the Teachers list as the Brookfield administrator, the Students list as a QA teacher).

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const row = (el: ReturnType<typeof createElement>) => html(createElement('table', null, createElement('tbody', null, createElement('tr', null, el))));

const IMG =
  '<img src="https://x.test/a.png" alt="" width="40" height="40" loading="lazy" decoding="async" class="md:hidden xl:block w-10 h-10 rounded-full object-cover"/>';
const INITIAL = (c: string) =>
  `<div class="flex md:hidden xl:flex w-10 h-10 rounded-full bg-sky-500 items-center justify-center text-white text-sm font-semibold shrink-0">${c}</div>`;
const TEXT = '<div class="flex flex-col"><h3 class="font-semibold">Ann Lee</h3><p class="text-xs text-gray-500">ann@x.test</p>';

describe('PersonCell', () => {
  const person = { name: 'Ann Lee', email: 'ann@x.test' };

  it('shows the photo, then the name and email', () => {
    expect(row(createElement(PersonCell, { person, photoSrc: 'https://x.test/a.png' }))).toContain(
      `<td class="flex items-center gap-4 p-4">${IMG}${TEXT}</div></td>`,
    );
  });

  it('shows the capitalised first letter of the name when there is no photo, or a ? for no name', () => {
    expect(row(createElement(PersonCell, { person: { ...person, name: 'ann lee' } }))).toContain(INITIAL('A'));
    expect(row(createElement(PersonCell, { person: { name: '' }, photoSrc: null }))).toContain(INITIAL('?'));
  });

  it('shows the Inactive and sign-in badges under the email, and then anything passed as children', () => {
    const out = row(
      createElement(PersonCell, { person: { ...person, status: 'inactive', loginState: 'not_sent' }, photoSrc: null }, createElement('span', null, 'Note')),
    );
    const afterEmail = out.slice(out.indexOf('ann@x.test</p>'));
    expect(afterEmail.indexOf('Inactive')).toBeGreaterThan(-1);
    expect(afterEmail.indexOf('Link not sent')).toBeGreaterThan(afterEmail.indexOf('Inactive'));
    expect(afterEmail.indexOf('<span>Note</span>')).toBeGreaterThan(afterEmail.indexOf('Link not sent'));
    expect(afterEmail.endsWith('<span>Note</span></div></td></tr></tbody></table>')).toBe(true);
  });

  it('shows no badges for an active person who has no sign-in state', () => {
    expect(row(createElement(PersonCell, { person, photoSrc: null }))).toContain(`${TEXT}</div></td>`);
  });
});

describe('ViewDetailsLink', () => {
  it('is the link and eye button both lists wrote out', () => {
    const eye = html(createElement(Eye, { className: 'w-4 h-4 text-white' }));
    expect(
      html(createElement(MemoryRouter, null, createElement(ViewDetailsLink, { to: '/dashboard/list/students/s1', name: 'Ann Lee' }))),
    ).toBe(
      '<a href="/dashboard/list/students/s1" data-discover="true"><button class="w-7 h-7 flex items-center justify-center rounded-full" style="background-color:var(--brand-button-bg, #0284c7)" ' +
        `title="View Ann Lee&#x27;s details" aria-label="View Ann Lee&#x27;s details">${eye}</button></a>`,
    );
  });
});

describe('the Students and Teachers lists', () => {
  const students = lf(studentsPageRaw);
  const teachers = lf(teachersPageRaw);

  it('use the shared cell and eye button instead of writing them out', () => {
    for (const [src, list] of [[students, 'students'], [teachers, 'teachers']] as const) {
      expect(src).toContain('<PersonCell person={item} photoSrc={photoSrc}');
      expect(src).toContain('<ViewDetailsLink to={`/dashboard/list/' + list + '/${item.id}`} name={item.name} />');
      expect(src).not.toContain('rounded-full object-cover');
      expect(src).not.toContain('<InactiveBadge');
      expect(src).not.toContain('<LoginLinkBadge');
    }
  });

  it('the Teachers list still adds its "No department" note inside the cell', () => {
    const cell = teachers.slice(teachers.indexOf('<PersonCell'), teachers.indexOf('</PersonCell>'));
    expect(cell).toContain('!USE_MOCK && institutionHasDepartments && !item.departmentId');
    expect(cell).toContain('No department');
    expect(students).not.toContain('No department');
  });
});
