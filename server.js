const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

async function getVideoLink(tmdbId) {
    console.log(`[SEARCH] Starting search for ID: ${tmdbId}`);
    
    // 1. Launch Browser with "Anti-Detection" args
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
            '--disable-gpu',
            '--window-size=1920,1080'
        ]
    });

    try {
        const page = await browser.newPage();

        // 2. Fake being a Desktop User (Less suspicious than mobile)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        // 3. Listen for the video file
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const url = request.url();
            // VidSrc often uses .m3u8 or .mp4
            if ((url.includes('.m3u8') || url.includes('.mp4')) && !url.includes('google') && !url.includes('thumbnails')) {
                console.log("[SUCCESS] Found Video URL:", url);
                videoUrl = url;
            }
            request.continue();
        });

        // 4. GO TO VIDSRC (The backup source)
        // This is often easier to scrape than Vidking
        const targetURL = `https://vidsrc.to/embed/movie/${tmdbId}`;
        console.log(`[NAVIGATING] ${targetURL}`);
        
        await page.goto(targetURL, { waitUntil: 'domcontentloaded', timeout: 25000 });

        // 5. Check if we are blocked
        const pageTitle = await page.title();
        console.log(`[PAGE TITLE] ${pageTitle}`);
        
        if (pageTitle.includes("Just a moment") || pageTitle.includes("Cloudflare")) {
            console.log("[ERROR] Render IP is blocked by Cloudflare.");
            await browser.close();
            return null;
        }

        // 6. Click the Player
        // We wait a moment, then click center
        await new Promise(r => setTimeout(r, 2000));
        await page.mouse.click(960, 540); // Click center
        
        // 7. Wait for the network sniffer to find the link
        for (let i = 0; i < 15; i++) {
            if (videoUrl) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        await browser.close();
        return videoUrl;

    } catch (e) {
        console.log("[CRITICAL ERROR]", e.message);
        if (browser) await browser.close();
        return null;
    }
}

app.get('/get-movie', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send({ error: "Missing ID" });
    
    // Extend timeout for Render
    req.setTimeout(60000); 

    try {
        const streamLink = await getVideoLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            // If VidSrc fails, we send a specific error
            res.status(404).json({ error: "Blocked by Cloudflare or Not Found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});