"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleLoaderOverride = void 0;
class BundleInfo {
    modPath;
    key;
    path;
    filepath;
    dependencyKeys;
    constructor(modpath, bundle, bundlePath, bundleFilepath) {
        this.modPath = modpath;
        this.key = bundle.key;
        this.path = bundlePath;
        this.filepath = bundleFilepath;
        this.dependencyKeys = bundle.dependencyKeys || [];
    }
}
class BundleLoaderOverride {
    container;
    jsonUtil;
    vfs;
    bundles = {};
    constructor(container) {
        this.container = container;
        this.vfs = container.resolve("VFS");
        this.jsonUtil = container.resolve("JsonUtil");
    }
    getBundles(local) {
        const result = [];
        for (const bundle in this.bundles) {
            result.push(this.getBundle(bundle, local));
        }
        return result;
    }
    getBundle(key, local) {
        //decode the bundle key name from url
        key = decodeURI(key);
        const bundle = this.jsonUtil.clone(this.bundles[key]);
        if (local) {
            bundle.path = bundle.filepath;
        }
        delete bundle.filepath;
        return bundle;
    }
    addBundles(modpath) {
        const manifest = this.jsonUtil.deserialize(this.vfs.readFile(`${modpath}bundles.json`)).manifest;
        for (const bundle of manifest) {
            // return a partial url. the complete url will be build on client side.
            const bundlePath = `/files/bundle/${bundle.key}`;
            const bundleFilepath = bundle.path || `${modpath}bundles/${bundle.key}`.replace(/\\/g, "/");
            this.addBundle(bundle.key, new BundleInfo(modpath, bundle, bundlePath, bundleFilepath));
        }
    }
    addBundle(key, b) {
        this.bundles[key] = b;
    }
    override() {
        const thisObj = this;
        this.container.afterResolution("BundleLoader", (_t, result) => {
            result.addBundle = (key, b) => {
                return thisObj.addBundle(key, b);
            };
            result.addBundles = (modpath) => {
                return thisObj.addBundles(modpath);
            };
            result.getBundle = (key, local) => {
                return thisObj.getBundle(key, local);
            };
            result.getBundles = (local) => {
                return thisObj.getBundles(local);
            };
        });
    }
}
exports.BundleLoaderOverride = BundleLoaderOverride;
//# sourceMappingURL=BundleLoaderOverride.js.map