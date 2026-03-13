const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const targetFile = process.argv[2]; // e.g., alive.txt containing URLs
const outDir = process.argv[3];
const customHeaderString = process.argv[4] || '';

// Parse header "X-Bug-Bounty: hacker123" into an object
const extraHTTPHeaders = {};
if (customHeaderString && customHeaderString.includes(':')) {
    const [key, val] = customHeaderString.split(':', 2);
    extraHTTPHeaders[key.trim()] = val.trim();
}

const assetsDir = path.join(outDir, 'assets');
const screenshotsDir = path.join(outDir, 'screenshots');

if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
    if (!fs.existsSync(targetFile)) {
        console.log(`[PLAYWRIGHT] Target file ${targetFile} not found.`);
        return;
    }
    const urls = fs.readFileSync(targetFile, 'utf8').split('\n').filter(Boolean);
    if (urls.length === 0) {
        console.log('[PLAYWRIGHT] No URLs to crawl.');
        return;
    }

    const browser = await chromium.launch({ headless: true });

    for (const urlStr of urls) {
        let url = urlStr.trim();
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }

        console.log(`[PLAYWRIGHT] Crawling: ${url}`);
        let context;
        try {
            context = await browser.newContext({
                extraHTTPHeaders,
                ignoreHTTPSErrors: true,
            });

            const page = await context.newPage();

            // Intercept all responses to capture JS and source maps
            page.on('response', async (response) => {
                const reqUrl = response.url();
                if (reqUrl.endsWith('.js') || reqUrl.endsWith('.map') || reqUrl.includes('.js?')) {
                    try {
                        const buffer = await response.body();
                        // Create a safe filename
                        let safeName = reqUrl.replace(/[^a-zA-Z0-9.\-]/g, '_');
                        if (safeName.length > 200) safeName = safeName.substring(safeName.length - 200);
                        const savePath = path.join(assetsDir, safeName);
                        fs.writeFileSync(savePath, buffer);
                        console.log(`[PLAYWRIGHT] Downloaded asset: ${reqUrl}`);
                    } catch (e) {
                        // Ignore response body read errors (e.g. CORS or destroyed)
                    }
                }
            });

            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

            // Capture Screenshot for Visual Recon
            try {
                const domainMatch = url.match(/:\/\/(.[^/]+)/);
                const domain = domainMatch ? domainMatch[1] : url.replace(/[^a-zA-Z0-9]/g, '_');
                const screenshotPath = path.join(screenshotsDir, `${domain}.png`);
                await page.screenshot({ path: screenshotPath, type: 'png' });
                console.log(`[PLAYWRIGHT] Screenshot saved for ${domain}`);
            } catch (screenshotError) {
                console.log(`[PLAYWRIGHT] Screenshot failed for ${url}: ${screenshotError.message}`);
            }

            // Find all buttons and click them to trigger dynamic requests
            console.log(`[PLAYWRIGHT] Clicking interactive elements on ${url}`);
            const buttons = await page.locator('button, a[role="button"], .btn');
            const count = await buttons.count();
            for (let i = 0; i < Math.min(count, 5); i++) { // click up to 5 buttons as a sample
                try {
                    await buttons.nth(i).click({ timeout: 2000, force: true });
                    await page.waitForTimeout(1000); // wait for network changes
                } catch (e) {
                    // ignore unclickable
                }
            }

            await context.close();
        } catch (error) {
            console.log(`[PLAYWRIGHT] Failed to crawl ${url}: ${error.message}`);
            if (context) await context.close();
        }
    }

    await browser.close();
    console.log('[PLAYWRIGHT] Active crawling finished.');
}

run().catch(console.error);
