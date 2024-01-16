"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoopGroupTrader = void 0;
const ConfigTypes_1 = require("C:/snapshot/project/obj/models/enums/ConfigTypes");
const Money_1 = require("C:/snapshot/project/obj/models/enums/Money");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const baseJson = __importStar(require("../../Traders/db/CoopGroupTraderBase.json"));
const FluentTraderAssortCreator_1 = require("./FluentTraderAssortCreator");
const traderHelpers_1 = require("./traderHelpers");
class CoopGroupTrader {
    mod;
    logger;
    traderHelper;
    fluentTraderAssortHelper;
    traderId = "coopTrader";
    itemHelper;
    constructor() {
        this.mod = "SITCoop"; // Set name of mod so we can log it to console later
    }
    /**
     * Some work needs to be done prior to SPT code being loaded, registering the profile image + setting trader update time inside the trader config json
     * @param container Dependency container
     */
    preAkiLoad(container) {
        // Get a logger
        this.logger = container.resolve("WinstonLogger");
        // Get SPT code/data we need later
        const preAkiModLoader = container.resolve("PreAkiModLoader");
        const imageRouter = container.resolve("ImageRouter");
        const configServer = container.resolve("ConfigServer");
        const traderConfig = configServer.getConfig(ConfigTypes_1.ConfigTypes.TRADER);
        const hashUtil = container.resolve("HashUtil");
        this.itemHelper = container.resolve("ItemHelper");
        // Create helper class and use it to register our traders image/icon + set its stock refresh time
        this.traderHelper = new traderHelpers_1.TraderHelper();
        this.fluentTraderAssortHelper = new FluentTraderAssortCreator_1.FluentAssortConstructor(hashUtil, this.logger);
        this.traderHelper.registerProfileImage(baseJson, this.mod, preAkiModLoader, imageRouter, "coop.jpg");
        this.traderHelper.setTraderUpdateTime(traderConfig, baseJson, 3600);
    }
    /**
     * Majority of trader-related work occurs after the aki database has been loaded but prior to SPT code being run
     * @param container Dependency container
     */
    postDBLoad(container) {
        // Resolve SPT classes we'll use
        const databaseServer = container.resolve("DatabaseServer");
        const configServer = container.resolve("ConfigServer");
        const jsonUtil = container.resolve("JsonUtil");
        // Get a reference to the database tables
        const tables = databaseServer.getTables();
        // Add new trader to the trader dictionary in DatabaseServer - has no assorts (items) yet
        this.traderHelper.addTraderToDb(baseJson, tables, jsonUtil);
        // const MILK_ID = "575146b724597720a27126d5"; // Can find item ids in `database\templates\items.json` or with https://db.sp-tarkov.com/search
        // this.fluentTraderAssortHelper.createSingleAssortItem(MILK_ID)
        //                             .addStackCount(200)
        //                             .addBuyRestriction(10)
        //                             .addMoneyCost(Money.ROUBLES, 2000)
        //                             .addLoyaltyLevel(1)
        //                             .export(tables.traders[baseJson._id]);
        this.createAssort(databaseServer.getTables());
        // this.fluentTraderAssortHelper.createComplexAssortItem()
        // Add more complex items to trader (items with sub-items, e.g. guns)
        // this.traderHelper.addComplexItemsToTrader(tables, baseJson._id, jsonUtil);
        // Add trader to locale file, ensures trader text shows properly on screen
        // WARNING: adds the same text to ALL locales (e.g. chinese/french/english)
        this.traderHelper.addTraderToLocales(baseJson, tables, baseJson.name, "Coop Trader", baseJson.nickname, baseJson.location, "");
    }
    createAssort(databaseServerTables) {
        // -------------------------------------------
        // Get Dynamic Assort Path
        // const traderDbPath = path.join( __dirname, this.traderId);
        const traderDbPath = path_1.default.join(process.cwd(), "user", "cache", "SITCoop", this.traderId);
        if (!fs_1.default.existsSync(traderDbPath))
            fs_1.default.mkdirSync(traderDbPath, { recursive: true });
        // Create dynamic assort file
        const dynamicAssortFilePath = path_1.default.join(traderDbPath, "dynamicAssort.json");
        if (!fs_1.default.existsSync(dynamicAssortFilePath)) {
            const defaultFile = JSON.stringify([], null, 4);
            fs_1.default.writeFileSync(dynamicAssortFilePath, defaultFile);
        }
        // -------------------------------------------
        // --------------------------------------------------------
        // Empty out the tables!
        databaseServerTables.traders[baseJson._id].assort.barter_scheme = {};
        databaseServerTables.traders[baseJson._id].assort.items = [];
        databaseServerTables.traders[baseJson._id].assort.loyal_level_items = {};
        const currentAssort = JSON.parse(fs_1.default.readFileSync(dynamicAssortFilePath).toString());
        for (const item of currentAssort) {
            this.fluentTraderAssortHelper.createSingleAssortItem(item["tpl"])
                .addStackCount(item["count"])
                .addMoneyCost(Money_1.Money.ROUBLES, this.itemHelper.getItemPrice(item["tpl"]))
                .addLoyaltyLevel(1)
                .export(databaseServerTables.traders[baseJson._id]);
        }
    }
}
exports.CoopGroupTrader = CoopGroupTrader;
//# sourceMappingURL=CoopGroupTrader.js.map