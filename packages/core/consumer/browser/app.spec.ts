import { test, expect } from '@playwright/test';
test('state, effects and both themes work in the production build',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Increment',exact:true}).click();
  await expect(page.getByTestId('count')).toHaveText('1');
  await page.getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.getByTestId('count')).toHaveText('42');
  const light=await page.locator('main').evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(light).not.toBe('rgba(0, 0, 0, 0)');
  await page.getByRole('button',{name:'Theme',exact:true}).click();
  await expect(page.locator('html')).toHaveClass('dark');
  const dark=await page.locator('main').evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
  expect(errors).toEqual([]);
});
