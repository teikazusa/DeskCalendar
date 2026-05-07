// Generate a simple 256x256 calendar icon (.ico)
const fs = require('fs');
const path = require('path');

const SIZE = 64;
const pixels = [];

// Color palette: [B, G, R, A] for each pixel
const C = { T: [0,0,0,0], W: [255,255,255,255], B: [246,181,100,255],
            G: [200,200,200,255], D: [60,60,60,255], LB: [255,220,180,255] };

function p(x, y, color) {
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE)
    pixels[y * SIZE + x] = color;
}

// Draw rounded rectangle body
const t = 10, b = SIZE-4, l = 6, r = SIZE-6;
for (let y = t; y < b; y++)
  for (let x = l; x < r; x++)
    p(x, y, C.W);

// Blue header bar
for (let y = t; y < t+14; y++)
  for (let x = l; x < r; x++)
    p(x, y, C.B);

// Header rounded corners
for (let y = t-2; y < t; y++)
  for (let x = l+2; x < r-2; x++)
    p(x, y, C.B);

// Binding rings
for (let rx of [16, 32, 48]) {
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -2; dx <= 2; dx++)
      if (dx*dx + dy*dy <= 9)
        p(rx+dx, t-4+dy, C.G);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx*dx + dy*dy <= 4)
        p(rx+dx, t-4+dy, C.W);
}

// Grid lines
for (let gy = t+18; gy < b-4; gy += 8)
  for (let gx = l+2; gx < r-2; gx++)
    if (pixels[gy * SIZE + gx] && pixels[gy * SIZE + gx][3] === 255)
      p(gx, gy, C.G);
for (let gx = l+10; gx < r-4; gx += 10)
  for (let gy = t+18; gy < b-4; gy++)
    if (pixels[gy * SIZE + gx] && pixels[gy * SIZE + gx][3] === 255)
      p(gx, gy, C.G);

// Write BMP pixel data (BGRA, bottom-up)
const rawSize = SIZE * SIZE * 4;
const pixelData = Buffer.alloc(rawSize);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const srcIdx = (SIZE-1-y) * SIZE + x;
    const c = pixels[srcIdx] || C.T;
    const dstIdx = (y * SIZE + x) * 4;
    pixelData[dstIdx] = c[0];     // B
    pixelData[dstIdx+1] = c[1];   // G
    pixelData[dstIdx+2] = c[2];   // R
    pixelData[dstIdx+3] = c[3];   // A
  }
}

// BMP info header
const bmpH = Buffer.alloc(40);
bmpH.writeUInt32LE(40, 0);
bmpH.writeUInt32LE(SIZE, 4);
bmpH.writeUInt32LE(SIZE * 2, 8); // height*2 for ICO
bmpH.writeUInt16LE(1, 12);
bmpH.writeUInt16LE(32, 14);
bmpH.writeUInt32LE(0, 16);
bmpH.writeUInt32LE(rawSize, 20);
bmpH.writeUInt32LE(0, 24);
bmpH.writeUInt32LE(0, 28);
bmpH.writeUInt32LE(0, 32);
bmpH.writeUInt32LE(0, 36);

// AND mask (1-bit, 0 = opaque)
const andRowBytes = Math.floor((SIZE + 31) / 32) * 4;
const andMask = Buffer.alloc(andRowBytes * SIZE);

const imageData = Buffer.concat([bmpH, pixelData, andMask]);

// ICO header
const icoH = Buffer.alloc(6);
icoH.writeUInt16LE(0, 0);
icoH.writeUInt16LE(1, 2);
icoH.writeUInt16LE(1, 4);

// Directory entry
const dirE = Buffer.alloc(16);
dirE.writeUInt8(SIZE === 256 ? 0 : SIZE, 0);
dirE.writeUInt8(SIZE === 256 ? 0 : SIZE, 1);
dirE.writeUInt8(0, 2);
dirE.writeUInt8(0, 3);
dirE.writeUInt16LE(1, 4);
dirE.writeUInt16LE(32, 6);
dirE.writeUInt32LE(imageData.length, 8);
dirE.writeUInt32LE(22, 12);

const ico = Buffer.concat([icoH, dirE, imageData]);
fs.writeFileSync(path.join(__dirname, '..', 'icon.ico'), ico);
console.log('Icon generated: ' + ico.length + ' bytes');
