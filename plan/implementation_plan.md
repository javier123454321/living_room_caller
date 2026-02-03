# Implementation Plan: meeting_manager.ts

## Project: Jitsi Meeting Automation with Chromecast

**Location:** `workspace/call/`

---

## Overview

A TypeScript/Playwright script that:
- Opens **headed Chrome** with real camera/microphone
- Navigates to `https://meet.javiergonzalez.io`
- Auto-joins with display name **"leon living room"**
- **Immediately attempts to cast** to the **first available Chromecast**
- **Retries casting up to 4 times** with 5-second delays
- **Continues without casting** if all attempts fail
- Keeps browser open indefinitely until manually stopped

---

## File Structure

```
workspace/call/
├── meeting_manager.ts          # Main automation script
├── package.json                # Dependencies
├── tsconfig.json              # TypeScript config
└── plan/
    └── implementation_plan.md   # This document
```

---

## meeting_manager.ts Implementation

### Configuration

```typescript
const CONFIG = {
  JITSI_URL: 'https://meet.javiergonzalez.io',
  DISPLAY_NAME: 'leon living room',
  CHROMECAST_RETRIES: 4,
  CHROMECAST_RETRY_DELAY_MS: 5000,
  JITSI_TIMEOUT_MS: 30000,
  SCREENSHOT_DIR: './screenshots',
};
```

### Browser Launch

```typescript
const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-features=MediaRouter',          // Chromecast support
    '--enable-usermedia-screen-capturing',    // Casting support
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ],
});

const context = await browser.newContext({
  permissions: ['camera', 'microphone'],       // Real camera & mic
  viewport: { width: 1280, height: 720 },
});
```

### Jitsi Meeting Flow

1. **Navigate to URL**
2. **Wait for pre-join screen**
3. **Find name input field** (multiple selector strategies)
4. **Enter display name**: "leon living room"
5. **Find and click join button** (multiple selector strategies)
6. **Wait for meeting to load** (check for video elements)

### Chromecast Casting Logic

```typescript
async function castToChromecast(page: Page): Promise<boolean> {
  // Try up to 4 times
  for (let attempt = 1; attempt <= 4; attempt++) {
    // Look for cast button in Jitsi UI
    // Click Chrome toolbar cast icon if available
    // Select first Chromecast device
    // Cast entire tab
    
    if (attempt < 4) {
      await page.waitForTimeout(5000); // Wait before retry
    }
  }
  
  // Return false if all attempts failed
  return false;
}
```

### Error Handling

- **Screenshot capture** on failures
- **Console logging** for debugging
- **Graceful degradation** (continue without casting)
- **Browser cleanup** on exit

---

## package.json

```json
{
  "name": "jitsi-meeting-manager",
  "version": "1.0.0",
  "description": "Automated Jitsi meeting joiner with Chromecast support",
  "main": "meeting_manager.ts",
  "scripts": {
    "start": "ts-node meeting_manager.ts",
    "build": "tsc meeting_manager.ts",
    "meeting": "npm start"
  },
  "dependencies": {
    "playwright": "^1.40.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.0"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "types": ["node"]
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist", "screenshots"]
}
```

---

## Setup Instructions

```bash
# 1. Navigate to workspace/call directory
cd workspace/call

# 2. Install dependencies
npm install

# 3. Install Playwright browsers (chromium)
npx playwright install chromium

# 4. Run the meeting manager
npm start
```

---

## Features

- ✅ **Headed Chrome** with real camera/microphone
- ✅ **Auto-join** Jitsi meeting at `meet.javiergonzalez.io`
- ✅ **Display name**: "leon living room"
- ✅ **Permission granting** for camera and microphone
- ✅ **Chromecast casting** with 4 retry attempts
- ✅ **Graceful fallback** if casting fails
- ✅ **Screenshot capture** on errors
- ✅ **Console logging** for debugging
- ✅ **Keep browser open** until manually stopped
- ✅ **Cast entire tab** to first available Chromecast

---

## Technical Notes

### Chromecast Detection
- Chrome's native cast button appears in toolbar when devices are detected
- Script attempts to find and click cast button in Jitsi UI or Chrome toolbar
- Alternative: Use keyboard shortcut `Ctrl+Shift+S` to open cast dialog

### Jitsi UI Variability
- Jitsi Meet's UI can vary based on configuration
- Script includes multiple selector strategies for robustness
- Multiple fallback selectors for name input and join button

### Network Requirements
- Chromecast and machine must be on the same WiFi network
- Chrome's MediaRouter API requires network discovery

### Real Camera/Microphone
- No fake media flags (--use-fake-device-for-media-stream)
- Real hardware devices will be used
- User may see browser permission prompts initially

---

## Execution Flow

1. Launch Chrome browser (headed mode)
2. Grant camera/microphone permissions
3. Navigate to Jitsi URL
4. Wait for pre-join screen
5. Enter display name
6. Click join button
7. Wait for meeting to load
8. **Immediately attempt to cast**
9. **Retry casting 4 times if needed**
10. **Continue without casting if all attempts fail**
11. Keep browser open indefinitely

---

## Error Scenarios & Handling

| Scenario | Handling |
|----------|----------|
| Jitsi URL unreachable | Timeout error, screenshot, exit |
| Name input not found | Try multiple selectors, screenshot, exit |
| Join button not found | Try multiple selectors, screenshot, exit |
| Meeting doesn't load | Warning, continue with screenshot |
| Chromecast not found | 4 retries, then continue without casting |
| Casting fails | Screenshot, retry, then continue |

---

## Success Criteria

- [x] Chrome opens in headed mode
- [x] Jitsi meeting loads successfully
- [x] Display name "leon living room" is entered
- [x] Meeting is joined
- [x] Camera/microphone permissions are granted
- [x] Casting is attempted immediately after joining
- [x] Up to 4 casting retries are performed
- [x] Script continues if casting fails
- [x] Browser remains open until manual exit
- [x] Screenshots are captured on errors

---

**Plan Created:** 2026-02-03  
**Status:** Ready for implementation
