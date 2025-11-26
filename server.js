console.log("Starting VidKing Backend [Blind Clicker]...");

const express = require('express');
const puppeteer = require('puppeteer-core');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const BROWSERLESS_KEY = "2TUZ3kpvkb60pJibc42c1993c5e9c908cb07a7cc0c69a3ee8"; 

const REGIONS = [
    `wss://production-lon.browserless.io?token=${BROWSERLESS_KEY}&stealth`,
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_KEY}&stealth`,
    `wss://chrome.browserless.io?token=${BROWSERLESS_KEY}&stealth`
];

const SOURCES = [
    "https://vidsrc.to/embed/movie/",
    "https://vidsrc.xyz/embed/movie/",
    "https://vidsrc.me/embed/movie/",
    "https://superembed.stream/movie/"
];

async function getBrowser() {
    for (const endpoint of REGIONS) {
        try {
            console.log(`[CONNECTING] Trying region: ${endpoint.split('?')[0]}...`);
            const browser = await puppeteer.connect({ 
                browserWSEndpoint: endpoint,
                // Set a standard Laptop screen size so center clicks land correctly
                defaultViewport: { width: 1366, height: 768 } 
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
        
        // 1. Headers (Look like a real user)
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/',
            'Upgrade-Insecure-Requests': '1',
            'Accept-Language': 'en-US,en;q=0.9'
        });

        // 2. Network Sniffer
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            if ((rUrl.includes('.m3u8') || rUrl.includes('.mp4')) && !rUrl.includes('thumb')) {
                console.log("[FOUND VIDEO] ", rUrl);
                videoUrl = rUrl;
            }
            request.continue();
        });

        // 3. Go to page
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Check if we are blocked
        const title = await page.title();
        console.log(`[PAGE TITLE] ${title}`);
        if (title.includes("Just a moment") || title.includes("Cloudflare")) {
            console.log("[BLOCKED] Cloudflare detected.");
            await browser.close();
            return null;
        }

        // 4. THE HUMAN CLICK STRATEGY
        console.log("[ACTION] Mimicking human behavior...");

        // A. Move mouse around (Triggers 'hover' states)
        await page.mouse.move(100, 100);
        await new Promise(r => setTimeout(r, 500));
        await page.mouse.move(683, 384); // Center of 1366x768
        
        // B. CLICK CENTER (Click 1)
        console.log("[CLICK] Center Screen (Attempt 1)");
        await page.mouse.down();
        await new Promise(r => setTimeout(r, 100)); // Real click duration
        await page.mouse.up();

        // Wait (VidSrc often opens a popup on first click)
        await new Promise(r => setTimeout(r, 2000));

        // C. CLICK CENTER AGAIN (Click 2 - The real one)
        console.log("[CLICK] Center Screen (Attempt 2)");
        await page.mouse.down();
        await new Promise(r => setTimeout(r, 100));
        await page.mouse.up();

        // D. IFRAME HAMMER
        // Just in case the video is inside a frame, click the center of EVERY frame
        const frames = page.frames();
        for (const frame of frames) {
            try {
                // Click the body of the frame
                await frame.click('body').catch(() => {});
            } catch(e) {}
        }

        // 5. Wait for Video URL
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
    
    req.setTimeout(90000); 

    try {
        const streamLink = await getAnyWorkingLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "Video did not start after clicks." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
