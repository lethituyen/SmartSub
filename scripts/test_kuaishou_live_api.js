const axios = require('axios');

async function testKuaishouApis() {
  const endpoints = [
    'https://live.kuaishou.com/live_api/hotwords',
    'https://live.kuaishou.com/live_api/ranking/hot',
    'https://live.kuaishou.com/live_api/search?keyword=短剧',
    'https://live.kuaishou.com/live_api/profile/public',
    'https://c.kuaishou.com/rest/k/ranking/hot',
    'https://api.kuaishouzt.com/rest/zt/share/w/shortVideo/list'
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://live.kuaishou.com/'
        },
        timeout: 5000
      });
      console.log(url, '-> 200 OK! Data keys:', Object.keys(res.data || {}));
      if (res.data?.data) {
        console.log('Sample data:', JSON.stringify(res.data.data).slice(0, 150));
      }
    } catch (e) {
      console.log(url, '-> Err:', e.response?.status || e.message);
    }
  }
}

testKuaishouApis();
