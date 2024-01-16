import { DependencyContainer, Lifecycle, injectable } from "tsyringe";
import type { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import type { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import type { StaticRouterModService } from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
/*
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
const loader = container.resolve<PreAkiModLoader>("PreAkiModLoader");
const apiPath = loader.getModPath("API");
const api = require(apiPath);
*/

export class QuestZoneApi implements IPreAkiLoadMod, IPostDBLoadMod {
  router: StaticRouterModService;
  dbServer: DatabaseServer;

  private modConfig = require("../config/config.json");

  public preAkiLoad(container: DependencyContainer): void {
    const logger = container.resolve<ILogger>("WinstonLogger");
    this.router = container.resolve<StaticRouterModService>(
      "StaticRouterModService"
    );

    this._registerStaticRoutes();
  }

  public postDBLoad(container: DependencyContainer): void {
    this.dbServer = container.resolve<DatabaseServer>("DatabaseServer");
    const tables = this.dbServer.getTables();

    tables.globals["QuestZones"] = [];
  }

  private _registerStaticRoutes(): void {
    // Get Zones Route
    this.router.registerStaticRouter(
      "GetZones",
      [
        {
          url: "/quests/zones/getZones",
          action: (url, info, sessionId, output) => {
            const json = JSON.stringify(
              this.dbServer.getTables().globals["QuestZones"]
            );
            if (this.modConfig.debugMode) console.log(json);

            return json;
          },
        },
      ],
      ""
    );
  }
}

module.exports = { mod: new QuestZoneApi() };
