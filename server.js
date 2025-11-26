const express = require('express');
const puppeteer = require('puppeteer-core');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// YOUR KEY
const BROWSERLESS_KEY = "2TUZ3kpvkb60pJibc42c1993c5e9c908cb07a7cc0c69a3ee8"; 

// THE SOURCES
const SOURCES = [
    "https://vidsrc.to/embed/movie/",
    "https://vidsrc.xyz/embed/movie/",
    "https://vidsrc.me/embed/movie/"
];

async function tryScrape(urlBase, tmdbId) {
    const targetURL = `${urlBase}${tmdbId}`;
    console.log(`[ATTEMPT] Connecting via Browserless to: ${targetURL}`);
    
    let browser = null;

    try {
        // --- THE FIX ---
        // 1. Use the Universal Endpoint (chrome.browserless.io)
        // 2. Add '&stealth' to automatically hide bot status
        // 3. Add '--window-size' to look like a desktop monitor
        browser = await puppeteer.connect({
            browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_KEY}&stealth&args=--window-size=1920,1080`
        });

        const page = await browser.newPage();
        
        // Set a real User Agent (Just in case Stealth needs help)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        // Listen for video file
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            if ((rUrl.includes('.m3u8') || rUrl.includes('.mp4')) && !rUrl.includes('thumb')) {
                console.log("[FOUND] Video URL:", rUrl);
                videoUrl = rUrl;
            }
            request.continue();
        });

        // Go to page
        console.log("Navigating...");
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Try to Click Play (Center of screen)
        try {
            await new Promise(r => setTimeout(r, 2000));
            await page.mouse.click(960, 540);
        } catch (e) {}

        // Wait for link loop
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
    
    // 60s timeout
    req.setTimeout(60000); 

    try {
        const streamLink = await getAnyWorkingLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "No video found in any source." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
