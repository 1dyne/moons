import {copyFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Runtime binaries are reproducible build output, not checked-in app assets.
const packageRoot=dirname(fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision')));
const target=fileURLToPath(new URL('../public/mediapipe/wasm/',import.meta.url));
mkdirSync(target,{recursive:true});
for(const name of ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm']){
 const source=join(packageRoot,'wasm',name);
 if(!existsSync(source))throw new Error(`MediaPipe runtime ${name} is missing; install workspace dependencies.`);
 copyFileSync(source,join(target,name));
}
console.log('MediaPipe runtime prepared for the app.');
