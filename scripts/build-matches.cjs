const fs = require('fs');
const path = require('path');
const {parseXgFile} = require('./xg-parser.cjs');

const root = path.resolve(__dirname, '..');
const matchDir = path.join(root, 'matches');
const generatedDir = path.join(matchDir, 'generated');
const adsDir = path.join(root, 'ads');
fs.mkdirSync(matchDir,{recursive:true});
fs.mkdirSync(generatedDir,{recursive:true});
fs.mkdirSync(adsDir,{recursive:true});

const sourceFiles = fs.readdirSync(matchDir,{withFileTypes:true})
  .filter(e=>e.isFile())
  .map(e=>e.name)
  .filter(n=>/\.(xg|json)$/i.test(n) && n !== 'manifest.json')
  .sort((a,b)=>a.localeCompare(b,'ja'));

const generated = {};
for(const file of sourceFiles){
  if(/\.xg$/i.test(file)){
    const data = parseXgFile(path.join(matchDir,file));
    const outName = `${file}.json`;
    fs.writeFileSync(path.join(generatedDir,outName),JSON.stringify(data));
    generated[file] = `generated/${outName}`;
    console.log(`Parsed ${file}: ${data.states.length} states`);
  }else{
    generated[file] = file;
  }
}

fs.writeFileSync(path.join(matchDir,'manifest.json'),JSON.stringify({
  schemaVersion:2,
  files:sourceFiles,
  generated
},null,2)+'\n');

const adFiles = fs.readdirSync(adsDir,{withFileTypes:true})
  .filter(e=>e.isFile())
  .map(e=>e.name)
  .filter(n=>/\.(png|jpe?g|webp|gif)$/i.test(n))
  .sort((a,b)=>a.localeCompare(b,'ja'));
fs.writeFileSync(path.join(adsDir,'manifest.json'),JSON.stringify({files:adFiles},null,2)+'\n');
console.log(`Manifest: ${sourceFiles.length} match(es), ${adFiles.length} ad(s)`);
