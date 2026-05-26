// Run this to test your Supabase connection
// node test-supabase.js
require('dotenv').config({ path: __dirname + '/.env' });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
console.log('URL:', url);
console.log('Key present:', !!key);

async function test() {
  try {
    // Insert a test event
    const body = {
      id: 'test-' + Date.now(),
      date: '2026-05-08',
      title: 'Test Event',
      time: null,
      end_time: null,
      color: '#FF3B30',
      completed: false,
      series_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(`${url}/rest/v1/events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });

    const status = res.status;
    const data = await res.text();
    console.log('Status:', status);
    console.log('Response:', data);

    if (res.ok) {
      // Clean up
      await fetch(`${url}/rest/v1/events?id=eq.${body.id}`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      console.log('TEST PASSED - Supabase works!');
    } else {
      console.log('TEST FAILED - Check your RLS policies and table schema');
    }
  } catch (e) {
    console.log('Connection failed:', e.message);
  }
}

test();
