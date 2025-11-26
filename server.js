console.log("Starting VidKing Backend [Turnstile Edition]...");

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

// Added 'SuperEmbed' and 'Vidsrc.pro' which are sometimes easier
const SOURCES = [
    "https://superembed.stream/movie/",
    "https://vidsrc.pro/embed/movie/",
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
        
        // 1. Headers
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/',
            'Upgrade-Insecure-Requests': '1'
        });

        // 2. Sniffer
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
        await page.goto(targetURL, { waitUntil: 'networkidle2', timeout: 30000 });

        // 4. HANDLE CLOUDFLARE CHECKBOX (The missing piece)
        console.log("[ACTION] Checking for Cloudflare/Turnstile...");
        
        // Wait a bit for widgets to load
        await new Promise(r => setTimeout(r, 3000));
        
        // Look for iframes that might be Turnstile
        const frames = page.frames();
        for (const frame of frames) {
            try {
                const title = await frame.title();
                // Turnstile often has no title or specific attributes
                if (title.includes("challenge") || title.includes("Cloudflare")) {
                    console.log("[CLICK] Found Cloudflare Frame. Clicking...");
                    await frame.click('body'); 
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (e) {}
        }

        // 5. FIND PLAY BUTTON
        let clicked = false;
        for (const frame of frames) {
            try {
                const clickedInFrame = await frame.evaluate(() => {
                    // Added more specific selectors
                    const buttons = document.querySelectorAll('.play-btn, #player_code, video, .r-player, #play-button, button[class*="play"]');
                    if (buttons.length > 0) {
                        buttons[0].click();
                        return true;
                    }
                    return false;
                });
                if (clickedInFrame) clicked = true;
            } catch (e) {}
        }

        if (clicked) console.log("[CLICK] Clicked a play button!");
        else {
            console.log("[BACKUP] Blind clicking center for autoplay...");
            await page.mouse.click(960, 540);
        }

        // 6. Wait for Video URL
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
            res.status(404).json({ error: "Cloud bypass failed. Try Localhost." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
