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

// Focus on .xyz and .to as they loaded for you
const SOURCES = [
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

async function tryScrape(urlBase, tmdbId) {
    const targetURL = `${urlBase}${tmdbId}`;
    console.log(`[ATTEMPT] Target: ${targetURL}`);
    
    let browser = null;

    try {
        browser = await getBrowser();
        if (!browser) return null;

        const page = await browser.newPage();
        
        // 1. Headers to look real
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/',
            'Upgrade-Insecure-Requests': '1'
        });

        // 2. SUPER LOGGING (We need to see what is happening)
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            
            // Log suspicious media files to debug
            if (rUrl.includes('.m3u8') || rUrl.includes('.mp4') || rUrl.includes('.m3u') || rUrl.includes('.mpd')) {
                console.log("[POTENTIAL VIDEO] ", rUrl);
                if (!rUrl.includes('thumb')) videoUrl = rUrl;
            }
            request.continue();
        });

        // 3. Go to page
        await page.goto(targetURL, { waitUntil: 'networkidle2', timeout: 30000 });

        // 4. SMART CLICKING (Find the button instead of guessing)
        console.log("[ACTION] Looking for Play Button...");
        
        // This script runs inside the browser to find the player
        const clicked = await page.evaluate(async () => {
            // Common selectors for play buttons on these sites
            const selectors = ['#player_code', '.play-btn', '#play-button', 'div[class*="play"]', 'iframe'];
            
            for (let sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    el.click(); // Click the element
                    return `Clicked ${sel}`;
                }
            }
            return "No specific button found, clicking center";
        });
        console.log(`[RESULT] ${clicked}`);

        // 5. BACKUP: Manual Click Center (If smart click failed)
        if (clicked.includes("No specific")) {
            await page.mouse.click(640, 360);
        }
        
        // 6. Wait longer for the video to start loading
        console.log("[WAITING] Listening for network traffic...");
        for (let i = 0; i < 20; i++) {
            if (videoUrl) {
                console.log("[SUCCESS] Found Link:", videoUrl);
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
    
    req.setTimeout(80000); // 80 seconds timeout

    try {
        const streamLink = await getAnyWorkingLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "Page loaded, but video file never started." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
