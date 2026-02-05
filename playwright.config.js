const path = require('path');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: path.join(__dirname, 'tests'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1280, height: 720 }
  }
};

module.exports = config;
