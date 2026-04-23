import { NextResponse } from 'next/server';
import net from 'net';

const PORT_TO_SERVICE: Record<string, string> = JSON.parse(process.env.PORT_TO_SERVICE || '{}');

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const type = searchParams.get('type') || 'http'; // 'http' | 'tcp'

    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    const urlObj = new URL(targetUrl);

    const mappedHost = PORT_TO_SERVICE[urlObj.port];
    urlObj.hostname = mappedHost;

    if (type === 'tcp') {
        // Extract host and port from URL (e.g., http://localhost:9092)
        try {
            const hostname = urlObj.hostname;
            const port = parseInt(urlObj.port);

            if (!hostname || isNaN(port)) {
                return NextResponse.json({ error: 'Invalid URL for TCP check. Must include hostname and port' }, { status: 400 });
            }

            const isOnline = await checkTcpPort(hostname, port);
            return NextResponse.json({ status: isOnline ? 'online' : 'offline' }, { status: isOnline ? 200 : 503 });
        } catch (e) {
            return NextResponse.json({ status: 'offline', error: 'Invalid URL format' }, { status: 503 });
        }
    } else {
        // HTTP check
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(urlObj, { signal: controller.signal });
            clearTimeout(id);

            if (res.ok) {
                return NextResponse.json({ status: 'online' }, { status: 200 });
            } else {
                return NextResponse.json({ status: 'offline', statusText: res.statusText }, { status: 404 });
            }
        } catch (error) {
            return NextResponse.json({ status: 'offline', error: (error as Error).message }, { status: 503 });
        }
    }
}

function checkTcpPort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            resolve(false);
        });

        socket.connect(port, host);
    });
}
