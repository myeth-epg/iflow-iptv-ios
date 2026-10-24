const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Universal Stream & CORS Proxy (Handles M3U, EPG, HLS redirects for Safari WebKit & Shaka)
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        };

        const response = await fetch(targetUrl, {
            headers,
            redirect: 'follow'
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

        response.body.pipe(res);
    } catch (err) {
        console.error('Proxy fetch error:', err.message);
        res.status(502).send('Error proxying request: ' + err.message);
    }
});

// App Settings & Config persistence
const CONFIG_FILE = path.join(__dirname, 'user_config.json');

app.get('/api/config', (req, res) => {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return res.json(JSON.parse(data));
        } catch (e) {
            console.error('Error reading config:', e);
        }
    }
    // Clean standalone defaults - user enters their own URLs in Settings
    res.json({
        playlistUrl: '',
        epgUrl: '',
        aspectRatio: 'default',
        qsHideSeconds: 10,
        showSpeed: true,
        enableExitApp: false
    });
});

app.post('/api/config', (req, res) => {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🍏 iFlow IPTV Universal Apple Player (macOS & iPadOS)`);
    console.log(`💻 Local (Mac / PC):  http://localhost:${PORT}`);
    console.log(`📱 iPad Air Network: http://192.168.0.200:${PORT}`);
    console.log(`====================================================`);
});
