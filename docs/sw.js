/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-6d4f622d'], (function (workbox) { 'use strict';

  self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "index.html",
    "revision": "8be7ab1dc0adab208ffe6bd2b4abb94e"
  }, {
    "url": "icons/icon-512.png",
    "revision": "42bca23c61649efd9975a514ceaced30"
  }, {
    "url": "icons/icon-192.png",
    "revision": "6f7ac57ed8945266ad413751bde76727"
  }, {
    "url": "data/workbook-audit.json",
    "revision": "48403f70cf152bd1763652ce5ba1a649"
  }, {
    "url": "data/campaign.json",
    "revision": "6778acbc77bf694441df3923bbe576b4"
  }, {
    "url": "data/Base_CeNtro Partner.xlsx",
    "revision": "f4120b1246c4d794cec7592466825c2f"
  }, {
    "url": "assets/workbox-window.prod.es5-BBnX5xw4.js",
    "revision": null
  }, {
    "url": "assets/index-Ch2WsMDV.css",
    "revision": null
  }, {
    "url": "assets/index-BeDFmLrh.js",
    "revision": null
  }, {
    "url": "assets/CeNtro Partner.png",
    "revision": null
  }, {
    "url": "manifest.webmanifest",
    "revision": "6d3ec395adf740b301f46c56efc8d777"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(({
    url
  }) => url.pathname.endsWith(".xlsx"), new workbox.NetworkFirst({
    "cacheName": "centro-partner-excel-v2-1",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 2,
      maxAgeSeconds: 86400
    })]
  }), 'GET');
  workbox.registerRoute(({
    url
  }) => url.pathname.endsWith("/data/campaign.json"), new workbox.StaleWhileRevalidate({
    "cacheName": "centro-partner-campaign-v1",
    plugins: []
  }), 'GET');

}));
