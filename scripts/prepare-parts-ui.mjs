import { mkdir, writeFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

// Separate application used solely to inspect the real components with isolated persisted data.
const root = resolve(".validation/parts-ui");
const save = async (file, content) => {
  const path = resolve(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};
const from = (file, target) => {
  const path = relative(
    dirname(resolve(root, file)),
    resolve(target),
  ).replaceAll("\\", "/");
  return path.startsWith(".") ? path : "./" + path;
};
await save(
  "package.json",
  JSON.stringify({ name: "marcon-parts-ui-test", private: true }),
);
await save(
  "next.config.cjs",
  "module.exports={turbopack:{root:require('node:path').resolve(__dirname,'../..')}};",
);
await save(
  "tsconfig.json",
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "esnext"],
      module: "esnext",
      jsx: "preserve",
      moduleResolution: "bundler",
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      paths: { "@/*": ["../../*"] },
      plugins: [{ name: "next" }],
    },
  }),
);
await save(
  "postcss.config.mjs",
  "export default {plugins:{'@tailwindcss/postcss':{}}};",
);
await save(
  "app/layout.tsx",
  `import '${from("app/layout.tsx", "app/globals.css")}';import '${from("app/layout.tsx", "app/theme.css")}';export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR" data-theme="light"><body><main style={{maxWidth:1200,padding:20,margin:'auto',minWidth:0}}>{children}</main></body></html>}`,
);
for (const [path, mode] of [
  ["parts", "comparison"],
  ["by-part", "share"],
]) {
  const file = `app/admin/dashboard/${path}/page.tsx`;
  await save(
    file,
    `import {Suspense} from 'react';import {PartsConsumptionScreen} from '${from(file, "components/workspace/screens/parts-consumption-screen.tsx")}';export default function Page(){return <Suspense><PartsConsumptionScreen role="admin" mode="${mode}" /></Suspense>}`,
  );
}
const dataRoot = resolve(".validation/parts-consumption");
const directories = (await readdir(dataRoot))
  .filter((d) => d.startsWith("postgres-"))
  .sort();
if (!directories.length)
  throw new Error("Execute test-parts-consumption.mjs primeiro.");
const api = `app/api/parts-consumption/route.ts`;
await save(
  api,
  `import {createRequire} from 'node:module';import {NextRequest,NextResponse} from 'next/server';
const require=createRequire(${JSON.stringify(resolve("package.json"))});
const {PGlite}=require(${JSON.stringify(resolve(".validation/node_modules/@electric-sql/pglite"))});
const {buildPartsReport}=require(${JSON.stringify(resolve("backend/src/workspace/parts-consumption.js"))});
const {exportPartsReport}=require(${JSON.stringify(resolve(dataRoot, "parts-export.cjs"))});
import {translateSql} from '${from(api, "lib/neon-db.mjs")}';
const globalTest=globalThis as typeof globalThis & {partsTestDb?: InstanceType<typeof PGlite>};
const pg=globalTest.partsTestDb??=new PGlite(${JSON.stringify(resolve(dataRoot, directories.at(-1)))});
async function execute(sql:string,args:unknown[]=[]){let i=0;const result=await pg.query(translateSql(sql).replace(/\\?/g,()=>'$'+(++i)),args);return [result.rows]}
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const q=request.nextUrl.searchParams;const format=q.get('format');if(format)q.set('export','all');
const r=await buildPartsReport({id:'test-admin',name:'Teste',email:'test@example.invalid',role:'admin',label:'Admin'},q,{execute,query:execute});
if(format==='pdf'||format==='xlsx')return new NextResponse(new Uint8Array(await exportPartsReport(r,format)),{headers:{'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
return NextResponse.json(r)}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha'},{status:Number((e as {status?:number}).status)||503})}}
`,
);
console.log(
  "Harness isolado preparado em .validation/parts-ui, com componentes reais e PostgreSQL de teste.",
);
