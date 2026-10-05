"use client";
import { useRef, useState } from "react";
import { useDemoStore } from "../demo-store";
const fields: [string,string][] = [["code","Código"],["description","Descrição"],["group","Grupo"],["unit","Unidade"],["branch","Filial"],["balance","Saldo informado"],["minimum","Estoque mínimo"],["maximum","Estoque máximo"],["pack","Embalagem"],["lead","Prazo de reposição"],["consumption","Consumo agregado"],["average","Média informada"],["period","Período explícito"],["directive","Orientação de compra"],["order","Quantidade pedida"],["parcelTotal","Total explícito das parcelas"],["programme","Programação de compras"]];
type Preview = { columns: { column:number;label:string }[]; sheets:string[]; sheet:string; ready:boolean; warnings:string[]; records:{row:number;values:Record<string,string>;conflicts:string[]}[] };
export function MaterialImport() {
  const {runAction}=useDemoStore();
  const [file,setFile] = useState<File|null>(null),[mapping,setMapping] = useState<Record<string,number>>({}),[sheet,setSheet] = useState(""),[header,setHeader] = useState(1),[preview,setPreview] = useState<Preview|null>(null),[busy,setBusy] = useState(false),[message,setMessage] = useState("");
  const result = useRef<HTMLParagraphElement>(null);
  const [parcels,setParcels] = useState<number[]>([]);
  const [sources,setSources]=useState<{balances:{id:number;code:string;file_name:string;row_number:number;branch_id:number;branch_code:string;quantity:number|null;unit:string;reconciliation_movement_id:number|null}[];warehouses:{id:number;name:string;branch_id:number|null}[]}|null>(null);
  const [sourceId,setSourceId]=useState("");
  async function loadSources(){try{const r=await fetch("/api/items/import");const data=await r.json();if(!r.ok)throw new Error(data.error);setSources(data);}catch(e){setMessage((e as Error).message);}}
  async function reconcile(form:HTMLFormElement){setBusy(true);try{const d=new FormData(form);await runAction({type:"reconcileImportBalance",id:Number(sourceId),warehouse:d.get("warehouse"),mode:d.get("mode"),countedQuantity:String(d.get("count")??"").trim()?Number(d.get("count")):null,reason:d.get("reason"),confirmed:d.get("confirmed")==="on"});setMessage("Conciliação registrada pelo fluxo oficial de estoque.");await loadSources();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function submit(confirm=false) {
    if (!file || busy) return;
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.set("file",file);body.set("mapping",JSON.stringify(mapping));body.set("sheet",sheet);body.set("headerRow",String(header));body.set("confirm",String(confirm));body.set("parcelColumns",JSON.stringify(parcels));
      const response = await fetch("/api/items/import",{method:"POST",body}); const data=await response.json();
      if (!response.ok) throw new Error(data.error);
      if (confirm) { setPreview(null);setMessage(`${data.repeated?"Arquivo já importado":"Importação registrada"}: ${data.records} linhas. ${data.conflicts.length} conflitos. Saldos aguardam vínculo com local e conciliação oficial. ${JSON.stringify(data.conflicts)}`); }
      else { setPreview(data);setSheet(data.sheet);setMessage(`${data.records.length} linhas na prévia. ${data.warnings.join(" ")}`); }
    } catch(error) { setMessage(error instanceof Error?error.message:"Falha na importação."); } finally { setBusy(false);result.current?.focus(); }
  }
  return <details className="panel"><summary>Importar relatório de materiais</summary>
    <p>Selecione o arquivo e mapeie as colunas oficiais. A importação preserva procedência, compras e consumo agregado. Saldos do relatório ficam separados das movimentações até conciliação.</p>
    <label>Planilha XLSX <input type="file" accept=".xlsx" disabled={busy} onChange={(e)=>{setFile(e.target.files?.[0]??null);setPreview(null);setMapping({});setSheet("");setParcels([]);}} /></label>
    <label>Linha do cabeçalho <input type="number" min="1" max="1000" value={header} disabled={busy} onChange={(e)=>{setHeader(Number(e.target.value));setPreview(null);}} /></label>
    {preview&&<><label>Aba <select value={sheet} disabled={busy} onChange={(e)=>{setSheet(e.target.value);setPreview(null);}}>{preview.sheets.map(s=><option key={s}>{s}</option>)}</select></label>
      <div className="form-grid">{fields.map(([key,label])=><label key={key}>{label}{["code","description","group","unit","branch"].includes(key)?" *":""}<select value={mapping[key]??""} disabled={busy} onChange={e=>{const next={...mapping};if(e.target.value)next[key]=Number(e.target.value);else delete next[key];setMapping(next);setPreview(p=>p?{...p,ready:false}:p);}}><option value="">Não informado</option>{preview.columns.map(c=><option key={c.column} value={c.column}>{c.column}: {c.label||"Sem título"}</option>)}</select></label>)}</div>
      <label>Colunas numéricas das parcelas de compra (seleção explícita)<select multiple value={parcels.map(String)} disabled={busy} onChange={e=>{setParcels(Array.from(e.target.selectedOptions,o=>Number(o.value)));setPreview(p=>p?{...p,ready:false}:p);}}>{preview.columns.map(c=><option key={c.column} value={c.column}>{c.column}: {c.label}</option>)}</select></label>
      {preview.records.length>0&&<div className="table-scroll"><table><caption>Prévia — {preview.records.length} registros</caption><thead><tr><th>Linha</th><th>Código</th><th>Filial</th><th>Descrição</th><th>Saldo</th><th>Conflitos</th></tr></thead><tbody>{preview.records.map(r=><tr key={r.row}><td>{r.row}</td><td>{r.values.code}</td><td>{r.values.branch}</td><td>{r.values.description}</td><td>{r.values.balance??"Não informado"} {r.values.unit}</td><td>{r.conflicts.join("; ")}</td></tr>)}</tbody></table></div>}</>}
    <button type="button" disabled={!file||busy} onClick={()=>submit()}>Gerar prévia</button> <button type="button" disabled={!preview?.ready||busy} onClick={()=>submit(true)}>Confirmar importação dos 48 registros</button>
    <details onToggle={e=>{if(e.currentTarget.open&&!sources)void loadSources();}}><summary>Procedência e conciliação de saldos (até 200 linhas)</summary>{sources&&<>
      <label>Saldo informado <select value={sourceId} onChange={e=>setSourceId(e.target.value)} disabled={busy}><option value="">Selecione</option>{sources.balances.map(b=><option key={b.id} value={b.id} disabled={!!b.reconciliation_movement_id}>{b.code} · filial {b.branch_code} · {b.quantity??"Não informado"} {b.unit} · {b.file_name}, linha {b.row_number}{b.reconciliation_movement_id?" · Conciliado":""}</option>)}</select></label>
      {sourceId&&<form onSubmit={e=>{e.preventDefault();void reconcile(e.currentTarget);}}><label>Almoxarifado confirmado da mesma filial <select name="warehouse" required disabled={busy}><option value="">Selecione</option>{sources.warehouses.filter(w=>Number(w.branch_id)===Number(sources.balances.find(b=>String(b.id)===sourceId)?.branch_id)).map(w=><option key={w.id}>{w.name}</option>)}</select></label>
      <label>Critério <select name="mode" disabled={busy}><option value="opening">Abertura — apenas local sem saldo, reserva ou movimentação</option><option value="count">Conciliação — contagem física atual, preservando histórico</option></select></label><label>Quantidade fisicamente contada agora (conciliação)<input name="count" type="number" min="0" step="1" disabled={busy}/></label><label>Justificativa <input name="reason" minLength={3} maxLength={800} required disabled={busy}/></label><label><input type="checkbox" name="confirmed" required disabled={busy}/> Confirmei o local e a contagem ou abertura.</label><button disabled={busy}>Confirmar no estoque oficial</button></form>}
    </>}</details>
    <p role="status" tabIndex={-1} ref={result}>{busy?"Processando…":message}</p>
  </details>;
}
