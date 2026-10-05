module.exports = [
"[externals]/buffer [external] (buffer, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("buffer", () => require("buffer"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/events [external] (events, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("events", () => require("events"));

module.exports = mod;
}),
"[externals]/http [external] (http, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("http", () => require("http"));

module.exports = mod;
}),
"[externals]/https [external] (https, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("https", () => require("https"));

module.exports = mod;
}),
"[externals]/net [external] (net, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("net", () => require("net"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/tls [external] (tls, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("tls", () => require("tls"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[externals]/zlib [external] (zlib, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("zlib", () => require("zlib"));

module.exports = mod;
}),
"[project]/app/layout.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RootLayout,
    "metadata",
    ()=>metadata
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$theme$2d$toggle$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/workspace/theme-toggle.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$demo$2d$store$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/workspace/demo-store.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/auth.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$james$2f$JamesAssistant$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/james/JamesAssistant.tsx [app-rsc] (ecmascript)");
;
;
;
;
;
const metadata = {
    title: "MARCON | Portal e gestão de materiais",
    description: "Acesso ao portal Marcon e à gestão de materiais Smartway."
};
;
;
async function RootLayout({ children }) {
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["currentUser"])();
    const showJames = !!user;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("html", {
        lang: "pt-BR",
        suppressHydrationWarning: true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("head", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("script", {
                    id: "marcon-theme",
                    dangerouslySetInnerHTML: {
                        __html: `try{document.documentElement.dataset.theme=localStorage.getItem("marcon-workspace-theme")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}`
                    }
                }, void 0, false, {
                    fileName: "[project]/app/layout.tsx",
                    lineNumber: 25,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/layout.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("body", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$theme$2d$toggle$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ThemeSync"], {}, void 0, false, {
                        fileName: "[project]/app/layout.tsx",
                        lineNumber: 28,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$demo$2d$store$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DemoProvider"], {
                        persistent: true,
                        accountId: user?.id,
                        children: [
                            children,
                            showJames && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$james$2f$JamesAssistant$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                userId: user.id
                            }, `${user.id}:${user.role}:${user.block ?? ""}`, false, {
                                fileName: "[project]/app/layout.tsx",
                                lineNumber: 36,
                                columnNumber: 13
                            }, this)
                        ]
                    }, user?.id ?? "anonymous", true, {
                        fileName: "[project]/app/layout.tsx",
                        lineNumber: 29,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/layout.tsx",
                lineNumber: 27,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/layout.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", (function(__turbopack_context__){

__turbopack_context__.n(__turbopack_context__.i("[project]/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/components/james/JamesAssistant.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/components/james/JamesAssistant.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/james/JamesAssistant.tsx", "default");
}),
"[project]/components/james/JamesAssistant.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/components/james/JamesAssistant.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/james/JamesAssistant.tsx <module evaluation>", "default");
}),
"[project]/components/james/JamesAssistant.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$james$2f$JamesAssistant$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/components/james/JamesAssistant.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$james$2f$JamesAssistant$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/components/james/JamesAssistant.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$james$2f$JamesAssistant$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/components/workspace/demo-store.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DemoProvider",
    ()=>DemoProvider,
    "useDemoStore",
    ()=>useDemoStore
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const DemoProvider = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call DemoProvider() from the server but DemoProvider is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/demo-store.tsx", "DemoProvider");
const useDemoStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call useDemoStore() from the server but useDemoStore is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/demo-store.tsx", "useDemoStore");
}),
"[project]/components/workspace/demo-store.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DemoProvider",
    ()=>DemoProvider,
    "useDemoStore",
    ()=>useDemoStore
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const DemoProvider = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call DemoProvider() from the server but DemoProvider is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/demo-store.tsx <module evaluation>", "DemoProvider");
const useDemoStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call useDemoStore() from the server but useDemoStore is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/demo-store.tsx <module evaluation>", "useDemoStore");
}),
"[project]/components/workspace/demo-store.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$demo$2d$store$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/components/workspace/demo-store.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$demo$2d$store$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/components/workspace/demo-store.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$demo$2d$store$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/components/workspace/theme-toggle.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ThemeSync",
    ()=>ThemeSync,
    "ThemeToggle",
    ()=>ThemeToggle,
    "useWorkspaceTheme",
    ()=>useWorkspaceTheme
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const ThemeSync = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call ThemeSync() from the server but ThemeSync is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/theme-toggle.tsx", "ThemeSync");
const ThemeToggle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call ThemeToggle() from the server but ThemeToggle is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/theme-toggle.tsx", "ThemeToggle");
const useWorkspaceTheme = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call useWorkspaceTheme() from the server but useWorkspaceTheme is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/theme-toggle.tsx", "useWorkspaceTheme");
}),
"[project]/components/workspace/theme-toggle.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ThemeSync",
    ()=>ThemeSync,
    "ThemeToggle",
    ()=>ThemeToggle,
    "useWorkspaceTheme",
    ()=>useWorkspaceTheme
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const ThemeSync = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call ThemeSync() from the server but ThemeSync is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/theme-toggle.tsx <module evaluation>", "ThemeSync");
const ThemeToggle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call ThemeToggle() from the server but ThemeToggle is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/theme-toggle.tsx <module evaluation>", "ThemeToggle");
const useWorkspaceTheme = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call useWorkspaceTheme() from the server but useWorkspaceTheme is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/components/workspace/theme-toggle.tsx <module evaluation>", "useWorkspaceTheme");
}),
"[project]/components/workspace/theme-toggle.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$theme$2d$toggle$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/components/workspace/theme-toggle.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$theme$2d$toggle$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/components/workspace/theme-toggle.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$workspace$2f$theme$2d$toggle$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/lib/accounts.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "accountByEmployeeNo",
    ()=>accountByEmployeeNo,
    "accountByIdentity",
    ()=>accountByIdentity
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db.ts [app-rsc] (ecmascript)");
;
const labels = {
    admin: "Admin",
    lider: "Líder de bloco",
    almoxarifado: "Almoxarifado",
    funcionario: "Funcionário"
};
function accountFromRow(row) {
    return {
        id: String(row.employee_no),
        name: row.name,
        email: row.email,
        role: row.role,
        label: labels[row.role],
        block: row.block ?? undefined,
        blockId: row.block_id == null ? undefined : Number(row.block_id),
        sector: row.sector
    };
}
async function withOverrides(row) {
    const [overrides] = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getPool"])().execute("SELECT o.permission,o.allowed FROM user_permission_overrides o JOIN users u ON u.id=o.user_id WHERE u.employee_no=?", [
        row.employee_no
    ]);
    return {
        ...accountFromRow(row),
        permissionOverrides: Object.fromEntries(overrides.map((o)=>[
                String(o.permission),
                Boolean(o.allowed)
            ]))
    };
}
async function accountByIdentity(identity) {
    const [rows] = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getPool"])().execute("SELECT u.employee_no, u.name, u.email, u.role, u.sector, u.block_id, u.password_hash, u.active, b.name AS block FROM users u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.employee_no = ? OR u.email = ? LIMIT 1", [
        identity,
        identity
    ]);
    const row = rows[0];
    return row?.active ? {
        account: await withOverrides(row),
        passwordHash: row.password_hash
    } : null;
}
async function accountByEmployeeNo(id) {
    const [rows] = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getPool"])().execute("SELECT u.employee_no, u.name, u.email, u.role, u.sector, u.block_id, u.password_hash, u.active, b.name AS block FROM users u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.employee_no = ? LIMIT 1", [
        id
    ]);
    return rows[0]?.active ? withOverrides(rows[0]) : null;
}
}),
"[project]/lib/auth.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cookieName",
    ()=>cookieName,
    "createSession",
    ()=>createSession,
    "currentUser",
    ()=>currentUser
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$accounts$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/accounts.ts [app-rsc] (ecmascript)");
;
;
;
;
if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["databaseEnabled"])() && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.startsWith("troque_"))) {
    throw new Error("SESSION_SECRET forte (mínimo 32 caracteres) é obrigatória no modo Neon.");
}
const globalAuth = globalThis;
const secret = process.env.SESSION_SECRET || (globalAuth.marconSecret ??= (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["randomBytes"])(32).toString("hex"));
const cookieName = "marcon_session";
const sign = (value)=>(0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createHmac"])("sha256", secret).update(value).digest("hex");
const passwordVersion = (passwordHash)=>sign(passwordHash).slice(0, 24);
function createSession(id, passwordHash) {
    const payload = `${id}:${Date.now() + 8 * 60 * 60 * 1000}${passwordHash ? `:${passwordVersion(passwordHash)}` : ""}`;
    return `${payload}:${sign(payload)}`;
}
async function currentUser() {
    const token = (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])()).get(cookieName)?.value;
    if (!token) return null;
    const parts = token.split(":");
    const [id, expiry] = parts;
    const signature = parts.at(-1);
    if (![
        3,
        4
    ].includes(parts.length) || !id || !expiry || !signature || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now()) return null;
    const expected = Buffer.from(sign(parts.slice(0, -1).join(":")));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !(0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["timingSafeEqual"])(expected, actual)) return null;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["databaseEnabled"])()) {
        if (parts.length !== 4) return null;
        const account = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$accounts$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["accountByIdentity"])(id);
        return account && parts[2] === passwordVersion(account.passwordHash) ? account.account : null;
    }
    if (parts.length !== 3) return null;
    return null;
}
}),
"[project]/lib/db.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "databaseEnabled",
    ()=>databaseEnabled,
    "getPool",
    ()=>getPool,
    "transaction",
    ()=>transaction
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$neon$2d$db$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/neon-db.mjs [app-rsc] (ecmascript)");
;
function databaseEnabled() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$neon$2d$db$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["databaseConfigured"])();
}
function getPool() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$neon$2d$db$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getPool"])();
// Alinha DEFAULT CURRENT_TIMESTAMP às datas UTC das transições e relatórios.
}
async function transaction(work) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$neon$2d$db$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["transaction"])(work);
}
}),
"[project]/lib/neon-db.mjs [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "closeDatabase",
    ()=>closeDatabase,
    "databaseConfigured",
    ()=>databaseConfigured,
    "getPool",
    ()=>getPool,
    "migrateDatabase",
    ()=>migrateDatabase,
    "transaction",
    ()=>transaction,
    "translateSql",
    ()=>translateSql
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ws$2f$wrapper$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/ws/wrapper.mjs [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$neondatabase$2f$serverless$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@neondatabase/serverless/index.mjs [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$neon$2d$serverless$2f$driver$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/drizzle-orm/neon-serverless/driver.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$neon$2d$serverless$2f$migrator$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/drizzle-orm/neon-serverless/migrator.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/drizzle-orm/sql/sql.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
;
;
;
;
;
;
__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$neondatabase$2f$serverless$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["neonConfig"].webSocketConstructor = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ws$2f$wrapper$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"];
const tablesWithId = new Set([
    "blocks",
    "warehouses",
    "users",
    "parts",
    "requests",
    "stock_transfers",
    "return_records",
    "stock_movements",
    "audit_log",
    "expected_receipts",
    "map_versions",
    "delivery_route_history",
    "rfid_access_events",
    "password_reset_tokens"
]);
const bigintColumns = new Set([
    "id",
    "actor_id",
    "approved_by",
    "block_id",
    "created_by",
    "fulfilled_by",
    "fulfilled_from",
    "map_version_id",
    "part_id",
    "received_by",
    "request_id",
    "requester_id",
    "return_id",
    "shipped_by",
    "source_warehouse_id",
    "destination_warehouse_id",
    "transfer_id",
    "user_id",
    "warehouse_id",
    "performed_by",
    "counter",
    "entity_id"
]);
let pool;
let database;
function databaseConfigured(env = process.env) {
    return /^postgres(ql)?:\/\//i.test(env.DATABASE_URL || "");
}
function getDatabase() {
    if (database) return database;
    if (!databaseConfigured()) {
        throw new Error("Configure DATABASE_URL com a URL PostgreSQL do Neon.");
    }
    pool = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$neondatabase$2f$serverless$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Pool"]({
        connectionString: process.env.DATABASE_URL,
        max: 10
    });
    database = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$neon$2d$serverless$2f$driver$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["drizzle"])({
        client: pool
    });
    return database;
}
function matchingParen(text, open) {
    let depth = 0;
    let quote = "";
    for(let i = open; i < text.length; i++){
        const ch = text[i];
        if (quote) {
            if (ch === quote && text[i + 1] === quote) i++;
            else if (ch === quote && text[i - 1] !== "\\") quote = "";
            continue;
        }
        if (ch === "'" || ch === '"') quote = ch;
        else if (ch === "(") depth++;
        else if (ch === ")" && --depth === 0) return i;
    }
    return -1;
}
function splitArgs(text) {
    const args = [];
    let start = 0;
    let depth = 0;
    let quote = "";
    for(let i = 0; i < text.length; i++){
        const ch = text[i];
        if (quote) {
            if (ch === quote && text[i + 1] === quote) i++;
            else if (ch === quote && text[i - 1] !== "\\") quote = "";
        } else if (ch === "'" || ch === '"') quote = ch;
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) {
            args.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    args.push(text.slice(start).trim());
    return args;
}
function rewriteCalls(text, name, convert) {
    let out = "";
    let i = 0;
    let quote = "";
    while(i < text.length){
        const ch = text[i];
        if (quote) {
            out += ch;
            if (ch === quote && text[i + 1] === quote) out += text[++i];
            else if (ch === quote && text[i - 1] !== "\\") quote = "";
            i++;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            out += ch;
            i++;
            continue;
        }
        const match = text.slice(i).match(new RegExp(`^${name}\\s*\\(`, "i"));
        if (!match) {
            out += ch;
            i++;
            continue;
        }
        const open = i + match[0].lastIndexOf("(");
        const close = matchingParen(text, open);
        if (close < 0) {
            out += ch;
            i++;
            continue;
        }
        const args = splitArgs(text.slice(open + 1, close)).map((arg)=>rewriteCalls(arg, name, convert));
        out += convert(args);
        i = close + 1;
    }
    return out;
}
function translateSql(input) {
    let text = input.replaceAll("`", '"');
    text = text.replace(/\bUTC_TIMESTAMP\s*\(\s*\d*\s*\)/gi, "CURRENT_TIMESTAMP");
    text = text.replace(/\bNOW\s*\(\s*\)/gi, "CURRENT_TIMESTAMP");
    text = text.replace(/\bINTERVAL\s+(\d+)\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)\b/gi, (_all, amount, unit)=>`INTERVAL '${amount} ${unit.toLowerCase()}'`);
    text = rewriteCalls(text, "DATE_ADD", ([date, interval])=>`(CAST(${date} AS timestamp) + ${interval})`);
    text = rewriteCalls(text, "DATE_SUB", ([date, interval])=>`(CAST(${date} AS timestamp) - ${interval})`);
    text = rewriteCalls(text, "DATE_FORMAT", ([date, format])=>{
        const fmt = format.replace(/^'|'$/g, "").replace(/%Y/g, "YYYY").replace(/%m/g, "MM").replace(/%d/g, "DD");
        return `TO_CHAR(${date}, '${fmt}')`;
    });
    text = rewriteCalls(text, "TIMESTAMPDIFF", ([unit, start, end])=>{
        if (unit.replaceAll("'", "").toUpperCase() === "SECOND") return `EXTRACT(EPOCH FROM (${end} - ${start}))`;
        if (unit.replaceAll("'", "").toUpperCase() === "MINUTE") return `(EXTRACT(EPOCH FROM (${end} - ${start})) / 60)`;
        if (unit.replaceAll("'", "").toUpperCase() === "HOUR") return `(EXTRACT(EPOCH FROM (${end} - ${start})) / 3600)`;
        return `(${end} - ${start})`;
    });
    text = rewriteCalls(text, "JSON_UNQUOTE", ([value])=>value.replace(/JSON_EXTRACT\(([^,]+),\s*'\$\.([\w]+)'\)/i, "$1->>'$2'"));
    text = rewriteCalls(text, "JSON_EXTRACT", ([value, path])=>{
        const key = path.match(/^'\$\.([\w]+)'$/)?.[1];
        return key ? `(${value}->>'${key}')${key === "referenceUnitPrice" ? "::numeric" : ""}` : value;
    });
    text = rewriteCalls(text, "IF", ([condition, yes, no])=>{
        const predicate = condition.trim() === "?" ? "(? <> 0)" : condition;
        return `(CASE WHEN ${predicate} THEN ${yes} ELSE ${no} END)`;
    });
    text = rewriteCalls(text, "FIELD", ([value, ...choices])=>`(CASE ${value} ${choices.map((choice, i)=>`WHEN ${choice} THEN ${i + 1}`).join(" ")} ELSE 0 END)`);
    text = text.replace(/([\w."']+)\s*=\s*TRUE\b/gi, "$1=1");
    text = text.replace(/([\w."']+)\s*=\s*FALSE\b/gi, "$1=0");
    const insert = text.match(/^\s*INSERT\s+(IGNORE\s+)?INTO\s+([\w"]+)/i);
    if (insert) {
        const table = insert[2].replaceAll('"', "").toLowerCase();
        const ignored = Boolean(insert[1]);
        text = text.replace(/^\s*INSERT\s+IGNORE\s+INTO/i, "INSERT INTO");
        const duplicate = /\s+ON DUPLICATE KEY UPDATE\s+(.+)$/i.exec(text);
        if (duplicate) {
            const conflict = {
                face_credentials: "user_id",
                request_reservations: "request_id, warehouse_id",
                user_permission_overrides: "user_id, permission"
            }[table];
            if (!conflict) throw new Error(`Falta regra ON CONFLICT para ${table}.`);
            const assignments = duplicate[1].replace(/VALUES\((\w+)\)/gi, "EXCLUDED.$1");
            text = text.replace(duplicate[0], ` ON CONFLICT (${conflict}) DO UPDATE SET ${assignments}`);
        } else if (ignored) {
            text += " ON CONFLICT DO NOTHING";
        }
        if (tablesWithId.has(table) && !/\bRETURNING\b/i.test(text)) text += " RETURNING id";
    }
    return text;
}
function parameterized(text, params = []) {
    const query = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sql"].empty();
    let start = 0;
    let index = 0;
    let quote = "";
    for(let i = 0; i < text.length; i++){
        const ch = text[i];
        if (quote) {
            if (ch === quote && text[i + 1] === quote) i++;
            else if (ch === quote && text[i - 1] !== "\\") quote = "";
        } else if (ch === "'" || ch === '"') quote = ch;
        else if (ch === "?") {
            query.append(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sql"].raw(text.slice(start, i)));
            const value = params[index++];
            query.append(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sql"]`${typeof value === "boolean" ? Number(value) : value}`);
            start = i + 1;
        }
    }
    query.append(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sql"].raw(text.slice(start)));
    if (index !== params.length) throw new Error(`SQL espera ${index} parâmetros, recebeu ${params.length}.`);
    return query;
}
class Executor {
    constructor(client){
        this.client = client;
    }
    async execute(text, params = []) {
        let result;
        let postgresSql;
        try {
            postgresSql = translateSql(text);
            result = await this.client.execute(parameterized(postgresSql, params));
        } catch (error) {
            if (error?.code === "23505") error.code = "ER_DUP_ENTRY";
            throw error;
        }
        const rows = (result.rows || []).map((row)=>Object.fromEntries(Object.entries(row).map(([key, value])=>[
                    key,
                    value instanceof Date ? value.toISOString().replace("T", " ").replace("Z", "") : bigintColumns.has(key) && typeof value === "string" && /^\d+$/.test(value) ? Number(value) : key === "reference_unit_price" && typeof value === "string" ? Number(value) : value
                ])));
        const insertId = Number(rows[0]?.id || 0);
        if (/^\s*INSERT\b/i.test(postgresSql)) {
            return [
                {
                    insertId,
                    affectedRows: result.rowCount || 0,
                    changedRows: result.rowCount || 0,
                    warningStatus: 0
                }
            ];
        }
        if (/^\s*(SELECT|WITH)\b/i.test(postgresSql)) return [
            rows
        ];
        return [
            {
                insertId,
                affectedRows: result.rowCount || 0,
                changedRows: result.rowCount || 0,
                warningStatus: 0
            }
        ];
    }
    query(text, params = []) {
        return this.execute(text, params);
    }
}
function getPool() {
    const executor = new Executor(getDatabase());
    return {
        execute: executor.execute.bind(executor),
        query: executor.query.bind(executor),
        end: closeDatabase
    };
}
async function transaction(work) {
    return getDatabase().transaction((tx)=>work(new Executor(tx)));
}
async function migrateDatabase() {
    const folder = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].resolve(process.cwd(), "db", "neon");
    getDatabase();
    const users = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
    if (users.rowCount) {
        const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'");
        const hasMarconUsers = columns.rows.some(({ column_name })=>column_name === "employee_no");
        const hasLegacyUsers = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legacy_new_db_users'");
        if (!hasMarconUsers && hasLegacyUsers.rowCount) {
            throw new Error("A tabela users do Neon não é compatível e legacy_new_db_users já existe; preserve/exporte os dados antes de migrar.");
        }
        if (!hasMarconUsers) await pool.query('ALTER TABLE "users" RENAME TO "legacy_new_db_users"');
    }
    const legacy = await pool.query("SELECT to_regclass('public.legacy_new_db_users') AS table_name");
    if (legacy.rows[0]?.table_name) {
        const sequence = await pool.query("SELECT pg_get_serial_sequence('public.legacy_new_db_users', 'id') AS name");
        if (sequence.rows[0]?.name) {
            const oldName = sequence.rows[0].name.split(".").at(-1).replaceAll('"', "");
            const newName = "legacy_new_db_users_id_seq";
            const exists = await pool.query("SELECT to_regclass($1) AS name", [
                `public.${newName}`
            ]);
            if (!exists.rows[0]?.name && oldName !== newName) {
                await pool.query(`ALTER SEQUENCE "${oldName.replaceAll('"', '""')}" RENAME TO "${newName}"`);
            }
        }
        const oldIndexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'legacy_new_db_users' AND indexname LIKE 'users_%'");
        for (const { indexname } of oldIndexes.rows){
            const nextName = `legacy_new_db_${indexname}`;
            await pool.query(`ALTER INDEX "${indexname.replaceAll('"', '""')}" RENAME TO "${nextName.replaceAll('"', '""')}"`);
        }
    }
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$drizzle$2d$orm$2f$neon$2d$serverless$2f$migrator$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["migrate"])(getDatabase(), {
        migrationsFolder: folder
    });
}
async function closeDatabase() {
    if (pool) await pool.end();
    pool = undefined;
    database = undefined;
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1f7nk46._.js.map