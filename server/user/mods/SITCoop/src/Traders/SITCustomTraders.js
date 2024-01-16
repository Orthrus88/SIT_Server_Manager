"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SITCustomTraders = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const BearTrader_1 = require("./BearTrader");
const CoopGroupTrader_1 = require("./CoopGroupTrader");
const FluentTraderAssortCreator_1 = require("./FluentTraderAssortCreator");
const UsecTrader_1 = require("./UsecTrader");
class SITCustomTraders {
    tradeHelper;
    itemHelper;
    hashUtil;
    fluentTraderAssortCreator;
    logger;
    static traders = [];
    databaseServer;
    traderAssortHelper;
    preAkiLoad(container) {
        this.databaseServer = container.resolve("DatabaseServer");
        SITCustomTraders.traders.push(new CoopGroupTrader_1.CoopGroupTrader(), new UsecTrader_1.UsecTrader(), new BearTrader_1.BearTrader());
        // Initialize Custom Traders
        for (const t of SITCustomTraders.traders) {
            t.preAkiLoad(container);
        }
        this.logger = container.resolve("WinstonLogger");
        this.tradeHelper = container.resolve("TradeHelper");
        this.itemHelper = container.resolve("ItemHelper");
        this.hashUtil = container.resolve("HashUtil");
        this.traderAssortHelper = container.resolve("TraderAssortHelper");
        this.fluentTraderAssortCreator = new FluentTraderAssortCreator_1.FluentAssortConstructor(this.hashUtil, this.logger);
        container.afterResolution("TradeController", (_t, result) => {
            // When the player trades with the Custom Traders, do stuff with the logic
            result.confirmTrading = (pmcData, request, sessionID) => {
                console.log("SITCustomTraders...");
                console.log(request);
                console.log("===== <> =====");
                // buying
                if (request.type === "buy_from_trader") {
                    const buyData = request;
                    this.buyFromCoopTrader(pmcData, request, sessionID);
                    return this.tradeHelper.buyItem(pmcData, buyData, sessionID, false, null);
                }
                // selling
                if (request.type === "sell_to_trader") {
                    const sellData = request;
                    this.sellToCoopTrader(pmcData, request, sessionID);
                    // return this.tradeHelper.sellItem(pmcData, sellData, sessionID);
                    return this.tradeHelper.sellItem(pmcData, pmcData, sellData, sessionID);
                }
                return null;
            };
            // The modifier Always makes sure this replacement method is ALWAYS replaced
        }, { frequency: "Always" });
        container.afterResolution("TraderController", (_t, result) => {
            result.getAssort = (sessionId, traderId) => {
                if (traderId === "coopTrader") {
                    SITCustomTraders.traders[0].createAssort(this.databaseServer.getTables());
                }
                return this.traderAssortHelper.getAssort(sessionId, traderId);
            };
        }, { frequency: "Always" });
    }
    postDBLoad(container) {
        // Initialize Custom Traders
        for (const t of SITCustomTraders.traders) {
            t.postDBLoad(container);
        }
    }
    buyFromCoopTrader(pmcData, request, sessionID) {
        const buyData = request;
        const itemGroups = buyData.scheme_items;
        const traderId = request.tid;
        // If not the CoopTrader, ignore all other logic                    
        if (traderId !== "coopTrader")
            return false;
        // -------------------------------------------
        // Get Dynamic Assort Path
        const traderDbPath = path_1.default.join(process.cwd(), "user", "cache", "SITCoop", traderId);
        if (!fs_1.default.existsSync(traderDbPath))
            fs_1.default.mkdirSync(traderDbPath, { recursive: true });
        // Create dynamic assort file
        const dynamicAssortFilePath = path_1.default.join(traderDbPath, "dynamicAssort.json");
        if (!fs_1.default.existsSync(dynamicAssortFilePath)) {
            const defaultFile = JSON.stringify([], null, 4);
            fs_1.default.writeFileSync(dynamicAssortFilePath, defaultFile);
        }
        // -------------------------------------------
        const assortItemIndex = this.databaseServer.getTables().traders[traderId].assort.items.findIndex(x => x._id == buyData.item_id);
        if (assortItemIndex === -1)
            return false;
        const currentAssort = JSON.parse(fs_1.default.readFileSync(dynamicAssortFilePath).toString());
        const assortItem = this.databaseServer.getTables().traders[traderId].assort.items[assortItemIndex];
        const storedAssortItemIndex = currentAssort.findIndex(x => x.tpl == assortItem._tpl);
        if (storedAssortItemIndex === -1)
            return false;
        if (currentAssort[storedAssortItemIndex].count - buyData.count <= 0) {
            currentAssort.splice(storedAssortItemIndex, 1);
        }
        else {
            currentAssort[storedAssortItemIndex].count -= buyData.count;
        }
        // save the change to file
        fs_1.default.writeFileSync(dynamicAssortFilePath, JSON.stringify(currentAssort));
        // regenerage the assort
        // SITCustomTraders.traders[0].createAssort(this.databaseServer.getTables());
        return true;
    }
    sellToCoopTrader(pmcData, request, sessionID) {
        const sellData = request;
        const itemGroups = sellData.items;
        const traderId = request.tid;
        // If not the CoopTrader, ignore all other logic                    
        if (traderId !== "coopTrader")
            return false;
        // -------------------------------------------
        // Get Dynamic Assort Path
        const traderDbPath = path_1.default.join(process.cwd(), "user", "cache", "SITCoop", traderId);
        if (!fs_1.default.existsSync(traderDbPath))
            fs_1.default.mkdirSync(traderDbPath, { recursive: true });
        // Create dynamic assort file
        const dynamicAssortFilePath = path_1.default.join(traderDbPath, "dynamicAssort.json");
        if (!fs_1.default.existsSync(dynamicAssortFilePath)) {
            const defaultFile = JSON.stringify([], null, 4);
            fs_1.default.writeFileSync(dynamicAssortFilePath, defaultFile);
        }
        // -------------------------------------------
        const currentAssort = JSON.parse(fs_1.default.readFileSync(dynamicAssortFilePath).toString());
        for (const itemGroup of itemGroups) {
            const itemIdToFind = itemGroup.id.replace(/\s+/g, ""); // Strip out whitespace
            // Find item in player inventory, or show error to player if not found
            const matchingItemInInventory = pmcData.Inventory.items.find(x => x._id === itemIdToFind);
            if (!matchingItemInInventory)
                continue;
            const childItems = this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, itemIdToFind);
            if (childItems) {
                // Add all the childItems
                for (const childItem of childItems) {
                    console.log(childItem);
                    const indexOfExisting = currentAssort.findIndex(x => x["tpl"] == childItem._tpl);
                    let count = childItem.upd !== undefined && childItem.upd?.StackObjectsCount !== undefined ? childItem.upd.StackObjectsCount : 1;
                    if (indexOfExisting == -1) {
                        currentAssort.push({ tpl: childItem._tpl, count: count });
                    }
                    else {
                        currentAssort[indexOfExisting]["count"] += count;
                    }
                }
            }
        }
        fs_1.default.writeFileSync(dynamicAssortFilePath, JSON.stringify(currentAssort));
        return true;
    }
}
exports.SITCustomTraders = SITCustomTraders;
//# sourceMappingURL=SITCustomTraders.js.map