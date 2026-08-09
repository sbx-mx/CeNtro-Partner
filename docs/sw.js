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
    "revision": "967cdc738fe9c28b84d775aeebdce156"
  }, {
    "url": "icons/icon-512.png",
    "revision": "42bca23c61649efd9975a514ceaced30"
  }, {
    "url": "icons/icon-192.png",
    "revision": "6f7ac57ed8945266ad413751bde76727"
  }, {
    "url": "data/workbook-audit.json",
    "revision": "4a20980a537dd7a26267c80177b57779"
  }, {
    "url": "data/campaign.json",
    "revision": "898f687887d709b85835e6915a7948d4"
  }, {
    "url": "data/Base_CeNtro Partner.xlsx",
    "revision": "1d76cdecb6160cbb60fc15a1ff18ec27"
  }, {
    "url": "assets/workbox-window.prod.es5-BBnX5xw4.js",
    "revision": null
  }, {
    "url": "assets/index-D1fsbbdt.js",
    "revision": null
  }, {
    "url": "assets/index-BBxssPcd.css",
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
