const axios = require('axios');

async function testAll() {
  console.log('--- Testing Xigua /channel/short_drama ---');
  try {
    const res = await axios.get('https://www.xigua.com/channel/short_drama', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    console.log('Xigua short_drama status:', res.status, 'len:', res.data.length);
    // Check if SSR_HYDRATED_DATA or _SSR_DATA or window._ROUTER_DATA exists
    const match = res.data.match(/_SSR_DATA\s*=\s*(\{[\s\S]*?\});/) ||
                  res.data.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (match) {
      console.log('Found SSR data in Xigua! len:', match[1].length);
    }
  } catch (e) {
    console.log('Xigua err:', e.message);
  }

  console.log('\n--- Testing Kuaishou Live API ---');
  try {
    const res = await axios.get('https://live.kuaishou.com/live_api/profile/public', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 5000
    });
    console.log('Kuaishou live_api status:', res.status);
  } catch (e) {
    console.log('Kuaishou live_api err:', e.message);
  }
}

testAll();
