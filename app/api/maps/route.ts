import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { databaseEnabled, getPool, transaction } from "@/lib/db";
import { ActionError, demand, integer, text } from "@/lib/permissions";
import {
  graphProblems,
  planStops,
  transports,
  type FacilityGraph,
  type RouteOptions,
} from "@/lib/routing";
import type { RowDataPacket, ResultSetHeader } from "@/lib/db-types";
import { imageObstacles, imageSuggestions } from "@/lib/map-image";
import { deliveryHistory, planDelivery } from "@/lib/delivery-planning";
export const runtime = "nodejs";
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Faça login." }, 401);
    demand(user, "stock");
    if (!databaseEnabled()) return json({ error: "Configure o Neon." }, 503);
    if (request.nextUrl.searchParams.has("delivery")) {
      const page = integer(
        Number(request.nextUrl.searchParams.get("page") ?? 1),
      );
      if (page > 10000) throw new ActionError("Página inválida.");
      return json({
        history: await deliveryHistory(
          integer(Number(request.nextUrl.searchParams.get("delivery"))),
          page,
        ),
      });
    }
    const id = request.nextUrl.searchParams.get("image");
    if (id) {
      if (!Number.isSafeInteger(Number(id)) || Number(id) < 1)
        return json({ error: "Versão inválida." }, 400);
      const [r] = await getPool().execute<RowDataPacket[]>(
        `SELECT image_data,image_type FROM map_versions WHERE id=? ${user.role === "admin" ? "" : "AND status='Publicada'"}`,
        [Number(id)],
      );
      if (!r[0]) return json({ error: "Mapa não encontrado." }, 404);
      return new NextResponse(new Uint8Array(r[0].image_data), {
        headers: {
          "Content-Type": r[0].image_type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const [maps] = await getPool().query<RowDataPacket[]>(
      `SELECT id,title,graph,status,created_at,published_at FROM map_versions ${user.role === "admin" ? "" : "WHERE status='Publicada'"} ORDER BY id DESC LIMIT 50`,
    );
    const [warehouses] = await getPool().query<RowDataPacket[]>(
      "SELECT id,name,block_id FROM warehouses WHERE active=TRUE",
    );
    const [blocks] = await getPool().query<RowDataPacket[]>(
      "SELECT id,name FROM blocks",
    );
    const [sectors] = await getPool().query<RowDataPacket[]>(
      "SELECT u.block_id AS blockId,b.name AS block,u.sector,COUNT(*) AS employees FROM users u JOIN blocks b ON b.id=u.block_id WHERE u.active=TRUE GROUP BY u.block_id,b.name,u.sector ORDER BY b.name,u.sector",
    );
    return json({ maps, warehouses, blocks, sectors });
  } catch (e) {
    if (e instanceof ActionError) return json({ error: e.message }, e.status);
    return json(
      {
        error:
          "Não foi possível carregar o mapa. Verifique o Neon e as migrações.",
      },
      503,
    );
  }
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return json({ error: "Origem não autorizada." }, 403);
  const user = await currentUser();
  if (!user) return json({ error: "Faça login." }, 401);
  if (!databaseEnabled()) return json({ error: "Configure o Neon." }, 503);
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new ActionError("Dados ausentes.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 6_000_000) {
        await reader.cancel();
        throw new ActionError("Arquivo muito grande (máximo 5 MB).", 413);
      }
      chunks.push(r.value);
    }
    const raw = Buffer.concat(chunks);
    let a: Record<string, unknown>;
    let image: Buffer | undefined;
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      demand(user, "map");
      const form = await new Response(raw, {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
      const file = form.get("image");
      a = {
        action: form.get("action") === "suggest" ? "suggest" : "save",
        title: form.get("title"),
        graph: JSON.parse(String(form.get("graph"))),
        baseId: Number(form.get("baseId")) || undefined,
      };
      if (file instanceof File && file.size) {
        if (
          file.size > 5_000_000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(file.type)
        )
          throw new ActionError("Envie PNG, JPEG ou WebP de até 5 MB.");
        const buffer = Buffer.from(await file.arrayBuffer()),
          meta = await sharp(buffer, {
            limitInputPixels: 16_000_000,
          }).metadata();
        if (!["png", "jpeg", "webp"].includes(meta.format ?? ""))
          throw new ActionError("Formato não suportado.");
        image = await sharp(buffer, { limitInputPixels: 16_000_000 })
          .rotate()
          .png()
          .toBuffer();
        if (image.length > 5_000_000)
          throw new ActionError(
            "A planta normalizada ultrapassa 5 MB. Reduza a resolução.",
          );
      }
    } else a = JSON.parse(raw.toString("utf8"));
    if (["planDelivery", "departDelivery"].includes(String(a.action)))
      return json(await planDelivery(user, a));
    if (a.action === "test") {
      demand(user, "stock");
      let graph: FacilityGraph;
      let mapVersion: number | null = null;
      if (user.role === "admin" && a.graph) graph = a.graph as FacilityGraph;
      else {
        const [r] = await getPool().query<RowDataPacket[]>(
          "SELECT id,graph FROM map_versions WHERE status='Publicada'",
        );
        if (!r[0])
          return json({
            route: null,
            reason:
              "Rota indisponível: nenhum mapa publicado. Operação manual.",
          });
        graph =
          typeof r[0].graph === "string" ? JSON.parse(r[0].graph) : r[0].graph;
        mapVersion = Number(r[0].id);
        if (!graph.reviewed)
          throw new ActionError("A planta publicada não está revisada.", 409);
        if (a.mapVersion !== undefined && a.mapVersion !== mapVersion)
          throw new ActionError(
            "A planta publicada mudou. Atualize a rota.",
            409,
          );
      }
      if (
        !Array.isArray(a.stops) ||
        a.stops.length > 25 ||
        !a.stops.every((s) => typeof s === "string")
      )
        throw new ActionError("Paradas inválidas.");
      const options: RouteOptions = {
        objective:
          a.objective === undefined
            ? "distance"
            : (a.objective as RouteOptions["objective"]),
        transport:
          a.transport === undefined
            ? "walking"
            : (a.transport as RouteOptions["transport"]),
        final: a.final === undefined ? undefined : text(a.final, 64),
      };
      if (
        !["distance", "time"].includes(options.objective!) ||
        !Object.hasOwn(transports, options.transport!)
      )
        throw new ActionError("Objetivo ou transporte inválido.");
      const route = planStops(
        graph,
        text(a.start, 64),
        a.stops as string[],
        options,
      );
      return json({
        route,
        graph,
        mapVersion,
        parameters: options,
        reason: route
          ? "Rota sugerida, sem movimentação de saldo."
          : "Rota indisponível: revise pontos, paredes e acessos bloqueados.",
      });
    }
    demand(user, "map");
    if (a.action === "suggest") {
      if (!image && a.baseId) {
        const [rows] = await getPool().execute<RowDataPacket[]>(
          "SELECT image_data FROM map_versions WHERE id=?",
          [integer(a.baseId)],
        );
        image = rows[0]?.image_data;
      }
      if (!image)
        throw new ActionError("Envie a planta antes de gerar sugestões.");
      const meta = await sharp(image).metadata();
      return json(
        await imageSuggestions(image, {
          width: meta.width!,
          height: meta.height!,
          metersPerPixel: 1,
          scaleCalibrated: false,
          nodes: [],
          edges: [],
          walls: [],
          reviewed: false,
        }),
      );
    }
    return await transaction(async (c) => {
      const [actors] = await c.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE employee_no=? AND active=TRUE AND role='admin' FOR UPDATE",
        [user.id],
      );
      if (!actors[0]) throw new ActionError("Sessão inválida.", 401);
      if (a.action === "createWarehouse") {
        const name = text(a.name, 80),
          blockId = a.blockId ? integer(a.blockId) : null;
        if (name.length < 3)
          throw new ActionError(
            "Informe um nome de almoxarifado com pelo menos três caracteres.",
          );
        const [duplicates] = await c.execute<RowDataPacket[]>(
          "SELECT id FROM warehouses WHERE name=?",
          [name],
        );
        if (duplicates.length)
          throw new ActionError(
            "Já existe um almoxarifado com esse nome.",
            409,
          );
        if (blockId) {
          const [blocks] = await c.execute<RowDataPacket[]>(
            "SELECT id FROM blocks WHERE id=?",
            [blockId],
          );
          if (!blocks.length) throw new ActionError("Bloco inexistente.");
        }
        const [created] = await c.execute<ResultSetHeader>(
          "INSERT INTO warehouses(code,name,block_id,is_central,active) VALUES(?,?,?,0,1)",
          ["LOCAL-" + randomUUID().slice(0, 16), name, blockId],
        );
        await c.execute(
          "INSERT INTO audit_log(actor_id,entity_type,entity_id,action,details) VALUES(?,'warehouse',?,'create',?)",
          [actors[0].id, created.insertId, JSON.stringify({ name, blockId })],
        );
        return json({ id: created.insertId, name }, 201);
      }
      if (a.action === "publish") {
        const id = integer(a.id),
          [r] = await c.execute<RowDataPacket[]>(
            "SELECT graph,status,image_data FROM map_versions WHERE id=? FOR UPDATE",
            [id],
          );
        if (!r[0] || r[0].status !== "Rascunho")
          throw new ActionError("Selecione uma versão em rascunho.");
        const graph =
          typeof r[0].graph === "string"
            ? JSON.parse(r[0].graph)
            : (r[0].graph as FacilityGraph);
        graph.obstacles = await imageObstacles(r[0].image_data);
        graph.nodes = graph.nodes.map((n: FacilityGraph["nodes"][number]) =>
          n.kind === "shelf" ? { ...n, kind: "access" } : n,
        );
        const errors = graphProblems(graph);
        const [activeWarehouses] = await c.query<RowDataPacket[]>(
          "SELECT id FROM warehouses WHERE active=TRUE",
        );
        const [activeBlocks] = await c.query<RowDataPacket[]>(
          "SELECT id FROM blocks",
        );
        if (
          graph.nodes.some(
            (n: FacilityGraph["nodes"][number]) =>
              (n.warehouseId &&
                !activeWarehouses.some(
                  (w) => Number(w.id) === n.warehouseId,
                )) ||
              (n.blockId &&
                !activeBlocks.some((b) => Number(b.id) === n.blockId)),
          )
        )
          throw new ActionError(
            "Um local ou bloco vinculado foi removido ou desativado. Resolva os vínculos antes de publicar.",
            409,
          );
        const [linked] = await c.query<RowDataPacket[]>(
          "SELECT i.map_node_id,i.warehouse_id,p.code FROM inventory i JOIN parts p ON p.id=i.part_id WHERE i.map_node_id IS NOT NULL AND p.active=TRUE",
        );
        const missing = linked.find(
          (l) =>
            !graph.nodes.some(
              (n: FacilityGraph["nodes"][number]) =>
                n.id === l.map_node_id &&
                n.warehouseId === Number(l.warehouse_id),
            ),
        );
        if (missing)
          throw new ActionError(
            `O ponto ${missing.map_node_id} está vinculado ao estoque de ${missing.code}. Resolva o vínculo no cadastro antes de publicar.`,
            409,
          );
        if (
          errors.length ||
          !graph.reviewed ||
          graph.nodes.length < 2 ||
          !graph.edges.some((e: { blocked: boolean }) => !e.blocked)
        )
          throw new ActionError(
            errors[0] ??
              "Teste os caminhos e confirme a conferência física antes de publicar.",
          );
        await c.query(
          "UPDATE map_versions SET status='Arquivada' WHERE status='Publicada'",
        );
        await c.execute(
          "UPDATE map_versions SET graph=?,status='Publicada',published_at=UTC_TIMESTAMP(3) WHERE id=?",
          [JSON.stringify(graph), id],
        );
        await c.execute(
          "INSERT INTO audit_log(actor_id,entity_type,entity_id,action) VALUES(?,'map',?,'publish')",
          [actors[0].id, id],
        );
        return json({ id });
      }
      if (a.action !== "save") throw new ActionError("Ação inválida.");
      const graph = a.graph as FacilityGraph;
      // Existing shelf IDs remain stable as access points; stock shelf metadata is untouched.
      if (Array.isArray(graph?.nodes))
        graph.nodes = graph.nodes.map((n) =>
          n.kind === "shelf" ? { ...n, kind: "access", uncertain: true } : n,
        );
      const errors = graphProblems(graph);
      if (errors.length) throw new ActionError(errors[0]);
      const title = text(a.title, 120);
      if (!title) throw new ActionError("Informe o título.");
      const [warehouses] = await c.query<RowDataPacket[]>(
        "SELECT id FROM warehouses WHERE active=TRUE",
      );
      const [blocks] = await c.query<RowDataPacket[]>("SELECT id FROM blocks");
      if (
        graph.nodes.some(
          (n) =>
            (n.warehouseId &&
              !warehouses.some((w) => Number(w.id) === n.warehouseId)) ||
            (n.blockId && !blocks.some((b) => Number(b.id) === n.blockId)),
        )
      )
        throw new ActionError(
          "Ponto vinculado a almoxarifado/bloco inexistente.",
        );
      if (!image && a.baseId) {
        const [base] = await c.execute<RowDataPacket[]>(
          "SELECT image_data FROM map_versions WHERE id=?",
          [integer(a.baseId)],
        );
        image = base[0]?.image_data;
      }
      if (!image) throw new ActionError("Envie a planta baixa.");
      graph.obstacles = await imageObstacles(image);
      const imageErrors = graphProblems(graph);
      if (imageErrors.length) throw new ActionError(imageErrors[0]);
      const meta = await sharp(image).metadata();
      if (meta.width !== graph.width || meta.height !== graph.height)
        throw new ActionError(
          "As dimensões do grafo devem corresponder à imagem.",
        );
      const [r] = await c.execute<ResultSetHeader>(
        "INSERT INTO map_versions(title,image_data,image_type,graph,created_by) VALUES(?,?,'image/png',?,?)",
        [title, image, JSON.stringify(graph), actors[0].id],
      );
      await c.execute(
        "INSERT INTO audit_log(actor_id,entity_type,entity_id,action) VALUES(?,'map',?,'draft')",
        [actors[0].id, r.insertId],
      );
      return json({ id: r.insertId });
    });
  } catch (e) {
    if (e instanceof ActionError) return json({ error: e.message }, e.status);
    return json(
      {
        error:
          "Não foi possível processar a planta. Confira o arquivo e os dados.",
      },
      400,
    );
  }
}
