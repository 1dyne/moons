import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';

// Bundles one integration test (workspace packages inlined, other packages external) and runs it.
const entry=process.argv[2];
if(!entry)throw new Error('Usage: node scripts/run-integration.mjs <test file>');
await mkdir('.test-output',{recursive:true});
const outfile=path.join('.test-output',path.basename(entry).replace(/\.ts$/,'.mjs'));
await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',alias:{'@':path.resolve('src/moons')},logLevel:'warning',
 plugins:[{name:'external-packages',setup(b){b.onResolve({filter:/^[^./]/},a=>a.path.startsWith('@workspace/')||a.path.startsWith('@/')?undefined:{path:a.path,external:true})}}]});
const child=spawn(process.execPath,['--test',outfile],{stdio:'inherit'});
child.on('exit',code=>process.exitCode=code??1);
