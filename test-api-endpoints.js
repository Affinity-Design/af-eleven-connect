import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function testElevenLabsEndpoints() {
  console.log('Available environment variables:');
  Object.keys(process.env).filter(key => key.includes('ELEVEN')).forEach(key => {
    console.log(`${key}: ${process.env[key] ? 'SET' : 'NOT SET'}`);
  });
  
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    console.log('ELEVENLABS_API_KEY not found in environment');
    return;
  }

  // Test endpoints to understand what's available
  const endpoints = [
    'https://api.elevenlabs.io/v1/history',
    'https://api.elevenlabs.io/v1/user',
    'https://api.elevenlabs.io/v1/voices'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\nTesting: ${endpoint}`);
      const response = await fetch(endpoint, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Response structure:`, Object.keys(data));
        
        if (endpoint.includes('history')) {
          console.log(`Sample record:`, data.history?.[0] ? Object.keys(data.history[0]) : 'No history records');
          console.log(`History count:`, data.history?.length || 0);
          
          // Check if any records show conversation/call data
          if (data.history?.length > 0) {
            const sample = data.history[0];
            console.log(`Sample record details:`, {
              source: sample.source,
              model_id: sample.model_id,
              voice_id: sample.voice_id,
              date_unix: sample.date_unix,
              character_count: sample.character_count,
              text: sample.text?.substring(0, 100) + '...'
            });
          }
        }
      } else {
        console.log(`Error: ${response.statusText}`);
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }
}

async function testGHLDirectly() {
  console.log('\n\n=== GHL Direct API Test ===');
  
  // We'll need to test this once we have proper tokens
  console.log('GHL testing requires valid OAuth tokens from database');
  console.log('Current issue: MongoDB connection timeout preventing token retrieval');
}

async function main() {
  console.log('=== ElevenLabs API Test ===');
  await testElevenLabsEndpoints();
  
  await testGHLDirectly();
}

main().catch(console.error);
