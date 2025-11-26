const express = require('express');
const puppeteer = require('puppeteer-core'); // Changed to core for remote connection
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// PASTE YOUR BROWSERLESS KEY HERE
const BROWSERLESS_KEY = "2TUZ3kpvkb60pJibc42c1993c5e9c908cb07a7cc0c69a3ee8"; 

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
        // CONNECT TO REMOTE BROWSER (The Bypass)
        browser = await puppeteer.connect({
            browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_KEY}&stealth`
        });

        const page = await browser.newPage();
        
        // 1. Listen for the video file
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

        // 2. Go to the page (Browserless handles the IP)
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 3. Try to Click "Play"
        try {
            await new Promise(r => setTimeout(r, 2000));
            await page.mouse.click(683, 384);
        } catch (e) {}

        // 4. Wait for link
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
            res.status(404).json({ error: "Browserless could not find video." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});