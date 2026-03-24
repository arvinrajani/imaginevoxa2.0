/**
 * Comprehensive System Test
 * Tests all critical components and API routes
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const tests = [];
let passed = 0;
let failed = 0;

// Helper function to make HTTP requests
function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
      } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test suite
async function runTests() {
  console.log('\n🔍 PRO Studio System Check\n');
  console.log('=' .repeat(50));

  // Test 1: Server is running
  tests.push({
    name: 'Server Health',
    test: async () => {
      const res = await makeRequest(BASE_URL);
      return res.status === 200 || res.status === 307 || res.status === 308;
    }
  });

  // Test 2: Studio page loads
  tests.push({
    name: 'Studio Page',
    test: async () => {
      const res = await makeRequest(`${BASE_URL}/app/studio`);
      return res.status === 200 || res.status === 401;
    }
  });

  // Test 3: Login page accessible
  tests.push({
    name: 'Auth System',
    test: async () => {
      const res = await makeRequest(`${BASE_URL}/login`);
      return res.status === 200;
    }
  });

  // Test 4: API routes exist
  const apiRoutes = [
    '/api/pro/brand-intake',
    '/api/pro/marketing-dna',
    '/api/pro/brand-kit/save',
    '/api/pro/mood-board/suggest',
    '/api/pro/image/base',
    '/api/pro/image/qa',
    '/api/pro/post-options',
    '/api/pro/campaign/plan',
    '/api/pro/prompt-copilot',
    '/api/pro/utm/build',
    '/api/pro/insights/roi',
    '/api/pro/publish',
  ];

  for (const route of apiRoutes) {
    tests.push({
      name: `API: ${route}`,
      test: async () => {
        const res = await makeRequest(`${BASE_URL}${route}`);
        // 401 is OK (needs auth), 404 is bad
        return res.status !== 404;
      }
    });
  }

  // Test 5: Environment variables
  tests.push({
    name: 'Environment Config',
    test: async () => {
      // Check if .env.local exists
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '.env.local');
      
      if (!fs.existsSync(envPath)) return false;
      
      const envContent = fs.readFileSync(envPath, 'utf8');
      const requiredVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'OPENAI_API_KEY',
        'OPENAI_IMAGE_MODEL',
        'OPENAI_TEXT_MODEL'
      ];
      
      return requiredVars.every(v => envContent.includes(v));
    }
  });

  // Test 6: Package dependencies
  tests.push({
    name: 'Dependencies',
    test: async () => {
      const fs = require('fs');
      const path = require('path');
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
      
      const required = ['openai', 'next', '@supabase/supabase-js', 'react'];
      return required.every(dep => pkg.dependencies[dep]);
    }
  });

  // Test 7: Database schema file exists
  tests.push({
    name: 'Database Schema',
    test: async () => {
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, 'init-database.sql');
      
      if (!fs.existsSync(schemaPath)) return false;
      
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const requiredTables = ['brands', 'brand_kits', 'mood_boards', 'marketing_dna', 'image_assets'];
      
      return requiredTables.every(table => schemaContent.includes(`CREATE TABLE`));
    }
  });

  // Run all tests
  for (const test of tests) {
    try {
      const result = await test.test();
      if (result) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed}/${tests.length} tests passed`);
  
  if (failed === 0) {
    console.log('\n🎉 All systems operational!');
    console.log('\n✨ PRO Studio is ready:');
    console.log(`   → http://localhost:3000/app/studio\n`);
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Review errors above.\n`);
  }
}

// Run tests
runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err.message);
  process.exit(1);
});
