import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG = {
  JITSI_URL: 'https://meet.javiergonzalez.io',
  DISPLAY_NAME: 'leon living room',
  CHROMECAST_RETRIES: 4,
  CHROMECAST_RETRY_DELAY_MS: 5000,
  JITSI_TIMEOUT_MS: 30000,
  SCREENSHOT_DIR: './screenshots',
};

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function ensureScreenshotDir(): Promise<void> {
  if (!fs.existsSync(CONFIG.SCREENSHOT_DIR)) {
    fs.mkdirSync(CONFIG.SCREENSHOT_DIR, { recursive: true });
  }
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  await ensureScreenshotDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(CONFIG.SCREENSHOT_DIR, `${name}_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath}`);
}

async function cleanup(): Promise<void> {
  console.log('\n🧹 Cleaning up...');
  if (context) {
    await context.close().catch(() => {});
  }
  if (browser) {
    await browser.close().catch(() => {});
  }
  console.log('👋 Browser closed');
}

async function castToChromecast(page: Page): Promise<boolean> {
  console.log('📺 Attempting to cast to Chromecast...');
  
  for (let attempt = 1; attempt <= CONFIG.CHROMECAST_RETRIES; attempt++) {
    console.log(`  Attempt ${attempt}/${CONFIG.CHROMECAST_RETRIES}`);
    
    try {
      const castButtonSelectors = [
        '[aria-label*="cast" i]',
        '[aria-label*="Cast" i]',
        '[title*="cast" i]',
        '[title*="Cast" i]',
        'button:has-text("cast")',
        'button:has-text("Cast")',
        '[data-testid*="cast" i]',
        '.cast-button',
        '[class*="cast" i]',
      ];
      
      for (const selector of castButtonSelectors) {
        const button = await page.$(selector);
        if (button) {
          console.log(`    Found cast button: ${selector}`);
          await button.click();
          console.log('    Clicked cast button');
          
          await page.waitForTimeout(2000);
          
          const deviceSelectors = [
            '[role="dialog"] button',
            '.cast-device',
            '[class*="device" i]',
            'text=/Chromecast|TV|Screen/i',
          ];
          
          for (const deviceSelector of deviceSelectors) {
            const device = await page.$(deviceSelector);
            if (device) {
              console.log(`    Found device: ${deviceSelector}`);
              await device.click();
              console.log('    ✅ Casting started!');
              await takeScreenshot(page, 'casting_started');
              await page.waitForTimeout(3000);
              return true;
            }
          }
        }
      }
      
      console.log('    No cast button found, trying keyboard shortcut...');
      await page.keyboard.press('Control+Shift+S');
      await page.waitForTimeout(2000);
      
      const dialogSelectors = [
        '[role="dialog"]',
        '.cast-dialog',
        '[class*="cast" i]',
      ];
      
      for (const dialogSelector of dialogSelectors) {
        const dialog = await page.$(dialogSelector);
        if (dialog) {
          const firstDevice = await dialog.$('button, [role="button"], .device');
            if (firstDevice) {
            await firstDevice.click();
            console.log('    ✅ Casting started via keyboard shortcut!');
            await takeScreenshot(page, 'casting_started_keyboard');
            return true;
          }
        }
      }
      
    } catch (error) {
      console.log(`    Attempt ${attempt} failed: ${error}`);
    }
    
    if (attempt < CONFIG.CHROMECAST_RETRIES) {
      console.log(`    Waiting ${CONFIG.CHROMECAST_RETRY_DELAY_MS}ms before retry...`);
      await page.waitForTimeout(CONFIG.CHROMECAST_RETRY_DELAY_MS);
    }
  }
  
  console.log('  ❌ All casting attempts failed, continuing without casting');
  return false;
}

