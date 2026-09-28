import { json, withUser } from "@/lib/api";
import type { Location, Stadium, TimePrice } from "@/lib/upstream";
import { upstreamFor } from "@/lib/users";

export const dynamic = "force-dynamic";

type Catalog = { locations: Location[]; stadiums: Stadium[]; prices: TimePrice[]; fetchedAt: number };
let cache: Catalog | null = null;

/** สาขา / สนาม / ช่องเวลา+ราคา (cache ในหน่วยความจำ 1 ชม.) */
export const GET = withUser(async (user) => {
  if (!cache || Date.now() - cache.fetchedAt > 3600_000) {
    const up = upstreamFor(user);
    const [locations, stadiums, prices] = await Promise.all([up.locations(), up.stadiums(), up.timePrices()]);
    cache = { locations, stadiums: stadiums.sort((a, b) => a.stadiumSort - b.stadiumSort), prices, fetchedAt: Date.now() };
  }
  return json(cache);
});
