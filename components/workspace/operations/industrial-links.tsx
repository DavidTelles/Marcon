"use client";
import { useState } from "react";
type Row={id:number|string;code?:string;name?:string;employee_no?:string;label?:string;branch_id?:number;block_id?:number;workplace_id?:number;map_node_id?:string;warehouse?:string};
type Data=Record<string,Row[]>;
const commands: Record<string,{label:string;fields:[string,string,string][]}>={
  branch:{label:"Cadastrar filial",fields:[["code","Código textual","text"],["name","Nome oficial (opcional)","text"]]},
  blockBranch:{label:"Vincular bloco à filial",fields:[["id","Bloco","blocks"],["branchId","Filial","branches"]]},
  warehouseBranch:{label:"Vincular almoxarifado à filial",fields:[["id","Almoxarifado","warehouses"],["branchId","Filial","branches"]]},
  sector:{label:"Cadastrar setor",fields:[["code","Código","text"],["name","Nome oficial","text"],["branchId","Filial","branches"],["blockId","Bloco","blocks"]]},
  workplace:{label:"Cadastrar local de trabalho",fields:[["code","Código","text"],["name","Nome oficial","text"],["sectorId","Setor","sectors"],["pointId","Ponto publicado (opcional)","points"]]},
  userWorkplace:{label:"Vincular usuário ao local de trabalho",fields:[["id","Usuário","users"],["workplaceId","Local de trabalho","workplaces"]]},
};
export function IndustrialLinks(){
  const [data,setData]=useState<Data|null>(null),[type,setType]=useState("branch"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function load(){setBusy(true);try{const r=await fetch("/api/industrial-links");const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);setError("");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function save(form:HTMLFormElement){setBusy(true);try{const values:Record<string,unknown>={type};for(const [key,,source]of commands[type].fields){const value=String(new FormData(form).get(key)??"");values[key]=source==="text"||key==="pointId"?value:Number(value);}const r=await fetch("/api/industrial-links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();form.reset();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <details className="panel" onToggle={e=>{if(e.currentTarget.open&&!data&&!busy)void load();}}><summary>Cadastros e vínculos industriais pendentes</summary><p>Selecione IDs dos cadastros oficiais. A publicação da planta valida os pontos vinculados. Cadastros históricos sem vínculo permanecem pendentes.</p>{error&&<p role="alert">{error} <button type="button" onClick={()=>load()}>Tentar novamente</button></p>}{data&&<>
    <p>Usuários sem local: {data.users.filter(u=>!u.workplace_id).length}. Blocos sem filial: {data.blocks.filter(b=>!b.branch_id).length}. Almoxarifados sem filial: {data.warehouses.filter(w=>!w.branch_id).length}. Estoques sem ponto válido: {data.pending.length}{data.pending.length===200?" ou mais":""}.</p>
    <form onSubmit={e=>{e.preventDefault();void save(e.currentTarget);}}><label>Ação <select value={type} disabled={busy} onChange={e=>setType(e.target.value)}>{Object.entries(commands).map(([key,c])=><option key={key} value={key}>{c.label}</option>)}</select></label><div className="form-grid">{commands[type].fields.map(([key,label,source])=><label key={`${type}-${key}`}>{label}{source==="text"?<input name={key} maxLength={key==="code"?64:160} required={key!=="name"||type!=="branch"} disabled={busy}/>:<select name={key} required={key!=="pointId"} disabled={busy}><option value="">Selecione</option>{data[source]?.map(r=><option key={r.id} value={r.id}>{r.employee_no??r.code??r.id} · {r.name??r.label}</option>)}</select>}</label>)}</div><button disabled={busy}>Confirmar vínculo</button></form>
    <details><summary>Estoques com ponto pendente (até 200)</summary><ul>{data.pending.map((p,i)=><li key={i}>{p.code} · {p.warehouse} · {p.map_node_id??"Sem ponto"}</li>)}</ul></details>
  </>}{busy&&<p role="status">Carregando…</p>}</details>;
}
