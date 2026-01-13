const WebSocket = require('ws');

const WSS_URL = process.env.WSS_URL || 'ws://localhost:8080';

console.log(`🧪 Testing WebSocket server at ${WSS_URL}\n`);

const ws = new WebSocket(WSS_URL);

let testsPassed = 0;
let testsFailed = 0;

ws.on('open', () => {
  console.log('✅ Test 1: Connection established');
  testsPassed++;

  // Test ping
  console.log('\n📤 Sending ping...');
  ws.send(JSON.stringify({ type: 'ping' }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Received:', message);

  if (message.type === 'connected') {
    console.log('✅ Test 2: Connected message received');
    testsPassed++;
  }

  if (message.type === 'pong') {
    console.log('✅ Test 3: Ping-pong working');
    testsPassed++;

    // Test health check
    console.log('\n📤 Sending health check...');
    ws.send(JSON.stringify({ type: 'health' }));
  }

  if (message.type === 'health') {
    console.log('✅ Test 4: Health check working');
    testsPassed++;
    
    console.log(`\n📊 Server Status:`);
    console.log(`   - Status: ${message.status}`);
    console.log(`   - Uptime: ${Math.round(message.uptime)}s`);
    console.log(`   - Active connections: ${message.connections}`);
    console.log(`   - Memory: ${Math.round(message.memory.heapUsed / 1024 / 1024)}MB`);

    // Close connection
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('❌ Test Failed: Connection error:', error.message);
  testsFailed++;
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n👋 Connection closed');
  console.log(`\n📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  
  if (testsFailed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n⏱️ Test timeout');
  ws.close();
  process.exit(1);
}, 10000);
