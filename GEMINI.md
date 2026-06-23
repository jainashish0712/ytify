- A strong preference for fully-typed, generic, and reusable code over quick fixes. avoid the use of `any`.
- Analyzes build errors and existing code thoroughly before making changes.
- Keen on identifying opportunities for optimization, code reduction, and file consolidation to avoid redundancy.
- Doesn't do what is not asked to do and knows what it's doing.
- strictly wants slow but accurate responses and not quick but inaccurate ones.

<!-- ## Key Learnings & Debugging Principles (from the iOS Equalizer Saga)
1. **The WebKit Opus Trap**: iOS Safari claims Opus support (`mediaCapabilities`) and plays `.webm` natively via `<audio>`, but its Web Audio API (`createMediaElementSource`) crashes silently with Opus. Always force AAC for iOS Web Audio API.
2. **CORS Red Herrings**: If audio plays but the Web Audio graph is silent, it's not always a CORS taint. Codec compatibility in the Web Audio pipeline is a separate beast.
3. **Safari's Header Hiding**: Safari hides CORS headers from `fetch` JS unless `Access-Control-Expose-Headers` is perfectly specified. The `*` wildcard is ignored on iOS.
4. **Eruda Limitations**: Mobile consoles like Eruda only see what the browser's JS engine lets them see. They cannot bypass WebKit's native header stripping.
5. **All iOS Browsers = Safari**: Brave, Chrome, and Firefox on iOS are just WebKit wrappers. A WebKit bug affects them all equally.
6. **Service Worker Local Network Limits**: Service Workers refuse to register on local network IPs over HTTP (e.g., `192.168.x.x`). Local mobile testing of SWs fails silently without HTTPS.
7. **Node Fetch Media Gotcha**: Building local Dev proxies for media requires handling HTTP `Range` headers and streaming responses. Using `.arrayBuffer()` will cause 500 crashes when browsers drop the connection mid-stream.
8. **The "Tainted Canvas" Fallback**: CORS-tainted `<audio>` tags will still play sound out of the speakers; they just output math zeroes to the Web Audio API.
9. **The Video Tag Loophole**: Changing `<audio>` to a hidden `<video playsinline>` can sometimes bypass Apple's audio-specific CORS bugs, as Apple historically fixes video pipelines first.
10. **Test Core Tech First, Network Later**: Always verify the exact codec and native browser limitations before rewriting proxy routing and networking layers. -->