// Run once:  node setup.js   -> asks 3 questions and writes the .env file
const fs = require('fs'), rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, a => r(a.trim())));
(async () => {
  console.log('\nMalfoy setup\n');
  const num = (await ask('Your WhatsApp number with country code, no + (example 2348101234567): ')).replace(/\D/g, '');
  const port = (await ask('Website port [3000]: ')) || '3000';
  const url = (await ask('Public website address (leave empty to use http://localhost:' + port + '): ')) || 'http://localhost:' + port;
  const env = ['PREFIX=.', 'PORT=' + port, 'PAIRING_NUMBER=' + num, 'OWNER_NUMBER=' + num, 'QR_KEY=' + require('crypto').randomBytes(8).toString('hex'), 'DATA_DIR=./data', 'PUBLIC_URL=' + url.replace(/\/$/, ''), 'GROQ_API_KEY=', 'YT_COOKIES=', ''].join('\n');
  fs.writeFileSync('.env', env); fs.mkdirSync('data', { recursive: true });
  console.log('\n.env written. Start the bot with:  npm start\nA pairing code will appear in this terminal.\n'); rl.close();
})();
