(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/components/face/face-capture.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FaceCapture",
    ()=>FaceCapture
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/face-client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$policy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/face-policy.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$face$2f$face$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/app/components/face/face.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function captureError(cause) {
    if (cause instanceof Error) {
        if (cause.name === "NotAllowedError") return "Permita o acesso à câmera no navegador e tente novamente.";
        if (cause.name === "NotFoundError") return "Nenhuma câmera encontrada. Conecte uma câmera e tente novamente.";
        return cause.message;
    }
    return "Falha na captura.";
}
function FaceCapture({ purpose, identity, password, adminTarget, onDone, onCancel }) {
    _s();
    const video = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const stream = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const operation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [status, setStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("A câmera será usada somente durante esta verificação.");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [progress, setProgress] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const initialStart = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(start);
    function stop() {
        operation.current?.abort();
        stream.current?.getTracks().forEach((track)=>track.stop());
        stream.current = null;
        if (video.current) video.current.srcObject = null;
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "FaceCapture.useEffect": ()=>{
            const startTimer = window.setTimeout({
                "FaceCapture.useEffect.startTimer": ()=>void initialStart.current()
            }["FaceCapture.useEffect.startTimer"], 0);
            const hide = {
                "FaceCapture.useEffect.hide": ()=>{
                    if (document.hidden) stop();
                }
            }["FaceCapture.useEffect.hide"];
            document.addEventListener("visibilitychange", hide);
            window.addEventListener("pagehide", stop);
            return ({
                "FaceCapture.useEffect": ()=>{
                    window.clearTimeout(startTimer);
                    stop();
                    document.removeEventListener("visibilitychange", hide);
                    window.removeEventListener("pagehide", stop);
                }
            })["FaceCapture.useEffect"];
        }
    }["FaceCapture.useEffect"], []);
    async function start() {
        if (busy) return;
        stop();
        const controller = new AbortController();
        operation.current = controller;
        const signal = controller.signal;
        setBusy(true);
        setError("");
        setProgress(0);
        try {
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("A câmera exige localhost ou HTTPS.");
            const challenge = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["faceRequest"])({
                action: "start",
                purpose,
                identity,
                password,
                adminTarget,
                consent: purpose === "register" ? __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$policy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FACE_CONSENT"] : undefined
            }, signal);
            if (challenge.model !== __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$policy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FACE_MODEL"]) throw new Error("Modelo facial atualizado. Recarregue a página.");
            setStatus("Autorize a câmera para continuar.");
            const media = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: "user",
                    width: {
                        ideal: 640
                    },
                    height: {
                        ideal: 480
                    }
                }
            });
            if (signal.aborted) {
                media.getTracks().forEach((track)=>track.stop());
                return;
            }
            stream.current = media;
            video.current.srcObject = media;
            await video.current.play();
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 480;
            const images = [];
            for(let i = 0; i < __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$policy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FACE_COUNT"]; i++){
                if (signal.aborted) return;
                const pose = challenge.poses?.[i];
                if (![
                    "center",
                    "left",
                    "right"
                ].includes(pose)) throw new Error("Desafio facial inválido. Inicie novamente.");
                setStatus(`${pose === "center" ? "Olhe de frente" : pose === "left" ? "Vire um pouco o rosto para sua direita" : "Vire um pouco o rosto para sua esquerda"}. Foto ${i + 1} de ${__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$policy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FACE_COUNT"]}.`);
                await new Promise((resolve)=>setTimeout(resolve, 2500));
                if (signal.aborted || !video.current?.videoWidth) return;
                canvas.getContext("2d").drawImage(video.current, 0, 0, 640, 480);
                images.push(canvas.toDataURL("image/jpeg", 0.75).split(",")[1]);
                setProgress(images.length / __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$policy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FACE_COUNT"]);
            }
            stream.current?.getTracks().forEach((track)=>track.stop());
            stream.current = null;
            setStatus("Analisando as cinco fotos no servidor…");
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["faceRequest"])({
                action: "finish",
                model: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$face$2d$policy$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FACE_MODEL"],
                images
            }, signal);
            if (signal.aborted) return;
            if (purpose === "login") {
                if (!result.destination || !/^\/inicio\/(admin|lider|almoxarifado|funcionario)$/.test(result.destination)) throw new Error("Destino de acesso inválido.");
                window.location.assign(result.destination);
            } else if (result.ok) onDone();
            else throw new Error("Cadastro não confirmado.");
        } catch (cause) {
            if (!signal.aborted) setError(captureError(cause));
        } finally{
            if (operation.current === controller) {
                stop();
                setBusy(false);
            }
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$face$2f$face$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].capture,
        "aria-label": "Captura facial",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("video", {
                ref: video,
                autoPlay: true,
                muted: true,
                playsInline: true,
                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$face$2f$face$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].video,
                "aria-label": "Prévia da câmera"
            }, void 0, false, {
                fileName: "[project]/app/components/face/face-capture.tsx",
                lineNumber: 158,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                role: "status",
                children: status
            }, void 0, false, {
                fileName: "[project]/app/components/face/face-capture.tsx",
                lineNumber: 166,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("progress", {
                value: progress,
                max: 1,
                "aria-label": "Progresso da captura"
            }, void 0, false, {
                fileName: "[project]/app/components/face/face-capture.tsx",
                lineNumber: 167,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                role: "alert",
                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$face$2f$face$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].error,
                children: error
            }, void 0, false, {
                fileName: "[project]/app/components/face/face-capture.tsx",
                lineNumber: 169,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$face$2f$face$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].actions,
                children: [
                    error && !busy && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>void start(),
                        children: "Tentar novamente"
                    }, void 0, false, {
                        fileName: "[project]/app/components/face/face-capture.tsx",
                        lineNumber: 175,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>{
                            stop();
                            onCancel();
                        },
                        children: "Cancelar"
                    }, void 0, false, {
                        fileName: "[project]/app/components/face/face-capture.tsx",
                        lineNumber: 179,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/face/face-capture.tsx",
                lineNumber: 173,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/face/face-capture.tsx",
        lineNumber: 157,
        columnNumber: 5
    }, this);
}
_s(FaceCapture, "c2Z+XyPoy+WK5quHHYE7U+SmOUs=");
_c = FaceCapture;
var _c;
__turbopack_context__.k.register(_c, "FaceCapture");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/components/face/face.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "actions": "face-module__mX68PG__actions",
  "capture": "face-module__mX68PG__capture",
  "card": "face-module__mX68PG__card",
  "consent": "face-module__mX68PG__consent",
  "error": "face-module__mX68PG__error",
  "field": "face-module__mX68PG__field",
  "success": "face-module__mX68PG__success",
  "video": "face-module__mX68PG__video",
});
}),
"[project]/app/login/components/face-login.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FaceLogin",
    ()=>FaceLogin
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$face$2f$face$2d$capture$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/face/face-capture.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/app/login/login.module.css [app-client] (css module)");
"use client";
;
;
;
function FaceLogin({ identity, password, onCancel }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].faceTest,
        "aria-labelledby": "local-face-title",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                id: "local-face-title",
                children: "Entrar com reconhecimento facial"
            }, void 0, false, {
                fileName: "[project]/app/login/components/face-login.tsx",
                lineNumber: 15,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: "Use o rosto cadastrado e siga as posições pedidas. A senha é exigida como confirmação adicional: a proteção contra foto e vídeo ainda não foi validada."
            }, void 0, false, {
                fileName: "[project]/app/login/components/face-login.tsx",
                lineNumber: 16,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$face$2f$face$2d$capture$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FaceCapture"], {
                purpose: "login",
                identity: identity,
                password: password,
                onCancel: onCancel,
                onDone: ()=>undefined
            }, void 0, false, {
                fileName: "[project]/app/login/components/face-login.tsx",
                lineNumber: 20,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/login/components/face-login.tsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
_c = FaceLogin;
var _c;
__turbopack_context__.k.register(_c, "FaceLogin");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/login/login-form.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LoginForm
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-right.mjs [app-client] (ecmascript) <export default as ArrowRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.mjs [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleAlert$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.mjs [app-client] (ecmascript) <export default as CircleAlert>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Eye$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/eye.mjs [app-client] (ecmascript) <export default as Eye>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2d$off$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__EyeOff$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/eye-off.mjs [app-client] (ecmascript) <export default as EyeOff>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$face$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ScanFace$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/scan-face.mjs [app-client] (ecmascript) <export default as ScanFace>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LoaderCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-client] (ecmascript) <export default as LoaderCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2d$keyhole$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LockKeyhole$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/lock-keyhole.mjs [app-client] (ecmascript) <export default as LockKeyhole>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shield$2d$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShieldCheck$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/shield-check.mjs [app-client] (ecmascript) <export default as ShieldCheck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/user-round.mjs [app-client] (ecmascript) <export default as UserRound>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$use$2d$login$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/login/use-login.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$components$2f$face$2d$login$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/login/components/face-login.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[project]/app/login/login.module.css [app-client] (css module)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
function LoginForm({ children, demoMode = false }) {
    _s();
    const { isBusy, status, identity, password, error, setIdentity, setPassword, submit } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$use$2d$login$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLogin"])();
    const [showPassword, setShowPassword] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [cameraActive, setCameraActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const identityRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const returnFocus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const errorDescription = error ? "login-error" : undefined;
    const buttonLabel = status === "success" ? "Acesso confirmado" : isBusy ? "Validando acesso…" : "Entrar";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            cameraActive ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$components$2f$face$2d$login$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FaceLogin"], {
                identity: identity,
                password: password,
                onCancel: ()=>setCameraActive(false)
            }, void 0, false, {
                fileName: "[project]/app/login/login-form.tsx",
                lineNumber: 46,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].form,
                        onSubmit: submit,
                        "aria-busy": isBusy,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].field,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "identity",
                                        children: "E-mail ou matrícula"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 51,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inputWrapper,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__["UserRound"], {
                                                size: 18,
                                                "aria-hidden": "true"
                                            }, void 0, false, {
                                                fileName: "[project]/app/login/login-form.tsx",
                                                lineNumber: 53,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                ref: (element)=>{
                                                    identityRef.current = element;
                                                    if (element && returnFocus.current) {
                                                        element.focus();
                                                        returnFocus.current = false;
                                                    }
                                                },
                                                id: "identity",
                                                name: "username",
                                                autoComplete: "username",
                                                autoCapitalize: "none",
                                                spellCheck: false,
                                                placeholder: "Seu e-mail ou matrícula",
                                                required: true,
                                                value: identity,
                                                onChange: (event)=>setIdentity(event.target.value),
                                                disabled: isBusy,
                                                "aria-invalid": Boolean(error),
                                                "aria-describedby": errorDescription
                                            }, void 0, false, {
                                                fileName: "[project]/app/login/login-form.tsx",
                                                lineNumber: 54,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 52,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/login/login-form.tsx",
                                lineNumber: 50,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].field,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        htmlFor: "password",
                                        children: "Senha"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 78,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].inputWrapper,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2d$keyhole$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LockKeyhole$3e$__["LockKeyhole"], {
                                                size: 18,
                                                "aria-hidden": "true"
                                            }, void 0, false, {
                                                fileName: "[project]/app/login/login-form.tsx",
                                                lineNumber: 80,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].passwordInput,
                                                id: "password",
                                                name: "password",
                                                type: showPassword ? "text" : "password",
                                                autoComplete: "current-password",
                                                placeholder: "Sua senha",
                                                required: true,
                                                value: password,
                                                onChange: (event)=>setPassword(event.target.value),
                                                disabled: isBusy,
                                                "aria-invalid": Boolean(error),
                                                "aria-describedby": errorDescription
                                            }, void 0, false, {
                                                fileName: "[project]/app/login/login-form.tsx",
                                                lineNumber: 81,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].revealButton,
                                                "aria-label": showPassword ? "Ocultar senha" : "Mostrar senha",
                                                "aria-pressed": showPassword,
                                                onClick: ()=>setShowPassword((visible)=>!visible),
                                                children: showPassword ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2d$off$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__EyeOff$3e$__["EyeOff"], {
                                                    size: 18,
                                                    "aria-hidden": "true"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/login/login-form.tsx",
                                                    lineNumber: 103,
                                                    columnNumber: 21
                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Eye$3e$__["Eye"], {
                                                    size: 18,
                                                    "aria-hidden": "true"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/login/login-form.tsx",
                                                    lineNumber: 105,
                                                    columnNumber: 21
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/login/login-form.tsx",
                                                lineNumber: 95,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 79,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/login/login-form.tsx",
                                lineNumber: 77,
                                columnNumber: 13
                            }, this),
                            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                id: "login-error",
                                role: "alert",
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].errorMessage,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleAlert$3e$__["CircleAlert"], {
                                        size: 18,
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 112,
                                        columnNumber: 17
                                    }, this),
                                    error
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/login/login-form.tsx",
                                lineNumber: 111,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "submit",
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].primaryButton,
                                disabled: isBusy,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        "aria-live": "polite",
                                        children: buttonLabel
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 121,
                                        columnNumber: 15
                                    }, this),
                                    status === "submitting" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LoaderCircle$3e$__["LoaderCircle"], {
                                        className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].spinner,
                                        size: 18,
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 123,
                                        columnNumber: 17
                                    }, this) : status === "success" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                        size: 18,
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 129,
                                        columnNumber: 17
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__["ArrowRight"], {
                                        size: 18,
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 131,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/login/login-form.tsx",
                                lineNumber: 116,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/login/login-form.tsx",
                        lineNumber: 49,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].alternativeAccess,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].divider,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 137,
                                        columnNumber: 15
                                    }, this),
                                    "outras formas de acesso",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 139,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/login/login-form.tsx",
                                lineNumber: 136,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].alternativeButton,
                                type: "button",
                                disabled: demoMode || isBusy || !identity.trim() || !password,
                                onClick: ()=>{
                                    setCameraActive(true);
                                },
                                "aria-describedby": "camera-access-note",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$face$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ScanFace$3e$__["ScanFace"], {
                                        size: 20,
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 142,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: "Entrar com reconhecimento facial"
                                    }, void 0, false, {
                                        fileName: "[project]/app/login/login-form.tsx",
                                        lineNumber: 142,
                                        columnNumber: 56
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/login/login-form.tsx",
                                lineNumber: 141,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                id: "camera-access-note",
                                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].accessNote,
                                children: demoMode ? "Acesso facial disponível com Neon configurado." : "Informe e-mail ou matrícula. Cadastre seu rosto no perfil após entrar com senha."
                            }, void 0, false, {
                                fileName: "[project]/app/login/login-form.tsx",
                                lineNumber: 144,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/login/login-form.tsx",
                        lineNumber: 135,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/login/login-form.tsx",
                lineNumber: 48,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$login$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].securityNote,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shield$2d$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShieldCheck$3e$__["ShieldCheck"], {
                        size: 15,
                        "aria-hidden": "true"
                    }, void 0, false, {
                        fileName: "[project]/app/login/login-form.tsx",
                        lineNumber: 150,
                        columnNumber: 9
                    }, this),
                    " ",
                    demoMode ? "Acesso por credenciais protegidas." : "Acesso por credenciais protegidas."
                ]
            }, void 0, true, {
                fileName: "[project]/app/login/login-form.tsx",
                lineNumber: 149,
                columnNumber: 7
            }, this),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/app/login/login-form.tsx",
        lineNumber: 44,
        columnNumber: 5
    }, this);
}
_s(LoginForm, "Mr7LRPqY/9A96y0hPa04fLLb5ug=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$use$2d$login$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLogin"]
    ];
});
_c = LoginForm;
var _c;
__turbopack_context__.k.register(_c, "LoginForm");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/login/login.module.css [app-client] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "accessCard": "login-module__Si-P0q__accessCard",
  "accessControls": "login-module__Si-P0q__accessControls",
  "accessFooter": "login-module__Si-P0q__accessFooter",
  "accessHeader": "login-module__Si-P0q__accessHeader",
  "accessNote": "login-module__Si-P0q__accessNote",
  "accessPanel": "login-module__Si-P0q__accessPanel",
  "alternativeButton": "login-module__Si-P0q__alternativeButton",
  "badge-arrive": "login-module__Si-P0q__badge-arrive",
  "brandContent": "login-module__Si-P0q__brandContent",
  "brandEyebrow": "login-module__Si-P0q__brandEyebrow",
  "brandFooter": "login-module__Si-P0q__brandFooter",
  "brandHeader": "login-module__Si-P0q__brandHeader",
  "brandName": "login-module__Si-P0q__brandName",
  "brandPanel": "login-module__Si-P0q__brandPanel",
  "brandSubtitle": "login-module__Si-P0q__brandSubtitle",
  "card-arrive": "login-module__Si-P0q__card-arrive",
  "card-shine": "login-module__Si-P0q__card-shine",
  "cardBack": "login-module__Si-P0q__cardBack",
  "cardChip": "login-module__Si-P0q__cardChip",
  "cardFooter": "login-module__Si-P0q__cardFooter",
  "cardHeader": "login-module__Si-P0q__cardHeader",
  "cardMiddle": "login-module__Si-P0q__cardMiddle",
  "cardStack": "login-module__Si-P0q__cardStack",
  "cardTitle": "login-module__Si-P0q__cardTitle",
  "demoBadge": "login-module__Si-P0q__demoBadge",
  "demoContent": "login-module__Si-P0q__demoContent",
  "demoDetails": "login-module__Si-P0q__demoDetails",
  "desktopBreak": "login-module__Si-P0q__desktopBreak",
  "divider": "login-module__Si-P0q__divider",
  "enter": "login-module__Si-P0q__enter",
  "errorMessage": "login-module__Si-P0q__errorMessage",
  "eyebrow": "login-module__Si-P0q__eyebrow",
  "faceTest": "login-module__Si-P0q__faceTest",
  "faceTestActions": "login-module__Si-P0q__faceTestActions",
  "faceTestError": "login-module__Si-P0q__faceTestError",
  "field": "login-module__Si-P0q__field",
  "floatingBadge": "login-module__Si-P0q__floatingBadge",
  "footerDots": "login-module__Si-P0q__footerDots",
  "form": "login-module__Si-P0q__form",
  "formContainer": "login-module__Si-P0q__formContainer",
  "heading": "login-module__Si-P0q__heading",
  "inputWrapper": "login-module__Si-P0q__inputWrapper",
  "password-eye-blink": "login-module__Si-P0q__password-eye-blink",
  "passwordInput": "login-module__Si-P0q__passwordInput",
  "primaryButton": "login-module__Si-P0q__primaryButton",
  "productName": "login-module__Si-P0q__productName",
  "revealButton": "login-module__Si-P0q__revealButton",
  "scene": "login-module__Si-P0q__scene",
  "sceneGrid": "login-module__Si-P0q__sceneGrid",
  "sceneRing": "login-module__Si-P0q__sceneRing",
  "securityNote": "login-module__Si-P0q__securityNote",
  "shell": "login-module__Si-P0q__shell",
  "simulationTag": "login-module__Si-P0q__simulationTag",
  "skipLink": "login-module__Si-P0q__skipLink",
  "spin": "login-module__Si-P0q__spin",
  "spinner": "login-module__Si-P0q__spinner",
  "textButton": "login-module__Si-P0q__textButton",
});
}),
"[project]/app/login/use-login.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useLogin",
    ()=>useLogin
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2d$routes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/workspace-routes.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function useLogin() {
    _s();
    const [identity, setIdentity] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [password, setPassword] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [status, setStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("idle");
    const requestRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const isBusy = status !== "idle";
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useLogin.useEffect": ()=>({
                "useLogin.useEffect": ()=>requestRef.current?.abort()
            })["useLogin.useEffect"]
    }["useLogin.useEffect"], []);
    async function submit(event) {
        event.preventDefault();
        if (requestRef.current || isBusy) return;
        const controller = new AbortController();
        requestRef.current = controller;
        const timeoutId = window.setTimeout(()=>controller.abort(), 15_000);
        setStatus("submitting");
        setError("");
        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    identity,
                    password
                }),
                signal: controller.signal
            });
            const result = await response.json();
            if (!response.ok) {
                setError(result.error || "Não foi possível entrar. Tente novamente.");
                setStatus("idle");
                return;
            }
            if (typeof result.destination !== "string" || !Object.values(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$workspace$2d$routes$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["roleLanding"]).includes(result.destination)) {
                throw new Error("Invalid login destination");
            }
            setStatus("success");
            window.location.assign(result.destination);
        } catch  {
            setError("Não foi possível conectar. Verifique sua conexão e tente novamente.");
            setStatus("idle");
        } finally{
            window.clearTimeout(timeoutId);
            requestRef.current = null;
        }
    }
    return {
        isBusy,
        status,
        identity,
        password,
        error,
        setIdentity,
        setPassword,
        submit
    };
}
_s(useLogin, "OeqcPSx5EqGuzTpcsGVc+5CghJY=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/face-client.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "faceRequest",
    ()=>faceRequest
]);
async function faceRequest(body, signal) {
    const response = await fetch("/api/login/face", body ? {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal
    } : {
        cache: "no-store",
        signal
    });
    const result = await response.json().catch(()=>null);
    if (!response.ok || !result || typeof result !== "object") throw new Error(result?.error || "Não foi possível concluir a captura.");
    return result;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/face-policy.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// OpenCV YuNet + SFace from the supplied Python prototype.
__turbopack_context__.s([
    "FACE_CONSENT",
    ()=>FACE_CONSENT,
    "FACE_COUNT",
    ()=>FACE_COUNT,
    "FACE_MODEL",
    ()=>FACE_MODEL,
    "FACE_THRESHOLD",
    ()=>FACE_THRESHOLD,
    "FACE_TTL",
    ()=>FACE_TTL,
    "coherentCapture",
    ()=>coherentCapture,
    "matchesEnrollment",
    ()=>matchesEnrollment,
    "similarity",
    ()=>similarity,
    "validEmbedding",
    ()=>validEmbedding,
    "validImages",
    ()=>validImages
]);
const FACE_MODEL = "opencv-yunet-sface-2023mar-v1";
const FACE_THRESHOLD = 0.363;
const FACE_CONSENT = "local-face-v1";
const FACE_TTL = 120_000;
const FACE_COUNT = 5;
function validEmbedding(value) {
    return Array.isArray(value) && value.length === 128 && value.every((n)=>typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100);
}
function similarity(a, b) {
    if (!validEmbedding(a) || !validEmbedding(b)) return -1;
    let dot = 0, aa = 0, bb = 0;
    for(let i = 0; i < 128; i++){
        dot += a[i] * b[i];
        aa += a[i] * a[i];
        bb += b[i] * b[i];
    }
    return aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : -1;
}
function validImages(value) {
    return Array.isArray(value) && value.length === FACE_COUNT && value.every((image)=>typeof image === "string" && image.length > 1000 && image.length <= 300000 && /^[A-Za-z0-9+/]+={0,2}$/.test(image));
}
function matchesEnrollment(samples, enrolled) {
    if (samples.length !== FACE_COUNT || enrolled.length !== FACE_COUNT || !samples.every(validEmbedding) || !enrolled.every(validEmbedding)) return false;
    return samples.every((sample)=>enrolled.some((reference)=>similarity(sample, reference) >= FACE_THRESHOLD));
}
function coherentCapture(samples) {
    if (samples.length !== FACE_COUNT || !samples.every(validEmbedding)) return false;
    return samples.every((sample, index)=>samples.slice(index + 1).every((other)=>similarity(sample, other) >= FACE_THRESHOLD));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/workspace-routes.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "pagePaths",
    ()=>pagePaths,
    "pathFor",
    ()=>pathFor,
    "roleLanding",
    ()=>roleLanding
]);
const roleLanding = {
    admin: "/admin/dashboard",
    lider: "/department-head/dashboard",
    almoxarifado: "/warehouse/dashboard",
    funcionario: "/employee/request"
};
const pagePaths = {
    admin: {
        pecas: "/admin/dashboard/parts",
        "por-peca": "/admin/dashboard/by-part",
        compra: "/admin/purchases",
        recomendacoes: "/admin/recommendations",
        mapa: "/admin/map",
        dashboard: "/admin/dashboard",
        requisicoes: "/admin/all-requests",
        funcionarios: "/admin/create",
        historico: "/admin/history"
    },
    lider: {
        materiais: "/department-head/materials",
        dashboard: "/department-head/dashboard",
        solicitacoes: "/department-head/requests",
        historico: "/department-head/history"
    },
    almoxarifado: {
        pecas: "/warehouse/dashboard/parts",
        "por-peca": "/warehouse/dashboard/by-part",
        dashboard: "/warehouse/dashboard",
        requisicoes: "/warehouse/requests",
        estoque: "/warehouse/stock/all/all",
        devolucoes: "/warehouse/returns",
        compra: "/warehouse/purchases",
        recomendacoes: "/warehouse/recommendations",
        historico: "/warehouse/history"
    },
    funcionario: {
        nova: "/employee/request",
        historico: "/employee/history"
    }
};
function pathFor(role, page) {
    return pagePaths[role][page] ?? roleLanding[role];
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/node_modules/lucide-react/dist/esm/icons/arrow-right.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>ArrowRight
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "arrow-right",
    size: 24,
    node: [
        [
            "path",
            {
                d: "M5 12h14",
                key: "1ays0h"
            }
        ],
        [
            "path",
            {
                d: "m12 5 7 7-7 7",
                key: "xquz4c"
            }
        ]
    ]
};
__iconData.node;
const ArrowRight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/arrow-right.mjs [app-client] (ecmascript) <export default as ArrowRight>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ArrowRight",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-right.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/check.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>Check
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "check",
    size: 24,
    node: [
        [
            "path",
            {
                d: "M20 6 9 17l-5-5",
                key: "1gmf2c"
            }
        ]
    ]
};
__iconData.node;
const Check = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/check.mjs [app-client] (ecmascript) <export default as Check>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Check",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>CircleAlert
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "circle-alert",
    size: 24,
    node: [
        [
            "circle",
            {
                cx: "12",
                cy: "12",
                r: "10",
                key: "1mglay"
            }
        ],
        [
            "line",
            {
                x1: "12",
                x2: "12",
                y1: "8",
                y2: "12",
                key: "1pkeuh"
            }
        ],
        [
            "line",
            {
                x1: "12",
                x2: "12.01",
                y1: "16",
                y2: "16",
                key: "4dfq90"
            }
        ]
    ],
    aliases: [
        "alert-circle"
    ]
};
__iconData.node;
const CircleAlert = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.mjs [app-client] (ecmascript) <export default as CircleAlert>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CircleAlert",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/eye-off.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>EyeOff
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "eye-off",
    size: 24,
    node: [
        [
            "path",
            {
                d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
                key: "ct8e1f"
            }
        ],
        [
            "path",
            {
                d: "M14.084 14.158a3 3 0 0 1-4.242-4.242",
                key: "151rxh"
            }
        ],
        [
            "path",
            {
                d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
                key: "13bj9a"
            }
        ],
        [
            "path",
            {
                d: "m2 2 20 20",
                key: "1ooewy"
            }
        ]
    ]
};
__iconData.node;
const EyeOff = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/eye-off.mjs [app-client] (ecmascript) <export default as EyeOff>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EyeOff",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2d$off$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2d$off$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/eye-off.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/eye.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>Eye
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "eye",
    size: 24,
    node: [
        [
            "path",
            {
                d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
                key: "1nclc0"
            }
        ],
        [
            "circle",
            {
                cx: "12",
                cy: "12",
                r: "3",
                key: "1v7zrd"
            }
        ]
    ]
};
__iconData.node;
const Eye = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/eye.mjs [app-client] (ecmascript) <export default as Eye>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Eye",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/eye.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>LoaderCircle
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "loader-circle",
    size: 24,
    node: [
        [
            "path",
            {
                d: "M21 12a9 9 0 1 1-6.219-8.56",
                key: "13zald"
            }
        ]
    ],
    aliases: [
        "loader-2"
    ]
};
__iconData.node;
const LoaderCircle = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-client] (ecmascript) <export default as LoaderCircle>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LoaderCircle",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/lock-keyhole.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>LockKeyhole
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "lock-keyhole",
    size: 24,
    node: [
        [
            "circle",
            {
                cx: "12",
                cy: "16",
                r: "1",
                key: "1au0dj"
            }
        ],
        [
            "rect",
            {
                x: "3",
                y: "10",
                width: "18",
                height: "12",
                rx: "2",
                key: "6s8ecr"
            }
        ],
        [
            "path",
            {
                d: "M7 10V7a5 5 0 0 1 10 0v3",
                key: "1pqi11"
            }
        ]
    ]
};
__iconData.node;
const LockKeyhole = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/lock-keyhole.mjs [app-client] (ecmascript) <export default as LockKeyhole>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LockKeyhole",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2d$keyhole$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2d$keyhole$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/lock-keyhole.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/scan-face.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>ScanFace
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "scan-face",
    size: 24,
    node: [
        [
            "path",
            {
                d: "M3 7V5a2 2 0 0 1 2-2h2",
                key: "aa7l1z"
            }
        ],
        [
            "path",
            {
                d: "M17 3h2a2 2 0 0 1 2 2v2",
                key: "4qcy5o"
            }
        ],
        [
            "path",
            {
                d: "M21 17v2a2 2 0 0 1-2 2h-2",
                key: "6vwrx8"
            }
        ],
        [
            "path",
            {
                d: "M7 21H5a2 2 0 0 1-2-2v-2",
                key: "ioqczr"
            }
        ],
        [
            "path",
            {
                d: "M8 14s1.5 2 4 2 4-2 4-2",
                key: "1y1vjs"
            }
        ],
        [
            "path",
            {
                d: "M9 9h.01",
                key: "1q5me6"
            }
        ],
        [
            "path",
            {
                d: "M15 9h.01",
                key: "x1ddxp"
            }
        ]
    ]
};
__iconData.node;
const ScanFace = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/scan-face.mjs [app-client] (ecmascript) <export default as ScanFace>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ScanFace",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$face$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scan$2d$face$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/scan-face.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/shield-check.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>ShieldCheck
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "shield-check",
    size: 24,
    node: [
        [
            "path",
            {
                d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
                key: "oel41y"
            }
        ],
        [
            "path",
            {
                d: "m9 12 2 2 4-4",
                key: "dzmm74"
            }
        ]
    ]
};
__iconData.node;
const ShieldCheck = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/shield-check.mjs [app-client] (ecmascript) <export default as ShieldCheck>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ShieldCheck",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shield$2d$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shield$2d$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/shield-check.mjs [app-client] (ecmascript)");
}),
"[project]/node_modules/lucide-react/dist/esm/icons/user-round.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconData",
    ()=>__iconData,
    "default",
    ()=>UserRound
]);
/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/createLucideIcon.mjs [app-client] (ecmascript)");
;
const __iconData = {
    name: "user-round",
    size: 24,
    node: [
        [
            "circle",
            {
                cx: "12",
                cy: "8",
                r: "5",
                key: "1hypcn"
            }
        ],
        [
            "path",
            {
                d: "M20 21a8 8 0 0 0-16 0",
                key: "rfgkzh"
            }
        ]
    ],
    aliases: [
        "user-2"
    ]
};
__iconData.node;
const UserRound = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(__iconData);
;
}),
"[project]/node_modules/lucide-react/dist/esm/icons/user-round.mjs [app-client] (ecmascript) <export default as UserRound>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UserRound",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/user-round.mjs [app-client] (ecmascript)");
}),
]);

//# sourceMappingURL=_122ob3q._.js.map