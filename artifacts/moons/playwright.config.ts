import {defineConfig} from '@playwright/test';
import {execFileSync} from 'node:child_process';

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../generated-artifacts/moons-tests',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:80',
    headless: true,
    launchOptions: {
      executablePath: execFileSync('which', ['chromium'], {encoding: 'utf8'}).trim(),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
    screenshot: 'only-on-failure',
  },
});
