import { syncJira } from "@/lib/services/sync";
import { syncRouteResponse } from "@/lib/sync-route-response";

export async function POST(request: Request) {
  return syncRouteResponse(request, syncJira);
}
