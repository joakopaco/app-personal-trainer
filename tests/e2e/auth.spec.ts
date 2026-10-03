import {test,expect} from '@playwright/test';
import {accounts,adminClient} from '../fixtures/cloud';
test('wrong password stays anonymous, real trainer enters a private space',async({page})=>{
  await page.goto('/hoy');await page.getByLabel('Email').fill(accounts[0].email);await page.getByLabel('Contraseña',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Contraseña',{exact:true}).fill(accounts[0].password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page.getByRole('navigation',{name:'Principal'})).toBeVisible();
  await page.getByRole('link',{name:'Alumnos',exact:true}).click();await expect(page).toHaveURL(/\/alumnos$/);
});
test('used recovery token cannot be replayed',async({page})=>{
  const{data,error}=await adminClient().auth.admin.generateLink({type:'recovery',email:accounts[1].email});expect(error).toBeNull();
  const token=data.properties!.hashed_token;
  await page.goto('/auth/callback?type=recovery&token_hash='+token);await expect(page.getByLabel('Nueva contraseña')).toBeVisible();
  try{
    await page.getByLabel('Nueva contraseña').fill(accounts[1].password+'x');await page.getByRole('button',{name:'Guardar contraseña'}).click();await expect(page.getByRole('navigation',{name:'Principal'})).toBeVisible();
    await page.goto('/auth/callback?type=recovery&token_hash='+token);await expect(page.getByRole('alert')).toContainText('utilizado o venció');
  }finally{await adminClient().auth.admin.updateUserById(accounts[1].userId,{password:accounts[1].password});}
});
