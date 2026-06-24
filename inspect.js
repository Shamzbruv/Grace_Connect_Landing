const fs = require('fs');

const configContent = fs.readFileSync('js/supabase-config.js', 'utf-8');
const matchUrl = configContent.match(/SUPABASE_URL = '([^']+)'/);
const matchKey = configContent.match(/SUPABASE_ANON_KEY = '([^']+)'/);

if (matchUrl && matchKey) {
  const url = matchUrl[1];
  const key = matchKey[1];

  async function rest(table) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    return await res.json();
  }

  async function run() {
    const data = await rest('policy_acceptances');
    console.log("POLICY ACCEPTANCES:");
    console.log(data);
  }
  run();
}
