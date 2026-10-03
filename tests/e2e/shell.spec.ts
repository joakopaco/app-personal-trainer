import { test, expect } from '@playwright/test';
for (const width of [360,390,768,1440]) {
  test(`login works without horizontal overflow at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:850});
    await page.goto('/hoy');
    await expect(page.getByRole('heading',{name:'Tu jornada empieza acá'})).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}
