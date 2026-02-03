import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG = {
  JITSI_URL: 'https://meet.javiergonzalez.io/leon-living-room',
  DISPLAY_NAME: 'leon living room',
  CHROMECAST_DEVICE_NAME: 'Living Room TV', // Set your Chromecast device name here (e.g., 'Living Room TV')
  CHROMECAST_RETRIES: 4,
  CHROMECAST_RETRY_DELAY_MS: 5000,
  JITSI_TIMEOUT_MS: 30000,
  SCREENSHOT_DIR: './screenshots',
  DEBUG: process.env.DEBUG === 'true' || process.env.DEBUG === '1',
  CHROME_EXECUTABLE_PATH: process.env.CHROME_EXECUTABLE_PATH || '',
  CHROME_CHANNEL: process.env.CHROME_CHANNEL || '',
};

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function ensureScreenshotDir(): Promise<void> {
  if (!fs.existsSync(CONFIG.SCREENSHOT_DIR)) {
    fs.mkdirSync(CONFIG.SCREENSHOT_DIR, { recursive: true });
  }
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  if (!CONFIG.DEBUG) {
    return;
  }
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
  console.log('📺 Attempting to cast to Chromecast via CDP...');
  
  try {
    // Get CDP session from the page
    const cdpSession = await page.context().newCDPSession(page);
    
    // Enable the Cast domain
    await cdpSession.send('Cast.enable');
    console.log('  ✅ Cast domain enabled');
    
    // Set up listener for available sinks (Cast devices)
    const sinks: Array<{ name: string; id: string; session?: string }> = [];
    
    cdpSession.on('Cast.sinksUpdated', (event: { sinks: Array<{ name: string; id: string; session?: string }> }) => {
      console.log(`  📡 Found ${event.sinks.length} Cast device(s):`);
      event.sinks.forEach((sink, i) => {
        console.log(`    ${i + 1}. ${sink.name} (${sink.id})`);
        sinks.push(sink);
      });
    });
    
    cdpSession.on('Cast.issueUpdated', (event: { issueMessage: string }) => {
      console.log(`  ⚠️ Cast issue: ${event.issueMessage}`);
    });
    
    // Wait for devices to be discovered
    for (let attempt = 1; attempt <= CONFIG.CHROMECAST_RETRIES; attempt++) {
      console.log(`  Attempt ${attempt}/${CONFIG.CHROMECAST_RETRIES} - waiting for devices...`);
      
      await page.waitForTimeout(CONFIG.CHROMECAST_RETRY_DELAY_MS);
      
      if (sinks.length > 0) {
        let targetSink = sinks[0]; // Default to first device
        
        // If a specific device name is configured, try to find it
        if (CONFIG.CHROMECAST_DEVICE_NAME) {
          const namedSink = sinks.find(s => 
            s.name.toLowerCase().includes(CONFIG.CHROMECAST_DEVICE_NAME.toLowerCase())
          );
          if (namedSink) {
            targetSink = namedSink;
            console.log(`  🎯 Found configured device: ${targetSink.name}`);
          } else {
            console.log(`  ⚠️ Configured device "${CONFIG.CHROMECAST_DEVICE_NAME}" not found, using first available`);
          }
        }
        
        console.log(`  📺 Starting cast to: ${targetSink.name}`);
        
        try {
          // Start tab mirroring to the selected sink
          await cdpSession.send('Cast.startDesktopMirroring', { sinkName: targetSink.name });
          console.log('  ✅ Cast started successfully!');
          await takeScreenshot(page, 'casting_started');
          return true;
        } catch (castError) {
          console.log(`  ⚠️ startDesktopMirroring failed, trying startTabMirroring...`);
          try {
            await cdpSession.send('Cast.startTabMirroring', { sinkName: targetSink.name });
            console.log('  ✅ Tab mirroring started successfully!');
            await takeScreenshot(page, 'tab_mirroring_started');
            return true;
          } catch (tabError) {
            console.log(`  ❌ Tab mirroring also failed: ${tabError}`);
          }
        }
      } else {
        console.log('  No Cast devices found yet...');
      }
    }
    
    // Clean up
    await cdpSession.send('Cast.disable');
    
  } catch (error) {
    console.log(`  ❌ CDP Cast error: ${error}`);
  }
  
  console.log('  ❌ All casting attempts failed, continuing without casting');
  return false;
}

async function joinMeeting(page: Page): Promise<boolean> {
  console.log('🎯 Joining meeting...');
  
  try {
    console.log('  Waiting for pre-join screen...');
    await page.waitForLoadState('networkidle');
    
    try {
      await page.waitForSelector('input[type="text"], button[aria-label*="join" i], button:has-text("Join")', { timeout: 10000 });
      console.log('  ✅ Pre-join screen elements detected');
    } catch (e) {
      console.log('  ⚠️ Pre-join screen elements not found, continuing anyway...');
    }
    
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, 'prejoin_screen');
    const bodyHTML = await page.content();
    console.log('  Page title:', await page.title());
    console.log('  Current URL:', page.url());
    
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
      '[data-testid="prejoin.joinMeeting"]',
      'button[aria-label*="join" i]',
      'button:has-text("Join")',
      'button:has-text("join")',
      'button:has-text("Join meeting")',
      'button:has-text("join meeting")',
      '[aria-label*="Join meeting" i]',
      '[data-testid*="join" i]',
      '#joinButton',
      '.join-button',
      'div[role="button"][aria-label*="join" i]',
      'div[role="button"]:has-text("Join")',
      'button[type="submit"]',
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
      
      console.log('  🔍 Debugging: Looking for all buttons on page...');
      const allButtons = await page.$$('button');
      console.log(`  Found ${allButtons.length} button elements`);
      
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const btn = allButtons[i];
        const text = await btn.textContent();
        const ariaLabel = await btn.getAttribute('aria-label');
        const dataTestId = await btn.getAttribute('data-testid');
        const isVisible = await btn.isVisible();
        console.log(`    Button ${i}: text="${text?.trim()}" aria-label="${ariaLabel}" data-testid="${dataTestId}" visible=${isVisible}`);
      }
      
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
    const launchArgs = [
      '--enable-features=MediaRouter,GlobalMediaControls,CastMediaRouteProvider',
      '--load-media-router-component-extension=1',
      '--enable-usermedia-screen-capturing',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--auto-select-desktop-capture-source=Entire screen',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
    ];

    const launchOptions: any = {
      headless: false,
      args: launchArgs,
    };

    if (CONFIG.CHROME_EXECUTABLE_PATH) {
      if (!fs.existsSync(CONFIG.CHROME_EXECUTABLE_PATH)) {
        console.log(`  ⚠️ Chrome executable not found at ${CONFIG.CHROME_EXECUTABLE_PATH}`);
      } else {
        launchOptions.executablePath = CONFIG.CHROME_EXECUTABLE_PATH;
        console.log(`  🔧 Using Chrome executable: ${CONFIG.CHROME_EXECUTABLE_PATH}`);
      }
    } else if (CONFIG.CHROME_CHANNEL) {
      launchOptions.channel = CONFIG.CHROME_CHANNEL;
      console.log(`  🔧 Using Chrome channel: ${CONFIG.CHROME_CHANNEL}`);
    }

    browser = await chromium.launch(launchOptions);
    
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
