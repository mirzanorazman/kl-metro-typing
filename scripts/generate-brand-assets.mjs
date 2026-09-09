import sharp from 'sharp';

const iconSource = 'public/favicon.svg';
const iconOutputs = [
  { file: 'public/favicon-32x32.png', size: 32 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
];

await Promise.all(iconOutputs.map(({ file, size }) => sharp(iconSource).resize(size, size).png({ compressionLevel: 9 }).toFile(file)));
