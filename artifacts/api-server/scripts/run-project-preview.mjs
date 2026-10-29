import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
await mkdir('.test-output',{recursive:true});
const outfile='.test-output/project-preview.mjs';
await build({entryPoints:['scripts/project-preview.ts'],outfile,bundle:true,platform:'node',format:'esm',alias:{'@':path.resolve('src/moons')},logLevel:'warning',
  plugins:[{name:'external-packages',setup(b){b.onResolve({filter:/^[^./]/},a=>a.path.startsWith('@workspace/')||a.path.startsWith('@/')||a.path.startsWith('zod')?undefined:{path:a.path,external:true});}}]});
const child=spawn(process.execPath,[outfile],{stdio:'inherit'});
process.on('SIGTERM',()=>child.kill());
child.on('exit',code=>process.exitCode=code??1);
