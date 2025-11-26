const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

async function getVideoLink(tmdbId) {
    console.log(`Searching for ID: ${tmdbId}`);
    
    // Cloud setup: We cannot see the window, so we use Stealth mode
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process'
        ]
    });
    
    const page = await browser.newPage();
    let videoUrl = null;

    await page.setRequestInterception(true);
    
    page.on('request', (request) => {
        const url = request.url();
        if (url.includes('.m3u8') && !url.includes('thumbnails')) {
            videoUrl = url;
            console.log("FOUND URL:", videoUrl);
        }
        request.continue();
    });

    try {
        await page.goto(`https://www.vidking.net/embed/movie/${tmdbId}?autoPlay=true`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        console.log("Error:", e.message);
    }

    await browser.close();
    return videoUrl;
}

app.get('/get-movie', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send({ error: "Missing ID" });
    
    try {
        const streamLink = await getVideoLink(id);
        if (streamLink) {
            res.json({ url: streamLink });
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});