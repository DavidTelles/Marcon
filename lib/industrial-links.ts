import type { Account } from "./accounts";
import { getPool, transaction } from "./db";
import { ActionError, demand, integer, text } from "./permissions";
import { first, rows, audit, insert } from "./stock-ledger";
import type { FacilityGraph } from "./routing";

export async function industrialLinks(user: Account) {
  demand(user,"people");
  const c = getPool();
  const [branches,blocks,sectors,workplaces,points,users,warehouses,pending] = await Promise.all([
    rows(c,"SELECT * FROM branches ORDER BY code"),rows(c,"SELECT * FROM blocks ORDER BY code"),rows(c,"SELECT * FROM sectors ORDER BY code"),rows(c,"SELECT * FROM workplaces ORDER BY code"),rows(c,"SELECT * FROM plant_points WHERE active=TRUE ORDER BY label"),
    rows(c,"SELECT id,employee_no,name,block_id,branch_id,sector_id,workplace_id FROM users WHERE active=TRUE ORDER BY employee_no"),rows(c,"SELECT id,code,name,block_id,branch_id FROM warehouses WHERE active=TRUE ORDER BY code"),
    rows(c,"SELECT p.code,w.name AS warehouse,i.map_node_id FROM inventory i JOIN parts p ON p.id=i.part_id JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN plant_points pt ON pt.id=i.map_node_id WHERE i.map_node_id IS NULL OR pt.id IS NULL OR pt.active=FALSE ORDER BY p.code,w.name LIMIT 200"),
  ]);
  return {branches,blocks,sectors,workplaces,points,users,warehouses,pending, basis:"Vínculos explícitos por IDs. Cadastros históricos sem vínculo exigem configuração; nomes não determinam localização."};
}
export async function configureIndustrialLink(user: Account, a: Record<string,unknown>) {
  demand(user,"people");
  return transaction(async c=>{
    const actor=await first(c,"SELECT id FROM users WHERE employee_no=? AND active=TRUE FOR UPDATE",[user.id]);
    if(!actor)throw new ActionError("Sessão inválida.",401);
    let id:number;
    if(a.type==="branch"){
      const code=text(a.code,64),name=text(a.name,160)||null;
      if(!code)throw new ActionError("Informe o código textual da filial.");
      const r=await insert(c,"INSERT INTO branches(code,name) VALUES(?,?) RETURNING id",[code,name]);id=Number(r!.id);
    }else if(a.type==="blockBranch"||a.type==="warehouseBranch"){
      id=integer(a.id);const branchId=integer(a.branchId),table=a.type==="blockBranch"?"blocks":"warehouses";
      if(!await first(c,"SELECT id FROM branches WHERE id=?",[branchId])||!await first(c,`SELECT id FROM ${table} WHERE id=? FOR UPDATE`,[id]))throw new ActionError("Filial ou cadastro inexistente.",404);
      const dependents=await first(c,table==="blocks"?"SELECT id FROM sectors WHERE block_id=? AND branch_id<>? LIMIT 1":"SELECT id FROM inventory i JOIN reported_balances r ON r.warehouse_id=i.warehouse_id WHERE i.warehouse_id=? AND r.branch_id<>? LIMIT 1",[id,branchId]);
      if(dependents)throw new ActionError("Existem vínculos incompatíveis; revise-os antes de alterar a filial.",409);
      await c.execute(`UPDATE ${table} SET branch_id=? WHERE id=?`,[branchId,id]);
    }else if(a.type==="sector"){
      const branchId=integer(a.branchId),blockId=integer(a.blockId),code=text(a.code,64),name=text(a.name,160);
      if(!code||!name)throw new ActionError("Informe código e nome oficiais do setor.");
      if(!await first(c,"SELECT id FROM blocks WHERE id=? AND branch_id=?",[blockId,branchId]))throw new ActionError("Vincule o bloco à filial antes de cadastrar o setor.",409);
      const r=await insert(c,"INSERT INTO sectors(code,name,branch_id,block_id) VALUES(?,?,?,?) RETURNING id",[code,name,branchId,blockId]);id=Number(r!.id);
    }else if(a.type==="workplace"){
      const sectorId=integer(a.sectorId),code=text(a.code,64),name=text(a.name,160),point=text(a.pointId,64)||null;
      if(!code||!name)throw new ActionError("Informe código e nome oficiais do local de trabalho.");
      const sector=await first(c,"SELECT * FROM sectors WHERE id=?",[sectorId]);if(!sector)throw new ActionError("Setor inexistente.",404);
      if(point&&!await first(c,"SELECT id FROM plant_points WHERE id=? AND active=TRUE AND block_id=? AND (sector_id IS NULL OR sector_id=?)",[point,sector.block_id,sector.id]))throw new ActionError("Selecione um ponto publicado do bloco/setor autorizado.",409);
      const r=await insert(c,"INSERT INTO workplaces(code,name,branch_id,block_id,sector_id,point_id) VALUES(?,?,?,?,?,?) RETURNING id",[code,name,sector.branch_id,sector.block_id,sector.id,point]);id=Number(r!.id);
    }else if(a.type==="userWorkplace"){
      id=integer(a.id);const workplace=await first(c,"SELECT wp.*,s.name AS sector FROM workplaces wp JOIN sectors s ON s.id=wp.sector_id WHERE wp.id=?",[integer(a.workplaceId)]);
      if(!workplace||!await first(c,"SELECT id FROM users WHERE id=? FOR UPDATE",[id]))throw new ActionError("Usuário ou local inexistente.",404);
      await c.execute("UPDATE users SET workplace_id=?,sector_id=?,sector=?,branch_id=?,block_id=? WHERE id=?",[workplace.id,workplace.sector_id,workplace.sector,workplace.branch_id,workplace.block_id,id]);
    }else throw new ActionError("Vínculo inválido.");
    await audit(c,Number(actor.id),"industrial_link",id,String(a.type),a);return{id};
  });
}
export async function syncPublishedPoints(c: import("./db-types").PoolConnection, graph:FacilityGraph, version:number) {
  const linked=await rows(c,"SELECT wp.code,wp.point_id,wp.block_id,wp.sector_id FROM workplaces wp WHERE wp.point_id IS NOT NULL");
  for(const wp of linked)if(!graph.nodes.some(n=>n.id===wp.point_id&&n.blockId===Number(wp.block_id)&&(!n.sectorId||n.sectorId===Number(wp.sector_id))))throw new ActionError(`O local ${wp.code} perderia seu ponto vinculado. Revise o cadastro antes de publicar.`,409);
  await c.execute("UPDATE plant_points SET active=FALSE WHERE active=TRUE");
  for(const n of graph.nodes){
    if(n.sectorId&&!await first(c,"SELECT id FROM sectors WHERE id=? AND block_id=?",[n.sectorId,n.blockId??null]))throw new ActionError("Setor do ponto não pertence ao bloco selecionado.",409);
    await c.execute("INSERT INTO plant_points(id,label,kind,warehouse_id,block_id,sector_id,published_version_id,active) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,kind=EXCLUDED.kind,warehouse_id=EXCLUDED.warehouse_id,block_id=EXCLUDED.block_id,sector_id=EXCLUDED.sector_id,published_version_id=EXCLUDED.published_version_id,active=TRUE",[n.id,n.label,n.kind,n.warehouseId??null,n.blockId??null,n.sectorId??null,version]);
  }
}
