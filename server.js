console.log("Starting VidKing Backend [Force Play Edition]...");

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

// REORDERED: .pro is often cleaner. Added https/http support.
const SOURCES = [
    "https://vidsrc.pro/embed/movie/",
    "https://vidsrc.xyz/embed/movie/",
    "https://vidsrc.to/embed/movie/",
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
        
        // 1. Desktop Headers
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/',
            'Upgrade-Insecure-Requests': '1',
            'Accept-Language': 'en-US,en;q=0.9'
        });

        // 2. Enhanced Sniffer (Logs ALL media types)
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            // Broader check for media
            if (rUrl.includes('.m3u8') || rUrl.includes('.mp4') || rUrl.includes('.mpd')) {
                // Ignore thumbnails and subtitles
                if (!rUrl.includes('.jpg') && !rUrl.includes('.png') && !rUrl.includes('.vtt')) {
                    console.log("[FOUND VIDEO] ", rUrl);
                    videoUrl = rUrl;
                }
            }
            request.continue();
        });

        // 3. Go to page
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 4. Check for Block
        const title = await page.title();
        console.log(`[PAGE TITLE] ${title}`);
        if (title.includes("Just a moment") || title.includes("Cloudflare")) {
            console.log("[BLOCKED] Cloudflare detected.");
            await browser.close();
            return null;
        }

        // 5. HUMAN ACTIONS
        console.log("[ACTION] Initializing clicks...");
        
        // Mouse Move
        await page.mouse.move(500, 500);
        await new Promise(r => setTimeout(r, 500));

        // Click 1 (Clear Ad)
        await page.mouse.click(960, 540);
        console.log("[CLICK] 1 (Clear Ad)");
        await new Promise(r => setTimeout(r, 2000));

        // Click 2 (Play)
        await page.mouse.click(960, 540);
        console.log("[CLICK] 2 (Play Attempt)");
        
        // 6. THE "FORCE PLAY" HACK
        // This injects code to find the video element and force start it
        console.log("[ACTION] Injecting Force-Play script...");
        await page.evaluate(() => {
            const vids = document.getElementsByTagName('video');
            for (let i = 0; i < vids.length; i++) {
                vids[i].play(); // Force start
                vids[i].muted = false;
            }
        });
        
        // 7. Spacebar Backup (Keyboard Play)
        await new Promise(r => setTimeout(r, 1000));
        await page.keyboard.press('Space');
        console.log("[KEYPRESS] Spacebar sent");

        // 8. Wait for Video URL
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
            res.status(404).json({ error: "Video loaded but stream URL never appeared." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
