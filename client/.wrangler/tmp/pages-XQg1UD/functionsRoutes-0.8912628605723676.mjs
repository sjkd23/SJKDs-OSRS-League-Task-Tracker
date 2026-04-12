import { onRequestGet as __api_share__id__ts_onRequestGet } from "C:\\Programming\\OSRS\\SJKD's League Task Tracker\\client\\functions\\api\\share\\[id].ts"
import { onRequestPost as __api_share_index_ts_onRequestPost } from "C:\\Programming\\OSRS\\SJKD's League Task Tracker\\client\\functions\\api\\share\\index.ts"

export const routes = [
    {
      routePath: "/api/share/:id",
      mountPath: "/api/share",
      method: "GET",
      middlewares: [],
      modules: [__api_share__id__ts_onRequestGet],
    },
  {
      routePath: "/api/share",
      mountPath: "/api/share",
      method: "POST",
      middlewares: [],
      modules: [__api_share_index_ts_onRequestPost],
    },
  ]