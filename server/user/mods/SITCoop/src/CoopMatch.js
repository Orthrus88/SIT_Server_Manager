"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoopMatch = exports.CoopMatchEndSessionMessages = exports.CoopMatchStatus = void 0;
const CoopConfig_1 = require("./CoopConfig");
const FriendlyAI_1 = require("./FriendlyAI");
const WebSocketHandler_1 = require("./WebSocketHandler");
var CoopMatchStatus;
(function (CoopMatchStatus) {
    CoopMatchStatus[CoopMatchStatus["Loading"] = 0] = "Loading";
    CoopMatchStatus[CoopMatchStatus["InGame"] = 1] = "InGame";
    CoopMatchStatus[CoopMatchStatus["Complete"] = 2] = "Complete";
})(CoopMatchStatus || (exports.CoopMatchStatus = CoopMatchStatus = {}));
class CoopMatchEndSessionMessages {
    static HOST_SHUTDOWN_MESSAGE = "host-shutdown";
    static WEBSOCKET_TIMEOUT_MESSAGE = "websocket-timeout";
    static NO_PLAYERS_MESSAGE = "no-players";
}
exports.CoopMatchEndSessionMessages = CoopMatchEndSessionMessages;
class CoopMatch {
    /** The ServerId. The ProfileId of the host player. */
    ServerId;
    /** The time the match was created. Useful for clearing out old matches. */
    CreatedDateTime = new Date();
    /** The time the match was last updated. Useful for clearing out old matches. */
    LastUpdateDateTime = new Date();
    /** The state of the match. */
    State;
    /** The IP of the match. Unused. */
    Ip;
    /** The Port of the match. Unused. */
    Port;
    /** The expected number of players. Used to hold the match before starting. Unused. */
    ExpectedNumberOfPlayers = 1;
    /** Game Version: To stop users mixing up SIT Versions. Causing significant sync issues. */
    GameVersion;
    /** SIT Version: To stop users mixing up SIT Versions. Causing significant sync issues. */
    SITVersion;
    /** Plain text password. Handled server side. */
    Password = undefined;
    Timestamp = undefined;
    /** The Connected Player Profiles. */
    ConnectedPlayers = [];
    /** The Connected User Profiles. */
    ConnectedUsers = [];
    /** Authorized Users (for password protection) */
    AuthorizedUsers = [];
    /** All characters in the game. Including AI */
    Characters = [];
    LastDataByProfileId = {};
    // @TODO: Delete
    // LastDataReceivedByAccountId: Record<string, number> = {};
    // LastData: Record<string, Record<string, any>> = {};
    // LastMoves: Record<string, any> = {};
    // LastRotates: Record<string, any> = {};
    // DamageArray: any[] = [];
    PreviousSentData = [];
    PreviousSentDataMaxSize = 128;
    Status = CoopMatchStatus.Loading;
    Settings = {};
    LocationData;
    Location;
    Time;
    WeatherSettings;
    SpawnPoint = { x: 0, y: 0, z: 0 };
    friendlyAI;
    CheckStartTimeout;
    CheckStillRunningInterval;
    /** A STATIC Dictonary of Coop Matches. The Key is the Account Id of the Player that created it */
    static CoopMatches = {};
    static AirdropLoot = undefined;
    static saveServer;
    static locationController;
    constructor(inData) {
        this.ServerId = inData.serverId;
        this.Status = CoopMatchStatus.Loading;
        this.CreatedDateTime = new Date(Date.now());
        this.LastUpdateDateTime = new Date(Date.now());
        if (inData.settings === undefined)
            return;
        this.Location = inData.settings.location;
        this.Time = inData.settings.timeVariant;
        this.WeatherSettings = inData.settings.timeAndWeatherSettings;
        this.friendlyAI = new FriendlyAI_1.friendlyAI();
        if (CoopMatch.CoopMatches[inData.serverId] !== undefined) {
            delete CoopMatch.CoopMatches[inData.serverId];
        }
        // Generate match location data (Loot)
        this.LocationData = CoopMatch.locationController.get("", {
            crc: 0,
            locationId: this.Location,
            variantId: 0 /* unused */
        });
        // This checks to see if the WebSockets can still be communicated with. If it cannot for any reason. The match/raid/session will close down.
        this.CheckStartTimeout = setTimeout(() => {
            this.CheckStillRunningInterval = setInterval(() => {
                if (!WebSocketHandler_1.WebSocketHandler.Instance.areThereAnyWebSocketsOpen(this.ConnectedPlayers)) {
                    this.endSession(CoopMatchEndSessionMessages.WEBSOCKET_TIMEOUT_MESSAGE);
                }
            }, CoopConfig_1.CoopConfig.Instance.webSocketTimeoutSeconds * 1000);
        }, CoopConfig_1.CoopConfig.Instance.webSocketTimeoutCheckStartSeconds * 1000);
    }
    ProcessData(info, logger) {
        if (info === undefined)
            return;
        if (JSON.stringify(info).charAt(0) === "[") {
            for (var indexOfInfo in info) {
                const _info = info[indexOfInfo];
                this.ProcessData(_info, logger);
            }
            return;
        }
        // console.log(info);
        if (typeof (info) === "undefined") {
            return;
        }
        else if (typeof (info) === "string") {
            if (info.indexOf("?") !== -1) {
                // console.log(`coop match wants to process this info ${info}`)
                const infoMethod = info.split('?')[0];
                const infoData = info.split('?')[1];
                const newJObj = { m: infoMethod, data: infoData };
                this.ProcessData(newJObj, logger);
            }
            return;
        }
        if (info.m === "Ping" && info.t !== undefined && info.profileId !== undefined) {
            this.Ping(info.profileId, info.t);
            return;
        }
        if (info.m === "SpawnPointForCoop") {
            this.SpawnPoint.x = info.x;
            this.SpawnPoint.y = info.y;
            this.SpawnPoint.z = info.z;
            return;
        }
        if (info.profileId !== undefined && info.m === "PlayerLeft") {
            this.PlayerLeft(info.profileId);
            if (this.ConnectedPlayers.length == 0)
                this.endSession(CoopMatchEndSessionMessages.NO_PLAYERS_MESSAGE);
            return;
        }
        // if(info.accountId !== undefined)
        //     this.PlayerJoined(info.accountId);
        if (info.profileId !== undefined)
            this.PlayerJoined(info.profileId);
        if (info.m === undefined) {
            this.LastUpdateDateTime = new Date(Date.now());
            return;
        }
        // logger.info(`Update a Coop Server [${info.serverId}][${info.m}]`);
        if (info.m !== "PlayerSpawn") {
            // this.LastData[info.m] = info;
            if (this.LastDataByProfileId[info.profileId] === undefined)
                this.LastDataByProfileId[info.profileId] = {};
            this.LastDataByProfileId[info.profileId][info.m] = info;
        }
        // if(info.m == "Move") {
        //     // console.log(info);
        //     this.LastMoves[info.accountId] = info;
        // }
        // else
        if (info.m == "PlayerSpawn") {
            // console.log(info);
            let foundExistingPlayer = false;
            for (var c of this.Characters) {
                if (info.profileId == c.profileId) {
                    foundExistingPlayer = true;
                    break;
                }
            }
            if (!foundExistingPlayer)
                this.Characters.push(info);
        }
        if (info.m == "Kill") {
            for (var c of this.Characters) {
                if (info.profileId == c.profileId) {
                    c.isDead = true;
                    break;
                }
            }
        }
        this.LastUpdateDateTime = new Date(Date.now());
        const serializedData = JSON.stringify(info);
        if (this.PreviousSentData.findIndex(x => x == serializedData) !== -1)
            return;
        if (this.PreviousSentData.length >= this.PreviousSentDataMaxSize)
            this.PreviousSentData = [];
        this.PreviousSentData.push(serializedData);
        WebSocketHandler_1.WebSocketHandler.Instance.sendToWebSockets(this.ConnectedUsers, serializedData);
    }
    UpdateStatus(inStatus) {
        this.Status = inStatus;
    }
    PlayerJoined(profileId) {
        if (profileId.startsWith("pmc") && this.ConnectedUsers.findIndex(x => x == profileId) === -1) {
            console.log(`Checking server authorization for profile: ${profileId}`);
            if (this.AuthorizedUsers.findIndex(x => x == profileId) === -1) {
                console.log(`${profileId} is not authorized in server: ${this.ServerId}`);
                WebSocketHandler_1.WebSocketHandler.Instance.closeWebSocketSession(profileId, CoopMatchEndSessionMessages.WEBSOCKET_TIMEOUT_MESSAGE);
                return;
            }
            this.ConnectedUsers.push(profileId);
            console.log(`${this.ServerId}: ${profileId} has joined`);
        }
        if (this.ConnectedPlayers.findIndex(x => x == profileId) === -1) {
            this.ConnectedPlayers.push(profileId);
            // console.log(`${this.ServerId}: ${profileId} has joined`);
        }
    }
    PlayerLeft(profileId) {
        this.ConnectedPlayers = this.ConnectedPlayers.filter(x => x != profileId);
        this.ConnectedUsers = this.ConnectedUsers.filter(x => x != profileId);
        this.AuthorizedUsers = this.AuthorizedUsers.filter(x => x != profileId);
        // If the Server Player has left, end the session
        if (this.ServerId == profileId) {
            this.endSession(CoopMatchEndSessionMessages.HOST_SHUTDOWN_MESSAGE);
        }
        console.log(`${this.ServerId}: ${profileId} has left`);
    }
    Ping(profileId, timestamp) {
        WebSocketHandler_1.WebSocketHandler.Instance.sendToWebSockets([profileId], JSON.stringify({ pong: timestamp }));
    }
    endSession(reason) {
        console.log(`COOP SESSION ${this.ServerId} HAS BEEN ENDED: ${reason}`);
        WebSocketHandler_1.WebSocketHandler.Instance.sendToWebSockets(this.ConnectedPlayers, JSON.stringify({ "endSession": true, reason: reason }));
        this.Status = CoopMatchStatus.Complete;
        //clearTimeout(this.SendLastDataInterval);
        clearTimeout(this.CheckStartTimeout);
        clearInterval(this.CheckStillRunningInterval);
        this.LocationData = null;
        delete CoopMatch.CoopMatches[this.ServerId];
    }
    static routeHandler(container) {
        // const dynamicRouterModService = container.resolve<DynamicRouterModService>("DynamicRouterModService");
        // const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");
        //  staticRouterModService.registerStaticRouter(
        //     "MyStaticModRouterSITConfig",
        //     [
        //         {
        //             url: "/coop/server/getAllForLocation",
        //             action: (url, info: any, sessionId: string, output) => {
        //                 console.log(info);
        //                 const matches : CoopMatch[] = [];
        //                 for(let itemKey in CoopMatch.CoopMatches) {
        //                     matches.push(CoopMatch.CoopMatches[itemKey]);
        //                 }
        //                 output = JSON.stringify(matches);
        //                 return output;
        //             }
        //         }
        //     ]
        //     ,"aki"
        // )
    }
}
exports.CoopMatch = CoopMatch;
//# sourceMappingURL=CoopMatch.js.map