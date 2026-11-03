const axios = require('axios');

async function testHongguoLiveParser() {
  const url = 'https://hongguoduanju.com/rank/hot-drama';
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://hongguoduanju.com/'
    },
    timeout: 8000
  });

  const html = res.data;
  const items = [];
  const linkRegex = /<a[^>]*href=["']\/detail\?series_id=(\d+)["'][^>]*>([\s\S]*?)<\/a>/g;
  let match;

  // Track seen IDs to combine cover + title
  const seenMap = new Map();

  while ((match = linkRegex.exec(html)) !== null) {
    const id = match[1];
    const inner = match[2];
    const imgMatch = inner.match(/src=["']([^"']+)["']/);
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (!seenMap.has(id)) {
      seenMap.set(id, { id, cover: '', title: '' });
    }
    const item = seenMap.get(id);
    if (imgMatch && !item.cover) {
      item.cover = imgMatch[1];
    }
    if (text && text.length > 1 && !/^\d+$/.test(text) && !item.title) {
      item.title = text;
    }
  }

  const results = Array.from(seenMap.values()).filter(x => x.title);
  console.log('Parsed Hongguo items count:', results.length);
  results.slice(0, 10).forEach((it, idx) => {
    console.log(`[Top ${idx + 1}] ID: ${it.id} | Title: "${it.title}" | Cover: ${it.cover.slice(0, 60)}...`);
  });
}

testHongguoLiveParser();
