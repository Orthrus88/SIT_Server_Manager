"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestZoneApi = void 0;
/*
import { PreAkiModLoader } from "C:/snapshot/project/obj/loaders/PreAkiModLoader";
const loader = container.resolve<PreAkiModLoader>("PreAkiModLoader");
const apiPath = loader.getModPath("API");
const api = require(apiPath);
*/
class QuestZoneApi {
    router;
    dbServer;
    modConfig = require("../config/config.json");
    preAkiLoad(container) {
        const logger = container.resolve("WinstonLogger");
        this.router = container.resolve("StaticRouterModService");
        this._registerStaticRoutes();
    }
    postDBLoad(container) {
        this.dbServer = container.resolve("DatabaseServer");
        const tables = this.dbServer.getTables();
        tables.globals["QuestZones"] = [];
    }
    _registerStaticRoutes() {
        // Get Zones Route
        this.router.registerStaticRouter("GetZones", [
            {
                url: "/quests/zones/getZones",
                action: (url, info, sessionId, output) => {
                    const json = JSON.stringify(this.dbServer.getTables().globals["QuestZones"]);
                    if (this.modConfig.debugMode)
                        console.log(json);
                    return json;
                },
            },
        ], "");
    }
}
exports.QuestZoneApi = QuestZoneApi;
module.exports = { mod: new QuestZoneApi() };
//# sourceMappingURL=mod.js.map