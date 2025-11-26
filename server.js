console.log("Starting VidKing Backend [Deep Frame Edition]...");

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

// NEW SOURCES: Embed.su and 2Embed are often friendlier to bots
const SOURCES = [
    "https://embed.su/embed/movie/", 
    "https://www.2embed.cc/embed/",
    "https://vidsrc.xyz/embed/movie/",
    "https://vidsrc.to/embed/movie/"
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
            console.log(`[FAILED] Region failed (429 means too many tries, wait a bit): ${e.message}`);
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
        
        // Headers
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/',
            'Upgrade-Insecure-Requests': '1'
        });

        // Network Sniffer
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            // Look for m3u8, mp4, or mpd
            if ((rUrl.includes('.m3u8') || rUrl.includes('.mp4') || rUrl.includes('.mpd')) && !rUrl.includes('thumb') && !rUrl.includes('jpg')) {
                console.log("[FOUND VIDEO] ", rUrl);
                videoUrl = rUrl;
            }
            request.continue();
        });

        // Go to page
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Check for Block
        const title = await page.title();
        console.log(`[PAGE TITLE] ${title}`);
        if (title.includes("Just a moment") || title.includes("Cloudflare")) {
            console.log("[BLOCKED] Cloudflare detected.");
            await browser.close();
            return null;
        }

        // --- DEEP FRAME LOGIC ---
        console.log("[ACTION] Hunting for frames...");
        
        // Wait for frames to populate
        await new Promise(r => setTimeout(r, 3000));
        
        // Initial Mouse Wiggle to wake up the player
        await page.mouse.move(500, 500);
        await page.mouse.click(960, 540); // Blind Click Center

        // Get all frames (Boxes inside boxes)
        const frames = page.frames();
        console.log(`[INFO] Found ${frames.length} frames.`);

        // Loop through EVERY frame and inject the "Force Play" command
        for (const frame of frames) {
            try {
                const result = await frame.evaluate(() => {
                    // 1. Try to find video tags and force play
                    const vids = document.getElementsByTagName('video');
                    if (vids.length > 0) {
                        for(let v of vids) {
                            v.muted = false;
                            v.play();
                        }
                        return "Found <video> tag";
                    }
                    
                    // 2. Try to find common play buttons
                    const btn = document.querySelector('.play-btn, #player_code, .r-player, #play-button, button[class*="play"]');
                    if (btn) {
                        btn.click();
                        return "Clicked Play Button";
                    }
                    return null;
                });

                if (result) console.log(`[FRAME ACTION] ${result}`);
            } catch (e) {
                // Ignore security errors
            }
        }

        // Wait for Video URL
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
    
    // 90 second timeout
    req.setTimeout(90000); 

    try {
        const streamLink = await getAnyWorkingLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "Deep scan failed." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
