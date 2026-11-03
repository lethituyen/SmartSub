const axios = require('axios');
const fs = require('fs');

async function testMobileKuaishou() {
  const res = await axios.get('https://m.kuaishou.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    },
    timeout: 8000
  });
  fs.writeFileSync('scripts/m_kuaishou.html', res.data, 'utf8');
  console.log('Saved m_kuaishou.html, length:', res.data.length);
  // Check for any window.__APOLLO_STATE__ or __INITIAL_STATE__ or ROOTS
  const match = res.data.match(/window\.__[A-Za-z0-9_]+__\s*=\s*(\{[\s\S]*?\});/);
  if (match) {
    console.log('Found state match:', match[0].slice(0, 50));
  }
}

testMobileKuaishou();
