/** Run: node --import tsx src/services/__tests__/ocr-client.test.ts */
// Mock Supabase client before importing the service
let mockInvoke: any;
const mockSupabase = {
  functions: {
    invoke: (...args: any[]) => mockInvoke(...args),
  },
};

// Mock file system
const mockReadAsStringAsync = async () => 'mock-base64-data';

// Set up mocks
(globalThis as any).mockSupabaseClient = mockSupabase;
(globalThis as any).mockFileSystem = {
  readAsStringAsync: mockReadAsStringAsync,
  EncodingType: { Base64: 'base64' },
};

// Mock modules
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === '../db/supabase' || id.endsWith('/db/supabase')) {
    return { supabase: mockSupabase };
  }
  if (id.endsWith('/stores/settings-store')) return {useSettingsStore:{getState:()=>({ocrConsent:true})}};
  if (id.endsWith('/stores/scan-store')) return {useScanStore:{getState:()=>({useScan:()=>true})}};
  if (id === 'expo-file-system/legacy') {
    return (globalThis as any).mockFileSystem;
  }
  return originalRequire.apply(this, arguments);
};

// Now import the service
const { recognizeWithClaude } = require('../claude-ocr');

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function section(name: string) {
  console.log(`\n${name}`);
}

async function runTests() {
  console.log('\n════════════════════════════════════════');
  console.log('  OCR Edge Function Client Tests');
  console.log('════════════════════════════════════════\n');

  await section('✓ Basic OCR call');
  {
    mockInvoke = async (functionName: string, options: any) => {
      assert(functionName === 'ocr-scorecard', 'Function name is correct');
      assert(options.body.imageData === 'mock-base64-data', 'Image data passed');
      assert(options.body.mediaType === 'image/jpeg', 'Media type is jpeg');
      
      return {
        data: {
          players: [
            {
              name: 'Bob Yates',
              scores: [4, 4, 6, 5, 5, 3, 5, 6, 4, 5, 4, 5, 4, 5, 3, 4, 6, 7],
              confidence: Array(18).fill(0.9),
              nameConfidence: 0.95,
            },
          ],
        },
        error: null,
      };
    };

    try {
      const result = await recognizeWithClaude('file:///path/to/scorecard.jpg');
      assert(result.players.length === 1, 'One player returned');
      assert(result.players[0].name === 'Bob Yates', 'Player name correct');
      assert(result.players[0].scores.length === 18, 'Has 18 scores');
      assert(result.averageConfidence > 0, 'Average confidence calculated');
    } catch (error) {
      failed++;
      console.log(`  ✗ OCR call failed: ${error}`);
    }
  }

  await section('✓ PNG media type detection');
  {
    mockInvoke = async (functionName: string, options: any) => {
      assert(options.body.mediaType === 'image/png', 'PNG media type detected');
      
      return {
        data: {
          players: [{
            name: 'Player',
            scores: Array(18).fill(4),
            confidence: Array(18).fill(0.9),
            nameConfidence: 0.85,
          }],
        },
        error: null,
      };
    };

    try {
      await recognizeWithClaude('file:///path/to/scorecard.PNG');
    } catch (error) {
      failed++;
      console.log(`  ✗ PNG test failed: ${error}`);
    }
  }

  await section('✓ Error handling');
  {
    mockInvoke = async () => ({
      data: null,
      error: { message: 'Invalid token' },
    });

    try {
      await recognizeWithClaude('file:///path/to/scorecard.jpg');
      failed++;
      console.log('  ✗ Should have thrown error for invalid token');
    } catch (error) {
      assert(
        error instanceof Error && error.message.includes('Invalid token'),
        'Throws error with correct message'
      );
    }
  }

  await section('✓ Invalid response handling');
  {
    mockInvoke = async () => ({
      data: {},
      error: null,
    });

    try {
      await recognizeWithClaude('file:///path/to/scorecard.jpg');
      failed++;
      console.log('  ✗ Should have thrown error for invalid response');
    } catch (error) {
      assert(
        error instanceof Error && error.message.includes('invalid response'),
        'Throws error for missing players data'
      );
    }
  }

  await section('✓ Score padding');
  {
    mockInvoke = async () => ({
      data: {
        players: [{
          name: 'Partial',
          scores: [4, 5, 3],
          confidence: [0.9, 0.85, 0.9],
          nameConfidence: 0.8,
        }],
      },
      error: null,
    });

    try {
      const result = await recognizeWithClaude('file:///path/to/scorecard.jpg');
      assert(result.players[0].scores.length === 18, 'Scores padded to 18');
      assert(result.players[0].confidence.length === 18, 'Confidence padded to 18');
      assert(
        result.players[0].scores.slice(0, 3).join(',') === '4,5,3',
        'Original scores preserved'
      );
      assert(
        result.players[0].scores.slice(3).every((s: number | null) => s === null),
        'Padded with blanks'
      );
    } catch (error) {
      failed++;
      console.log(`  ✗ Score padding failed: ${error}`);
    }
  }

  await section('✓ Multiple players');
  {
    mockInvoke = async () => ({
      data: {
        players: [
          {
            name: 'Player 1',
            scores: Array(18).fill(4),
            confidence: Array(18).fill(0.9),
            nameConfidence: 0.95,
          },
          {
            name: 'Player 2',
            scores: Array(18).fill(5),
            confidence: Array(18).fill(0.85),
            nameConfidence: 0.9,
          },
          {
            name: 'Player 3',
            scores: Array(18).fill(4),
            confidence: Array(18).fill(0.92),
            nameConfidence: 0.88,
          },
        ],
      },
      error: null,
    });

    try {
      const result = await recognizeWithClaude('file:///path/to/scorecard.jpg');
      assert(result.players.length === 3, 'Three players returned');
      assert(result.players[0].name === 'Player 1', 'First player correct');
      assert(result.players[1].name === 'Player 2', 'Second player correct');
      assert(result.players[2].name === 'Player 3', 'Third player correct');
    } catch (error) {
      failed++;
      console.log(`  ✗ Multiple players test failed: ${error}`);
    }
  }

  console.log('\n════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
