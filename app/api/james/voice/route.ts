import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ActionError } from "@/lib/permissions";
import {
  localVoiceStatus,
  speakLocal,
  transcribeLocalWave,
} from "@/lib/james-local-voice";

import { marcoBody } from "@/lib/marco-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

async function limitedBody(request: NextRequest, limit: number) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit)
    throw new ActionError("Áudio longo demais.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ActionError("Áudio vazio.", 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new ActionError("Áudio longo demais.", 413);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function GET() {
  if (!(await currentUser()))
    return NextResponse.json(
      { error: "Faça login." },
      { status: 401, headers },
    );
  return NextResponse.json(await localVoiceStatus(), { headers });
}

export async function POST(request: NextRequest) {
  try {
    if (!(await currentUser()))
      return NextResponse.json(
        { error: "Sua sessão terminou." },
        { status: 401, headers },
      );
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new ActionError("Origem inválida.", 403);
    if (request.headers.get("content-type") === "audio/wav") {
      const { transcript, processingMs } = await transcribeLocalWave(
        await limitedBody(request, 550_000),
        request.signal,
      );
      return NextResponse.json(
        { transcript, processingMs },
        { headers: { ...headers, "Server-Timing": `asr;dur=${processingMs}` } },
      );
    }
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ActionError("Formato inválido.", 415);
    const body = await marcoBody(request, 4000);
    if (typeof body?.text !== "string")
      throw new ActionError("Resposta de voz inválida.", 422);
    const { audio, processingMs } = await speakLocal(body?.text);
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        ...headers,
        "Content-Type": "audio/wav",
        "Server-Timing": `tts;dur=${processingMs}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ActionError
            ? error.message
            : "Serviço de voz indisponível.",
      },
      {
        status: error instanceof ActionError ? error.status : 503,
        headers,
      },
    );
  }
}
