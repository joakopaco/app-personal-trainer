import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/cloud';
test('administrative navigation bypasses the trainer offline shell', async ({page, context}) => {
  await page.goto('/hoy');
  await page.getByLabel('Email', {exact:true}).fill(accounts[0].email);
  await page.getByLabel('Contraseña', {exact:true}).fill(accounts[0].password);
  await page.getByRole('button', {name:'Ingresar',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Principal'})).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('/administracion');
  await expect(page.getByLabel('Usuario', {exact:true})).toBeVisible();
  await expect(page.getByLabel('Email', {exact:true})).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.goto('/administracion')).rejects.toThrow();
});
