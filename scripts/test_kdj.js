const axios = require('axios');
const fs = require('fs');

async function testKdj() {
  const res = await axios.get('https://kdj.kuaishou.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 8000
  });
  fs.writeFileSync('scripts/kdj_home.html', res.data, 'utf8');
  console.log('Saved kdj_home.html, len:', res.data.length);
  // Look for any scripts, APIs, or links
  const links = [...res.data.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
  console.log('kdj links:', [...new Set(links)].slice(0, 20));
}

testKdj();
