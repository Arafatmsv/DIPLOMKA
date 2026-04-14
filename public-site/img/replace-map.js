const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'analytics.html');
const snippetPath = path.join(__dirname, 'map-snippet.html');

let html = fs.readFileSync(htmlPath, 'utf8');
const snippet = fs.readFileSync(snippetPath, 'utf8');

// Find the old SVG block (from <svg id="kyrgyzstanMap" to closing </svg> before the tooltip)
const startMarker = '<svg id="kyrgyzstanMap"';
const endMarker = '</svg>';

const startIdx = html.indexOf(startMarker);
if (startIdx === -1) { console.error('Start marker not found'); process.exit(1); }

// Find the closing </svg> that belongs to the map (first one after startIdx)
const endIdx = html.indexOf(endMarker, startIdx);
if (endIdx === -1) { console.error('End marker not found'); process.exit(1); }

const oldSvg = html.substring(startIdx, endIdx + endMarker.length);
html = html.replace(oldSvg, snippet.trim());

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('SVG replaced successfully!');
console.log('Old SVG length:', oldSvg.length);
console.log('New SVG length:', snippet.trim().length);