async function joinMeeting(page: Page): Promise<boolean> {
  console.log('🎯 Joining meeting...');
  
  try {
    console.log('  Waiting for pre-join screen...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const nameSelectors = [
      'input[placeholder*="name" i]',
      'input[placeholder*="Name" i]',
      'input[aria-label*="name" i]',
      'input[aria-label*="Name" i]',
      'input[id*="name" i]',
      'input[name*="name" i]',
      'input[data-testid*="name" i]',
      '#username',
      '#displayName',
      'input[type="text"]',
    ];
    
    let nameInput = null;
    for (const selector of nameSelectors) {
      nameInput = await page.$(selector);
      if (nameInput) {
        console.log(`  Found name input: ${selector}`);
        break;
      }
    }
    
    if (!nameInput) {
      console.log('  ⚠️ Name input not found, trying to proceed anyway...');
    } else {
      await nameInput.fill(CONFIG.DISPLAY_NAME);
      console.log(`  ✅ Entered display name: ${CONFIG.DISPLAY_NAME}`);
      await takeScreenshot(page, 'display_name_entered');
    }
    
    const joinSelectors = [
      'button:has-text("join")',
      'button:has-text("Join")',
      'button:has-text("join meeting")',
      'button:has-text("Join Meeting")',
      'button[aria-label*="join" i]',
      'button[aria-label*="Join" i]',
      '[data-testid*="join" i]',
      '#joinButton',
      '.join-button',
      'button[type="submit"]',
      '[role="button"]:has-text("Join")',
      '[role="button"][aria-label*="Join meeting" i]',
      '[data-testid="prejoin.joinMeeting"]',
    ];
    
    let joinButton = null;
    for (const selector of joinSelectors) {
      joinButton = await page.$(selector);
      if (joinButton) {
        const isVisible = await joinButton.isVisible();
        if (isVisible) {
          console.log(`  Found join button: ${selector}`);
          break;
        }
        joinButton = null;
      }
    }
    
    if (!joinButton) {
      console.log('  ❌ Join button not found');
      await takeScreenshot(page, 'join_button_not_found');
      return false;
    }
    
    await joinButton.click();
    console.log('  ✅ Clicked join button');
    await takeScreenshot(page, 'join_button_clicked');
    
    console.log('  Waiting for meeting to load...');
    await page.waitForTimeout(5000);
    
    const videoSelectors = [
      'video',
      '.video-container',
      '[class*="video" i]',
      '#largeVideoContainer',
      '.remote-video',
    ];
    
    let meetingLoaded = false;
    for (const selector of videoSelectors) {
      const element = await page.$(selector);
      if (element) {
        meetingLoaded = true;
        console.log(`  Found video element: ${selector}`);
        break;
      }
    }
    
    if (meetingLoaded) {
      console.log('  ✅ Meeting loaded successfully!');
      await takeScreenshot(page, 'meeting_loaded');
    } else {
      console.log('  ⚠️ Meeting may not have fully loaded, but continuing...');
    }
    
    return true;
    
  } catch (error) {
    console.error('  ❌ Error joining meeting:', error);
    await takeScreenshot(page, 'join_error');
    return false;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting Jitsi Meeting Manager...\n');
  
  if (!process.env.DISPLAY) {
    console.log('⚠️  No DISPLAY environment variable detected!');
    console.log('   This script requires a display for Chromecast casting.');
    console.log('   Options:');
    console.log('   1. Run with xvfb-run: xvfb-run npm start');
    console.log('   2. Use "npm run start:headless" for virtual display');
    console.log('   3. Connect to a graphical session (SSH -X or desktop)\n');
    console.log('   For now, attempting to continue (may fail)...\n');
  }
  
  process.on('SIGINT', async () => {
    console.log('\n⚠️ Received SIGINT, shutting down...');
    await cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n⚠️ Received SIGTERM, shutting down...');
    await cleanup();
    process.exit(0);
  });
  
  try {
    console.log('🌐 Launching Chrome browser...');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--enable-features=MediaRouter',
        '--enable-usermedia-screen-capturing',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    
    console.log('  ✅ Browser launched in headed mode');
    
    context = await browser.newContext({
      permissions: ['camera', 'microphone'],
      viewport: { width: 1280, height: 720 },
    });
    
    console.log('  ✅ Context created with camera/microphone permissions');
    
    const page = await context.newPage();
    await takeScreenshot(page, 'context_created');
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`  🌐 Console error: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', (error) => {
      console.log(`  🌐 Page error: ${error.message}`);
    });
    
    console.log(`\n🔗 Navigating to ${CONFIG.JITSI_URL}...`);
    await page.goto(CONFIG.JITSI_URL, { timeout: CONFIG.JITSI_TIMEOUT_MS });
    console.log('  ✅ Page loaded');
    await takeScreenshot(page, 'page_loaded');
    
    const joined = await joinMeeting(page);
    
    if (!joined) {
      console.log('\n❌ Failed to join meeting, exiting...');
      await cleanup();
      process.exit(1);
    }
    
    await castToChromecast(page);
    
    console.log('\n✨ Meeting is active! Browser will remain open.');
    console.log('   Press Ctrl+C to stop.\n');
    
    await new Promise(() => {});
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    await cleanup();
    process.exit(1);
  }
}

main();
