// Simple screenshot capture script
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const outputDir = '/opt/cursor/artifacts/screenshots';
const htmlFile = path.join(outputDir, 'demo.html');

console.log('Capturing SnapScore demo screenshots...');

// Use Chrome in headless mode to capture
const captureScreenshot = (selector, filename) => {
  return new Promise((resolve, reject) => {
    const cmd = `/usr/local/bin/google-chrome --headless=new --screenshot=${path.join(outputDir, filename)} --window-size=1280,1400 --hide-scrollbars --disable-gpu --no-sandbox ${htmlFile}`;
    
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error capturing ${filename}:`, error.message);
        reject(error);
      } else {
        console.log(`✓ Captured ${filename}`);
        resolve();
      }
    });
  });
};

async function main() {
  try {
    await captureScreenshot('body', '01-home-screen.png');
    await new Promise(r => setTimeout(r, 2000));
    
    await captureScreenshot('body', '02-contest-setup.png');
    await new Promise(r => setTimeout(r, 2000));
    
    await captureScreenshot('body', '03-scorecard-entry.png');
    await new Promise(r => setTimeout(r, 2000));
    
    await captureScreenshot('body', '04-live-leaderboard.png');
    await new Promise(r => setTimeout(r, 2000));
    
    await captureScreenshot('body', '05-final-settlement.png');
    
    console.log('\n✅ All screenshots captured successfully!');
    console.log(`Output directory: ${outputDir}`);
    
    // List files
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.png'));
    console.log('\nCaptured screenshots:');
    files.forEach(f => console.log(`  - ${path.join(outputDir, f)}`));
    
  } catch (error) {
    console.error('Failed to capture screenshots:', error);
    process.exit(1);
  }
}

main();
