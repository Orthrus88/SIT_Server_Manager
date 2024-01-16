"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var StayInTarkovMod_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StayInTarkovMod = void 0;
const tsyringe = require("C:/snapshot/project/node_modules/tsyringe");
const CoopConfig_1 = require("./CoopConfig");
const CoopMatch_1 = require("./CoopMatch");
const WebSocketHandler_1 = require("./WebSocketHandler");
const Router_1 = require("C:/snapshot/project/obj/di/Router");
const ConfigTypes_1 = require("C:/snapshot/project/obj/models/enums/ConfigTypes");
const SITConfig_1 = require("./SITConfig");
const AzureWAH = require("./AzureWebAppHelper");
// -------------------------------------------------------------------------
// Custom Traders (needs to be refactored into SITCustomTraders.ts)
const CoopMatchResponse_1 = require("./CoopMatchResponse");
const SITCustomTraders_1 = require("./Traders/SITCustomTraders");
// -------------------------------------------------------------------------
// Overrides ---------------------------------------------------------------
const BundleLoaderOverride_1 = require("./Overrides/BundleLoaderOverride");
const LauncherControllerOverride_1 = require("./Overrides/LauncherControllerOverride");
const GameControllerOverride_1 = require("./Overrides/GameControllerOverride");
// -------------------------------------------------------------------------
let StayInTarkovMod = class StayInTarkovMod {
    static { StayInTarkovMod_1 = this; }
    static Instance;
    static container;
    saveServer;
    httpResponse;
    databaseServer;
    webSocketHandler;
    externalIPFinder;
    coopConfig;
    sitConfig;
    configServer;
    httpConfig;
    bundleCallbacks;
    locationController;
    inraidCallbacks;
    traders = [];
    getCoopMatch(serverId) {
        if (serverId === undefined) {
            console.error("getCoopMatch -- no serverId provided");
            return undefined;
        }
        if (CoopMatch_1.CoopMatch.CoopMatches[serverId] === undefined) {
            console.error(`getCoopMatch -- no server of ${serverId} exists`);
            return undefined;
        }
        return CoopMatch_1.CoopMatch.CoopMatches[serverId];
    }
    InitializeVariables(container) {
        // ----------------------------------------------------------------
        // Initialize & resolve variables
        StayInTarkovMod_1.container = container;
        StayInTarkovMod_1.Instance = this;
        const logger = container.resolve("WinstonLogger");
        this.saveServer = container.resolve("SaveServer");
        this.configServer = container.resolve("ConfigServer");
        this.locationController = container.resolve("LocationController");
        this.bundleCallbacks = container.resolve("BundleCallbacks");
        this.inraidCallbacks = container.resolve("InraidCallbacks");
        this.httpResponse = container.resolve("HttpResponseUtil");
        CoopMatch_1.CoopMatch.saveServer = this.saveServer;
        CoopMatch_1.CoopMatch.locationController = this.locationController;
        CoopMatch_1.CoopMatch.routeHandler(container);
        // get http.json config
        this.httpConfig = this.configServer.getConfig(ConfigTypes_1.ConfigTypes.HTTP);
        this.coopConfig = new CoopConfig_1.CoopConfig();
        this.sitConfig = new SITConfig_1.SITConfig();
        this.sitConfig.routeHandler(container);
        this.webSocketHandler = new WebSocketHandler_1.WebSocketHandler(this.coopConfig.webSocketPort, logger);
        // this.traders.push(new SITCustomTraders(), new CoopGroupTrader(), new UsecTrader(), new BearTrader());
        this.traders.push(new SITCustomTraders_1.SITCustomTraders());
    }
    preAkiLoad(container) {
        const logger = container.resolve("WinstonLogger");
        const dynamicRouterModService = container.resolve("DynamicRouterModService");
        const staticRouterModService = container.resolve("StaticRouterModService");
        this.InitializeVariables(container);
        // Initialize Custom Traders
        for (const t of this.traders) {
            t.preAkiLoad(container);
        }
        // ----------------------- Bundle Loader overrides ------------------------------------------------
        const bundleLoaderOverride = new BundleLoaderOverride_1.BundleLoaderOverride(container);
        bundleLoaderOverride.override();
        // ----------------------- Game Controller overrides -------------------------------------------------
        const gameControllerOverride = new GameControllerOverride_1.GameControllerOverride(container);
        gameControllerOverride.override();
        // ----------------------- Launcher Controller overrides -------------------------------------------------
        const launcherControllerOverride = new LauncherControllerOverride_1.LauncherControllerOverride(container, gameControllerOverride, this.coopConfig, this.httpConfig);
        launcherControllerOverride.override();
        // ----------------------- TODO: Azure WebApp Helper (trying to fix this ASAP) ------------------------------------------------
        new AzureWAH.AzureWebAppHelper(this.configServer);
        // Connect to this module
        staticRouterModService.registerStaticRouter("ConnectionRouter", [
            {
                url: "/coop/connect",
                action: (url, info, sessionID, output) => {
                    output = JSON.stringify({});
                    return output;
                }
            },
        ], "aki");
        dynamicRouterModService.registerDynamicRouter("sit-coop-loot", [
            // Re-implementation of /client/location/getLocalloot for SIT Coop.
            // Single player uses the default route.
            new Router_1.RouteAction("/coop/location/getLoot", (url, info, sessionID, output) => {
                const coopMatch = this.getCoopMatch(info.serverId);
                if (coopMatch === undefined) {
                    console.error(`Cannot retrieve LocationData for unknown ServerId: ${info.serverId}!`);
                    return this.httpResponse.nullResponse();
                }
                if (coopMatch.LocationData === undefined) {
                    console.error(`No LocationData found in server ${coopMatch.ServerId}!`);
                    return this.httpResponse.nullResponse();
                }
                this.inraidCallbacks.registerPlayer(url, info, sessionID);
                return this.httpResponse.getBody(coopMatch.LocationData);
            }),
            new Router_1.RouteAction("/coop/server/spawnPoint", 
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (url, info, sessionID, output) => {
                const splitUrl = url.split("/");
                const matchId = splitUrl.pop();
                var spawnPoint = { x: 0, y: 0, z: 0 };
                if (matchId !== undefined) {
                    // console.log("matchId:" + matchId);
                    const coopMatch = this.getCoopMatch(matchId);
                    if (coopMatch !== undefined)
                        spawnPoint = coopMatch.SpawnPoint;
                }
                output = JSON.stringify(spawnPoint);
                return output;
            }),
            new Router_1.RouteAction("/coop/server/friendlyAI", 
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (url, info, sessionID, output) => {
                const splitUrl = url.split("/");
                const matchId = splitUrl.pop();
                var friendlyAI;
                if (matchId !== undefined) {
                    // console.log("matchId:" + matchId);
                    const coopMatch = this.getCoopMatch(matchId);
                    if (coopMatch !== undefined)
                        friendlyAI = coopMatch.friendlyAI;
                }
                output = JSON.stringify(friendlyAI);
                return output;
            }),
            /* Fix for downloading bundle files with extension not ending with .bundle */
            new Router_1.RouteAction("/files/bundle", 
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            (url, info, sessionID, output) => {
                return this.bundleCallbacks.getBundle(url, info, sessionID);
            })
        ], "aki");
        staticRouterModService.registerStaticRouter("MyStaticModRouter", [
            {
                url: "/coop/server/getAllForLocation",
                action: (url, info, sessionId, output) => {
                    // console.log(info);
                    const matches = [];
                    const profiles = this.saveServer.getProfiles();
                    for (let itemKey in CoopMatch_1.CoopMatch.CoopMatches) {
                        // Get Instance of CoopMatch
                        const m = CoopMatch_1.CoopMatch.CoopMatches[itemKey];
                        // Filter out Raids that have Not Started or Empty
                        if (m.ConnectedPlayers.length === 0)
                            continue;
                        // Filter out Raids that are on a different time
                        if (m.Time != info.timeVariant)
                            continue;
                        // Filter out Raids that are in a different location
                        if (m.Location != info.location)
                            continue;
                        // Create the custom CoopMatchResponse with the exact Json values needed by the Client
                        const matchResponse = new CoopMatchResponse_1.CoopMatchResponse();
                        // Account Id / Server Id
                        matchResponse.HostProfileId = itemKey;
                        let hostName = "";
                        // Player's name for the Host Name
                        for (let profileKey in profiles) {
                            if (profiles[profileKey].characters.pmc._id === itemKey) {
                                hostName = profiles[profileKey].characters.pmc.Info.Nickname;
                                break;
                            }
                        }
                        matchResponse.HostName = hostName;
                        // Raid Settings
                        matchResponse.Settings = m.Settings;
                        // Number of Players Connected
                        matchResponse.PlayerCount = m.ConnectedUsers.length;
                        // Numebr of Players Expected
                        matchResponse.ExpectedPlayerCount = m.ExpectedNumberOfPlayers;
                        // Location Instance
                        matchResponse.Location = m.Location;
                        // Passworded
                        matchResponse.IsPasswordLocked = m.Password !== undefined && m.Password !== "";
                        // Game Version
                        matchResponse.GameVersion = m.GameVersion;
                        // SIT Version
                        matchResponse.SITVersion = m.SITVersion;
                        // Server Id
                        matchResponse.ServerId = itemKey;
                        matches.push(matchResponse);
                    }
                    output = JSON.stringify(matches);
                    return output;
                }
            },
            {
                url: "/coop/server/create",
                action: (url, info, sessionId, output) => {
                    logger.info(`Start a Coop Server ${info.serverId}`);
                    // logger.info("Coop Data:_________");
                    logger.info(info);
                    // logger.info("___________________");
                    let currentCoopMatch = CoopMatch_1.CoopMatch.CoopMatches[info.serverId];
                    if (currentCoopMatch !== undefined && currentCoopMatch !== null) {
                        currentCoopMatch.endSession(CoopMatch_1.CoopMatchEndSessionMessages.HOST_SHUTDOWN_MESSAGE);
                        delete CoopMatch_1.CoopMatch.CoopMatches[info.serverId];
                        currentCoopMatch = undefined;
                    }
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId] = new CoopMatch_1.CoopMatch(info);
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].Timestamp = info.timestamp;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].Location = info.settings.location;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].Time = info.settings.timeVariant;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].WeatherSettings = info.settings.timeAndWeatherSettings;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].ExpectedNumberOfPlayers = info.expectedNumberOfPlayers;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].GameVersion = info.gameVersion;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].SITVersion = info.sitVersion;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].Password = info.password !== undefined ? info.password : undefined;
                    CoopMatch_1.CoopMatch.CoopMatches[info.serverId].AuthorizedUsers.push(info.serverId);
                    output = JSON.stringify({ serverId: info.serverId });
                    return output;
                }
            },
            {
                url: "/coop/server/exist",
                action: (url, info, sessionId, output) => {
                    let coopMatch = null;
                    for (let cm in CoopMatch_1.CoopMatch.CoopMatches) {
                        // logger.info(JSON.stringify(this.CoopMatches[cm]));
                        if (CoopMatch_1.CoopMatch.CoopMatches[cm].Location != info.location)
                            continue;
                        if (CoopMatch_1.CoopMatch.CoopMatches[cm].Time != info.timeVariant)
                            continue;
                        if (CoopMatch_1.CoopMatch.CoopMatches[cm].Status == CoopMatch_1.CoopMatchStatus.Complete)
                            continue;
                        // Player starting the server has 5 minutes to load into a raid
                        if (CoopMatch_1.CoopMatch.CoopMatches[cm].LastUpdateDateTime < new Date(Date.now() - ((1000 * 60) * 5)))
                            continue;
                        if (CoopMatch_1.CoopMatch.CoopMatches[cm].Password !== "") {
                            if (info.password == "") {
                                output = JSON.stringify({
                                    passwordRequired: true
                                });
                                return output;
                            }
                            if (CoopMatch_1.CoopMatch.CoopMatches[cm].Password !== info.password) {
                                output = JSON.stringify({
                                    invalidPassword: true
                                });
                                return output;
                            }
                        }
                        coopMatch = CoopMatch_1.CoopMatch.CoopMatches[cm];
                    }
                    logger.info(coopMatch !== null ? "match exists" : "match doesn't exist!");
                    output = JSON.stringify(coopMatch !== null ?
                        {
                            ServerId: coopMatch.ServerId,
                            timestamp: coopMatch.Timestamp,
                            expectedNumberOfPlayers: coopMatch.ExpectedNumberOfPlayers,
                            sitVersion: coopMatch.SITVersion,
                            gameVersion: coopMatch.GameVersion
                        } : null);
                    return output;
                }
            },
            {
                url: "/coop/server/join",
                action: (url, info, sessionId, output) => {
                    let coopMatch = CoopMatch_1.CoopMatch.CoopMatches[info.serverId];
                    logger.info(coopMatch !== null ? "match exists" : "match doesn't exist!");
                    if (coopMatch === null || coopMatch === undefined) {
                        output = JSON.stringify(null);
                        return output;
                    }
                    if (coopMatch.Password !== "") {
                        if (info.password == "") {
                            output = JSON.stringify({
                                passwordRequired: true
                            });
                            return output;
                        }
                        if (coopMatch.Password !== info.password) {
                            output = JSON.stringify({
                                invalidPassword: true
                            });
                            return output;
                        }
                    }
                    if (coopMatch.ConnectedUsers.findIndex(x => x == info.profileId) !== -1) {
                        if (WebSocketHandler_1.WebSocketHandler.Instance.webSockets[info.profileId] !== undefined) {
                            if (WebSocketHandler_1.WebSocketHandler.Instance.webSockets[info.profileId].readyState == WebSocket.OPEN) {
                                logger.info(`JoinMatch failed: ${info.profileId} is already connected!`);
                                output = JSON.stringify({
                                    alreadyConnected: true
                                });
                                return output;
                            }
                        }
                    }
                    if (coopMatch.AuthorizedUsers.findIndex(x => x == info.profileId) === -1) {
                        coopMatch.AuthorizedUsers.push(info.profileId);
                        logger.info(`Added authorized user: ${info.profileId} in server: ${coopMatch.ServerId}`);
                    }
                    output = JSON.stringify(coopMatch !== null ?
                        {
                            serverId: coopMatch.ServerId,
                            timestamp: coopMatch.Timestamp,
                            expectedNumberOfPlayers: coopMatch.ExpectedNumberOfPlayers,
                            sitVersion: coopMatch.SITVersion,
                            gameVersion: coopMatch.GameVersion
                        } : null);
                    return output;
                }
            },
            {
                url: "/coop/server/read/players",
                action: (url, info, sessionId, output) => {
                    // ---------------------------------------------------------------------------------------------------
                    // This call requires the client to pass what players/bots it knows about to filter the response back!
                    let coopMatch = this.getCoopMatch(info.serverId);
                    if (coopMatch == null || coopMatch == undefined) {
                        output = JSON.stringify([{ notFound: true }]);
                        return output;
                    }
                    //
                    let charactersToSend = [];
                    let playersToFilterOut = info.pL;
                    for (var c of coopMatch.Characters) {
                        if (!playersToFilterOut.includes(c.profileId)) {
                            charactersToSend.push(c);
                        }
                    }
                    output = JSON.stringify(charactersToSend);
                    // console.log(output);
                    return output;
                }
            },
            {
                url: "/coop/server/update",
                action: (url, info, sessionId, output) => {
                    if (info === undefined || info.serverId === undefined) {
                        if (JSON.stringify(info).charAt(0) === '[') {
                            for (var item of info) {
                                let coopMatch = this.getCoopMatch(item.serverId);
                                if (coopMatch === undefined)
                                    break;
                                coopMatch.ProcessData(item, logger);
                            }
                            output = JSON.stringify({});
                            return output;
                        }
                        console.error("/coop/server/update -- no info or serverId provided");
                        output = JSON.stringify({ response: "ERROR" });
                        return JSON.stringify({ response: "ERROR" });
                    }
                    // let timeCheck = Date.now();
                    // console.log(info);
                    let coopMatch = this.getCoopMatch(info.serverId);
                    if (coopMatch == null || coopMatch == undefined) {
                        console.error("/coop/server/update -- no coopMatch found to update");
                        output = JSON.stringify({});
                        return output;
                    }
                    coopMatch.ProcessData(info, logger);
                    // 
                    // console.log(Date.now() - timeCheck);
                    output = JSON.stringify({});
                    return output;
                }
            },
            {
                url: "/coop/server/delete",
                action: (url, info, sessionId, output) => {
                    // logger.info("Update a Coop Server");
                    console.log(info);
                    output = JSON.stringify({ response: "OK" });
                    return JSON.stringify({ response: "OK" });
                }
            },
            {
                url: "/coop/get-invites",
                action: (url, info, sessionID, output) => {
                    logger.info("Getting Coop Server Invites");
                    const obj = {
                        "players": [{}, {}],
                        "invite": [],
                        "group": []
                    };
                    output = JSON.stringify(obj);
                    return output;
                }
            },
            {
                url: "/coop/server-status",
                action: (url, info, sessionId, output) => {
                    logger.info("Getting Coop Server Match Status");
                    return "";
                }
            },
        ], "sit-coop"
        // "aki"
        );
        // Hook up to existing AKI static route
        staticRouterModService.registerStaticRouter("MatchStaticRouter-SIT", [
            {
                url: "/client/match/group/status",
                action: (url, info, sessionID, output) => {
                    logger.info("/client/match/group/status");
                    logger.info("Getting Coop Server Match Status");
                    const obj = {
                        "players": [],
                        "invite": [],
                        "group": []
                    };
                    output = JSON.stringify(obj);
                    return output;
                }
            },
            // {
            //     url: "/client/match/group/current",
            //     action: (url: string, info: any, sessionID: string, output: string): any => 
            //     {
            //         logger.info("/client/match/group/current")
            //         logger.info("TODO: Look into Getting Group Current")
            //         const myAccount = this.saveServer.getProfile(sessionID);
            //         if(myAccount === undefined) { 
            //             console.log("own account cannot be found");
            //             return null;
            //         }
            //         let squadList: Friend[] = [];
            //         // console.log(allAccounts);
            //         // {
            //         //     let squadMember: Friend = {
            //         //         _id: myAccount.info.id,
            //         //         Info: {
            //         //             Level: myAccount.characters.pmc.Info.Level,
            //         //             Nickname: myAccount.info.username,
            //         //             Side: myAccount.characters.pmc.Info.Side,
            //         //             MemberCategory: MemberCategory.DEFAULT
            //         //         }
            //         //     };
            //         //     squadList.push(squadMember);
            //         // }
            //         const obj = {
            //             squad: squadList,
            //             raidSettings: {}
            //         };
            //         output = JSON.stringify({ data: obj, err: 0, errmsg: null });
            //         return output;
            //     }
            // },
            {
                url: "/client/match/group/exit_from_menu",
                action: (url, info, sessionID, output) => {
                    logger.info("exit_from_menu");
                    output = JSON.stringify({});
                    return output;
                }
            },
            {
                url: "/client/match/group/exit_from_menu",
                action: (url, info, sessionID, output) => {
                    logger.info("exit_from_menu");
                    output = JSON.stringify({});
                    return output;
                }
            },
            {
                url: "/client/raid/person/killed",
                action: (url, info, sessionID, output) => {
                    logger.info("Person has been Killed!");
                    console.log(info);
                    output = JSON.stringify(info);
                    return output;
                }
            },
            {
                url: "/client/raid/createFriendlyAI",
                action: (url, info, sessionID, output) => {
                    // logger.info("Person has been Killed!")
                    console.log(info);
                    output = JSON.stringify(info);
                    return output;
                }
            },
            {
                url: "/client/match/raid/ready",
                action: (url, info, sessionID, output) => {
                    console.log(url);
                    console.log(info);
                    console.log(sessionID);
                    output = JSON.stringify({});
                    return output;
                }
            },
            {
                url: "/client/match/raid/not-ready",
                action: (url, info, sessionID, output) => {
                    console.log(url);
                    console.log(info);
                    console.log(sessionID);
                    output = JSON.stringify({});
                    return output;
                }
            },
            {
                url: "/client/match/group/invite/cancel-all",
                action: (url, info, sessionID, output) => {
                    console.log(url);
                    console.log(info);
                    console.log(sessionID);
                    output = JSON.stringify({});
                    return output;
                }
            },
            {
                url: "/client/match/available",
                action: (url, info, sessionID, output) => {
                    console.log(url);
                    console.log(info);
                    console.log(sessionID);
                    output = JSON.stringify(false);
                    return output;
                }
            }
        ], "aki");
        /**
         * WIP/UNUSED FEATURE: GET FRIENDS LIST
         */
        // container.afterResolution("DialogueController", (_t, result: DialogueController) => 
        // {
        //     // We want to replace the original method logic with something different
        //     result.getFriendList = (sessionID: string) => 
        //     {
        //         return this.getFriendsList(sessionID);
        //     }
        //     // The modifier Always makes sure this replacement method is ALWAYS replaced
        // }, {frequency: "Always"});
        /**
         * MUST HAVE: REPLACE GAME CONFIG SO IP CAN BE EXTERNAL
         */
    }
    // public getFriendsList(sessionID: string): IGetFriendListDataResponse
    // {
    //     console.log("getFriendsList");
    //     const friends = this.getFriendsForUser(sessionID);
    //     return {
    //         "Friends": friends,
    //         "Ignore": [],
    //         "InIgnoreList": []
    //     };
    // }
    // public getFriendsForUser(sessionID: string): Friend[]
    // {
    //     const allAccounts = this.saveServer.getProfiles();
    // 	const myAccount = this.saveServer.getProfile(sessionID);
    // 	if(myAccount === undefined) { 
    // 		console.log("own account cannot be found");
    // 		return null;
    // 	}
    //     let friendList: Friend[] = [];
    //     // console.log(allAccounts);
    //     for (const id in allAccounts)
    //     {
    //         if(id == sessionID)
    //             continue;
    //         let accountProfile = this.saveServer.getProfile(id);
    //         let friend: Friend = {
    //             _id: accountProfile.info.id,
    //             Info: {
    //                 Level: accountProfile.characters.pmc.Info.Level,
    //                 Nickname: accountProfile.info.username,
    //                 Side: accountProfile.characters.pmc.Info.Side,
    //                 MemberCategory: MemberCategory.MemberCategory.DEFAULT
    //             }
    //         };
    //         friendList.push(friend);
    //     }
    //     return friendList;
    // }
    postDBLoad(container) {
        StayInTarkovMod_1.container = container;
        const dbTables = StayInTarkovMod_1.container.resolve("DatabaseServer").getTables();
        dbTables.locales.global["en"]["Attention! This is a Beta version of Escape from Tarkov for testing purposes."]
            = "Welcome to Stay in Tarkov. The OFFLINE Coop mod for SPT-Aki.";
        dbTables.locales.global["en"]["NDA free warning"]
            = "To Host/Join a game. You must select a map and go to the last screen to use the Server Browser. Have fun!";
        const locations = dbTables.locations;
        // Open All Exfils. This is a SIT >mod< feature. Has nothing to do with the Coop module. Can be turned off in config/SITConfig.json
        if (this.sitConfig.openAllExfils === true) {
            console.log("Opening all Exfils");
            this.updateExtracts(locations);
        }
        // Initialize Custom Traders
        for (const t of this.traders) {
            t.postDBLoad(container);
        }
    }
    updateExtracts(locations) {
        // Initialize an array of all of the location names
        const locationNames = [
            "bigmap",
            "factory4_day",
            "factory4_night",
            "interchange",
            "laboratory",
            "lighthouse",
            "rezervbase",
            "shoreline",
            "tarkovstreets",
            "woods"
        ];
        // Loop through each location
        for (const location of locationNames) {
            // Loop through each extract
            for (const extract in locations[location].base.exits) {
                const extractName = locations[location].base.exits[extract].Name;
                // Make extracts available no matter what side of the map you spawned.
                const newEntryPoint = this.getEntryPoints(locations[location].base.Id);
                if (locations[location].base.exits[extract].EntryPoints !== newEntryPoint) {
                    locations[location].base.exits[extract].EntryPoints = newEntryPoint;
                }
                // If this is a train extract... Move on to the next extract.
                if (locations[location].base.exits[extract].PassageRequirement === "Train") {
                    continue;
                }
                if (locations[location].base.exits[extract].PassageRequirement === "ScavCooperation") {
                    locations[location].base.exits[extract].PassageRequirement = "TransferItem";
                    locations[location].base.exits[extract].RequirementTip = "EXFIL_Item";
                }
                locations[location].base.exits[extract].ExfiltrationType = "Individual";
                locations[location].base.exits[extract].PlayersCount = 0;
            }
        }
    }
    getEntryPoints(location) {
        switch (location) {
            case "bigmap":
                return "Customs,Boiler Tanks";
            case "factory4_day":
                return "Factory";
            case "factory4_night":
                return "Factory";
            case "Interchange":
                return "MallSE,MallNW";
            case "laboratory":
                return "Common";
            case "Lighthouse":
                return "Tunnel,North";
            case "RezervBase":
                return "Common";
            case "Shoreline":
                return "Village,Riverside";
            case "TarkovStreets":
                return "E1_2,E6_1,E2_3,E3_4,E4_5,E5_6,E6_1";
            case "Woods":
                return "House,Old Station";
            default:
                return "";
        }
    }
};
exports.StayInTarkovMod = StayInTarkovMod;
exports.StayInTarkovMod = StayInTarkovMod = StayInTarkovMod_1 = __decorate([
    tsyringe.injectable()
], StayInTarkovMod);
module.exports = { mod: new StayInTarkovMod() };
//# sourceMappingURL=StayInTarkovMod.js.map