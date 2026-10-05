import { NextRequest,NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ActionError } from "@/lib/permissions";
import { industrialLinks,configureIndustrialLink } from "@/lib/industrial-links";
export const runtime="nodejs";
function failure(error:unknown){return NextResponse.json({error:error instanceof ActionError?error.message:"Falha ao consultar ou configurar os vínculos. Verifique dados e tente novamente."},{status:error instanceof ActionError?error.status:503});}
export async function GET(){try{const user=await currentUser();if(!user)throw new ActionError("Faça login.",401);return NextResponse.json(await industrialLinks(user),{headers:{"Cache-Control":"no-store"}});}catch(error){return failure(error);}}
export async function POST(request:NextRequest){try{if(request.headers.get("origin")!==request.nextUrl.origin)throw new ActionError("Origem não autorizada.",403);const user=await currentUser();if(!user)throw new ActionError("Faça login.",401);return NextResponse.json(await configureIndustrialLink(user,await request.json()));}catch(error){return failure(error);}}
