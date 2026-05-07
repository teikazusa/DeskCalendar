const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'release', 'DeskCalendar-win32-x64', 'locales');
if (!fs.existsSync(localesDir)) {
  console.log('No locales dir found, skipping cleanup');
  process.exit(0);
}

const keep = ['zh-CN.pak', 'ja.pak', 'en-US.pak'];
let removed = 0;
fs.readdirSync(localesDir).forEach(f => {
  if (f.endsWith('.pak') && !keep.includes(f)) {
    fs.unlinkSync(path.join(localesDir, f));
    removed++;
  }
});
console.log(`Removed ${removed} unused locale files`);
