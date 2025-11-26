const express = require('express');
const puppeteer = require('puppeteer-core');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const BROWSERLESS_KEY = "2TUZ3kpvkb60pJibc42c1993c5e9c908cb07a7cc0c69a3ee8"; 

// REGION HOPPER (Keep London first, it worked for you)
const REGIONS = [
    `wss://production-lon.browserless.io?token=${BROWSERLESS_KEY}&stealth`,
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_KEY}&stealth`,
    `wss://chrome.browserless.io?token=${BROWSERLESS_KEY}&stealth`
];

const SOURCES = [
    "https://vidsrc.to/embed/movie/",
    "https://vidsrc.xyz/embed/movie/",
    "https://vidsrc.me/embed/movie/"
];

async function getBrowser() {
    for (const endpoint of REGIONS) {
        try {
            console.log(`[CONNECTING] Trying region: ${endpoint.split('?')[0]}...`);
            const browser = await puppeteer.connect({ 
                browserWSEndpoint: endpoint,
                defaultViewport: { width: 1920, height: 1080 } 
            });
            console.log("[CONNECTED] Success!");
            return browser;
        } catch (e) {
            console.log(`[FAILED] Region failed: ${e.message}`);
        }
    }
    return null;
}

async function tryScrape(urlBase, tmdbId) {
    const targetURL = `${urlBase}${tmdbId}`;
    console.log(`[ATTEMPT] Target: ${targetURL}`);
    
    let browser = null;

    try {
        browser = await getBrowser();
        if (!browser) return null;

        const page = await browser.newPage();
        
        // 1. SET HEADERS (Crucial for VidSrc)
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/', // Fake referer
            'Accept-Language': 'en-US,en;q=0.9'
        });

        // 2. LISTEN FOR VIDEO
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            // VidSrc usually uses .m3u8 or master.m3u8
            if ((rUrl.includes('.m3u8') || rUrl.includes('.mp4')) && !rUrl.includes('thumb')) {
                console.log("[FOUND] Video URL:", rUrl);
                videoUrl = rUrl;
            }
            request.continue();
        });

        // 3. GO TO PAGE
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 25000 });

        // 4. CHECK FOR CLOUDFLARE BLOCK
        const title = await page.title();
        console.log(`[PAGE TITLE] ${title}`);
        if (title.includes("Just a moment") || title.includes("Cloudflare")) {
            console.log("[BLOCKED] Cloudflare detected.");
            await browser.close();
            return null;
        }

        // 5. AGGRESSIVE CLICKING (Triple Click Strategy)
        // Click 1: Clear overlay / Popup
        try {
            await new Promise(r => setTimeout(r, 1500));
            await page.mouse.click(960, 540); // Center
            console.log("[CLICK] 1");
        } catch (e) {}

        // Click 2: Hit the Play Button
        try {
            await new Promise(r => setTimeout(r, 1000));
            await page.mouse.click(960, 540); // Center again
            console.log("[CLICK] 2");
        } catch (e) {}
        
        // Click 3: Backup (Bottom left play button)
        try {
            await new Promise(r => setTimeout(r, 1000));
            await page.mouse.click(50, 950); 
            console.log("[CLICK] 3");
        } catch (e) {}

        // 6. WAIT FOR RESULT
        for (let i = 0; i < 15; i++) {
            if (videoUrl) {
                await browser.close();
                return videoUrl;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        await browser.close();
        return null;

    } catch (e) {
        console.log(`[FAIL] Error: ${e.message}`);
        if (browser) await browser.close();
        return null;
    }
}

async function getAnyWorkingLink(tmdbId) {
    let finalLink = null;
    for (const source of SOURCES) {
        finalLink = await tryScrape(source, tmdbId);
        if (finalLink) break;
    }
    return finalLink;
}

app.get('/get-movie', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send({ error: "Missing ID" });
    
    req.setTimeout(60000); 

    try {
        const streamLink = await getAnyWorkingLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "Connected to browser, but video did not start." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
