import { chromium } from 'playwright';

(async () => {
    console.log("Launching browser to check Auth0 loading issues...");
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`[PAGE ${msg.type().toUpperCase()}]`, msg.text());
    });

    page.on('pageerror', err => {
        console.log('[PAGE EXCEPTION]', err.stack || err.message);
    });

    try {
        await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 10000 });
        console.log("Page loaded. Waiting 5 seconds to see if it makes it past AUTH0...");
        await page.waitForTimeout(5000);

        const text = await page.innerText('body');
        console.log("BODY TEXT:", text);
    } catch (err) {
        console.error("Navigation failed:", err.message);
    } finally {
        await browser.close();
    }
})();
