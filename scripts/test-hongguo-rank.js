const axios = require('axios');
const fs = require('fs');

async function testRank() {
  const url = 'https://hongguoduanju.com/rank/hot-drama';
  console.log('Fetching', url);
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://hongguoduanju.com/'
    },
    timeout: 8000
  });
  console.log('Status:', res.status, 'HTML length:', res.data.length);
  fs.writeFileSync('scripts/hongguo_rank.html', res.data, 'utf8');

  // Look for _ROUTER_DATA
  const routerMatch = res.data.match(/_ROUTER_DATA\s*=\s*(\{[\s\S]*?\});/);
  if (routerMatch) {
    console.log('Found _ROUTER_DATA!');
    try {
      const parsed = JSON.parse(routerMatch[1]);
      console.log('Router data keys:', Object.keys(parsed));
      console.log('Page keys:', Object.keys(parsed.loaderData?.page || {}));
      const pageData = parsed.loaderData?.page;
      // Print sample
      console.log('Sample pageData:', JSON.stringify(pageData).slice(0, 500));
    } catch (e) {
      console.log('Parse router data err:', e.message);
    }
  }

  // Also look for links /detail?series_id=
  const detailMatches = [...res.data.matchAll(/\/detail\?series_id=(\d+)/g)].map(m => m[1]);
  console.log('Detail series_ids found:', [...new Set(detailMatches)]);
}

testRank();
