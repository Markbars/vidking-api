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
        
        // 1. Headers
        await page.setExtraHTTPHeaders({
            'Referer': 'https://imdb.com/',
            'Upgrade-Insecure-Requests': '1'
        });

        // 2. NETWORK SNIFFER (Global - sees traffic from all frames)
        let videoUrl = null;
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const rUrl = request.url();
            // Check for m3u8, mp4, or weird blobs
            if ((rUrl.includes('.m3u8') || rUrl.includes('.mp4')) && !rUrl.includes('thumb')) {
                console.log("[FOUND VIDEO] ", rUrl);
                videoUrl = rUrl;
            }
            request.continue();
        });

        // 3. GO TO PAGE
        await page.goto(targetURL, { waitUntil: 'networkidle2', timeout: 35000 });

        // 4. CHECK FOR CLOUDFLARE
        const title = await page.title();
        console.log(`[PAGE TITLE] ${title}`);
        if (title.includes("Just a moment") || title.includes("Cloudflare")) {
            console.log("[BLOCKED] Cloudflare detected.");
            await browser.close();
            return null;
        }

        // 5. IFRAME DIVING (The Fix)
        console.log("[ACTION] Searching for Iframes...");
        
        // Wait a moment for frames to load
        await new Promise(r => setTimeout(r, 3000));

        const frames = page.frames();
        console.log(`[INFO] Found ${frames.length} frames.`);

        // Loop through all frames (Main page + sub-frames) to find the button
        let clicked = false;
        for (const frame of frames) {
            try {
                // Try to find a player or button inside this frame
                const frameClicked = await frame.evaluate(() => {
                    const playBtn = document.querySelector('.play-btn') || 
                                    document.querySelector('#player_code') ||
                                    document.querySelector('video') ||
                                    document.querySelector('.r-player');
                    if (playBtn) {
                        playBtn.click();
                        return true;
                    }
                    return false;
                });

                if (frameClicked) {
                    console.log(`[CLICK] Clicked button inside a frame!`);
                    clicked = true;
                    // Don't break yet, sometimes we need to click multiple layers
                }
            } catch (e) {
                // Ignore frame access errors (some frames are blocked security-wise)
            }
        }

        if (!clicked) {
            console.log("[BACKUP] No frame button found. Using Blind Center Click.");
            await page.mouse.click(640, 360);
        }

        // 6. WAIT FOR VIDEO URL
        for (let i = 0; i < 15; i++) {
            if (videoUrl) {
                await browser.close();
                return videoUrl;
            }
            await new
