// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../apps/web/src/app/AppShell';
afterEach(cleanup);
test('keyboard users can reach student navigation and the main content', async()=>{
  render(<MemoryRouter><AppShell><h1>Mi jornada</h1></AppShell></MemoryRouter>);
  const user=userEvent.setup();
  await user.tab();
  expect(document.activeElement?.textContent).toBe('Ir al contenido');
  expect(screen.getByRole('navigation',{name:'Principal'})).toBeTruthy();
  expect(screen.getByRole('link',{name:'Alumnos'}).getAttribute('href')).toBe('/alumnos');
  expect(screen.getByRole('main').textContent).toContain('Mi jornada');
});
