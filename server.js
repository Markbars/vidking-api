const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// We will try these 3 sources in order.
const SOURCES = [
    "https://vidsrc.xyz/embed/movie/",
    "https://vidsrc.me/embed/movie/",
    "https://2embed.cc/embed/"
];

async function tryScrape(browser, urlBase, tmdbId) {
    const targetURL = `${urlBase}${tmdbId}`;
    console.log(`[ATTEMPT] Trying source: ${targetURL}`);
    
    try {
        const page = await browser.newPage();
        
        // 1. Randomize Viewport to look human
        await page.setViewport({ width: 1366, height: 768 });

        // 2. Listen for the video file
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            // Look for m3u8 or mp4
            if ((rUrl.includes('.m3u8') || rUrl.includes('.mp4')) && !rUrl.includes('thumb') && !rUrl.includes('sprite')) {
                console.log("[FOUND] Video URL:", rUrl);
                videoUrl = rUrl;
            }
            request.continue();
        });

        // 3. Go to the page
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // 4. Check for Cloudflare Block
        const title = await page.title();
        if (title.includes("Cloudflare") || title.includes("Just a moment")) {
            console.log(`[BLOCKED] Cloudflare detected on ${urlBase}`);
            await page.close();
            return null;
        }

        // 5. Try to Click (The "Play" overlay)
        try {
            await new Promise(r => setTimeout(r, 2000));
            await page.mouse.click(683, 384); // Center click
        } catch (e) {}

        // 6. Wait for video link
        for (let i = 0; i < 10; i++) {
            if (videoUrl) {
                await page.close();
                return videoUrl;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        await page.close();
        return null;

    } catch (e) {
        console.log(`[FAIL] Error on ${urlBase}: ${e.message}`);
        return null;
    }
}

async function getAnyWorkingLink(tmdbId) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    });

    let finalLink = null;

    // Loop through sources. If one works, stop and return it.
    for (const source of SOURCES) {
        finalLink = await tryScrape(browser, source, tmdbId);
        if (finalLink) break; // We found one!
    }

    await browser.close();
    return finalLink;
}

app.get('/get-movie', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send({ error: "Missing ID" });
    
    req.setTimeout(120000); // Allow 2 minutes for multiple attempts

    try {
        const streamLink = await getAnyWorkingLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "All sources blocked or failed." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});