import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://xn--raunko-j2a.si/login');
  await page.getByRole('textbox', { name: 'vas@email.com' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).fill('mahnic.nik');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: 'vas@email.com' }).fill('mahnic.nik');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: 'vas@email.com' }).dblclick();
  await page.getByRole('textbox', { name: 'vas@email.com' }).click({
    modifiers: ['Alt', 'Shift']
  });
  await page.getByRole('textbox', { name: 'vas@email.com' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+Shift+@');
  await page.getByRole('textbox', { name: '••••••••' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).dblclick();
  await page.getByRole('textbox', { name: 'vas@email.com' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('ControlOrMeta+Shift+2');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('CapsLock');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('ControlOrMeta+2');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: 'vas@email.com' }).press('Alt+™');
  await page.getByRole('textbox', { name: '••••••••' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).click();
  await page.getByRole('textbox', { name: 'vas@email.com' }).fill('mahnic.nik@gmail.com');
  await page.getByRole('textbox', { name: '••••••••' }).click();
  await page.getByRole('textbox', { name: '••••••••' }).fill('knjigovodja');
  await page.getByRole('button', { name: 'Prijava' }).click();
});