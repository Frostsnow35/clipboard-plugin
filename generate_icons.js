const fs = require('fs');
const { createCanvas } = require('canvas');
const path = require('path');

function generateIcon(size, filename) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 背景：圆角矩形
    const radius = size * 0.2;
    ctx.fillStyle = '#007bff';
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // 绘制剪贴板形状
    const padding = size * 0.2;
    const boardW = size - padding * 2;
    const boardH = size - padding * 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padding, padding + size * 0.05, boardW, boardH - size * 0.05);

    // 剪贴板夹子
    ctx.fillStyle = '#0056b3';
    const clipW = boardW * 0.4;
    const clipH = size * 0.1;
    ctx.fillRect(size / 2 - clipW / 2, padding, clipW, clipH);

    // 装饰线条（模拟文本）
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = size * 0.04;
    const lineX = padding + boardW * 0.2;
    const lineW = boardW * 0.6;
    for (let i = 0; i < 3; i++) {
        const lineY = padding + boardH * 0.3 + i * (boardH * 0.2);
        ctx.beginPath();
        ctx.moveTo(lineX, lineY);
        ctx.lineTo(lineX + lineW, lineY);
        ctx.stroke();
    }

    const buffer = canvas.toBuffer('image/png');
    const iconsDir = path.join(__dirname, 'icons');
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir);
    }
    fs.writeFileSync(path.join(iconsDir, filename), buffer);
    console.log(`Generated ${filename}`);
}

generateIcon(48, 'icon48.png');
generateIcon(128, 'icon128.png');
