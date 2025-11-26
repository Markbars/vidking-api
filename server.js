console.log("Starting VidKing Backend...");

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
    "https://vidsrc.xyz/embed/movie/",
    "https://vidsrc.to/embed/movie/",
    "https://vidsrc.me/embed/movie/"
];

// Helper to connect to Browserless
async function getBrowser() {
    for (const endpoint of REGIONS) {
        try {
            console.log(`[CONNECTING] Trying region: ${endpoint.split('?')[0]}...`);
            const browser = await puppeteer.connect({ 
                browserWSEndpoint: endpoint,
                defaultViewport: { width: 1280, height: 720 } 
            });
            console.log("[CONNECTED] Success!");
            return browser;
        } catch (e) {
            console.log(`[FAILED] Region failed: ${e.message}`);
        }
    }
    return null;
}

// Helper to scrape a single source
async function tryScrape(urlBase, tmdbId) {
    const targetURL = `${urlBase}${tmdbId}`;
    console.log(`[ATTEMPT] Target: ${targetURL}`);
    
    let browser = null;

    try {
        browser = await getBrowser();
        if (!browser) {
            console.log("[CRITICAL] Could not connect to any Browserless region.");
            return null;
        }

        const page = await browser.newPage();
        
        // Headers to trick VidSrc
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/',
            'Upgrade-Insecure-Requests': '1'
        });

        // Network Sniffer
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            // Look for video files
            if ((rUrl.includes('.m3u8') || rUrl.includes('.mp4')) && !rUrl.includes('thumb')) {
                console.log("[FOUND VIDEO] ", rUrl);
                videoUrl = rUrl;
            }
            request.continue();
        });

        // Go to page
        await page.goto(targetURL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Check for Cloudflare Block
        const title = await page.title();
        if (title.includes("Just a moment") || title.includes("Cloudflare")) {
            console.log("[BLOCKED] Cloudflare detected.");
            await browser.close();
            return null;
        }

        // --- IFRAME DIVER STRATEGY ---
        console.log("[ACTION] Searching for Iframes...");
        
        // Wait for frames
        await new Promise(r => setTimeout(r, 2000));
        
        const frames = page.frames();
        let clicked = false;
        
        // Try to click buttons inside every frame found
        for (const frame of frames) {
            try {
                const clickedInFrame = await frame.evaluate(() => {
                    // List of possible buttons
                    const possibleButtons = [
                        '.play-btn', 
                        '#player_code', 
                        'video', 
                        '.r-player', 
                        '#play-button'
                    ];
                    
                    for (let selector of possibleButtons) {
                        const btn = document.querySelector(selector);
                        if (btn) {
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                });

                if (clickedInFrame) {
                    console.log(`[CLICK] Successfully clicked button in a frame!`);
                    clicked = true;
                }
            } catch (e) {
                // Ignore security errors from cross-origin frames
            }
        }

        // Backup Blind Click
        if (!clicked) {
            console.log("[BACKUP] No button found. Blind Center Click.");
            await page.mouse.click(640, 360);
        }

        // Wait for video URL to appear
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
    
    // Set long timeout
    req.setTimeout(90000); 

    try {
        const streamLink = await getAnyWorkingLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "Video player found, but stream did not start." });
        }
    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
