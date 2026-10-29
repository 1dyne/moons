import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'projects.spec.ts',workers:1,timeout:120000,expect:{timeout:15000},
  outputDir:'../../generated-artifacts/projects-tests',reporter:'list',
  use:{baseURL:'http://127.0.0.1:4317',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)}},
  webServer:{command:'node scripts/run-project-preview.mjs',cwd:'../api-server',url:'http://127.0.0.1:4317/api/version',reuseExistingServer:false,timeout:60000},
});
